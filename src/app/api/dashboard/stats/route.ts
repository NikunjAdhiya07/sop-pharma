import { NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import SOP from '@/models/SOP';
import MCQBank from '@/models/MCQBank';

export async function GET() {
  try {
    await connectDB();

    // Get total SOPs
    const totalSOPs = await SOP.countDocuments();

    // Get MCQ Banks stats
    const mcqBanks = await MCQBank.find({}, { totalQuestions: 1, createdAt: 1 }).lean();
    const totalMCQBanks = mcqBanks.length;
    const totalQuestions = mcqBanks.reduce((sum, bank) => sum + (bank.totalQuestions || 0), 0);

    // Get last activity
    const lastSOP = await SOP.findOne().sort({ updatedAt: -1 }).select('updatedAt');
    const lastBank = await MCQBank.findOne().sort({ updatedAt: -1 }).select('updatedAt');

    let lastActivity = null;
    if (lastSOP && lastBank) {
      lastActivity = lastSOP.updatedAt > lastBank.updatedAt ? lastSOP.updatedAt : lastBank.updatedAt;
    } else if (lastSOP) {
      lastActivity = lastSOP.updatedAt;
    } else if (lastBank) {
      lastActivity = lastBank.updatedAt;
    }

    return NextResponse.json({
      success: true,
      stats: {
        totalSOPs,
        totalMCQBanks,
        totalQuestions,
        lastActivity: lastActivity ? lastActivity.toISOString() : null,
      }
    });

  } catch (error) {
    console.error('Error fetching dashboard stats:', error);
    return NextResponse.json(
      { 
        error: 'Failed to fetch dashboard stats',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
