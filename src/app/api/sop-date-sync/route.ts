import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import MasterSOPRepository from '@/models/MasterSOPRepository';

/**
 * GET /api/sop-date-sync
 * Fetches all SOPs from Master SOP Repository with their extracted dates
 */
export async function GET(request: NextRequest) {
  try {
    await connectDB();

    // Fetch all SOPs from Master SOP Repository
    const sops = await MasterSOPRepository.find({})
      .sort({ updatedAt: -1 })
      .lean();

    // Transform the data to match the frontend interface
    const transformedSOPs = sops.map((sop: any) => ({
      _id: sop._id.toString(),
      sopIdentifier: sop.sopIdentifier,
      sopName: sop.sopName,
      department: sop.department,
      effectiveDate: sop.metadata?.effectiveDate || null,
      reviewDate: sop.metadata?.reviewDate || null,
      expiryDate: sop.metadata?.expiryDate || null,
      version: sop.metadata?.version || null,
      syncedAt: sop.updatedAt,
      status: determineStatus(sop),
    }));

    return NextResponse.json({
      success: true,
      sops: transformedSOPs,
      total: transformedSOPs.length,
    });

  } catch (error) {
    console.error('Error fetching synced SOPs:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to fetch synced SOPs',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

/**
 * Helper function to determine SOP status based on available dates
 */
function determineStatus(sop: any): 'synced' | 'pending' | 'error' {
  const hasEffectiveDate = !!sop.metadata?.effectiveDate;
  const hasReviewDate = !!sop.metadata?.reviewDate;

  if (hasEffectiveDate && hasReviewDate) {
    return 'synced';
  } else if (hasEffectiveDate || hasReviewDate) {
    return 'pending';
  } else {
    return 'error';
  }
}
