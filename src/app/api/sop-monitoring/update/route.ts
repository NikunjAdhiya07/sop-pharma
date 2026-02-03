import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import SOP from '@/models/SOP';

export async function PUT(req: NextRequest) {
  try {
    await connectDB();
    const { 
      sopId, 
      reviewDate,
      expiryDate, 
      owner,
      processArea,
      version,
      effectiveDate,
      guidelineReference,
      remarks,
      // Legacy fields
      validityPeriod, 
      complianceStatus, 
      complianceNotes 
    } = await req.json();

    if (!sopId) {
      return NextResponse.json({ success: false, error: 'SOP ID is required' }, { status: 400 });
    }

    const updateData: any = {};
    
    // New data-driven fields
    if (reviewDate) {
      updateData.reviewDate = new Date(reviewDate);
    }
    
    if (expiryDate) {
      updateData.expiryDate = new Date(expiryDate);
    }
    
    if (owner !== undefined) {
      updateData.owner = owner;
    }
    
    if (processArea !== undefined) {
      updateData.processArea = processArea;
    }
    
    if (version !== undefined) {
      updateData.version = version;
    }
    
    if (effectiveDate) {
      updateData.effectiveDate = new Date(effectiveDate);
    }
    
    if (guidelineReference !== undefined) {
      updateData.guidelineReference = guidelineReference;
    }
    
    if (remarks !== undefined) {
      updateData.remarks = remarks;
    }
    
    // Legacy fields (keeping for backward compatibility)
    if (validityPeriod) {
      updateData.validityPeriod = validityPeriod;
      // Auto-calculate expiry date based on upload date + validity period
      const sop = await SOP.findById(sopId);
      if (sop && !expiryDate) {
        const uploadDate = new Date(sop.uploadedAt);
        const expiryDateCalc = new Date(uploadDate);
        expiryDateCalc.setMonth(expiryDateCalc.getMonth() + validityPeriod);
        updateData.expiryDate = expiryDateCalc;
      }
    }
    
    if (complianceStatus) {
      updateData.complianceStatus = complianceStatus;
    }
    
    if (complianceNotes !== undefined) {
      updateData.complianceNotes = complianceNotes;
    }
    
    updateData.lastReviewedAt = new Date();
    
    // Calculate next review date (3 months before expiry) if expiry is set
    if (updateData.expiryDate) {
      const nextReview = new Date(updateData.expiryDate);
      nextReview.setMonth(nextReview.getMonth() - 3);
      updateData.nextReviewDate = nextReview;
    }

    const updatedSOP = await SOP.findByIdAndUpdate(
      sopId,
      { $set: updateData },
      { new: true }
    );

    if (!updatedSOP) {
      return NextResponse.json({ success: false, error: 'SOP not found' }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      message: 'SOP updated successfully',
      sop: updatedSOP
    });
  } catch (error: any) {
    console.error('Error updating SOP:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
