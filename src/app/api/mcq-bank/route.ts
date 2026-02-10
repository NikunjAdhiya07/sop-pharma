import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import MCQBank from '@/models/MCQBank';
import mongoose from 'mongoose';
import { getServerSession } from 'next-auth';
import { logAccess, getClientIP, getUserAgent } from '@/lib/accessLogger';

export async function GET(request: NextRequest) {
  try {
    await connectDB();

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    const sopId = searchParams.get('sopId');
    const difficulty = searchParams.get('difficulty');
    const folderDepartment = searchParams.get('folderDepartment');
    const folderSubcategory = searchParams.get('folderSubcategory');
    const page = parseInt(searchParams.get('page') || '1');
    const limit = Math.min(parseInt(searchParams.get('limit') || '10'), 1000);
    const summary = searchParams.get('summary') === 'true';

    // When fetching by specific ID, use native MongoDB driver
    // to bypass Mongoose schema filtering that strips isChecked/isReviewed
    if (id) {
      const db = mongoose.connection.db;
      if (!db) {
        return NextResponse.json({ error: 'Database not connected' }, { status: 500 });
      }
      const collection = db.collection('mcqbanks');
      const objectId = new mongoose.Types.ObjectId(id);
      const bank = await collection.findOne({ _id: objectId });

      if (!bank) {
        return NextResponse.json({
          success: true,
          mcqBanks: [],
          pagination: { page: 1, limit: 1, total: 0, totalPages: 0 },
        });
      }

      // Log status for debugging
      const checkedCount = bank.mcqs?.filter((m: any) => m.isChecked).length || 0;
      const reviewedCount = bank.mcqs?.filter((m: any) => m.isReviewed).length || 0;
      console.log(`📋 Fetched bank ${bank.sopIdentifier} via native driver: ${checkedCount} checked, ${reviewedCount} reviewed out of ${bank.mcqs?.length || 0} questions`);

      // Log access
      try {
        const session: any = await getServerSession();
        if (session?.user) {
          await logAccess({
            userId: session.user.id || session.user._id,
            username: session.user.username || session.user.name,
            userEmail: session.user.email,
            resourceType: 'mcq-bank',
            resourceId: id,
            resourceName: bank.sopIdentifier || bank.sopName,
            action: 'view',
            ipAddress: getClientIP(request.headers),
            userAgent: getUserAgent(request.headers),
            metadata: {
              mcqBankName: bank.sopName,
              questionsViewed: bank.mcqs?.length || 0,
            },
          });
        }
      } catch (logError) {
        console.error('Error logging access:', logError);
      }

      return NextResponse.json({
        success: true,
        mcqBanks: [bank],
        pagination: { page: 1, limit: 1, total: 1, totalPages: 1 },
      });
    }

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

    // If summary mode, only fetch essential fields
    if (summary) {
      const mcqBanks = await MCQBank.find(query)
        .select('sopId sopIdentifier sopName folderDepartment folderSubcategory totalQuestions difficultyDistribution createdAt')
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean();

      const total = await MCQBank.countDocuments(query);

      return NextResponse.json({
        success: true,
        mcqBanks,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      });
    }

    // Fetch MCQ Banks with folder fields explicitly selected
    const mcqBanks = await MCQBank.find(query)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean()
      .maxTimeMS(30000);

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
