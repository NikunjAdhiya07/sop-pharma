import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import MasterSOPRepository from '@/models/MasterSOPRepository';

export async function GET(request: NextRequest) {
  try {
    await connectDB();

    const { searchParams } = new URL(request.url);
    const department = searchParams.get('department');

    // Build query
    const query: any = {};
    if (department && department !== 'all') {
      query.department = department;
    }

    // Fetch all Master Repository SOPs
    const masterSOPs = await MasterSOPRepository.find(query)
      .sort({ department: 1, sopIdentifier: 1 })
      .lean();

    // Convert _id to string for each document
    const sopsWithStringIds = masterSOPs.map(sop => ({
      ...sop,
      _id: sop._id.toString(),
    }));

    // Get unique departments
    const departments = await MasterSOPRepository.distinct('department');

    // Log sample IDs for debugging
    if (sopsWithStringIds.length > 0) {
      console.log('[API] Sample SOP IDs:', sopsWithStringIds.slice(0, 3).map(s => ({ id: s._id, identifier: s.sopIdentifier })));
    }

    return NextResponse.json({
      success: true,
      sops: sopsWithStringIds,
      departments: departments.sort(),
      total: sopsWithStringIds.length,
    });

  } catch (error) {
    console.error('Error fetching Master SOP Repository:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to fetch Master SOP Repository',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
