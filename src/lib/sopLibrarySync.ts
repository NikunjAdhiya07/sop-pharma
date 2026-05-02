import connectDB from '@/lib/mongodb';
import SOPLibrary from '@/models/SOPLibrary';
import SOP from '@/models/SOP';
import MCQBank from '@/models/MCQBank';
import { extractDepartmentFromIdentifier } from '@/lib/sopLibraryHelper';

/**
 * Check if an SOP should be excluded from the library
 * - Excludes annexure files, temp files, and non-primary SOP files
 */
function shouldExcludeSOP(sop: any): boolean {
  const identifier = (sop.identifier || '').toLowerCase();
  const name = (sop.name || '').toLowerCase();
  
  // Exclude temp files (start with ~$)
  if (name.startsWith('~$') || identifier.startsWith('~$')) {
    return true;
  }
  
  // Exclude annexure files
  if (identifier.includes('annexure') || name.includes('annexure')) {
    return true;
  }
  
  // Exclude files that don't have a proper SOP identifier pattern
  // Valid patterns: QAGE01-10, QCMI50-00, PRMA01-02, etc.
  const validIdentifierPattern = /^[A-Z]{2,4}\d{2,3}-\d{2}$/i;
  if (!validIdentifierPattern.test(sop.identifier)) {
    return true;
  }
  
  return false;
}

/**
 * Clean the SOP name - format as IDENTIFIER_TITLE
 * This ensures consistent naming across all views
 */
function cleanSOPName(sop: any): string {
  const identifier = (sop.identifier || '').toUpperCase();
  const originalName = sop.name || '';
  
  // If the name is just the identifier or garbage, use identifier
  if (!originalName || originalName === identifier || 
      originalName.includes('---') || originalName.includes('ANNEXURE')) {
    return identifier;
  }
  
  // If name starts with identifier, extract title and reformat
  if (originalName.toUpperCase().startsWith(identifier)) {
    const rest = originalName.substring(identifier.length).replace(/^[\s\-_:\.]+/, '').trim();
    if (rest) {
      return `${identifier}_${rest.replace(/_/g, ' ').replace(/\s+/g, ' ').trim().toUpperCase()}`;
    }
    return identifier;
  }
  
  // Otherwise, format as "IDENTIFIER_NAME"
  return `${identifier}_${originalName.replace(/_/g, ' ').replace(/\s+/g, ' ').trim().toUpperCase()}`;
}

export async function performSOPLibrarySync() {
  await connectDB();

  const stats = {
    sopProcessed: 0,
    sopLibraryCreated: 0,
    sopLibraryUpdated: 0,
    skipped: 0,
    errors: 0,
  };

  // Fetch all SOPs (not just completed ones, to show progress)
  const allSops = await SOP.find({ 
    status: { $in: ['completed', 'uploaded', 'processing'] } 
  }).lean();
  
  // Filter out annexures, temp files, and non-primary SOPs
  const sops = allSops.filter(sop => !shouldExcludeSOP(sop));
  stats.skipped = allSops.length - sops.length;
  
  console.log(`🔍 Sync: Found ${allSops.length} total SOPs, processing ${sops.length} (skipped ${stats.skipped} non-primary files)`);
  
  // Fetch all existing SOP Library entries
  const existingSOPLibraries = await SOPLibrary.find({}).lean();
  console.log(`🔍 Sync: Found ${existingSOPLibraries.length} existing library entries`);
  const sopLibraryMap = new Map(existingSOPLibraries.map(s => [s.sopIdentifier, s]));

  // Fetch all MCQ Banks (select mcqs to get accurate count)
  const mcqBanks = await MCQBank.find({}).select('_id sopId totalQuestions mcqs').lean();
  console.log(`🔍 Sync: Found ${mcqBanks.length} MCQ banks`);
  const mcqBankMap = new Map(mcqBanks.map(m => [m.sopId.toString(), m]));

  const bulkOps = [];
  const processedIdentifiers = new Set<string>();
  const oneYearFromNow = new Date();
  oneYearFromNow.setFullYear(oneYearFromNow.getFullYear() + 1);

  for (const sop of sops) {
    // Skip if we've already processed this identifier in this batch
    if (processedIdentifiers.has(sop.identifier)) continue;
    processedIdentifiers.add(sop.identifier);

    try {
      const { departmentCode, departmentName } = extractDepartmentFromIdentifier(sop.identifier);
      const mcqBank = mcqBankMap.get(sop._id.toString());
      const existingSopLibrary = sopLibraryMap.get(sop.identifier);

      // Get the cleaned SOP name
      const sopName = cleanSOPName(sop);
      
      if (existingSopLibrary) {
        const actualMCQCount = mcqBank ? (mcqBank.mcqs?.length ?? mcqBank.totalQuestions ?? 0) : 0;
        const storedMCQCount = existingSopLibrary.metadata?.totalMCQs ?? 0;

        const needsUpdate = 
          existingSopLibrary.sopName !== sopName ||
          existingSopLibrary.department !== departmentName ||
          (mcqBank && String(existingSopLibrary.mcqBankId || '') !== String(mcqBank._id)) ||
          existingSopLibrary.folderPath !== sop.folderPath ||
          storedMCQCount !== actualMCQCount;

        if (needsUpdate) {
          const updateDoc: any = {
            sopName: sopName,
            department: departmentName,
            departmentCode: departmentCode,
            folderPath: sop.folderPath,
            parentFolder: sop.parentFolder,
            subfolderLevel: sop.subfolderLevel,
            expiryDate: sop.expiryDate,
            lastReviewDate: sop.reviewDate || sop.lastReviewedAt || new Date(),
          };

          if (mcqBank) {
            updateDoc.mcqBankId = mcqBank._id;
            updateDoc['metadata.totalMCQs'] = actualMCQCount;
          } else if (existingSopLibrary.mcqBankId) {
            updateDoc.mcqBankId = null;
            updateDoc['metadata.totalMCQs'] = 0;
            updateDoc['completionStatus.hasMCQs'] = false;
          }

          bulkOps.push({
            updateOne: {
              filter: { _id: existingSopLibrary._id },
              update: { $set: updateDoc }
            }
          });
          stats.sopLibraryUpdated++;
        }
      } else {
        // Create new entry
        bulkOps.push({
          insertOne: {
            document: {
              sopId: sop._id,
              sopName: sopName,
              sopIdentifier: sop.identifier,
              department: departmentName,
              departmentCode: departmentCode,
              mcqBankId: mcqBank?._id,
              videos: [],
              slides: [],
              sopDocuments: [],
              expiryDate: sop.expiryDate || oneYearFromNow,
              lastReviewDate: sop.reviewDate || sop.lastReviewedAt || new Date(),
              folderPath: sop.folderPath,
              parentFolder: sop.parentFolder,
              subfolderLevel: sop.subfolderLevel,
              metadata: {
                views: 0,
                totalMCQs: mcqBank ? (mcqBank.mcqs?.length ?? mcqBank.totalQuestions ?? 0) : 0,
              },
            }
          }
        });
        stats.sopLibraryCreated++;
      }

      stats.sopProcessed++;
    } catch (error: any) {
      console.error(`Error processing SOP ${sop?.identifier || 'unknown'}:`, error);
      stats.errors++;
    }
  }

  if (bulkOps.length > 0) {
    await SOPLibrary.bulkWrite(bulkOps);
  }

  return stats;
}
