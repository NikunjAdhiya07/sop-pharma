import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import SOPLibrary from '@/models/SOPLibrary';
import SOP from '@/models/SOP';
import MCQBank from '@/models/MCQBank';
import { extractDepartmentFromIdentifier, extractTitleFromFolderPath } from '@/lib/sopLibraryHelper';

/**
 * Check if an identifier is a valid primary SOP identifier
 * Valid patterns: QAGE01-10, QCMI50-00, PRMA01-02, etc.
 */
function isValidSOPIdentifier(identifier: string): boolean {
  if (!identifier) return false;
  const validPattern = /^[A-Z]{2,4}\d{2,3}-\d{2}$/i;
  return validPattern.test(identifier);
}

/**
 * Check if an SOP should be excluded (annexure, temp file, etc.)
 */
function shouldExclude(identifier: string, name: string): boolean {
  const id = (identifier || '').toLowerCase();
  const n = (name || '').toLowerCase();
  
  // Exclude temp files
  if (n.startsWith('~$') || id.startsWith('~$')) return true;
  
  // Exclude annexures
  if (id.includes('annexure') || n.includes('annexure')) return true;
  
  // Exclude if identifier is not valid
  if (!isValidSOPIdentifier(identifier)) return true;
  
  return false;
}

// POST - Clean up and fix SOP names in database
export async function POST(request: NextRequest) {
  try {
    await connectDB();

    const stats = {
      sopLibraryDeleted: 0,
      sopLibraryUpdated: 0,
      departmentsUpdated: 0,
      mcqBankUpdated: 0,
      sopUpdated: 0,
      errors: [] as string[],
    };

    // Step 1: Delete SOPLibrary entries with invalid identifiers or annexures
    console.log('🧹 Step 1: Cleaning up invalid SOPLibrary entries...');
    const allSOPLibraries = await SOPLibrary.find({}).lean();
    
    const idsToDelete: string[] = [];
    for (const lib of allSOPLibraries) {
      if (shouldExclude(lib.sopIdentifier, lib.sopName)) {
        idsToDelete.push(lib._id.toString());
      }
    }
    
    if (idsToDelete.length > 0) {
      await SOPLibrary.deleteMany({ _id: { $in: idsToDelete } });
      stats.sopLibraryDeleted = idsToDelete.length;
      console.log(`🗑️ Deleted ${idsToDelete.length} invalid SOPLibrary entries`);
    }

    // Step 2: Update remaining SOPLibrary entries with clean names AND correct departments
    console.log('🔄 Step 2: Updating SOPLibrary names and departments...');
    const validLibraries = await SOPLibrary.find({}).lean();
    
    for (const lib of validLibraries) {
      const identifier = lib.sopIdentifier;
      const currentName = lib.sopName || '';
      const currentDept = lib.department || '';
      
      // Get the correct department from the identifier
      const { departmentCode, departmentName } = extractDepartmentFromIdentifier(identifier);
      
      // Extract proper name from folderPath stored in the database
      // folderPath contains the full folder structure with the title: "QAGE01-10 - STANDARD OPERATING PROCEDURE FOR SOP"
      let cleanName = currentName;
      
      // Try to get the proper title from folderPath first (most reliable source)
      if (lib.folderPath) {
        const extractedTitle = extractTitleFromFolderPath(lib.folderPath, identifier);
        // Only use extracted title if it has more than just the identifier
        if (extractedTitle && (extractedTitle.includes('_') || extractedTitle.includes(' - '))) {
          cleanName = extractedTitle;
        }
      }
      
      // If no title from folderPath, fall back to cleaning the current name
      if ((!cleanName.includes('_') && !cleanName.includes(' - ')) || cleanName === currentName) {
        // If contains path separators, extract the last meaningful segment
        if (currentName.includes('/')) {
          const parts = currentName.split('/');
          cleanName = parts[parts.length - 1];
        }
        
        // Remove the identifier prefix if present at the start
        if (cleanName.toUpperCase().startsWith(identifier.toUpperCase())) {
          cleanName = cleanName.substring(identifier.length).replace(/^[\s\-_:\.]+/, '').trim();
        }
        
        // Replace underscores with spaces and clean up
        cleanName = cleanName.replace(/_/g, ' ').replace(/\s+/g, ' ').trim();
        
        // If still garbage or empty, just use the identifier
        if (!cleanName || cleanName.includes('---') || cleanName.toUpperCase().includes('ANNEXURE')) {
          cleanName = identifier.toUpperCase();
        } else {
          // Format as "IDENTIFIER_TITLE"
          cleanName = `${identifier.toUpperCase()}_${cleanName.toUpperCase()}`;
        }
      }
      
      // Check if update is needed
      const needsUpdate = currentName !== cleanName || currentDept !== departmentName;
      
      if (needsUpdate) {
        await SOPLibrary.updateOne(
          { _id: lib._id },
          { $set: { sopName: cleanName, department: departmentName, departmentCode: departmentCode } }
        );
        if (currentDept !== departmentName) stats.departmentsUpdated++;
        if (currentName !== cleanName) stats.sopLibraryUpdated++;
      }
    }
    console.log(`✏️ Updated ${stats.sopLibraryUpdated} SOPLibrary names, ${stats.departmentsUpdated} departments`);

    // Step 3: Update MCQBank names and departments to match
    console.log('🔄 Step 3: Updating MCQBank names and departments...');
    const mcqBanks = await MCQBank.find({}).lean();
    
    // Create a map of sopIdentifier -> folderPath from SOPLibrary for quick lookup
    const folderPathMap = new Map<string, string>();
    for (const lib of validLibraries) {
      if (lib.folderPath) {
        folderPathMap.set(lib.sopIdentifier, lib.folderPath);
      }
    }
    
    for (const bank of mcqBanks) {
      const identifier = bank.sopIdentifier;
      const currentName = bank.sopName || '';
      const currentDept = bank.department || '';
      
      if (!isValidSOPIdentifier(identifier)) continue;
      
      // Get the correct department from the identifier
      const { departmentCode, departmentName } = extractDepartmentFromIdentifier(identifier);
      
      // Try to get proper title from the folderPath lookup
      let cleanName = currentName;
      const folderPath = folderPathMap.get(identifier);
      
      if (folderPath) {
        const extractedTitle = extractTitleFromFolderPath(folderPath, identifier);
        if (extractedTitle && (extractedTitle.includes('_') || extractedTitle.includes(' - '))) {
          cleanName = extractedTitle;
        }
      }
      
      // If no title from folderPath, fall back to cleaning current name
      if ((!cleanName.includes('_') && !cleanName.includes(' - ')) || cleanName === currentName) {
        if (!currentName || 
            currentName.includes('---') || 
            currentName.includes('/') ||
            currentName.toUpperCase().includes('ANNEXURE')) {
          cleanName = identifier.toUpperCase();
        } else if (!currentName.toUpperCase().startsWith(identifier.toUpperCase())) {
          cleanName = `${identifier.toUpperCase()}_${currentName.replace(/_/g, ' ').replace(/\s+/g, ' ').trim().toUpperCase()}`;
        }
      }
      
      const needsUpdate = currentName !== cleanName || currentDept !== departmentName;
      
      if (needsUpdate) {
        await MCQBank.updateOne(
          { _id: bank._id },
          { $set: { sopName: cleanName, department: departmentName } }
        );
        stats.mcqBankUpdated++;
      }
    }
    console.log(`✏️ Updated ${stats.mcqBankUpdated} MCQBank entries`);

    // Step 4: Update SOP names
    console.log('🔄 Step 4: Updating SOP names...');
    const sops = await SOP.find({}).lean();
    
    for (const sop of sops) {
      const identifier = sop.identifier;
      const currentName = sop.name || '';
      
      if (!isValidSOPIdentifier(identifier)) continue;
      
      // Try to get proper title from folderPath stored in SOP document or lookup
      let cleanName = currentName;
      const folderPath = sop.folderPath || folderPathMap.get(identifier);
      
      if (folderPath) {
        const extractedTitle = extractTitleFromFolderPath(folderPath, identifier);
        if (extractedTitle && (extractedTitle.includes('_') || extractedTitle.includes(' - '))) {
          cleanName = extractedTitle;
        }
      }
      
      // If no title from folderPath, fall back to cleaning current name
      if ((!cleanName.includes('_') && !cleanName.includes(' - ')) || cleanName === currentName) {
        if (!currentName || 
            currentName.includes('---') || 
            currentName.includes('/') ||
            currentName.toUpperCase().includes('ANNEXURE')) {
          cleanName = identifier.toUpperCase();
        } else if (!currentName.toUpperCase().startsWith(identifier.toUpperCase())) {
          cleanName = `${identifier.toUpperCase()}_${currentName.replace(/_/g, ' ').replace(/\s+/g, ' ').trim().toUpperCase()}`;
        }
      }
      
      if (currentName !== cleanName) {
        await SOP.updateOne(
          { _id: sop._id },
          { $set: { name: cleanName } }
        );
        stats.sopUpdated++;
      }
    }
    console.log(`✏️ Updated ${stats.sopUpdated} SOP names`);

    // Get final counts
    const finalCount = await SOPLibrary.countDocuments();
    const departmentCounts: Record<string, number> = {};
    
    const remaining = await SOPLibrary.find({}).select('department').lean();
    for (const lib of remaining) {
      const dept = lib.department || 'Unknown';
      departmentCounts[dept] = (departmentCounts[dept] || 0) + 1;
    }

    console.log('✅ Cleanup complete!');
    console.log('📊 Department counts:', departmentCounts);

    return NextResponse.json({
      success: true,
      message: 'Database cleanup completed successfully',
      stats,
      finalCount,
      departmentCounts,
    });
  } catch (error: any) {
    console.error('❌ Error during cleanup:', error);
    return NextResponse.json(
      { success: false, error: 'Cleanup failed', details: error.message },
      { status: 500 }
    );
  }
}

// GET - Get current stats without making changes
export async function GET(request: NextRequest) {
  try {
    await connectDB();

    const allSOPLibraries = await SOPLibrary.find({}).select('sopIdentifier sopName department').lean();
    
    const invalidCount = allSOPLibraries.filter(lib => 
      shouldExclude(lib.sopIdentifier, lib.sopName)
    ).length;
    
    const validCount = allSOPLibraries.length - invalidCount;
    
    const departmentCounts: Record<string, number> = {};
    const departmentInvalidCounts: Record<string, number> = {};
    
    for (const lib of allSOPLibraries) {
      const dept = lib.department || 'Unknown';
      const isInvalid = shouldExclude(lib.sopIdentifier, lib.sopName);
      
      if (isInvalid) {
        departmentInvalidCounts[dept] = (departmentInvalidCounts[dept] || 0) + 1;
      } else {
        departmentCounts[dept] = (departmentCounts[dept] || 0) + 1;
      }
    }

    return NextResponse.json({
      success: true,
      current: {
        total: allSOPLibraries.length,
        valid: validCount,
        invalid: invalidCount,
      },
      departmentCounts,
      departmentInvalidCounts,
    });
  } catch (error: any) {
    console.error('Error getting stats:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to get stats', details: error.message },
      { status: 500 }
    );
  }
}
