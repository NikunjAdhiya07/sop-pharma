import { NextRequest, NextResponse } from 'next/server';
import { readdir, readFile } from 'fs/promises';
import path from 'path';
import connectDB from '@/lib/mongodb';
import SOP from '@/models/SOP';
import MCQBank from '@/models/MCQBank';
import { generateMCQsFromSOP } from '@/lib/gemini';
import { parsePDF, parseDOCX } from '@/lib/documentParser';

export async function POST(request: NextRequest) {
  try {
    await connectDB();

    let bodyLanguage: 'English' | 'Gujarati' | undefined;
    try {
      const rawText = await request.text();
      if (rawText) {
        const body = JSON.parse(rawText);
        bodyLanguage = body.language;
      }
    } catch (e) {
      console.warn('⚠️ Could not parse request body for language:', e);
    }
    console.log(`🌐 Bulk process language from request body: "${bodyLanguage || 'not provided'}"`);

    const filesDir = path.join(process.cwd(), 'files');
    
    // Read all files from the files directory
    let fileNames: string[];
    try {
      fileNames = await readdir(filesDir);
    } catch (err) {
      return NextResponse.json(
        { error: 'Files directory not found or empty' },
        { status: 400 }
      );
    }

    // Filter for DOC, DOCX, and PDF files
    const sopFiles = fileNames.filter(file => {
      const ext = file.toLowerCase().split('.').pop();
      return ext === 'doc' || ext === 'docx' || ext === 'pdf';
    });

    if (sopFiles.length === 0) {
      return NextResponse.json(
        { error: 'No DOC, DOCX, or PDF files found in the files folder' },
        { status: 400 }
      );
    }

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        let completed = 0;
        let failed = 0;
        const errors: Array<{ fileName: string; error: string }> = [];
        const results: Array<{ fileName: string; mcqCount: number; sopId: string }> = [];

        for (const fileName of sopFiles) {
          try {
            // Send progress update
            const progress = {
              total: sopFiles.length,
              completed,
              failed,
              current: fileName,
              errors,
              results,
              chunkProgress: 0,
              chunkTotal: 10,
            };
            
            try {
              controller.enqueue(
                encoder.encode(`data: ${JSON.stringify(progress)}\n\n`)
              );
            } catch (e) {
              console.warn('⚠️ Stream controller closed by client. Stopping bulk process.');
              return; // Stop processing all files if client disconnected
            }

            const filePath = path.join(filesDir, fileName);
            const fileBuffer = await readFile(filePath);
            
            // Extract text based on file type
            const ext = fileName.toLowerCase().split('.').pop();
            let content = '';
            let wordCount = 0;

            if (ext === 'pdf') {
              const parsed = await parsePDF(fileBuffer);
              content = parsed.content;
              wordCount = parsed.metadata.wordCount;
            } else if (ext === 'docx' || ext === 'doc') {
              const parsed = await parseDOCX(fileBuffer);
              content = parsed.content;
              wordCount = parsed.metadata.wordCount;
            }

            // Validate content
            if (wordCount < 10) {
              throw new Error(`Insufficient content. Only ${wordCount} words found. Minimum 10 words required.`);
            }

            // Generate SOP name and identifier from filename
            let headerSubject = '';
            if (ext === 'docx' || ext === 'doc') {
              try {
                const { extractSOPHeaderTableData } = await import('@/lib/docxHeaderExtractor');
                const headerData = await extractSOPHeaderTableData(fileBuffer);
                if (headerData?.subject) {
                  headerSubject = String(headerData.subject).trim();
                }
              } catch {}
            }

            const nameWithoutExt = fileName.replace(/\.(pdf|docx|doc)$/i, '');
            const sopName = headerSubject || nameWithoutExt;

            // Generate identifier
            const codeMatch = nameWithoutExt.match(/([A-Z]{2,}[-_]?\d+[-_]?\d*)/i);
            let sopIdentifier;
            if (codeMatch) {
              sopIdentifier = codeMatch[1].toUpperCase();
            } else {
              const words = nameWithoutExt.split(/[\s_-]+/).filter(w => w.length > 0);
              sopIdentifier = words.slice(0, 3).join('-').toUpperCase() || `SOP-${Date.now()}`;
            }

            // Auto-detect department
            const department = detectDepartment(nameWithoutExt, content);

            // Extract dates from content
            const { extractDatesFromContent } = await import('@/lib/dateExtractor');
            const extractedDates = extractDatesFromContent(content);

            // Resolve language so Gujarati uploads don't overwrite English SOPs
            const effectiveLanguage = bodyLanguage || 'English';
            console.log(`🌐 Effective language for "${sopName}": ${effectiveLanguage} (body=${bodyLanguage})`);

            // Find or create SOP by identifier AND language so English and Gujarati coexist
            let sop = await SOP.findOne({ identifier: sopIdentifier, language: effectiveLanguage });

            if (!sop) {
              // Create new SOP for this language (keeps English SOP intact when adding Gujarati)
              sop = await SOP.create({
                name: sopName,
                identifier: sopIdentifier,
                department: department,
                language: effectiveLanguage,
                fileUrl: `/files/${fileName}`,
                fileType: ext === 'doc' ? 'docx' : ext,
                content: content,
                status: 'processing',
                mcqCount: 0,
                effectiveDate: extractedDates.effectiveDate,
                reviewDate: extractedDates.reviewDate,
                expiryDate: extractedDates.expiryDate,
                version: extractedDates.version,
                metadata: {
                  fileSize: fileBuffer.length,
                  wordCount: wordCount,
                },
              });
              console.log(`📝 Created new ${effectiveLanguage} SOP for: ${sopName}`);
            } else {
              // Update existing SOP for this language only
              sop.status = 'processing';
              sop.content = content;
              if (extractedDates.effectiveDate) sop.effectiveDate = extractedDates.effectiveDate;
              if (extractedDates.reviewDate) sop.reviewDate = extractedDates.reviewDate;
              if (extractedDates.expiryDate) sop.expiryDate = extractedDates.expiryDate;
              if (extractedDates.version) sop.version = extractedDates.version;
              sop.metadata = {
                fileSize: fileBuffer.length,
                wordCount: wordCount,
              };
              await sop.save();
              console.log(`🔄 Updated existing ${effectiveLanguage} SOP for: ${sopName}`);
            }

            // Check if MCQ bank already exists for this SOP + language combo
            let existingBank = await MCQBank.findOne({ sopId: sop._id, language: effectiveLanguage });
            let existingQuestions: string[] = [];

            if (existingBank) {
              existingQuestions = existingBank.mcqs.map(m => m.question);
              console.log(`🔄 Regenerating ${effectiveLanguage} MCQs for: ${sopName}. Current count: ${existingQuestions.length}`);
            } else {
              console.log(`📝 Will create ${effectiveLanguage} MCQ bank for: ${sopName}`);
            }

            // Generate MCQs using Gemini with incremental saving callback
            const result = await generateMCQsFromSOP({
              sopContent: content,
              sopName: sopName,
              sopIdentifier: sopIdentifier,
              existingQuestions: existingQuestions,
              isBulk: true,
              language: effectiveLanguage,
              onBatchComplete: async (batchMcqs: any[]) => {
                // Save each batch immediately to the database
                if (batchMcqs.length > 0) {
                  // Reload the bank to get the latest version (match by language)
                  const currentBank = await MCQBank.findOne({ sopId: sop._id, language: effectiveLanguage });
                  
                  if (!currentBank) {
                    // First batch - create the bank
                    await MCQBank.create({
                      sopId: sop._id,
                      sopName: sopName,
                      sopIdentifier: sopIdentifier,
                      department: department,
                      mcqs: batchMcqs,
                      totalQuestions: batchMcqs.length,
                      difficultyDistribution: {
                        easy: batchMcqs.filter(m => m.difficulty === 'Easy').length,
                        medium: batchMcqs.filter(m => m.difficulty === 'Medium').length,
                        hard: batchMcqs.filter(m => m.difficulty === 'Hard').length,
                      },
                      aiModel: 'gemini-3-pro-preview',
                      language: effectiveLanguage,
                    });
                    console.log(`💾 Created MCQ bank with first batch of ${batchMcqs.length} MCQs`);
                  } else {
                    // Subsequent batches - check for duplicates before appending
                    const currentQuestions = new Set(currentBank.mcqs.map(m => m.question.replace(/^⭐\s*/, '').trim()));
                    
                    // Filter out duplicates from the new batch
                    const uniqueNewMcqs = batchMcqs.filter(m => {
                      const questionText = m.question.replace(/^⭐\s*/, '').trim();
                      return !currentQuestions.has(questionText);
                    });

                    if (uniqueNewMcqs.length > 0) {
                      // Append only unique questions
                      currentBank.mcqs = [...currentBank.mcqs, ...uniqueNewMcqs];
                      currentBank.totalQuestions = currentBank.mcqs.length;
                      
                      // Recalculate distribution
                      currentBank.difficultyDistribution = {
                        easy: currentBank.mcqs.filter(m => m.difficulty === 'Easy').length,
                        medium: currentBank.mcqs.filter(m => m.difficulty === 'Medium').length,
                        hard: currentBank.mcqs.filter(m => m.difficulty === 'Hard').length,
                      };
                      
                      await currentBank.save();
                      console.log(`💾 Saved batch of ${uniqueNewMcqs.length} unique MCQs. Total: ${currentBank.mcqs.length}`);
                    }
                  }

                  // Send real-time chunk progress update to client
                  try {
                    const updatedBank = await MCQBank.findOne({ sopId: sop._id, language: effectiveLanguage });
                    const chunkProgress = {
                      total: sopFiles.length,
                      completed,
                      failed,
                      current: fileName,
                      errors,
                      results,
                      chunkProgress: updatedBank ? updatedBank.mcqs.length : 0,
                      chunkTotal: 100, // Target is 100
                    };
                    controller.enqueue(
                      encoder.encode(`data: ${JSON.stringify(chunkProgress)}\n\n`)
                    );
                  } catch (e) {
                    // If stream is closed, we should ideally stop. 
                    // However, stopping inside a callback deep in Gemini.ts requires more logic.
                    // For now, we just skip enqueuing if stream is gone.
                    console.warn('⚠️ Could not send chunk progress update - stream likely closed.');
                  }
                }
              }
            });

            // Check if we got any MCQs at all
            const finalBank = await MCQBank.findOne({ sopId: sop._id, language: effectiveLanguage });
            if (!finalBank || finalBank.mcqs.length === 0) {
              console.warn(`⚠️ No MCQs generated for ${sopName}. All batches may have failed.`);
              throw new Error(`Failed to generate any MCQs. All batches encountered errors.`);
            }

            // Log if we got partial results
            if (finalBank.mcqs.length < 100) {
              console.warn(`⚠️ Partial result for ${sopName}: ${finalBank.mcqs.length} MCQs (expected 100)`);
            }
            
            console.log(`✅ Final MCQ count for ${sopName}: ${finalBank.mcqs.length} questions`);

            // Update SOP status
            sop.status = 'completed';
            sop.processedAt = new Date();
            sop.mcqCount = finalBank.mcqs.length;
            await sop.save();

            completed++;
            results.push({
              fileName: fileName,
              mcqCount: finalBank.mcqs.length,
              sopId: sop._id.toString(),
            });

          } catch (error) {
            console.error(`Error processing ${fileName}:`, error);
            failed++;
            errors.push({
              fileName: fileName,
              error: error instanceof Error ? error.message : 'Unknown error'
            });
          }
        }

        // Send final progress update
        const finalProgress = {
          total: sopFiles.length,
          completed,
          failed,
          current: '',
          errors,
          results,
        };
        
        try {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify(finalProgress)}\n\n`)
          );
        } catch (e) {
          // Ignore
        }

        controller.close();
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });

  } catch (error) {
    console.error('Bulk MCQ generation error:', error);
    return NextResponse.json(
      {
        error: 'Bulk MCQ generation failed',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

// Helper function to detect department from filename or content
function detectDepartment(filename: string, content: string): string {
  const text = (filename + ' ' + content.substring(0, 500)).toLowerCase();

  const departmentKeywords = {
    'QA': ['qa', 'quality assurance', 'qaic', 'qaio', 'qcge', 'instrument calibration', 'instrument operation', 'audit', 'compliance', 'deviation', 'capa'],
    'QC': ['qc', 'quality control', 'testing', 'analysis', 'laboratory', 'sampling', 'specification'],
    'Microbiology': ['microbiology', 'qami', 'qcmi', 'sterility', 'bioburden', 'environmental monitoring', 'aseptic'],
    'Production': ['production', 'praa', 'prcl', 'pred', 'preo', 'prep', 'prge', 'prma', 'prpa', 'manufacturing', 'aseptic area', 'eye drops', 'eye ointment', 'external preparation', 'packing'],
    'Store': ['store', 'bsge', 'stcl', 'stge', 'stop', 'stpa', 'strm', 'warehouse', 'storage', 'inventory', 'raw material', 'packing material'],
    'Engineering and Maintenance': ['engineering', 'maintenance', 'equipment', 'calibration', 'preventive', 'hvac', 'utilities'],
    'Personnel': ['personnel', 'human resources', 'hr', 'training', 'recruitment', 'employee', 'staff'],
  };

  for (const [dept, keywords] of Object.entries(departmentKeywords)) {
    if (keywords.some(keyword => text.includes(keyword))) {
      return dept;
    }
  }

  return 'QA';
}
