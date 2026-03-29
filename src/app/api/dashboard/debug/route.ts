import { NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import SOPLibrary from '@/models/SOPLibrary';
import MCQBank from '@/models/MCQBank';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    await connectDB();

    // 1. All unique raw department values in SOPLibrary + sample identifiers per dept
    const libraryDepts = await SOPLibrary.aggregate([
      {
        $group: {
          _id: '$department',
          count: { $sum: 1 },
          sampleIdentifiers: { $push: '$sopIdentifier' },
          sampleNames: { $push: '$sopName' },
        }
      },
      { $sort: { count: -1 } },
      {
        $project: {
          department: '$_id',
          count: 1,
          sampleIdentifiers: { $slice: ['$sampleIdentifiers', 5] },
          sampleNames: { $slice: ['$sampleNames', 3] },
        }
      }
    ]);

    // 2. Identifier format analysis - what patterns exist?
    const identifierFormats = await SOPLibrary.aggregate([
      {
        $addFields: {
          identifierLen: { $strLenCP: '$sopIdentifier' },
          hasHyphen: { $gt: [{ $indexOfCP: ['$sopIdentifier', '-'] }, -1] },
          matchesOldRegex: {
            $regexMatch: {
              input: '$sopIdentifier',
              regex: '^[A-Za-z]{2,4}[0-9]{2,3}-[0-9]{2}$'
            }
          },
          matchesNewRegex: {
            $regexMatch: {
              input: '$sopIdentifier',
              regex: '^[A-Za-z]{2,6}[0-9]{1,4}-[0-9]{1,3}$'
            }
          },
        }
      },
      {
        $group: {
          _id: {
            department: '$department',
            matchesOld: '$matchesOldRegex',
            matchesNew: '$matchesNewRegex',
          },
          count: { $sum: 1 },
          sampleIds: { $push: '$sopIdentifier' },
        }
      },
      { $sort: { '_id.department': 1 } },
      {
        $project: {
          department: '$_id.department',
          matchesOldRegex: '$_id.matchesOld',
          matchesNewRegex: '$_id.matchesNew',
          count: 1,
          sampleIds: { $slice: ['$sampleIds', 3] },
        }
      }
    ]);

    // 3. MCQBank folderDepartment values
    const mcqDepts = await MCQBank.aggregate([
      {
        $group: {
          _id: '$folderDepartment',
          count: { $sum: 1 },
          distinctSOPs: { $addToSet: '$sopIdentifier' },
          sampleIdentifiers: { $push: '$sopIdentifier' },
        }
      },
      { $sort: { count: -1 } },
      {
        $project: {
          folderDepartment: '$_id',
          count: 1,
          uniqueSOPCount: { $size: '$distinctSOPs' },
          sampleIdentifiers: { $slice: ['$sampleIdentifiers', 5] },
        }
      }
    ]);

    // 4. SOPLibrary total count (no filter)
    const totalLibraryCount = await SOPLibrary.countDocuments();

    // 5. How many pass old vs new regex
    const oldRegexCount = await SOPLibrary.countDocuments({
      sopIdentifier: { $regex: /^[A-Z]{2,4}\d{2,3}-\d{2}$/i }
    });
    const newRegexCount = await SOPLibrary.countDocuments({
      sopIdentifier: { $regex: /^[A-Z]{2,6}\d{1,4}-\d{1,3}$/i }
    });

    return NextResponse.json({
      summary: {
        totalLibraryEntries: totalLibraryCount,
        matchingOldRegex: oldRegexCount,
        matchingNewRegex: newRegexCount,
        excludedByOldRegex: totalLibraryCount - oldRegexCount,
        excludedByNewRegex: totalLibraryCount - newRegexCount,
      },
      libraryDepartments: libraryDepts,
      identifierFormatAnalysis: identifierFormats,
      mcqBankFolderDepartments: mcqDepts,
    });

  } catch (error) {
    return NextResponse.json(
      { error: 'Debug failed', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
