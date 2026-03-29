import { NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import SOPLibrary from '@/models/SOPLibrary';
import MasterSOPRepository from '@/models/MasterSOPRepository';

export interface ExpiryAlert {
  _id: string;
  sopNo: string;
  sopName: string;
  department: string;
  reviewDate: string;
  daysUntilExpiry: number;
  priority: 'expired' | 'high' | 'medium' | 'low';
}

export async function GET() {
  try {
    await connectDB();

    // Fetch SOPs from library (filtered to valid identifiers, exclude annexures)
    const sopLibrariesRaw = await SOPLibrary.find({
      sopIdentifier: { $regex: /^[A-Z]{2,4}\d{2,3}-\d{2}$/i },
      sopName: { $not: /annexure/i },
    })
      .populate('sopId', 'reviewDate expiryDate')
      .select('sopIdentifier sopName department sopId')
      .lean();
    const sopLibraries = sopLibrariesRaw as Array<{
      _id: unknown;
      sopIdentifier: string;
      sopName: string;
      department: string;
      sopId: { reviewDate?: Date; expiryDate?: Date } | null;
    }>;

    // Pull review dates from MasterSOPRepository (most reliable source)
    const masterSOPs = await MasterSOPRepository.find({
      'metadata.reviewDate': { $ne: null }
    }).select('sopIdentifier metadata.reviewDate metadata.expiryDate').lean();

    const sopToReviewDateMap = new Map<string, Date>();
    masterSOPs.forEach((sop: any) => {
      if (sop.sopIdentifier) {
        const code = sop.sopIdentifier.trim().toUpperCase();
        const date = sop.metadata?.reviewDate || sop.metadata?.expiryDate;
        if (date) sopToReviewDateMap.set(code, new Date(date));
      }
    });

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const alerts: ExpiryAlert[] = [];

    for (const lib of sopLibraries) {
      const sopObj = lib.sopId as any;
      const sopCode = lib.sopIdentifier.trim().toUpperCase();

      // Resolve review/expiry date — priority: MasterSOPRepository > SOP.reviewDate > SOP.expiryDate
      let reviewDate: Date | null = null;
      if (sopToReviewDateMap.has(sopCode)) {
        reviewDate = sopToReviewDateMap.get(sopCode)!;
      } else if (sopObj?.reviewDate) {
        reviewDate = new Date(sopObj.reviewDate);
      } else if (sopObj?.expiryDate) {
        reviewDate = new Date(sopObj.expiryDate);
      }

      if (!reviewDate) continue; // Skip SOPs with no date info

      const diffMs = reviewDate.getTime() - today.getTime();
      const daysUntilExpiry = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

      let priority: ExpiryAlert['priority'];
      if (daysUntilExpiry < 0) {
        priority = 'expired';
      } else if (daysUntilExpiry <= 30) {
        priority = 'high';
      } else if (daysUntilExpiry <= 60) {
        priority = 'medium';
      } else {
        priority = 'low';
      }

      alerts.push({
        _id: (lib._id as any).toString(),
        sopNo: lib.sopIdentifier,
        sopName: lib.sopName,
        department: lib.department,
        reviewDate: reviewDate.toISOString(),
        daysUntilExpiry,
        priority
      });
    }

    // Sort: expired first, then by soonest expiry
    alerts.sort((a, b) => a.daysUntilExpiry - b.daysUntilExpiry);

    const summary = {
      total: alerts.length,
      expired: alerts.filter(a => a.priority === 'expired').length,
      high: alerts.filter(a => a.priority === 'high').length,
      medium: alerts.filter(a => a.priority === 'medium').length,
      low: alerts.filter(a => a.priority === 'low').length,
    };

    return NextResponse.json({ success: true, alerts, summary });
  } catch (error) {
    console.error('Error fetching expiry alerts:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch expiry alerts' },
      { status: 500 }
    );
  }
}
