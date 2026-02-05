import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import MasterSOPRepository from '@/models/MasterSOPRepository';
import { parseDOCX } from '@/lib/documentParser';
import { extractDatesFromContent, extractSOPIdentifier } from '@/lib/dateExtractor';

export async function POST(req: NextRequest) {
  try {
    await connectDB();

    const formData = await req.formData();
    const files = formData.getAll('files') as File[];

    if (!files || files.length === 0) {
      return NextResponse.json(
        { success: false, error: 'No files uploaded' },
        { status: 400 }
      );
    }

    const results: any[] = [];
    let updated = 0;
    let notFound = 0;
    let errors = 0;

    for (const file of files) {
      try {
        // Only process DOCX files
        if (!file.name.endsWith('.docx') && !file.name.endsWith('.doc')) {
          results.push({
            fileName: file.name,
            status: 'error',
            message: 'Only DOCX files are supported',
          });
          errors++;
          continue;
        }

        // Convert to buffer
        const bytes = await file.arrayBuffer();
        const buffer = Buffer.from(bytes);

        // Parse DOCX
        const parsed = await parseDOCX(buffer);
        const content = parsed.content;

        console.log(`\n📄 Processing: ${file.name}`);
        console.log(`📝 Content preview (first 500 chars):`, content.substring(0, 500));

        // Extract SOP identifier from content
        let sopIdentifier = extractSOPIdentifier(content);
        console.log(`🔍 Extracted identifier from content:`, sopIdentifier);
        
        // If not found in content, try to extract from filename
        if (!sopIdentifier) {
          const codeMatch = file.name.match(/([A-Z]{2,4}[A-Z]{2}\d{2}-\d{2})/);
          if (codeMatch) {
            sopIdentifier = codeMatch[1];
            console.log(`📁 Extracted identifier from filename:`, sopIdentifier);
          }
        }

        if (!sopIdentifier) {
          console.log(`❌ Could not extract identifier`);
          results.push({
            fileName: file.name,
            status: 'error',
            message: 'Could not extract SOP identifier from file',
          });
          errors++;
          continue;
        }

        console.log(`✅ Using identifier:`, sopIdentifier);

        // Find existing SOP - try exact match first
        let sop = await MasterSOPRepository.findOne({ sopIdentifier: sopIdentifier });

        // If not found, try fuzzy match (base code without version)
        if (!sop) {
          console.log(`⚠️ Exact match not found, trying fuzzy match...`);
          
          // Extract base code (e.g., QAGE01 from QAGE01-10)
          const baseCode = sopIdentifier.split('-')[0];
          console.log(`🔍 Searching for base code:`, baseCode);
          
          // Find SOPs that start with the base code
          const similarSOPs = await MasterSOPRepository.find({
            sopIdentifier: new RegExp(`^${baseCode}-`, 'i')
          }).limit(5).lean();
          
          console.log(`📋 Found ${similarSOPs.length} similar SOP(s):`, similarSOPs.map(s => s.sopIdentifier));
          
          if (similarSOPs.length === 1) {
            // Only one match, use it
            sop = await MasterSOPRepository.findOne({ sopIdentifier: similarSOPs[0].sopIdentifier });
            console.log(`✅ Using fuzzy match:`, sop?.sopIdentifier);
          } else if (similarSOPs.length > 1) {
            // Multiple matches, use the latest version (highest number)
            const latest = similarSOPs.sort((a, b) => {
              const aNum = parseInt(a.sopIdentifier.split('-')[1] || '0');
              const bNum = parseInt(b.sopIdentifier.split('-')[1] || '0');
              return bNum - aNum;
            })[0];
            sop = await MasterSOPRepository.findOne({ sopIdentifier: latest.sopIdentifier });
            console.log(`✅ Using latest version:`, sop?.sopIdentifier);
          }
        }

        if (!sop) {
          results.push({
            fileName: file.name,
            sopIdentifier,
            status: 'not_found',
            message: `SOP with identifier ${sopIdentifier} not found in database`,
          });
          notFound++;
          continue;
        }

        // Extract dates
        const extractedDates = extractDatesFromContent(content);
        console.log(`📅 Extracted dates:`, extractedDates);

        // Update SOP (only dates, don't touch MCQs or other data)
        const updateFields: any = {};
        const foundDates: string[] = [];
        
        if (extractedDates.effectiveDate) {
          updateFields.effectiveDate = extractedDates.effectiveDate;
          foundDates.push('Effective Date');
        }
        if (extractedDates.reviewDate) {
          updateFields.reviewDate = extractedDates.reviewDate;
          foundDates.push('Review Date');
        }
        if (extractedDates.expiryDate) {
          updateFields.expiryDate = extractedDates.expiryDate;
          foundDates.push('Expiry Date');
        }
        if (extractedDates.version) {
          updateFields.version = extractedDates.version;
          foundDates.push('Version');
        }

        if (Object.keys(updateFields).length > 0) {
          await MasterSOPRepository.updateOne(
            { _id: sop._id },
            { $set: updateFields }
          );

          console.log(`✅ Updated:`, foundDates.join(', '));

          results.push({
            fileName: file.name,
            sopIdentifier: sop.sopIdentifier,
            extractedDates: {
              effectiveDate: extractedDates.effectiveDate?.toISOString(),
              reviewDate: extractedDates.reviewDate?.toISOString(),
              expiryDate: extractedDates.expiryDate?.toISOString(),
              version: extractedDates.version,
            },
            foundDates,
            status: 'success',
            message: `Found & Updated: ${foundDates.join(', ')}`,
          });
          updated++;
        } else {
          results.push({
            fileName: file.name,
            sopIdentifier,
            status: 'error',
            message: 'No dates found in document',
          });
          errors++;
        }

      } catch (error) {
        results.push({
          fileName: file.name,
          status: 'error',
          message: error instanceof Error ? error.message : 'Unknown error',
        });
        errors++;
      }
    }

    return NextResponse.json({
      success: true,
      results,
      summary: {
        total: files.length,
        updated,
        notFound,
        errors,
      },
    });

  } catch (error) {
    console.error('Error processing DOCX files:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to process files',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
