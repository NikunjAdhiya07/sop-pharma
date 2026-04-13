import { NextResponse, type NextRequest } from 'next/server';
import connectDB from '@/lib/mongodb';
import MCQReview from '@/models/MCQReview';
import MCQBank from '@/models/MCQBank';

export async function GET(request: NextRequest) {
  try {
    await connectDB();

    // Get MCQBank statistics by department
    const mcqBankStats = await MCQBank.aggregate([
      {
        $group: {
          _id: '$department',
          totalSOPs: { $sum: 1 },
          totalQuestions: { $sum: '$totalQuestions' },
        },
      },
      {
        $sort: { _id: 1 },
      },
    ]);

    // Get MCQReview with department info via lookup
    const mcqReviewStats = await MCQReview.aggregate([
      {
        $lookup: {
          from: 'mcqbanks',
          localField: 'originalMcqBankId',
          foreignField: '_id',
          as: 'mcqBankInfo',
        },
      },
      {
        $unwind: {
          path: '$mcqBankInfo',
          preserveNullAndEmptyArrays: true,
        },
      },
      {
        $group: {
          _id: { department: '$mcqBankInfo.department', status: '$reviewStatus' },
          count: { $sum: 1 },
        },
      },
    ]);

    // Get overall review status
    const overallReviewStats = await MCQReview.aggregate([
      {
        $group: {
          _id: '$reviewStatus',
          count: { $sum: 1 },
        },
      },
    ]);

    // Build a map of review stats for quick lookup
    const reviewStatsMap: Record<string, { done: number; pending: number }> = {};
    mcqReviewStats.forEach((stat: any) => {
      const dept = stat._id.department || 'Unknown';
      const status = stat._id.status;

      if (!reviewStatsMap[dept]) {
        reviewStatsMap[dept] = { done: 0, pending: 0 };
      }
      reviewStatsMap[dept][status === 'done' ? 'done' : 'pending'] = stat.count;
    });

    // Get detailed stats by department
    const detailedStats = mcqBankStats.map((dept: any) => {
      const deptName = dept._id || 'Unknown';
      const reviewData = reviewStatsMap[deptName] || { done: 0, pending: 0 };
      const reviewedQuestions = reviewData.done;
      const pendingQuestions = reviewData.pending;
      const totalReviewedCount = reviewedQuestions + pendingQuestions;

      return {
        department: deptName,
        totalSOPs: dept.totalSOPs,
        totalQuestions: dept.totalQuestions,
        reviewedQuestions: reviewedQuestions,
        notReviewedQuestions: pendingQuestions,
        totalReviewsInQueue: totalReviewedCount,
        reviewPercentage: totalReviewedCount > 0 ? Math.round((reviewedQuestions / totalReviewedCount) * 100) : 0,
      };
    });

    // Calculate overall stats
    const overallStats = detailedStats.reduce(
      (acc: any, dept: any) => ({
        totalDepartments: acc.totalDepartments + 1,
        totalSOPs: acc.totalSOPs + dept.totalSOPs,
        totalQuestions: acc.totalQuestions + dept.totalQuestions,
        totalReviewed: acc.totalReviewed + dept.reviewedQuestions,
        totalNotReviewed: acc.totalNotReviewed + dept.notReviewedQuestions,
        totalInReviewQueue: acc.totalInReviewQueue + dept.totalReviewsInQueue,
      }),
      {
        totalDepartments: 0,
        totalSOPs: 0,
        totalQuestions: 0,
        totalReviewed: 0,
        totalNotReviewed: 0,
        totalInReviewQueue: 0,
      }
    );

    // Calculate overall review percentage based on review queue
    const overallPercentage =
      overallStats.totalInReviewQueue > 0
        ? Math.round((overallStats.totalReviewed / overallStats.totalInReviewQueue) * 100)
        : 0;

    return NextResponse.json({
      success: true,
      timestamp: new Date(),
      overall: {
        ...overallStats,
        reviewPercentage: overallPercentage,
      },
      byDepartment: detailedStats.sort((a: any, b: any) => {
        // Sort by total questions descending
        return b.totalQuestions - a.totalQuestions;
      }),
      reviewStatusBreakdown: overallReviewStats.reduce(
        (acc: any, stat: any) => ({
          ...acc,
          [stat._id || 'unknown']: stat.count,
        }),
        {}
      ),
    });
  } catch (error) {
    console.error('Error fetching MCQ review stats:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to fetch MCQ review statistics',
      },
      { status: 500 }
    );
  }
}
