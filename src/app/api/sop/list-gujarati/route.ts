import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import SOP from '@/models/SOP';

export async function GET(request: NextRequest) {
  try {
    await connectDB();

    // Find all Gujarati SOPs
    const gujaratiSOPs = await SOP.find({ language: 'Gujarati' })
      .select('_id name identifier language department uploadedAt')
      .sort({ uploadedAt: -1 });

    return NextResponse.json({
      success: true,
      count: gujaratiSOPs.length,
      sops: gujaratiSOPs,
    });

  } catch (error) {
    console.error('Error fetching Gujarati SOPs:', error);
    return NextResponse.json(
      { 
        error: 'Failed to fetch Gujarati SOPs',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
