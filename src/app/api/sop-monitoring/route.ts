import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import SOP from '@/models/SOP';
import MergeSuggestion from '@/models/MergeSuggestion';

// Helper function to compute SOP status dynamically
function computeSOPStatus(sop: any) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  const expiryDate = sop.expiryDate ? new Date(sop.expiryDate) : null;
  const reviewDate = sop.reviewDate ? new Date(sop.reviewDate) : null;
  
  // Calculate days to expiry
  let daysToExpiry = null;
  if (expiryDate) {
    const diffTime = expiryDate.getTime() - today.getTime();
    daysToExpiry = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  }
  
  // Calculate days to review
  let daysToReview = null;
  if (reviewDate) {
    const diffTime = reviewDate.getTime() - today.getTime();
    daysToReview = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  }
  
  // Determine status based on dates
  let status = 'valid';
  let priority = 0; // Higher = more urgent
  
  // Check expiry first (highest priority)
  if (expiryDate && expiryDate < today) {
    status = 'expired';
    priority = 100;
  } else if (reviewDate && reviewDate <= today) {
    status = 'needsReview';
    priority = 90;
  } else if (expiryDate && daysToExpiry !== null && daysToExpiry <= 30) {
    status = 'expiringSoon';
    priority = 80;
  } else if (!expiryDate && !reviewDate) {
    status = 'missingDates';
    priority = 70;
  }
  
  return {
    ...sop,
    computedStatus: status,
    priority,
    daysToExpiry,
    daysToReview
  };
}

export async function GET(req: NextRequest) {
  try {
    await connectDB();

    // Fetch all SOPs
    const allSops = await SOP.find({}).lean();
    
    // Compute status for each SOP
    const sopsWithStatus = allSops.map(computeSOPStatus);
    
    // Sort by priority (most urgent first)
    sopsWithStatus.sort((a, b) => b.priority - a.priority);
    
    // Categorize SOPs
    const expired = sopsWithStatus.filter(s => s.computedStatus === 'expired');
    const needsReview = sopsWithStatus.filter(s => s.computedStatus === 'needsReview');
    const expiringSoon = sopsWithStatus.filter(s => s.computedStatus === 'expiringSoon');
    const missingDates = sopsWithStatus.filter(s => s.computedStatus === 'missingDates');
    const valid = sopsWithStatus.filter(s => s.computedStatus === 'valid');
    
    // Get actionable insights
    const today = new Date();
    const nextWeek = new Date(today);
    nextWeek.setDate(today.getDate() + 7);
    
    const needsReviewThisWeek = sopsWithStatus.filter(s => {
      if (!s.reviewDate) return false;
      const reviewDate = new Date(s.reviewDate);
      return reviewDate >= today && reviewDate <= nextWeek;
    });
    
    const expiringNext30Days = sopsWithStatus.filter(s => {
      if (!s.expiryDate) return false;
      const expiryDate = new Date(s.expiryDate);
      const thirtyDaysFromNow = new Date(today);
      thirtyDaysFromNow.setDate(today.getDate() + 30);
      return expiryDate >= today && expiryDate <= thirtyDaysFromNow;
    });
    
    // Department breakdown (auto-grouped)
    const departments = [...new Set(allSops.map((s: any) => s.department))];
    const departmentStats = departments.map(dept => {
      const deptSOPs = sopsWithStatus.filter(s => s.department === dept);
      return {
        name: dept,
        total: deptSOPs.length,
        expired: deptSOPs.filter(s => s.computedStatus === 'expired').length,
        needsReview: deptSOPs.filter(s => s.computedStatus === 'needsReview').length,
        expiringSoon: deptSOPs.filter(s => s.computedStatus === 'expiringSoon').length,
        missingDates: deptSOPs.filter(s => s.computedStatus === 'missingDates').length,
        valid: deptSOPs.filter(s => s.computedStatus === 'valid').length,
      };
    });
    
    // Owner breakdown
    const owners = [...new Set(allSops.map((s: any) => s.owner).filter(Boolean))];
    const ownerStats = owners.map(owner => {
      const ownerSOPs = sopsWithStatus.filter(s => s.owner === owner);
      return {
        name: owner,
        total: ownerSOPs.length,
        expired: ownerSOPs.filter(s => s.computedStatus === 'expired').length,
        needsReview: ownerSOPs.filter(s => s.computedStatus === 'needsReview').length,
        expiringSoon: ownerSOPs.filter(s => s.computedStatus === 'expiringSoon').length,
      };
    });
    
    // Process Area breakdown
    const processAreas = [...new Set(allSops.map((s: any) => s.processArea).filter(Boolean))];
    const processAreaStats = processAreas.map(area => {
      const areaSOPs = sopsWithStatus.filter(s => s.processArea === area);
      return {
        name: area,
        total: areaSOPs.length,
        expired: areaSOPs.filter(s => s.computedStatus === 'expired').length,
        needsReview: areaSOPs.filter(s => s.computedStatus === 'needsReview').length,
        expiringSoon: areaSOPs.filter(s => s.computedStatus === 'expiringSoon').length,
      };
    });
    
    // Find potential merges (same process area or guideline reference)
    const potentialMerges = [];
    for (let i = 0; i < allSops.length; i++) {
      for (let j = i + 1; j < allSops.length; j++) {
        const sop1 = allSops[i] as any;
        const sop2 = allSops[j] as any;
        
        if (sop1.processArea && sop2.processArea && sop1.processArea === sop2.processArea) {
          potentialMerges.push({
            sop1: { id: sop1._id, name: sop1.name, identifier: sop1.identifier },
            sop2: { id: sop2._id, name: sop2.name, identifier: sop2.identifier },
            reason: `Same process area: ${sop1.processArea}`
          });
        } else if (sop1.guidelineReference && sop2.guidelineReference && 
                   sop1.guidelineReference === sop2.guidelineReference) {
          potentialMerges.push({
            sop1: { id: sop1._id, name: sop1.name, identifier: sop1.identifier },
            sop2: { id: sop2._id, name: sop2.name, identifier: sop2.identifier },
            reason: `Same guideline: ${sop1.guidelineReference}`
          });
        }
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        summary: {
          total: allSops.length,
          expired: expired.length,
          needsReview: needsReview.length,
          expiringSoon: expiringSoon.length,
          missingDates: missingDates.length,
          valid: valid.length,
        },
        actionable: {
          needsReviewThisWeek: needsReviewThisWeek.length,
          expiringNext30Days: expiringNext30Days.length,
          expired: expired.length,
          missingDates: missingDates.length,
        },
        sops: {
          expired,
          needsReview,
          expiringSoon,
          missingDates,
          valid,
          needsReviewThisWeek,
          expiringNext30Days,
          all: sopsWithStatus,
        },
        departmentStats,
        ownerStats,
        processAreaStats,
        potentialMerges: potentialMerges.slice(0, 20), // Limit to 20
      }
    });
  } catch (error: any) {
    console.error('Error in SOP monitoring API:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
