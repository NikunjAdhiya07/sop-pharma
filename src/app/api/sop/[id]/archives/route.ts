import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import ArchivedSOP from '@/models/ArchivedSOP';
import ArchivedMCQBank from '@/models/ArchivedMCQBank';

// GET /api/sop/[id]/archives
// Returns all archived versions of a specific SOP, ordered newest-first
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await connectDB();

    const { id } = await params;
    if (!id) {
      return NextResponse.json({ error: 'SOP ID is required' }, { status: 400 });
    }

    // Fetch all archived versions for this SOP
    const archives = await ArchivedSOP.find({ originalSOPId: id })
      .sort({ archivedAt: -1 })
      .select('-content') // Exclude full content by default (too large)
      .lean();

    // For each archive, check if there's a corresponding MCQ bank
    const archivesWithMCQInfo = await Promise.all(
      archives.map(async (archive) => {
        const mcqBank = await ArchivedMCQBank.findOne({ archivedSOPId: archive._id })
          .select('totalQuestions difficultyDistribution sopVersion archivedAt language')
          .lean();
        return {
          ...archive,
          mcqBank: mcqBank || null,
        };
      })
    );

    return NextResponse.json({
      success: true,
      sopId: id,
      totalVersions: archives.length,
      archives: archivesWithMCQInfo,
    });

  } catch (error) {
    console.error('Error fetching SOP archives:', error);
    const message = error instanceof Error ? error.message : 'Failed to fetch archives';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
