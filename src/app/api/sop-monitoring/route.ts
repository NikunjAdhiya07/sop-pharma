import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import SOPLibrary from '@/models/SOPLibrary';
import MergeSuggestion from '@/models/MergeSuggestion';

export async function GET(req: NextRequest) {
  try {
    await connectDB();

    // Fetch all SOPs for dashboard
    const sops = await SOPLibrary.find({}).sort({ expiryDate: 1 });

    // Fetch pending merge suggestions
    const mergeSuggestions = await MergeSuggestion.find({ status: 'pending' })
      .sort({ similarityScore: -1 })
      .limit(10);

    // Calculate compliance stats
    const complianceStats = {
      compliant: sops.filter((s: any) => s.complianceStatus === 'compliant').length,
      partial: sops.filter((s: any) => s.complianceStatus === 'partial').length,
      nonCompliant: sops.filter((s: any) => s.complianceStatus === 'non-compliant').length,
      pending: sops.filter((s: any) => !s.complianceStatus || s.complianceStatus === 'pending').length
    };

    // Group SOPs by status
    const today = new Date();
    const thirtyDaysFromNow = new Date();
    thirtyDaysFromNow.setDate(today.getDate() + 30);

    const expired = sops.filter((s: any) => s.expiryDate && new Date(s.expiryDate) < today);
    const expiringSoon = sops.filter((s: any) => 
      s.expiryDate && 
      new Date(s.expiryDate) >= today && 
      new Date(s.expiryDate) <= thirtyDaysFromNow
    );
    const valid = sops.filter((s: any) => !s.expiryDate || new Date(s.expiryDate) > thirtyDaysFromNow);

    return NextResponse.json({
      success: true,
      data: {
        allSops: sops,
        expired,
        expiringSoon,
        valid,
        mergeSuggestions,
        complianceStats
      }
    });
  } catch (error: any) {
    console.error('Error in SOP monitoring API:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
