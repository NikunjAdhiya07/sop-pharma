import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import MCQRecycle from '@/models/MCQRecycle';

// GET: Fetch recycled questions
export async function GET(request: NextRequest) {
  try {
    await connectDB();

    const { searchParams } = new URL(request.url);
    const sopId = searchParams.get('sopId');
    const folderPath = searchParams.get('folderPath');
    const isRestored = searchParams.get('isRestored');

    let query: any = {};
    
    if (sopId) {
      query.sopId = sopId;
    }
    
    if (folderPath) {
      query.folderPath = folderPath;
    }
    
    if (isRestored !== null && isRestored !== undefined) {
      query.isRestored = isRestored === 'true';
    }

    const recycledQuestions = await MCQRecycle.find(query)
      .sort({ replacedAt: -1 })
      .lean();

    // Group by folder path for organized display
    const groupedByFolder: Record<string, any[]> = {};
    recycledQuestions.forEach((item) => {
      if (!groupedByFolder[item.folderPath]) {
        groupedByFolder[item.folderPath] = [];
      }
      groupedByFolder[item.folderPath].push(item);
    });

    return NextResponse.json({
      success: true,
      recycled: recycledQuestions,
      count: recycledQuestions.length,
      groupedByFolder,
    });
  } catch (error: any) {
    console.error('Error fetching recycled questions:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}

// POST: Move a question to recycle (called when marking as completed with changes)
export async function POST(request: NextRequest) {
  try {
    await connectDB();

    const body = await request.json();
    const {
      originalReviewId,
      originalMcqBankId,
      originalQuestionIndex,
      sopId,
      sopName,
      sopIdentifier,
      oldVersion,
      newVersion,
      replacedBy,
      recycleReason,
    } = body;

    // Validate required fields
    if (!originalReviewId || !oldVersion || !newVersion || !sopIdentifier) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Create folder path based on SOP identifier
    // Extract department from identifier (e.g., "SOP-QA-001" -> "QA")
    const parts = sopIdentifier.split('-');
    const department = parts.length >= 2 ? parts[1] : 'General';
    const folderPath = `${department}/${sopIdentifier}`;

    // Create recycled item
    const recycled = await MCQRecycle.create({
      originalReviewId,
      originalMcqBankId,
      originalQuestionIndex,
      sopId,
      sopName,
      sopIdentifier,
      oldVersion,
      newVersion,
      replacedBy,
      replacedAt: new Date(),
      recycleReason: recycleReason || 'Question updated during review',
      folderPath,
      isRestored: false,
    });

    return NextResponse.json({
      success: true,
      recycled,
      message: 'Old version moved to recycle successfully',
    });
  } catch (error: any) {
    console.error('Error recycling question:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}

// PUT: Restore a recycled question
export async function PUT(request: NextRequest) {
  try {
    await connectDB();

    const body = await request.json();
    const { recycleId, restoredBy } = body;

    if (!recycleId) {
      return NextResponse.json(
        { success: false, error: 'Recycle ID is required' },
        { status: 400 }
      );
    }

    const updatedRecycle = await MCQRecycle.findByIdAndUpdate(
      recycleId,
      {
        $set: {
          isRestored: true,
          restoredBy,
          restoredAt: new Date(),
        },
      },
      { new: true }
    );

    if (!updatedRecycle) {
      return NextResponse.json(
        { success: false, error: 'Recycled question not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      recycled: updatedRecycle,
      message: 'Question restored successfully',
    });
  } catch (error: any) {
    console.error('Error restoring question:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}

// DELETE: Permanently delete a recycled question
export async function DELETE(request: NextRequest) {
  try {
    await connectDB();

    const { searchParams } = new URL(request.url);
    const recycleId = searchParams.get('recycleId');

    if (!recycleId) {
      return NextResponse.json(
        { success: false, error: 'Recycle ID is required' },
        { status: 400 }
      );
    }

    const deletedRecycle = await MCQRecycle.findByIdAndDelete(recycleId);

    if (!deletedRecycle) {
      return NextResponse.json(
        { success: false, error: 'Recycled question not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Recycled question permanently deleted',
    });
  } catch (error: any) {
    console.error('Error deleting recycled question:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
