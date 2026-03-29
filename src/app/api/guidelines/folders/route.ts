import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import SOPGuideline from '@/models/SOPGuideline';
import User from '@/models/User';

export const dynamic = 'force-dynamic';

/**
 * API Endpoint: Guideline Folder Management
 * 
 * Manages guideline folders (categories)
 */

// GET: List all folders with statistics
export async function GET() {
  try {
    await dbConnect();
    void User; // Ensure User schema is registered

    // Aggregate folder statistics
    const folderStats = await SOPGuideline.aggregate([
      {
        $group: {
          _id: '$folderName',
          guidelineCount: { $sum: 1 },
          totalClauses: { $sum: { $size: { $ifNull: ['$clauses', []] } } },
          lastUpdated: { $max: '$updatedAt' },
        },
      },
      {
        $project: {
          folderName: '$_id',
          guidelineCount: 1,
          totalClauses: 1,
          lastUpdated: 1,
          _id: 0,
        },
      },
      {
        $sort: { folderName: 1 },
      },
    ]).option({ maxTimeMS: 20000 }); // 20s aggregation timeout

    // Default folders if none exist
    const defaultFolders = [
      { folderName: 'ICH Guidelines', guidelineCount: 0, totalClauses: 0 },
      { folderName: 'WHO GMP', guidelineCount: 0, totalClauses: 0 },
      { folderName: 'FDA CFR', guidelineCount: 0, totalClauses: 0 },
      { folderName: 'Schedule M', guidelineCount: 0, totalClauses: 0 },
    ];

    // Merge existing folders with defaults
    const existingFolderNames = folderStats.map(f => f.folderName);
    const folders = [
      ...folderStats,
      ...defaultFolders.filter(df => !existingFolderNames.includes(df.folderName)),
    ].sort((a, b) => a.folderName.localeCompare(b.folderName));

    return NextResponse.json({
      success: true,
      folders,
      totalGuidelines: folderStats.reduce((sum, f) => sum + f.guidelineCount, 0),
      totalClauses: folderStats.reduce((sum, f) => sum + f.totalClauses, 0),
    });
  } catch (error) {
    console.error('Error fetching guideline folders:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to fetch folders',
        details: (error as Error).message,
      },
      { status: 500 }
    );
  }
}

// POST: Create a new folder (just a validation, folders are created on upload)
export async function POST(request: NextRequest) {
  try {
    const { folderName } = await request.json();

    if (!folderName || typeof folderName !== 'string') {
      return NextResponse.json(
        { success: false, error: 'Folder name is required' },
        { status: 400 }
      );
    }

    const trimmedName = folderName.trim();
    if (trimmedName.length < 2 || trimmedName.length > 50) {
      return NextResponse.json(
        { success: false, error: 'Folder name must be between 2 and 50 characters' },
        { status: 400 }
      );
    }

    // Folder is valid - it will be created when guidelines are uploaded
    return NextResponse.json({
      success: true,
      message: 'Folder name is valid',
      folderName: trimmedName,
    });
  } catch (error) {
    console.error('Error creating folder:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to create folder',
        details: (error as Error).message,
      },
      { status: 500 }
    );
  }
}

// DELETE: Remove all guidelines from a folder
export async function DELETE(request: NextRequest) {
  try {
    await dbConnect();

    const { searchParams } = new URL(request.url);
    const folderName = searchParams.get('folderName');

    if (!folderName) {
      return NextResponse.json(
        { success: false, error: 'Folder name is required' },
        { status: 400 }
      );
    }

    const result = await SOPGuideline.deleteMany({ folderName });

    return NextResponse.json({
      success: true,
      message: `Deleted ${result.deletedCount} guidelines from folder "${folderName}"`,
      deletedCount: result.deletedCount,
    });
  } catch (error) {
    console.error('Error deleting folder:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to delete folder',
        details: (error as Error).message,
      },
      { status: 500 }
    );
  }
}
