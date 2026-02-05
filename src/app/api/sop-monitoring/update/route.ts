import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import MasterSOPRepository from '@/models/MasterSOPRepository';
import { logSOPActivity, compareSOPVersions } from '@/lib/activityLogger';
import { logAudit } from '@/lib/sopAuditLogger';

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
      // User information for activity logging
      userId,
      userName,
      userRole,
      userDepartment,
      reason, // Why is this update being made?
      // Legacy fields
      validityPeriod, 
      complianceStatus, 
      complianceNotes 
    } = await req.json();

    if (!sopId) {
      return NextResponse.json({ success: false, error: 'SOP ID is required' }, { status: 400 });
    }

    // Fetch current SOP state for comparison
    const currentSOP = await MasterSOPRepository.findById(sopId).lean();
    
    if (!currentSOP) {
      return NextResponse.json({ success: false, error: 'SOP not found' }, { status: 404 });
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
      if (!expiryDate) {
        const uploadDate = new Date(currentSOP.createdAt);
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

    // Update the SOP
    const updatedSOP = await MasterSOPRepository.findByIdAndUpdate(
      sopId,
      { $set: updateData },
      { new: true }
    );

    if (!updatedSOP) {
      return NextResponse.json({ success: false, error: 'SOP not found' }, { status: 404 });
    }

    // Log the activity with change tracking
    const { fieldsChanged, previousValues, updatedValues } = compareSOPVersions(
      currentSOP,
      { ...currentSOP, ...updateData }
    );

    // Only log if we have user information
    if (userId && userName && userRole) {
      // Log to activity tracker
      await logSOPActivity({
        sopId: sopId,
        sopIdentifier: currentSOP.sopIdentifier,
        sopName: currentSOP.sopName,
        userId,
        userName,
        userRole,
        userDepartment,
        actionType: 'updated',
        actionCategory: 'content',
        fieldsChanged,
        previousValues,
        updatedValues,
        reason: reason || 'SOP details updated',
        systemGenerated: false,
      });
      
      // Log to audit system with specific action types
      const ipAddress = req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || 'unknown';
      const userAgent = req.headers.get('user-agent') || 'unknown';
      
      // Determine specific action type for audit
      let auditActionType: any = 'sop_edited';
      if (fieldsChanged.includes('reviewDate') && fieldsChanged.length === 1) {
        auditActionType = 'sop_review_date_changed';
      } else if (fieldsChanged.includes('expiryDate') && fieldsChanged.length === 1) {
        auditActionType = 'sop_expiry_date_changed';
      } else if (fieldsChanged.includes('version') && fieldsChanged.length === 1) {
        auditActionType = 'sop_version_updated';
      }
      
      await logAudit({
        userId,
        userName,
        userRole,
        department: userDepartment || currentSOP.department,
        actionType: auditActionType,
        module: 'Monitoring',
        sopId: sopId,
        sopIdentifier: currentSOP.sopIdentifier,
        sopName: currentSOP.sopName,
        oldValue: previousValues,
        newValue: updatedValues,
        fieldsChanged,
        ipAddress,
        userAgent,
        isSystemGenerated: false,
      });
    }

    return NextResponse.json({
      success: true,
      message: 'SOP updated successfully',
      sop: updatedSOP,
      activityLogged: !!(userId && userName && userRole),
      auditLogged: !!(userId && userName && userRole),
      changesTracked: {
        fieldsChanged,
        previousValues,
        updatedValues,
      },
    });
  } catch (error: any) {
    console.error('Error updating SOP:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
