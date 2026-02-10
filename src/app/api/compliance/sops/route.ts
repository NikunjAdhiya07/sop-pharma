import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import SOP from '@/models/SOP';

/**
 * API Endpoint: List SOPs for Compliance Analysis
 * 
 * Returns SOPs available for compliance checking
 */

export async function GET(request: NextRequest) {
  try {
    await dbConnect();

    const { searchParams } = new URL(request.url);
    const department = searchParams.get('department');
    const search = searchParams.get('search');
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '50');

    // Build query
    const query: any = {};
    
    if (department && department !== 'all') {
      query.department = department;
    }
    
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { identifier: { $regex: search, $options: 'i' } },
      ];
    }

    // Get total count
    const total = await SOP.countDocuments(query);

    // Fetch SOPs with pagination
    const sops = await SOP.find(query)
      .select('_id identifier name department version status uploadedAt')
      .sort({ department: 1, identifier: 1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean();

    // Get unique departments for filter dropdown
    const departments = await SOP.distinct('department');

    return NextResponse.json({
      success: true,
      sops,
      departments: departments.filter(Boolean).sort(),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error('Error fetching SOPs for compliance:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to fetch SOPs',
        details: (error as Error).message,
      },
      { status: 500 }
    );
  }
}
