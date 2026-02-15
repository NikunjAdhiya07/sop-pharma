
import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import EliminatedQuestion from '@/models/EliminatedQuestion';

export async function GET(request: NextRequest) {
  try {
    await connectDB();
    const { searchParams } = new URL(request.url);
    const bankId = searchParams.get('bankId');
    const sopId = searchParams.get('sopId');
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '50');
    const grouped = searchParams.get('grouped') === 'true'; // New param for grouped view
    const source = searchParams.get('source'); // 'similarity' or 'review'
    
    // Dynamically import MCQRecycle to avoid potential compilation issues if not used elsewhere
    const MCQRecycle = (await import('@/models/MCQRecycle')).default;

    const query: any = {};
    const recycleQuery: any = {};
    
    if (sopId) {
      query.sopId = sopId;
      recycleQuery.sopId = sopId;
    }
    
    // Filter based on source
    let eliminatedQuestions: any[] = [];
    let recycledQuestions: any[] = [];
    let totalEliminated = 0;
    let totalRecycled = 0;
    
    if (source === 'similarity') {
      // Only fetch duplicate-based eliminations (from Similar Questions workflow)
      query.eliminationReason = 'duplicate';
      
      [eliminatedQuestions, totalEliminated] = await Promise.all([
        EliminatedQuestion.find(query)
          .sort({ eliminatedAt: -1 })
          .limit(grouped ? 1000 : limit * page)
          .lean(),
        EliminatedQuestion.countDocuments(query)
      ]);
      
      // No recycled questions for similarity source
      recycledQuestions = [];
      totalRecycled = 0;
      
    } else if (source === 'review') {
      // Only fetch review-based eliminations and replacements
      // Exclude duplicates (those come from similarity workflow)
      query.eliminationReason = { $ne: 'duplicate' };
      
      [eliminatedQuestions, recycledQuestions, totalEliminated, totalRecycled] = await Promise.all([
        EliminatedQuestion.find(query)
          .sort({ eliminatedAt: -1 })
          .limit(grouped ? 1000 : limit * page)
          .lean(),
        MCQRecycle.find(recycleQuery)
          .sort({ replacedAt: -1 })
          .limit(grouped ? 1000 : limit * page)
          .lean(),
        EliminatedQuestion.countDocuments(query),
        MCQRecycle.countDocuments(recycleQuery)
      ]);
      
    } else {
      // No source filter - fetch all (original behavior)
      [eliminatedQuestions, recycledQuestions, totalEliminated, totalRecycled] = await Promise.all([
        EliminatedQuestion.find(query)
          .sort({ eliminatedAt: -1 })
          .limit(grouped ? 1000 : limit * page)
          .lean(),
        MCQRecycle.find(recycleQuery)
          .sort({ replacedAt: -1 })
          .limit(grouped ? 1000 : limit * page)
          .lean(),
        EliminatedQuestion.countDocuments(query),
        MCQRecycle.countDocuments(recycleQuery)
      ]);
    }

    // Map recycled questions to match eliminated question structure
    const mappedRecycled = recycledQuestions.map((q: any) => ({
      _id: q._id,
      sopId: q.sopId,
      sopName: q.sopName,
      sopIdentifier: q.sopIdentifier,
      question: q.oldVersion,
      originalQuestionIndex: q.originalQuestionIndex,
      eliminationReason: 'replaced', // Custom reason for recycled
      eliminatedAt: q.replacedAt,
      eliminatedBy: q.replacedBy,
      replacedWith: 'Updated via Review Center',
      isRecycled: true
    }));

    // Combine and sort
    let allQuestions = [...eliminatedQuestions, ...mappedRecycled].sort((a: any, b: any) => {
      const dateA = new Date(a.eliminatedAt).getTime();
      const dateB = new Date(b.eliminatedAt).getTime();
      return dateB - dateA;
    });

    const total = totalEliminated + totalRecycled;

    // Apply pagination to the combined list (if not grouped)
    // If grouped, we used a high limit (1000) so we likely have most of them.
    // Pagination logic here is 'post-fetch' which is fine for moderate dataset sizes.
    // Ideally user asks for page 2, we need to skip page 1.
    
    if (!grouped) {
       const skip = (page - 1) * limit;
       allQuestions = allQuestions.slice(skip, skip + limit);
    }

    // If grouped view is requested, group by SOP
    if (grouped) {
      const groupedBySOP: any = {};
      
      allQuestions.forEach((q: any) => {
        const key = q.sopIdentifier;
        if (!groupedBySOP[key]) {
          // Extract department from identifier (e.g., "QAGE10-05" -> "QA")
          const deptMatch = q.sopIdentifier.match(/^([A-Z]+)/);
          const department = deptMatch ? deptMatch[1] : 'Unknown';
          
          groupedBySOP[key] = {
            sopId: q.sopId,
            sopName: q.sopName,
            sopIdentifier: q.sopIdentifier,
            department: department,
            questions: [],
            totalQuestions: 0
          };
        }
        groupedBySOP[key].questions.push(q);
        groupedBySOP[key].totalQuestions++;
      });

      return NextResponse.json({
        success: true,
        groupedBySOP: Object.values(groupedBySOP),
        pagination: {
          current: page,
          total: Math.ceil(total / limit),
          totalRecords: total
        }
      });
    }

    return NextResponse.json({
      success: true,
      questions: allQuestions,
      pagination: {
        current: page,
        total: Math.ceil(total / limit),
        totalRecords: total
      }
    });

  } catch (error) {
    console.error('Error fetching eliminated questions:', error);
    return NextResponse.json(
      { error: 'Failed to fetch eliminated questions' },
      { status: 500 }
    );
  }
}
