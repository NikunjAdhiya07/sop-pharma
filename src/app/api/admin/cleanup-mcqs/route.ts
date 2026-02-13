import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import MCQBank from '@/models/MCQBank';
import SOP from '@/models/SOP';
import EliminatedQuestion from '@/models/EliminatedQuestion';
import { detectProblematicQuestions } from '@/lib/mcqDuplicateDetector';

export async function POST(request: NextRequest) {
  try {
    await connectDB();

    const body = await request.json();
    const {
      sopId,
      mode = 'duplicates', // Only 'duplicates' is safe now
      autoReplace = false, // Default to false for safety
      dryRun = true, // Default to true for safety
      similarityThreshold = 80,
    } = body;

    console.log(`🧹 MCQ Cleanup: mode=${mode}, dryRun=${dryRun}, autoReplace=${autoReplace}`);

    // Fetch MCQ banks to process
    const query = sopId ? { sopId } : {};
    const mcqBanks = await MCQBank.find(query);

    if (mcqBanks.length === 0) {
      return NextResponse.json(
        { error: 'No MCQ banks found' },
        { status: 404 }
      );
    }

    const results = {
      analyzed: mcqBanks.length,
      removed: {
        duplicates: 0,
        contentMismatches: 0,
        total: 0,
      },
      replaced: 0,
      preview: [] as Array<{
        sopId: string;
        sopName: string;
        sopIdentifier: string;
        totalQuestions: number;
        exactDuplicates: Array<{
          indices: number[];
          question: string;
          keepIndex: number;
          removeIndices: number[];
        }>;
        removedCount: number;
        replacedCount: number;
      }>,
    };

    // Process each MCQ bank
    for (const bank of mcqBanks) {
      console.log(`\n📋 ${bank.sopName} (${bank.mcqs.length} questions)`);

      // Detect ONLY exact duplicates
      const duplicateAnalysis = detectProblematicQuestions(
        bank.mcqs,
        similarityThreshold
      );

      console.log(`   ✅ Exact duplicates: ${duplicateAnalysis.exactDuplicates.length} groups`);
      console.log(`   📊 Similar questions: ${duplicateAnalysis.similarQuestions.length} pairs (not removed)`);

      // Prepare detailed preview
      const exactDuplicatesPreview = duplicateAnalysis.exactDuplicates.map(dup => ({
        indices: dup.indices,
        question: dup.questionText,
        keepIndex: dup.indices[0],
        removeIndices: dup.indices.slice(1),
      }));

      const indicesToRemove = duplicateAnalysis.indicesToRemove;
      const removedCount = indicesToRemove.size;

      // Only remove if NOT dry run
      if (!dryRun && removedCount > 0) {
        const sortedIndices = Array.from(indicesToRemove).sort((a, b) => b - a);

        // Store eliminated questions
        for (const index of sortedIndices) {
          const mcq = bank.mcqs[index];
          
          await EliminatedQuestion.create({
            sopId: bank.sopId,
            sopName: bank.sopName,
            sopIdentifier: bank.sopIdentifier,
            question: mcq,
            eliminationReason: 'duplicate',
            duplicateOf: bank.mcqs[duplicateAnalysis.exactDuplicates.find(d => d.indices.includes(index))!.indices[0]].question,
            similarityScore: 100,
            eliminatedAt: new Date(),
            eliminatedBy: 'cleanup-system',
          });
        }

        // Remove duplicates
        sortedIndices.forEach(index => {
          bank.mcqs.splice(index, 1);
        });

        results.removed.duplicates += removedCount;
        results.removed.total += removedCount;

        console.log(`   ❌ Removed ${removedCount} duplicate questions`);

        // Generate replacements if requested
        if (autoReplace) {
          const sop = await SOP.findById(bank.sopId);
          
          if (sop) {
            console.log(`   🔄 Generating ${removedCount} replacements...`);
            
            try {
              const { generateMCQsFromSOP } = await import('@/lib/gemini');
              
              const result = await generateMCQsFromSOP({
                sopContent: sop.content,
                sopName: sop.name,
                sopIdentifier: sop.identifier,
                existingQuestions: bank.mcqs.map(m => m.question),
                targetCount: removedCount,
                isBulk: false,
                language: sop.language || 'English',
              });

              if (result.mcqs.length > 0) {
                bank.mcqs.push(...result.mcqs);
                results.replaced += result.mcqs.length;
                console.log(`   ✅ Generated ${result.mcqs.length} replacements`);
              }
            } catch (error) {
              console.error(`   ❌ Replacement failed:`, error);
            }
          }
        }

        // Update bank
        bank.totalQuestions = bank.mcqs.length;
        bank.difficultyDistribution = {
          easy: bank.mcqs.filter(m => m.difficulty === 'Easy').length,
          medium: bank.mcqs.filter(m => m.difficulty === 'Medium').length,
          hard: bank.mcqs.filter(m => m.difficulty === 'Hard').length,
        };
        await bank.save();
      } else if (dryRun && removedCount > 0) {
        console.log(`   👁️  Preview: Would remove ${removedCount} duplicates`);
        results.removed.duplicates += removedCount;
        results.removed.total += removedCount;
      }

      // Add to preview
      results.preview.push({
        sopId: bank.sopId.toString(),
        sopName: bank.sopName,
        sopIdentifier: bank.sopIdentifier,
        totalQuestions: bank.mcqs.length,
        exactDuplicates: exactDuplicatesPreview,
        removedCount,
        replacedCount: 0,
      });
    }

    const summary = dryRun 
      ? `Preview: ${results.removed.total} exact duplicates found`
      : `Removed: ${results.removed.total} duplicates, Replaced: ${results.replaced}`;

    console.log(`\n✅ ${summary}`);

    return NextResponse.json({
      success: true,
      dryRun,
      results,
      message: summary,
    });

  } catch (error) {
    console.error('MCQ cleanup error:', error);
    return NextResponse.json(
      {
        error: 'MCQ cleanup failed',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
