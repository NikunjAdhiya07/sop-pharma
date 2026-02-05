import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import SOP from '@/models/SOP';

/**
 * API endpoint to validate and correct SOP monitoring data
 * This ensures all SOPs have correct dates and status based on Review Date as Expiry Date
 */
export async function POST(req: NextRequest) {
  try {
    await connectDB();

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Fetch all SOPs
    const allSOPs = await SOP.find({}).lean();
    
    const validationResults = {
      total: allSOPs.length,
      withReviewDate: 0,
      withExpiryDate: 0,
      withBothDates: 0,
      missingDates: 0,
      expired: 0,
      expiringSoon: 0,
      needsReview: 0,
      valid: 0,
      details: [] as any[],
    };

    for (const sop of allSOPs) {
      const reviewDate = sop.reviewDate ? new Date(sop.reviewDate) : null;
      const expiryDate = sop.expiryDate ? new Date(sop.expiryDate) : null;
      const effectiveExpiryDate = reviewDate || expiryDate;

      // Count date availability
      if (reviewDate) validationResults.withReviewDate++;
      if (expiryDate) validationResults.withExpiryDate++;
      if (reviewDate && expiryDate) validationResults.withBothDates++;
      if (!reviewDate && !expiryDate) validationResults.missingDates++;

      // Calculate status
      let status = 'valid';
      let daysToExpiry = null;

      if (effectiveExpiryDate) {
        const diffTime = effectiveExpiryDate.getTime() - today.getTime();
        daysToExpiry = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

        if (effectiveExpiryDate < today) {
          status = 'expired';
          validationResults.expired++;
        } else if (daysToExpiry <= 7) {
          status = 'needsReview';
          validationResults.needsReview++;
        } else if (daysToExpiry <= 30) {
          status = 'expiringSoon';
          validationResults.expiringSoon++;
        } else {
          validationResults.valid++;
        }
      } else {
        validationResults.valid++;
      }

      validationResults.details.push({
        identifier: sop.identifier,
        name: sop.name,
        department: sop.department,
        reviewDate: reviewDate?.toISOString(),
        expiryDate: expiryDate?.toISOString(),
        effectiveExpiryDate: effectiveExpiryDate?.toISOString(),
        status,
        daysToExpiry,
      });
    }

    // Sort details by status priority (expired first)
    validationResults.details.sort((a, b) => {
      const statusPriority: any = { expired: 0, needsReview: 1, expiringSoon: 2, valid: 3 };
      return statusPriority[a.status] - statusPriority[b.status];
    });

    return NextResponse.json({
      success: true,
      message: 'SOP monitoring data validated successfully',
      validation: validationResults,
    });

  } catch (error: any) {
    console.error('Error validating SOP monitoring data:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to validate SOP monitoring data',
        details: error.message 
      },
      { status: 500 }
    );
  }
}
