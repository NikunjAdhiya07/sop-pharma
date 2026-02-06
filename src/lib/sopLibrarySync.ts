import connectDB from '@/lib/mongodb';
import SOPLibrary from '@/models/SOPLibrary';
import SOP from '@/models/SOP';
import MCQBank from '@/models/MCQBank';
import { extractDepartmentFromIdentifier } from '@/lib/sopLibraryHelper';

export async function performSOPLibrarySync() {
  await connectDB();

  const stats = {
    sopProcessed: 0,
    sopLibraryCreated: 0,
    sopLibraryUpdated: 0,
    errors: 0,
  };

  // Fetch all SOPs (not just completed ones, to show progress)
  const sops = await SOP.find({ 
    status: { $in: ['completed', 'uploaded', 'processing'] } 
  }).lean();
  
  console.log(`🔍 Sync: Found ${sops.length} SOPs to process`);
  
  // Fetch all existing SOP Library entries
  const existingSOPLibraries = await SOPLibrary.find({}).lean();
  console.log(`🔍 Sync: Found ${existingSOPLibraries.length} existing library entries`);
  const sopLibraryMap = new Map(existingSOPLibraries.map(s => [s.sopIdentifier, s]));

  // Fetch all MCQ Banks
  const mcqBanks = await MCQBank.find({}).lean();
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

      if (existingSopLibrary) {
        // Check if we actually need to update
        const needsUpdate = 
          existingSopLibrary.sopName !== sop.name ||
          existingSopLibrary.department !== departmentName ||
          (mcqBank && !existingSopLibrary.mcqBankId) ||
          existingSopLibrary.folderPath !== sop.folderPath;

        if (needsUpdate) {
          const updateDoc: any = {
            sopName: sop.name,
            department: departmentName,
            departmentCode: departmentCode,
            folderPath: sop.folderPath,
            parentFolder: sop.parentFolder,
            subfolderLevel: sop.subfolderLevel,
          };

          if (mcqBank && !existingSopLibrary.mcqBankId) {
            updateDoc.mcqBankId = mcqBank._id;
            updateDoc['metadata.totalMCQs'] = mcqBank.totalQuestions;
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
              sopName: sop.name,
              sopIdentifier: sop.identifier,
              department: departmentName,
              departmentCode: departmentCode,
              mcqBankId: mcqBank?._id,
              videos: [],
              slides: [],
              sopDocuments: [],
              expiryDate: oneYearFromNow,
              folderPath: sop.folderPath,
              parentFolder: sop.parentFolder,
              subfolderLevel: sop.subfolderLevel,
              metadata: {
                views: 0,
                totalMCQs: mcqBank?.totalQuestions || 0,
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
