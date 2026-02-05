import { NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import SOP from '@/models/SOP';

export async function GET() {
  try {
    await connectDB();

    // Get a few SOPs to check their date formats
    const sops = await SOP.find({}).limit(10).lean();

    const debugInfo = sops.map(sop => ({
      name: sop.name,
      identifier: sop.identifier,
      reviewDate: {
        value: sop.reviewDate,
        type: typeof sop.reviewDate,
        isDate: sop.reviewDate instanceof Date,
        parsed: sop.reviewDate ? new Date(sop.reviewDate).toISOString() : null,
      },
      expiryDate: {
        value: sop.expiryDate,
        type: typeof sop.expiryDate,
        isDate: sop.expiryDate instanceof Date,
        parsed: sop.expiryDate ? new Date(sop.expiryDate).toISOString() : null,
      },
      effectiveDate: {
        value: sop.effectiveDate,
        type: typeof sop.effectiveDate,
        isDate: sop.effectiveDate instanceof Date,
        parsed: sop.effectiveDate ? new Date(sop.effectiveDate).toISOString() : null,
      },
    }));

    return NextResponse.json({
      success: true,
      totalSOPs: await SOP.countDocuments(),
      sampleSOPs: debugInfo,
    });

  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
