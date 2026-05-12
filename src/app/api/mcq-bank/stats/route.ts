import { NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import MCQBank from '@/models/MCQBank';
import { getRedis, REDIS_TTL } from '@/lib/redis';

const MCQ_STATS_CACHE_KEY = 'mcq-stats:v1';

export async function GET() {
  try {
    const redis = getRedis();
    if (redis) {
      try {
        const cached = await redis.get(MCQ_STATS_CACHE_KEY);
        if (cached) return NextResponse.json(cached);
      } catch { /* fall through */ }
    }

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

    const responseBody = {
      success: true,
      gujarati: {
        numberOfMcqBanks: gujaratiCount,
        totalQuestions: gujaratiTotalQuestions,
        uniqueSopsWithMcq: uniqueSopsWithGujaratiMcq,
      },
      english: {
        numberOfMcqBanks: englishCount,
      },
    };

    if (redis) {
      try { await redis.set(MCQ_STATS_CACHE_KEY, responseBody, { ex: REDIS_TTL.FIVE_MIN }); } catch { /* ignore */ }
    }

    return NextResponse.json(responseBody);
  } catch (error) {
    console.error('Error fetching MCQ stats:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch stats' },
      { status: 500 }
    );
  }
}
