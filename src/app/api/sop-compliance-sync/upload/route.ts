import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import MasterSOPRepository from '@/models/MasterSOPRepository';
import { extractTablesFromDOCX } from '@/lib/docxTableParser';

/**
 * POST /api/sop-compliance-sync/upload
 * Upload department DOCX files with SOP compliance dates
 * 
 * Expected table format:
 * | Sr. No. | SOP Subject | SOP No. | Version No. | Effective Date | Review Date |
 */
export async function POST(request: NextRequest) {
  try {
    await connectDB();

    const formData = await request.formData();
    const files: File[] = [];

    // Extract all DOCX files
    for (const [, value] of formData.entries()) {
      if (value instanceof File && value.name.toLowerCase().endsWith('.docx')) {
        // Skip temporary files
        if (!value.name.startsWith('~$')) {
          files.push(value);
        }
      }
    }

    if (files.length === 0) {
      return NextResponse.json(
        { error: 'No DOCX files found' },
        { status: 400 }
      );
    }

    console.log(`\n📦 Processing ${files.length} department files...\n`);

    let totalUpdated = 0;
    let totalSkipped = 0;
    let totalErrors = 0;

    for (const file of files) {
      try {
        console.log(`📄 Processing: ${file.name}`);

        // Extract department from filename (e.g., "1. QA.docx" -> "QA")
        const department = extractDepartmentFromFilename(file.name);
        console.log(`🏢 Department: ${department}`);

        // Convert file to buffer
        const arrayBuffer = await file.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        // Extract tables
        const tables = await extractTablesFromDOCX(buffer);
        console.log(`📊 Found ${tables.length} tables`);

        if (tables.length === 0) {
          console.log(`⚠️ No tables found in ${file.name}`);
          totalSkipped++;
          continue;
        }

        // Process each table
        for (let tableIndex = 0; tableIndex < tables.length; tableIndex++) {
          const table = tables[tableIndex];
          
          console.log(`\n📋 Processing table ${tableIndex + 1} (${table.rows.length} rows)`);

          // Skip tables with too few rows
          if (table.rows.length < 2) {
            console.log(`⏭️ Skipping table ${tableIndex + 1}: too few rows`);
            continue;
          }

          // Process each row (skip header row if it exists)
          let processedInTable = 0;
          
          for (let rowIndex = 0; rowIndex < table.rows.length; rowIndex++) {
            const row = table.rows[rowIndex];
            
            // Skip rows with insufficient columns
            if (row.cells.length < 6) continue;

            // Expected format: [Sr.No | SOP Subject | SOP No | Version | Effective Date | Review Date]
            const sopNo = row.cells[2]?.trim();
            const version = row.cells[3]?.trim();
            const effectiveDateStr = row.cells[4]?.trim();
            const reviewDateStr = row.cells[5]?.trim();

            // Validate SOP number format
            if (!sopNo || !/^[A-Z]{2,6}\d{2,3}$/i.test(sopNo)) {
              continue; // Skip header rows or invalid rows
            }

            // Parse dates
            const effectiveDate = parseDate(effectiveDateStr);
            const reviewDate = parseDate(reviewDateStr);

            if (!effectiveDate && !reviewDate) {
              console.log(`⚠️ No valid dates for ${sopNo}`);
              continue;
            }

            // Try to find SOP in database
            // First try exact match with version
            let sop = await MasterSOPRepository.findOne({ 
              sopIdentifier: `${sopNo}-${version}` 
            });

            // If not found, try pattern match
            if (!sop) {
              const pattern = new RegExp(`^${sopNo}(-\\d+)?$`, 'i');
              sop = await MasterSOPRepository.findOne({ 
                sopIdentifier: pattern 
              });
            }

            if (!sop) {
              totalSkipped++;
              continue;
            }

            // Update SOP
            const updates: any = {};
            
            if (effectiveDate) {
              updates['metadata.effectiveDate'] = effectiveDate;
            }
            
            if (reviewDate) {
              updates['metadata.reviewDate'] = reviewDate;
              updates['metadata.expiryDate'] = reviewDate; // Review date IS expiry date
            }
            
            if (version) {
              updates['metadata.version'] = version;
            }

            if (department) {
              updates.department = department;
            }

            await MasterSOPRepository.findByIdAndUpdate(
              sop._id,
              { $set: updates },
              { new: true }
            );

            console.log(`✅ ${sop.sopIdentifier}: Effective=${formatDate(effectiveDate)}, Review=${formatDate(reviewDate)}`);
            totalUpdated++;
            processedInTable++;
          }

          console.log(`📊 Table ${tableIndex + 1}: Updated ${processedInTable} SOPs`);
        }

        console.log(`✅ Completed ${file.name}\n`);

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
    console.error('Error in upload:', error);
    return NextResponse.json(
      { error: 'Failed to process files', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

/**
 * Extract department name from filename
 * Examples: "1. QA.docx" -> "QA", "2. QC.docx" -> "QC"
 */
function extractDepartmentFromFilename(filename: string): string {
  // Remove file extension
  const nameWithoutExt = filename.replace(/\.docx$/i, '');
  
  // Remove leading numbers and dots
  const cleaned = nameWithoutExt.replace(/^\d+\.\s*/, '');
  
  return cleaned.toUpperCase();
}

/**
 * Parse date string in DD/MM/YYYY format
 */
function parseDate(dateStr: string | undefined): Date | null {
  if (!dateStr) return null;
  
  try {
    const parts = dateStr.split('/');
    if (parts.length !== 3) return null;
    
    const day = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10) - 1; // Month is 0-indexed
    const year = parseInt(parts[2], 10);
    
    const date = new Date(year, month, day);
    
    // Validate
    if (isNaN(date.getTime())) return null;
    
    return date;
  } catch {
    return null;
  }
}

/**
 * Format date for logging
 */
function formatDate(date: Date | null): string {
  if (!date) return 'N/A';
  
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  
  return `${day}/${month}/${year}`;
}
