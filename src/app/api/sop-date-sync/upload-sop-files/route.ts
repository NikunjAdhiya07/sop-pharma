import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import MasterSOPRepository from '@/models/MasterSOPRepository';
import { parseSOPFromDOCX } from '@/lib/sopDocxParser';

/**
 * POST /api/sop-date-sync/upload-sop-files
 * 
 * Upload individual SOP DOCX files to extract and sync dates
 * This replaces the department file upload approach
 */
export async function POST(req: NextRequest) {
  try {
    await connectDB();
    
    const formData = await req.formData();
    const files = formData.getAll('files') as File[];
    
    if (!files || files.length === 0) {
      return NextResponse.json(
        { error: 'No files provided' },
        { status: 400 }
      );
    }
    
    console.log(`\n📦 Processing ${files.length} SOP files...`);
    
    let totalUpdated = 0;
    let totalSkipped = 0;
    let totalErrors = 0;
    
    for (const file of files) {
      try {
        // Skip non-DOCX files
        if (!file.name.endsWith('.docx') && !file.name.endsWith('.DOCX')) {
          console.log(`⏭️ Skipping non-DOCX file: ${file.name}`);
          totalSkipped++;
          continue;
        }
        
        // Skip temporary files
        if (file.name.startsWith('~$')) {
          console.log(`⏭️ Skipping temporary file: ${file.name}`);
          totalSkipped++;
          continue;
        }
        
        console.log(`\n📄 Processing: ${file.name}`);
        
        // Convert file to buffer
        const arrayBuffer = await file.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        
        // Parse SOP metadata
        const metadata = await parseSOPFromDOCX(buffer, file.name);
        
        if (!metadata) {
          console.log(`❌ Failed to parse ${file.name}`);
          totalErrors++;
          continue;
        }
        
        // Find and update SOP in database
        const { sopIdentifier, effectiveDate, reviewDate, version } = metadata;
        
        // Try exact match first
        let sop = await MasterSOPRepository.findOne({ sopIdentifier });
        
        // If not found, try pattern match (e.g., QAGE98 matches QAGE98-04)
        if (!sop) {
          const baseIdentifier = sopIdentifier.replace(/-\d+$/, '');
          const pattern = new RegExp(`^${baseIdentifier}(-\\d+)?$`, 'i');
          sop = await MasterSOPRepository.findOne({ sopIdentifier: pattern });
        }
        
        if (!sop) {
          console.log(`⚠️ SOP ${sopIdentifier} not found in database`);
          totalSkipped++;
          continue;
        }
        
        // Update SOP metadata
        const updates: any = {};
        
        if (effectiveDate) {
          updates['metadata.effectiveDate'] = effectiveDate;
        }
        
        if (reviewDate) {
          updates['metadata.reviewDate'] = reviewDate;
          updates['metadata.expiryDate'] = reviewDate; // Review date IS the expiry date
        }
        
        if (version) {
          updates['metadata.version'] = version;
        }
        
        if (Object.keys(updates).length > 0) {
          await MasterSOPRepository.findByIdAndUpdate(
            sop._id,
            { $set: updates },
            { new: true }
          );
          
          console.log(`✅ Updated ${sop.sopIdentifier}`);
          totalUpdated++;
        } else {
          console.log(`⚠️ No dates found in ${file.name}`);
          totalSkipped++;
        }
        
      } catch (fileError) {
        console.error(`❌ Error processing ${file.name}:`, fileError);
        totalErrors++;
      }
    }
    
    console.log(`\n✅ Processing complete:`);
    console.log(`   Updated: ${totalUpdated}`);
    console.log(`   Skipped: ${totalSkipped}`);
    console.log(`   Errors: ${totalErrors}`);
    
    return NextResponse.json({
      success: true,
      updated: totalUpdated,
      skipped: totalSkipped,
      errors: totalErrors,
      message: `Successfully updated ${totalUpdated} SOPs`
    });
    
  } catch (error) {
    console.error('Error in upload-sop-files:', error);
    return NextResponse.json(
      { error: 'Failed to process files', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
