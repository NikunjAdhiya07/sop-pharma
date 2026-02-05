import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import MasterSOPRepository from '@/models/MasterSOPRepository';

/**
 * POST /api/sop-date-sync/sync-to-monitoring
 * Syncs all SOPs from Master SOP Repository to ensure dates are available for SOP Monitoring
 * 
 * This endpoint ensures that:
 * 1. All SOPs in Master Repository have their dates properly set
 * 2. The SOP Monitoring system can access these dates
 * 3. Any missing or incomplete data is flagged
 */
export async function POST(request: NextRequest) {
  try {
    await connectDB();

    // Fetch all SOPs from Master SOP Repository
    const allSOPs = await MasterSOPRepository.find({}).lean();

    let syncedCount = 0;
    let skippedCount = 0;
    const errors: Array<{ sopIdentifier: string; error: string }> = [];

    // Process each SOP to ensure dates are properly formatted and accessible
    for (const sop of allSOPs) {
      try {
        // Verify that the SOP has the required date fields in metadata
        const hasEffectiveDate = !!sop.metadata?.effectiveDate;
        const hasReviewDate = !!sop.metadata?.reviewDate;

        if (hasEffectiveDate || hasReviewDate) {
          // Update the SOP to ensure dates are properly indexed
          await MasterSOPRepository.findByIdAndUpdate(
            sop._id,
            {
              $set: {
                'metadata.effectiveDate': sop.metadata?.effectiveDate || null,
                'metadata.reviewDate': sop.metadata?.reviewDate || null,
                'metadata.expiryDate': sop.metadata?.expiryDate || null,
                'metadata.version': sop.metadata?.version || '1.0',
              },
            },
            { new: true }
          );

          syncedCount++;
        } else {
          skippedCount++;
          errors.push({
            sopIdentifier: sop.sopIdentifier,
            error: 'Missing both effective date and review date',
          });
        }
      } catch (error) {
        console.error(`Error syncing SOP ${sop.sopIdentifier}:`, error);
        errors.push({
          sopIdentifier: sop.sopIdentifier,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
        skippedCount++;
      }
    }

    return NextResponse.json({
      success: true,
      message: 'Sync completed',
      syncedCount,
      skippedCount,
      totalSOPs: allSOPs.length,
      errors: errors.length > 0 ? errors : undefined,
    });

  } catch (error) {
    console.error('Error syncing to monitoring:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to sync to monitoring',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
