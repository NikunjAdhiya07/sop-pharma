import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import SOP from '@/models/SOP';

// GET /api/sop/[id] - Fetch a single SOP by ID
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await connectDB();

    const { id } = params;
    if (!id) {
      return NextResponse.json({ error: 'SOP ID is required' }, { status: 400 });
    }

    const sop = await SOP.findById(id).select('-content');
    if (!sop) {
      return NextResponse.json({ error: 'SOP not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true, sop });
  } catch (error) {
    console.error('Error fetching SOP:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch SOP' },
      { status: 500 }
    );
  }
}
