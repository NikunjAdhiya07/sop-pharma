import { NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import MCQBank from '@/models/MCQBank';

export async function GET() {
  try {
    await connectDB();

    const [gujaratiCount, gujaratiBanks, englishCount] = await Promise.all([
      MCQBank.countDocuments({ language: 'Gujarati' }),
      MCQBank.find({ language: 'Gujarati' })
        .select('sopId sopIdentifier totalQuestions')
        .lean(),
      MCQBank.countDocuments({ language: 'English' }),
    ]);

    const gujaratiTotalQuestions = (gujaratiBanks as any[]).reduce(
      (sum, b) => sum + (b.totalQuestions || 0),
      0
    );
    const uniqueSopsWithGujaratiMcq = new Set(
      (gujaratiBanks as any[]).map((b) => b.sopId?.toString()).filter(Boolean)
    ).size;

    return NextResponse.json({
      success: true,
      gujarati: {
        numberOfMcqBanks: gujaratiCount,
        totalQuestions: gujaratiTotalQuestions,
        uniqueSopsWithMcq: uniqueSopsWithGujaratiMcq,
      },
      english: {
        numberOfMcqBanks: englishCount,
      },
    });
  } catch (error) {
    console.error('Error fetching MCQ stats:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch stats' },
      { status: 500 }
    );
  }
}
