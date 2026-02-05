import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import MasterSOPRepository from '@/models/MasterSOPRepository';
import mongoose from 'mongoose';

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    // In Next.js 15+, params is a Promise
    const params = await context.params;
    const sopId = params.id;
    
    console.log('[API] Fetching SOP with ID:', sopId);
    
    await connectDB();

    // Validate MongoDB ObjectId format
    if (!mongoose.Types.ObjectId.isValid(sopId)) {
      console.error('[API] Invalid ObjectId format:', sopId);
      return NextResponse.json(
        { success: false, error: 'Invalid SOP ID format' },
        { status: 400 }
      );
    }

    const sop = await MasterSOPRepository.findById(sopId).lean();

    console.log('[API] SOP found:', sop ? 'Yes' : 'No');

    if (!sop) {
      // Log all available SOPs for debugging
      const allSops = await MasterSOPRepository.find({}, '_id sopIdentifier').limit(5).lean();
      console.log('[API] Sample SOPs in database:', allSops);
      
      return NextResponse.json(
        { success: false, error: 'SOP not found' },
        { status: 404 }
      );
    }

    // Convert _id to string
    const sopWithStringId = {
      ...sop,
      _id: sop._id.toString(),
    };

    console.log('[API] Returning SOP:', sopWithStringId.sopIdentifier);

    return NextResponse.json({
      success: true,
      sop: sopWithStringId,
    });

  } catch (error) {
    console.error('[API] Error fetching SOP:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to fetch SOP',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
