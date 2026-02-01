import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import SOPLibrary from '@/models/SOPLibrary';
import SOP from '@/models/SOP';
import MCQBank from '@/models/MCQBank';
import { extractDepartmentFromIdentifier } from '@/lib/sopLibraryHelper';

// POST - Sync existing SOPs and MCQ Banks into SOP Library
export async function POST(request: NextRequest) {
  try {
    await connectDB();

    const stats = {
      sopProcessed: 0,
      sopLibraryCreated: 0,
      sopLibraryUpdated: 0,
      errors: 0,
    };

    // Fetch all SOPs
    const sops = await SOP.find({ status: 'completed' });
    
    for (const sop of sops) {
      try {
        // Extract department from identifier
        const { departmentCode, departmentName } = extractDepartmentFromIdentifier(sop.identifier);

        // Find associated MCQ Bank
        const mcqBank = await MCQBank.findOne({ sopId: sop._id });

        // Check if SOP Library entry already exists
        let sopLibrary = await SOPLibrary.findOne({ sopIdentifier: sop.identifier });

        if (sopLibrary) {
          // Update existing entry
          sopLibrary.sopName = sop.name;
          sopLibrary.department = departmentName;
          sopLibrary.departmentCode = departmentCode;
          
          if (mcqBank && !sopLibrary.mcqBankId) {
            sopLibrary.mcqBankId = mcqBank._id;
            sopLibrary.metadata.totalMCQs = mcqBank.totalQuestions;
          }

          await sopLibrary.save();
          stats.sopLibraryUpdated++;
        } else {
          // Create new entry
          const oneYearFromNow = new Date();
          oneYearFromNow.setFullYear(oneYearFromNow.getFullYear() + 1);

          sopLibrary = new SOPLibrary({
            sopId: sop._id,
            sopName: sop.name,
            sopIdentifier: sop.identifier,
            department: departmentName,
            departmentCode: departmentCode,
            mcqBankId: mcqBank?._id,
            videos: [],
            slides: [],
            sopDocuments: [],
            expiryDate: oneYearFromNow, // Set default expiry to 1 year
            metadata: {
              views: 0,
              totalMCQs: mcqBank?.totalQuestions || 0,
            },
          });

          await sopLibrary.save();
          stats.sopLibraryCreated++;
        }

        stats.sopProcessed++;
      } catch (error: any) {
        console.error(`Error processing SOP ${sop.identifier}:`, error);
        stats.errors++;
      }
    }

    return NextResponse.json({
      success: true,
      message: 'SOP Library sync completed',
      stats,
    });
  } catch (error: any) {
    console.error('Error syncing SOP library:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to sync SOP library', details: error.message },
      { status: 500 }
    );
  }
}
