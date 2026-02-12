
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
    const skip = (page - 1) * limit;

    const query: any = {};
    
    if (sopId) query.sopId = sopId;
    
    // Fetch eliminated questions
    const [questions, total] = await Promise.all([
      EliminatedQuestion.find(query)
        .sort({ eliminatedAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      EliminatedQuestion.countDocuments(query)
    ]);

    // If grouped view is requested, group by SOP
    if (grouped) {
      const groupedBySOP: any = {};
      
      questions.forEach((q: any) => {
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
      questions,
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
