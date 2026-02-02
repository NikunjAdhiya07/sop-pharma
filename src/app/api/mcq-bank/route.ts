import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import MCQBank from '@/models/MCQBank';

export async function GET(request: NextRequest) {
  try {
    await connectDB();

    const { searchParams } = new URL(request.url);
    const sopId = searchParams.get('sopId');
    const difficulty = searchParams.get('difficulty');
    const folderDepartment = searchParams.get('folderDepartment');
    const folderSubcategory = searchParams.get('folderSubcategory');
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '10');

    let query: any = {};

    if (sopId) {
      query.sopId = sopId;
    }

    // Folder filtering
    if (folderDepartment) {
      query.folderDepartment = folderDepartment;
    }
    if (folderSubcategory) {
      query.folderSubcategory = folderSubcategory;
    }


    // Fetch MCQ Banks with folder fields explicitly selected
    const mcqBanks = await MCQBank.find(query)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean();

    const total = await MCQBank.countDocuments(query);

    // Debug: Log folder field status
    const organizedCount = mcqBanks.filter(b => b.folderDepartment && b.folderSubcategory).length;
    console.log(`📊 Fetched ${mcqBanks.length} banks: ${organizedCount} organized, ${mcqBanks.length - organizedCount} unorganized`);
    
    if (mcqBanks.length > 0) {
      const sample = mcqBanks[0];
      console.log(`📝 Sample bank: ${sample.sopIdentifier}, folder: ${sample.folderDepartment}/${sample.folderSubcategory}`);
    }

    // Filter by difficulty if specified
    let filteredMCQBanks = mcqBanks;
    if (difficulty && ['Easy', 'Medium', 'Hard'].includes(difficulty)) {
      filteredMCQBanks = mcqBanks.map(bank => ({
        ...bank,
        mcqs: bank.mcqs.filter((mcq: any) => mcq.difficulty === difficulty),
      }));
    }

    return NextResponse.json({
      success: true,
      mcqBanks: filteredMCQBanks,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });

  } catch (error) {
    console.error('Error fetching MCQ Banks:', error);
    return NextResponse.json(
      { 
        error: 'Failed to fetch MCQ Banks',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    await connectDB();

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json(
        { error: 'MCQ Bank ID is required' },
        { status: 400 }
      );
    }

    const mcqBank = await MCQBank.findByIdAndDelete(id);

    if (!mcqBank) {
      return NextResponse.json(
        { error: 'MCQ Bank not found' },
        { status: 404 }
      );
    }

    // Optional: Reset SOP mcqCount if link exists
    try {
      const SOP = (await import('@/models/SOP')).default;
      await SOP.findByIdAndUpdate(mcqBank.sopId, { 
        $set: { mcqCount: 0, status: 'pending' } 
      });
    } catch (sopErr) {
      console.warn('Could not reset SOP stats after bank deletion:', sopErr);
    }

    return NextResponse.json({
      success: true,
      message: 'MCQ Bank deleted successfully'
    });

  } catch (error) {
    console.error('Error deleting MCQ Bank:', error);
    return NextResponse.json(
      { 
        error: 'Failed to delete MCQ Bank',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
