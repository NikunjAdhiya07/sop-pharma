import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import MasterSOPRepository from '@/models/MasterSOPRepository';
import SOP from '@/models/SOP';
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
      complianceNotes,
      // Document links
      englishDocxLink,
      englishPdfLink,
      gujaratiDocxLink,
      gujaratiPdfLink
    } = await req.json();

    if (!sopId) {
      return NextResponse.json({ success: false, error: 'SOP ID is required' }, { status: 400 });
    }

    // Fetch current SOP state for comparison
    let currentSOP: any = await SOP.findById(sopId).lean();
    let isMasterSop = false;
    
    if (!currentSOP) {
      currentSOP = await MasterSOPRepository.findById(sopId).lean();
      isMasterSop = true;
    }
    
    if (!currentSOP) {
      return NextResponse.json({ success: false, error: 'SOP not found' }, { status: 404 });
    }

    const sopIdentifier = currentSOP.identifier || currentSOP.sopIdentifier || currentSOP.sopNo;

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

    if (englishPdfLink !== undefined && englishPdfLink !== "") {
      updateData.fileUrl = englishPdfLink;
    }

    if (englishDocxLink !== undefined || gujaratiDocxLink !== undefined || gujaratiPdfLink !== undefined || englishPdfLink !== undefined) {
       let docs = currentSOP.sopDocuments ? [...currentSOP.sopDocuments] : [];
       
       if (englishDocxLink !== undefined) {
         docs = docs.filter((d: any) => !( (d.language === 'English' || !d.language) && (d.fileType === 'docx' || d.fileType === 'doc') ));
         if (englishDocxLink) docs.push({ fileName: 'English DOCX', filePath: englishDocxLink, fileType: 'docx', language: 'English' });
       }
       if (englishPdfLink !== undefined) {
         docs = docs.filter((d: any) => !( (d.language === 'English' || !d.language) && d.fileType === 'pdf' ));
       }
       if (gujaratiDocxLink !== undefined) {
         docs = docs.filter((d: any) => d.language === 'Gujarati' && (d.fileType === 'docx' || d.fileType === 'doc') ? false : true);
         if (gujaratiDocxLink) docs.push({ fileName: 'Gujarati DOCX', filePath: gujaratiDocxLink, fileType: 'docx', language: 'Gujarati' });
       }
       if (gujaratiPdfLink !== undefined) {
         docs = docs.filter((d: any) => d.language === 'Gujarati' && d.fileType === 'pdf' ? false : true);
         if (gujaratiPdfLink) docs.push({ fileName: 'Gujarati PDF', filePath: gujaratiPdfLink, fileType: 'pdf', language: 'Gujarati' });
       }
       updateData.sopDocuments = docs;
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

    console.log(`[API] Updating SOP ${sopId} (isMaster: ${isMasterSop}). Payload:`, JSON.stringify(updateData, null, 2));

    // Update the SOP
    let updatedSOP;
    if (isMasterSop) {
      // Map to MasterSOPRepository schema (metadata nested)
      const masterData = { ...updateData };
      const metadata: any = { ...currentSOP.metadata };
      if (updateData.expiryDate) metadata.expiryDate = updateData.expiryDate;
      if (updateData.reviewDate) metadata.reviewDate = updateData.reviewDate;
      if (updateData.version) metadata.version = updateData.version;
      if (updateData.effectiveDate) metadata.effectiveDate = updateData.effectiveDate;
      masterData.metadata = metadata;
      
      updatedSOP = await MasterSOPRepository.findByIdAndUpdate(sopId, { $set: masterData }, { new: true });
      if (sopIdentifier) {
        await SOP.updateMany({ identifier: sopIdentifier }, { $set: updateData });
      }
    } else {
      updatedSOP = await SOP.findByIdAndUpdate(sopId, { $set: updateData }, { new: true });
      if (sopIdentifier) {
        const masterUpdate: any = { ...updateData };
        delete masterUpdate.fileUrl;
        delete masterUpdate.sopDocuments;
        
        // Map to MasterSOPRepository schema
        const metadata: any = {};
        if (updateData.expiryDate) metadata.expiryDate = updateData.expiryDate;
        if (updateData.reviewDate) metadata.reviewDate = updateData.reviewDate;
        if (updateData.version) metadata.version = updateData.version;
        if (updateData.effectiveDate) metadata.effectiveDate = updateData.effectiveDate;
        
        if (Object.keys(metadata).length > 0) {
          masterUpdate.metadata = metadata;
        }

        await MasterSOPRepository.updateMany(
          { $or: [{ sopIdentifier: sopIdentifier }, { identifier: sopIdentifier }] as any }, 
          { $set: masterUpdate }
        );
      }
    }

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
        sopIdentifier: sopIdentifier || currentSOP.sopIdentifier || 'Unknown',
        sopName: currentSOP.sopName || currentSOP.name || 'Unknown',
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
        sopIdentifier: sopIdentifier || currentSOP.sopIdentifier || 'Unknown',
        sopName: currentSOP.sopName || currentSOP.name || 'Unknown',
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
