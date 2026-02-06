import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import SOPLibrary from '@/models/SOPLibrary';
import MCQBank from '@/models/MCQBank';
import { organizeFolderStructure } from '@/lib/sopLibraryHelper';
import { performSOPLibrarySync } from '@/lib/sopLibrarySync';

// GET - Fetch SOP Library entries
export async function GET(request: NextRequest) {
  try {
    await connectDB();

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    const department = searchParams.get('department');
    const search = searchParams.get('search');
    const hasVideos = searchParams.get('hasVideos');
    const hasSlides = searchParams.get('hasSlides');
    const hasMCQs = searchParams.get('hasMCQs');
    const skipSync = searchParams.get('skipSync') === 'true';

    // Trigger sync check
    if (!id && !skipSync) {
      const count = await SOPLibrary.countDocuments();
      if (count === 0) {
        console.log('📚 SOP Library is empty, triggering initial sync...');
        await performSOPLibrarySync();
      } else {
        performSOPLibrarySync().catch(err => console.error('Auto-sync error:', err));
      }
    }

    // If ID is provided, fetch single entry
    if (id) {
      const sopLibrary = await SOPLibrary.findById(id)
        .populate('mcqBankId', 'totalQuestions difficultyDistribution');

      if (!sopLibrary) {
        return NextResponse.json(
          { success: false, error: 'SOP Library entry not found' },
          { status: 404 }
        );
      }

      return NextResponse.json({
        success: true,
        sopLibraries: [sopLibrary],
        total: 1,
      });
    }

    // Build query
    const query: any = {};

    if (department && department !== 'all') {
      query.department = department;
    }

    if (search) {
      query.$or = [
        { sopName: { $regex: search, $options: 'i' } },
        { sopIdentifier: { $regex: search, $options: 'i' } },
      ];
    }

    if (hasVideos === 'true') {
      query['completionStatus.hasVideos'] = true;
    }

    if (hasSlides === 'true') {
      query['completionStatus.hasSlides'] = true;
    }

    if (hasMCQs === 'true') {
      query['completionStatus.hasMCQs'] = true;
    }

    const sopLibraries = await SOPLibrary.find(query)
      .populate('mcqBankId', 'totalQuestions difficultyDistribution')
      .sort({ department: 1, sopIdentifier: 1 });

    // Organize by department
    const organized = organizeFolderStructure(sopLibraries);

    // Get unique departments
    const departments = [...new Set(sopLibraries.map(sop => sop.department))].sort();

    return NextResponse.json({
      success: true,
      sopLibraries,
      organized,
      departments,
      total: sopLibraries.length,
    });
  } catch (error: any) {
    console.error('Error fetching SOP library:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch SOP library', details: error.message },
      { status: 500 }
    );
  }
}

// POST - Create new SOP Library entry
export async function POST(request: NextRequest) {
  try {
    await connectDB();

    const body = await request.json();
    const { sopId, sopName, sopIdentifier, department, departmentCode, mcqBankId } = body;

    // Check if entry already exists
    const existing = await SOPLibrary.findOne({ sopIdentifier });
    if (existing) {
      return NextResponse.json(
        { success: false, error: 'SOP Library entry already exists for this identifier' },
        { status: 400 }
      );
    }

    const sopLibrary = new SOPLibrary({
      sopId,
      sopName,
      sopIdentifier,
      department,
      departmentCode,
      mcqBankId,
      videos: [],
      slides: [],
      sopDocuments: [],
    });

    await sopLibrary.save();

    return NextResponse.json({
      success: true,
      sopLibrary,
      message: 'SOP Library entry created successfully',
    });
  } catch (error: any) {
    console.error('Error creating SOP library entry:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to create SOP library entry', details: error.message },
      { status: 500 }
    );
  }
}

// PUT - Update SOP Library entry
export async function PUT(request: NextRequest) {
  try {
    await connectDB();

    const body = await request.json();
    const { id, updates } = body;

    if (!id) {
      return NextResponse.json(
        { success: false, error: 'SOP Library ID is required' },
        { status: 400 }
      );
    }

    const sopLibrary = await SOPLibrary.findByIdAndUpdate(
      id,
      { $set: updates },
      { new: true, runValidators: true }
    ).populate('mcqBankId', 'totalQuestions difficultyDistribution');

    if (!sopLibrary) {
      return NextResponse.json(
        { success: false, error: 'SOP Library entry not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      sopLibrary,
      message: 'SOP Library entry updated successfully',
    });
  } catch (error: any) {
    console.error('Error updating SOP library entry:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to update SOP library entry', details: error.message },
      { status: 500 }
    );
  }
}

// DELETE - Remove SOP Library entry
export async function DELETE(request: NextRequest) {
  try {
    await connectDB();

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json(
        { success: false, error: 'SOP Library ID is required' },
        { status: 400 }
      );
    }

    const sopLibrary = await SOPLibrary.findByIdAndDelete(id);

    if (!sopLibrary) {
      return NextResponse.json(
        { success: false, error: 'SOP Library entry not found' },
        { status: 404 }
      );
    }

    // TODO: Delete associated files from filesystem

    return NextResponse.json({
      success: true,
      message: 'SOP Library entry deleted successfully',
    });
  } catch (error: any) {
    console.error('Error deleting SOP library entry:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to delete SOP library entry', details: error.message },
      { status: 500 }
    );
  }
}
