import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import MasterSOPRepository from '@/models/MasterSOPRepository';
import { extractDatesFromContent } from '@/lib/dateExtractor';

/**
 * POST /api/sop-date-sync/upload-department-files
 * Handles upload of department-level DOCX files containing SOP dates
 * Each file represents a department and contains dates for multiple SOPs
 */
export async function POST(request: NextRequest) {
  try {
    await connectDB();

    const formData = await request.formData();
    const files: File[] = [];

    // Extract all DOCX files from FormData
    for (const [key, value] of formData.entries()) {
      if (value instanceof File && value.name.toLowerCase().endsWith('.docx')) {
        files.push(value);
      }
    }

    if (files.length === 0) {
      return NextResponse.json(
        { 
          success: false,
          error: 'No DOCX files found',
          details: 'Please upload department DOCX files containing SOP dates'
        },
        { status: 400 }
      );
    }

    console.log(`📦 Processing ${files.length} department files...`);

    // Create streaming response
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        let totalSOPsUpdated = 0;
        let totalFilesProcessed = 0;
        let totalFilesFailed = 0;
        const errors: Array<{ fileName: string; error: string }> = [];
        const results: Array<{ fileName: string; sopsUpdated: number; department: string }> = [];

        for (const file of files) {
          try {
            console.log(`\n📄 Processing file: ${file.name}`);

            // Determine department from filename
            const department = extractDepartmentFromFilename(file.name);
            console.log(`🏢 Detected department: ${department}`);

            // Send progress update
            const progress = {
              total: files.length,
              completed: totalFilesProcessed,
              failed: totalFilesFailed,
              current: file.name,
              errors,
              results,
            };

            try {
              controller.enqueue(
                encoder.encode(`data: ${JSON.stringify(progress)}\n\n`)
              );
            } catch (e) {
              console.warn('⚠️ Stream controller closed by client');
              return;
            }

            // Read file buffer
            const bytes = await file.arrayBuffer();
            const buffer = Buffer.from(bytes);

            // Extract tables from DOCX
            let sopDataList: Array<any> = [];
            try {
              const { extractTablesFromDOCX } = await import('@/lib/docxTableParser');
              const tables = await extractTablesFromDOCX(buffer);
              console.log(`📊 Extracted ${tables.length} tables from ${file.name}`);
              
              // Parse tables to extract SOP dates
              sopDataList = parseSOPDatesFromTables(tables, department);
              console.log(`🔍 Found ${sopDataList.length} SOPs in ${file.name}`);
            } catch (err) {
              throw new Error(`Failed to extract tables from DOCX: ${err instanceof Error ? err.message : 'Unknown error'}`);
            }


            // Update each SOP in the database
            let sopsUpdated = 0;
            for (const sopData of sopDataList) {
              try {
                // Try to find SOP with exact match first, then with regex pattern
                // This handles cases where DB has "QAGE98-04" but file has "QAGE98"
                let result = await MasterSOPRepository.findOneAndUpdate(
                  { sopIdentifier: sopData.identifier },
                  {
                    $set: {
                      'metadata.effectiveDate': sopData.effectiveDate || null,
                      'metadata.reviewDate': sopData.reviewDate || null,
                      'metadata.expiryDate': sopData.expiryDate || null,
                      'metadata.version': sopData.version || '1.0',
                      department: department,
                    },
                  },
                  { 
                    new: true,
                    upsert: false
                  }
                );

                // If exact match failed, try pattern match (e.g., QAGE98 matches QAGE98-04)
                if (!result) {
                  const pattern = new RegExp(`^${sopData.identifier}(-\\d+)?$`, 'i');
                  result = await MasterSOPRepository.findOneAndUpdate(
                    { sopIdentifier: pattern },
                    {
                      $set: {
                        'metadata.effectiveDate': sopData.effectiveDate || null,
                        'metadata.reviewDate': sopData.reviewDate || null,
                        'metadata.expiryDate': sopData.expiryDate || null,
                        'metadata.version': sopData.version || '1.0',
                        department: department,
                      },
                    },
                    { 
                      new: true,
                      upsert: false
                    }
                  );
                }

                if (result) {
                  sopsUpdated++;
                  console.log(`✅ Updated ${result.sopIdentifier} (from ${sopData.identifier})`);
                } else {
                  console.log(`⚠️ SOP ${sopData.identifier} not found in database, skipping`);
                }
              } catch (updateError) {
                console.error(`❌ Error updating ${sopData.identifier}:`, updateError);
              }
            }

            totalSOPsUpdated += sopsUpdated;
            totalFilesProcessed++;
            results.push({
              fileName: file.name,
              sopsUpdated,
              department,
            });

            console.log(`✅ Completed ${file.name}: ${sopsUpdated} SOPs updated`);

          } catch (error) {
            console.error(`❌ Error processing ${file.name}:`, error);
            totalFilesFailed++;
            errors.push({
              fileName: file.name,
              error: error instanceof Error ? error.message : 'Unknown error'
            });
          }
        }

        // Send final progress update
        const finalProgress = {
          total: files.length,
          completed: totalFilesProcessed,
          failed: totalFilesFailed,
          current: '',
          errors,
          results,
          totalSOPsUpdated,
        };

        try {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify(finalProgress)}\n\n`)
          );
        } catch (e) {
          // Ignore
        }

        console.log(`\n✅ Processing complete: ${totalSOPsUpdated} SOPs updated from ${totalFilesProcessed} files`);
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
    console.error('Department files upload error:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Upload failed',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

/**
 * Extract department name from filename
 */
function extractDepartmentFromFilename(filename: string): string {
  const name = filename.toUpperCase();
  
  if (name.includes('QA')) return 'QA';
  if (name.includes('QC')) return 'QC';
  if (name.includes('MICROBIOLOGY')) return 'MICROBIOLOGY';
  if (name.includes('PRODUCTION')) return 'PRODUCTION';
  if (name.includes('STORE')) return 'STORE';
  if (name.includes('ENGINEERING') || name.includes('MAINTENANCE')) return 'ENGINEERING AND MAINTENANCE';
  if (name.includes('PERSONNEL')) return 'PERSONNEL';
  
  return 'GENERAL';
}

/**
 * Parse SOP dates from extracted tables
 */
function parseSOPDatesFromTables(
  tables: Array<{ rows: Array<{ cells: string[] }> }>,
  department: string
): Array<{
  identifier: string;
  effectiveDate?: Date;
  reviewDate?: Date;
  expiryDate?: Date;
  version?: string;
}> {
  const sopDataList: Array<any> = [];

  console.log(`📊 Processing ${tables.length} tables for ${department}`);

  for (let tableIndex = 0; tableIndex < tables.length; tableIndex++) {
    const table = tables[tableIndex];
    
    if (table.rows.length === 0) continue;

    // Debug: Show first 3 rows of the table
    console.log(`\n🔍 Table ${tableIndex + 1} preview (${table.rows.length} rows):`);
    for (let i = 0; i < Math.min(3, table.rows.length); i++) {
      console.log(`  Row ${i}: [${table.rows[i].cells.join(' | ')}]`);
    }

    // Try to detect column structure from data patterns (no header row)
    // Expected format: [Category | SOP Name | SOP No | Version | Effective Date | Review Date]
    let sopNoColIndex = -1;
    let effectiveDateColIndex = -1;
    let reviewDateColIndex = -1;
    let versionColIndex = -1;
    let startRowIndex = 0;

    // Analyze first few data rows to detect column types
    for (let i = 0; i < Math.min(5, table.rows.length); i++) {
      const row = table.rows[i];
      
      // Skip rows with too few columns
      if (row.cells.length < 4) continue;

      // Look for SOP identifier pattern in each column
      for (let colIdx = 0; colIdx < row.cells.length; colIdx++) {
        const cell = row.cells[colIdx]?.trim();
        
        // Check if this looks like an SOP identifier (e.g., QAGE01, PRAA02)
        if (cell && /^[A-Z]{2,6}[A-Z0-9\-]*\d{2,3}$/i.test(cell)) {
          sopNoColIndex = colIdx;
          
          // Assume dates are in next columns after SOP No
          // But skip version column if it exists (numeric, 1-2 digits)
          let dateSearchStart = colIdx + 1;
          
          // Check if next column is version (1-2 digit number)
          if (dateSearchStart < row.cells.length) {
            const nextCell = row.cells[dateSearchStart]?.trim();
            if (nextCell && /^\d{1,2}$/.test(nextCell)) {
              // This is version, skip it
              versionColIndex = dateSearchStart;
              dateSearchStart++;
            }
          }
          
          // Now look for dates starting from dateSearchStart
          if (dateSearchStart < row.cells.length) {
            const cell1 = row.cells[dateSearchStart]?.trim();
            if (cell1 && /\d{1,2}\/\d{1,2}\/\d{4}/.test(cell1)) {
              effectiveDateColIndex = dateSearchStart;
            }
          }
          
          if (dateSearchStart + 1 < row.cells.length) {
            const cell2 = row.cells[dateSearchStart + 1]?.trim();
            if (cell2 && /\d{1,2}\/\d{1,2}\/\d{4}/.test(cell2)) {
              reviewDateColIndex = dateSearchStart + 1;
            }
          }
          
          break; // Found SOP column, stop searching
        }
      }

      // If we found the structure, break
      if (sopNoColIndex >= 0) {
        startRowIndex = 0; // Start from first row since there's no header
        console.log(`✅ Table ${tableIndex + 1}: Detected column structure from data`);
        console.log(`   Columns: SOP=${sopNoColIndex}, Effective=${effectiveDateColIndex}, Review=${reviewDateColIndex}, Version=${versionColIndex}`);
        break;
      }
    }

    // If no structure detected, skip this table
    if (sopNoColIndex === -1) {
      console.log(`⚠️ Table ${tableIndex + 1}: Could not detect column structure, skipping`);
      continue;
    }

    // Process data rows
    for (let i = startRowIndex; i < table.rows.length; i++) {
      const row = table.rows[i];
      
      if (row.cells.length <= sopNoColIndex) continue;

      const sopId = row.cells[sopNoColIndex]?.trim();
      
      // Validate SOP identifier
      if (!sopId || !/[A-Z]{2,6}[A-Z0-9\-]+\d+/i.test(sopId)) continue;

      const cleanSopId = sopId.replace(/\s+/g, '').toUpperCase();

      // Extract dates
      let effectiveDate: Date | undefined;
      let reviewDate: Date | undefined;
      let version: string | undefined;

      if (effectiveDateColIndex >= 0 && row.cells.length > effectiveDateColIndex) {
        const dateStr = row.cells[effectiveDateColIndex]?.trim();
        const parsed = parseDateString(dateStr);
        if (parsed) {
          effectiveDate = parsed;
          console.log(`  ✓ ${cleanSopId} Effective: ${dateStr} → ${parsed.toISOString().split('T')[0]}`);
        }
      }

      if (reviewDateColIndex >= 0 && row.cells.length > reviewDateColIndex) {
        const dateStr = row.cells[reviewDateColIndex]?.trim();
        const parsed = parseDateString(dateStr);
        if (parsed) {
          reviewDate = parsed;
          console.log(`  ✓ ${cleanSopId} Review: ${dateStr} → ${parsed.toISOString().split('T')[0]}`);
        }
      }

      if (versionColIndex >= 0 && row.cells.length > versionColIndex) {
        version = row.cells[versionColIndex]?.trim();
      }

      if (effectiveDate || reviewDate) {
        sopDataList.push({
          identifier: cleanSopId,
          effectiveDate,
          reviewDate,
          version: version || '1.0',
        });
      }
    }
  }

  console.log(`📋 Extracted ${sopDataList.length} SOPs from ${tables.length} tables`);
  return sopDataList;
}

/**
 * Parse SOP dates from document content
 * This function looks for patterns like:
 * - SOP Code: QAGE01-10
 * - Effective Date: 01/01/2024
 * - Review Date: 01/01/2025
 * 
 * It also handles table formats where data is in columns
 */
function parseSOPDatesFromContent(content: string, department: string): Array<{
  identifier: string;
  effectiveDate?: Date;
  reviewDate?: Date;
  expiryDate?: Date;
  version?: string;
}> {
  const sopDataList: Array<any> = [];
  
  // Split content into lines
  const lines = content.split('\n').map(line => line.trim()).filter(line => line.length > 0);
  
  console.log(`📄 Processing ${lines.length} lines from ${department} document`);
  
  // Try to detect if this is a table format
  // Look for header row with columns like "SOP No.", "Effective Date", "Review Date"
  let isTableFormat = false;
  let sopNoColIndex = -1;
  let effectiveDateColIndex = -1;
  let reviewDateColIndex = -1;
  let versionColIndex = -1;
  
  // Find header row
  for (let i = 0; i < Math.min(20, lines.length); i++) {
    const line = lines[i].toLowerCase();
    
    // Check if this line contains table headers
    if ((line.includes('sop') && (line.includes('no') || line.includes('number'))) || 
        (line.includes('effective') && line.includes('date')) ||
        (line.includes('review') && line.includes('date'))) {
      
      // Try multiple splitting strategies
      const splittingStrategies = [
        // Strategy 1: Tab-separated
        (line: string) => line.split('\t').map(p => p.trim()).filter(p => p),
        // Strategy 2: Multiple spaces (2+)
        (line: string) => line.split(/\s{2,}/).map(p => p.trim()).filter(p => p),
        // Strategy 3: Pipe-separated
        (line: string) => line.split('|').map(p => p.trim()).filter(p => p),
        // Strategy 4: Single tab or 3+ spaces
        (line: string) => line.split(/\t|\s{3,}/).map(p => p.trim()).filter(p => p),
      ];
      
      let bestParts: string[] = [];
      let bestStrategy = 0;
      
      // Try each strategy and pick the one that gives us the most columns
      for (let s = 0; s < splittingStrategies.length; s++) {
        const parts = splittingStrategies[s](lines[i]);
        if (parts.length > bestParts.length) {
          bestParts = parts;
          bestStrategy = s;
        }
      }
      
      const parts = bestParts;
      console.log(`🔍 Found potential header row at line ${i} using strategy ${bestStrategy}:`, parts);
      
      // Find column indices with more flexible matching
      parts.forEach((part, idx) => {
        const lowerPart = part.toLowerCase();
        
        // Match SOP No/Number column
        if ((lowerPart.includes('sop') && (lowerPart.includes('no') || lowerPart.includes('number'))) ||
            lowerPart === 'sop no.' || lowerPart === 'sop no' || lowerPart === 'sop number') {
          sopNoColIndex = idx;
          console.log(`  ✓ SOP No. column at index ${idx}`);
        }
        
        // Match Effective Date column
        if ((lowerPart.includes('effective') && lowerPart.includes('date')) ||
            lowerPart === 'effective date' || lowerPart === 'eff. date' || lowerPart === 'eff date') {
          effectiveDateColIndex = idx;
          console.log(`  ✓ Effective Date column at index ${idx}`);
        }
        
        // Match Review Date column
        if ((lowerPart.includes('review') && lowerPart.includes('date')) ||
            lowerPart === 'review date' || lowerPart === 'rev. date' || lowerPart === 'rev date') {
          reviewDateColIndex = idx;
          console.log(`  ✓ Review Date column at index ${idx}`);
        }
        
        // Match Version column
        if (lowerPart.includes('version') || lowerPart === 'ver' || lowerPart === 'ver.' ||
            lowerPart === 'version no' || lowerPart === 'version no.') {
          versionColIndex = idx;
          console.log(`  ✓ Version column at index ${idx}`);
        }
      });
      
      if (sopNoColIndex >= 0 && (effectiveDateColIndex >= 0 || reviewDateColIndex >= 0)) {
        isTableFormat = true;
        console.log(`✅ Table format detected!`);
        console.log(`   Columns: SOP=${sopNoColIndex}, Effective=${effectiveDateColIndex}, Review=${reviewDateColIndex}, Version=${versionColIndex}`);
        
        // Use the same splitting strategy for data rows
        const splitStrategy = splittingStrategies[bestStrategy];
        
        // Process table rows starting from next line
        for (let j = i + 1; j < lines.length; j++) {
          const rowLine = lines[j];
          
          // Skip empty lines or separator lines
          if (!rowLine || rowLine.match(/^[\-\s\|=]+$/)) continue;
          
          // Split row using the same strategy
          const rowParts = splitStrategy(rowLine);
          
          // Debug: Log first few rows
          if (j - i <= 5) {
            console.log(`  Row ${j - i}: [${rowParts.join(' | ')}]`);
          }
          
          // Extract SOP identifier
          if (rowParts.length > sopNoColIndex) {
            const sopId = rowParts[sopNoColIndex];
            
            // Validate it looks like an SOP identifier
            if (sopId && /[A-Z]{2,6}[A-Z0-9\-]+\d+/i.test(sopId)) {
              const cleanSopId = sopId.replace(/\s+/g, '').toUpperCase();
              
              // Extract dates
              let effectiveDate: Date | undefined;
              let reviewDate: Date | undefined;
              let version: string | undefined;
              
              if (effectiveDateColIndex >= 0 && rowParts.length > effectiveDateColIndex) {
                const dateStr = rowParts[effectiveDateColIndex];
                const parsed = parseDateString(dateStr);
                if (parsed) {
                  effectiveDate = parsed;
                  console.log(`    ${cleanSopId} Effective: ${dateStr} → ${parsed.toISOString().split('T')[0]}`);
                } else {
                  console.log(`    ${cleanSopId} Effective: ${dateStr} → FAILED TO PARSE`);
                }
              }
              
              if (reviewDateColIndex >= 0 && rowParts.length > reviewDateColIndex) {
                const dateStr = rowParts[reviewDateColIndex];
                const parsed = parseDateString(dateStr);
                if (parsed) {
                  reviewDate = parsed;
                  console.log(`    ${cleanSopId} Review: ${dateStr} → ${parsed.toISOString().split('T')[0]}`);
                } else {
                  console.log(`    ${cleanSopId} Review: ${dateStr} → FAILED TO PARSE`);
                }
              }
              
              if (versionColIndex >= 0 && rowParts.length > versionColIndex) {
                version = rowParts[versionColIndex];
              }
              
              if (effectiveDate || reviewDate) {
                sopDataList.push({
                  identifier: cleanSopId,
                  effectiveDate,
                  reviewDate,
                  version: version || '1.0',
                });
              }
            }
          }
        }
        
        console.log(`📊 Extracted ${sopDataList.length} SOPs from table`);
        break; // Found and processed table, exit
      }
    }
  }
  
  // If not table format, try the original proximity-based approach
  if (!isTableFormat) {
    console.log('📝 Using proximity-based extraction (not table format)');
    
    // Pattern to match SOP identifiers (e.g., QAGE01-10, QC-01-05, etc.)
    const sopIdPattern = /([A-Z]{2,6}[A-Z\s-]*\d{1,3}-\d{1,3})/gi;
    
    // Find all SOP identifiers in the content
    const sopIds = new Set<string>();
    for (const line of lines) {
      const matches = line.match(sopIdPattern);
      if (matches) {
        matches.forEach(id => sopIds.add(id.replace(/\s+/g, '').toUpperCase()));
      }
    }
    
    console.log(`🔍 Found ${sopIds.size} unique SOP identifiers in content`);
    
    // For each SOP, try to extract dates from nearby lines
    for (const sopId of sopIds) {
      try {
        // Find the line containing this SOP ID
        const sopLineIndex = lines.findIndex(line => 
          line.toUpperCase().includes(sopId)
        );
        
        if (sopLineIndex === -1) continue;
        
        // Look at surrounding lines (±10 lines) for dates
        const contextStart = Math.max(0, sopLineIndex - 10);
        const contextEnd = Math.min(lines.length, sopLineIndex + 10);
        const contextLines = lines.slice(contextStart, contextEnd).join('\n');
        
        // Extract dates from context using the existing date extractor
        const extractedDates = extractDatesFromContent(contextLines);
        
        sopDataList.push({
          identifier: sopId,
          effectiveDate: extractedDates.effectiveDate,
          reviewDate: extractedDates.reviewDate,
          expiryDate: extractedDates.expiryDate,
          version: extractedDates.version || '1.0',
        });
        
        console.log(`📋 ${sopId}: Effective=${extractedDates.effectiveDate}, Review=${extractedDates.reviewDate}`);
        
      } catch (error) {
        console.error(`Error parsing dates for ${sopId}:`, error);
      }
    }
  }
  
  return sopDataList;
}

/**
 * Parse date string in various formats
 */
function parseDateString(dateStr: string): Date | null {
  if (!dateStr || typeof dateStr !== 'string') return null;
  
  dateStr = dateStr.trim();
  
  // Try DD/MM/YYYY format (most common in your documents)
  const ddmmyyyyMatch = dateStr.match(/(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})/);
  if (ddmmyyyyMatch) {
    const day = parseInt(ddmmyyyyMatch[1]);
    const month = parseInt(ddmmyyyyMatch[2]) - 1; // JS months are 0-indexed
    const year = parseInt(ddmmyyyyMatch[3]);
    
    const date = new Date(year, month, day);
    if (!isNaN(date.getTime())) {
      return date;
    }
  }
  
  // Try YYYY-MM-DD format
  const yyyymmddMatch = dateStr.match(/(\d{4})[\/\-\.](\d{1,2})[\/\-\.](\d{1,2})/);
  if (yyyymmddMatch) {
    const year = parseInt(yyyymmddMatch[1]);
    const month = parseInt(yyyymmddMatch[2]) - 1;
    const day = parseInt(yyyymmddMatch[3]);
    
    const date = new Date(year, month, day);
    if (!isNaN(date.getTime())) {
      return date;
    }
  }
  
  return null;
}
