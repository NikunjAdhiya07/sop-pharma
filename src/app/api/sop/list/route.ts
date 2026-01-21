import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import SOP from '@/models/SOP';

export async function GET(request: NextRequest) {
  try {
    await connectDB();

    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '20');

    let query: any = {};

    if (status && ['uploaded', 'processing', 'completed', 'failed'].includes(status)) {
      query.status = status;
    }

    const sops = await SOP.find(query)
      .select('-content') // Exclude large content field
      .sort({ uploadedAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit);

    const total = await SOP.countDocuments(query);

    return NextResponse.json({
      success: true,
      sops,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });

  } catch (error) {
    console.error('Error fetching SOPs:', error);
    return NextResponse.json(
      { 
        error: 'Failed to fetch SOPs',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
