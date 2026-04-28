import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import SOP from '@/models/SOP';
import MCQBank from '@/models/MCQBank';
import ArchivedSOP from '@/models/ArchivedSOP';
import ArchivedMCQBank from '@/models/ArchivedMCQBank';
import { parseDocument, validateDocumentContent } from '@/lib/documentParser';
import path from 'path';
import crypto from 'crypto';
import { Notification } from '@/models/Notification';
import User from '@/models/User';
import { persistUploadPath } from '@/lib/persistUploadPath';

/**
 * Increments the SOP version.
 * Examples:
 *   "1.0"  -> "1.1"
 *   "1.9"  -> "1.10"
 *   "2.5"  -> "2.6"
 *   "1"    -> "1.1"
 */
function incrementVersion(currentVersion: string): string {
  const parts = currentVersion.trim().split('.');
  if (parts.length === 1) {
    // Only major version exists, e.g. "1" -> "1.1"
    return `${parts[0]}.1`;
  }
  const major = parseInt(parts[0], 10) || 1;
  const minor = parseInt(parts[1], 10) || 0;
  return `${major}.${minor + 1}`;
}

export async function POST(request: NextRequest) {
  console.log('🔄 SOP Replace API called');

  try {
    await connectDB();

    const formData = await request.formData();
    const file = formData.get('file') as File;
    const sopId = formData.get('sopId') as string;
    const newSopName = formData.get('sopName') as string;
    const newSopIdentifier = formData.get('sopIdentifier') as string;
    const newDepartment = formData.get('department') as string;
    const newLanguage = (formData.get('language') as 'English' | 'Gujarati') || 'English';
    const archiveReason = (formData.get('archiveReason') as string) || 'Replaced with new version';
    // Allow manual version override
    const manualVersion = formData.get('version') as string | null;

    if (!file) {
      return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });
    }
    if (!sopId) {
      return NextResponse.json({ error: 'sopId is required' }, { status: 400 });
    }

    // -----------------------------------------------
    // 1. Find the existing (live) SOP
    // -----------------------------------------------
    const existingSOP = await SOP.findById(sopId);
    if (!existingSOP) {
      return NextResponse.json({ error: 'SOP not found' }, { status: 404 });
    }
    console.log(`✅ Found existing SOP: ${existingSOP.identifier} v${existingSOP.version}`);

    // -----------------------------------------------
    // 2. Calculate new version
    // -----------------------------------------------
    const currentVersion = existingSOP.version || '1.0';
    const newVersion = manualVersion ? manualVersion.trim() : incrementVersion(currentVersion);
    console.log(`📈 Versioning: ${currentVersion} → ${newVersion}`);

    // -----------------------------------------------
    // 3. Validate new file
    // -----------------------------------------------
    const fileExtension = file.name.split('.').pop()?.toLowerCase();
    if (!fileExtension || !['pdf', 'docx'].includes(fileExtension)) {
      return NextResponse.json({ error: 'Only PDF and DOCX files are supported' }, { status: 400 });
    }
    const fileType = fileExtension as 'pdf' | 'docx';

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    const checksum = crypto.createHash('sha256').update(buffer).digest('hex');

    const parsed = await parseDocument(buffer, fileType);
    const validation = validateDocumentContent(parsed.content);
    if (!validation.isValid) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }

    // -----------------------------------------------
    // 4. Archive the existing SOP
    // -----------------------------------------------
    console.log('🗄️ Archiving existing SOP...');
    const archivedSOP = await ArchivedSOP.create({
      originalSOPId: existingSOP._id,
      name: existingSOP.name,
      identifier: existingSOP.identifier,
      department: existingSOP.department,
      fileUrl: existingSOP.fileUrl,
      fileType: existingSOP.fileType,
      content: existingSOP.content,
      language: existingSOP.language,
      checksum: existingSOP.checksum,
      version: currentVersion,
      uploadedAt: existingSOP.uploadedAt,
      processedAt: existingSOP.processedAt,
      status: existingSOP.status,
      mcqCount: existingSOP.mcqCount,
      processArea: existingSOP.processArea,
      owner: existingSOP.owner,
      effectiveDate: existingSOP.effectiveDate,
      reviewDate: existingSOP.reviewDate,
      expiryDate: existingSOP.expiryDate,
      guidelineReference: existingSOP.guidelineReference,
      lastReviewedBy: existingSOP.lastReviewedBy,
      remarks: existingSOP.remarks,
      folderPath: existingSOP.folderPath,
      parentFolder: existingSOP.parentFolder,
      subfolderLevel: existingSOP.subfolderLevel,
      originalFileName: existingSOP.originalFileName,
      metadata: existingSOP.metadata,
      archivedAt: new Date(),
      archiveReason,
      replacedByVersion: newVersion,
    });
    console.log(`✅ SOP archived with ID: ${archivedSOP._id}`);

    // -----------------------------------------------
    // 5. Archive existing MCQ Bank (if any)
    // -----------------------------------------------
    const existingMCQBank = await MCQBank.findOne({ sopId: existingSOP._id });
    if (existingMCQBank) {
      console.log(`🗄️ Archiving MCQ Bank (${existingMCQBank.totalQuestions} questions)...`);
      await ArchivedMCQBank.create({
        archivedSOPId: archivedSOP._id,
        originalSOPId: existingSOP._id,
        sopName: existingMCQBank.sopName,
        sopIdentifier: existingMCQBank.sopIdentifier,
        sopVersion: currentVersion,
        department: existingMCQBank.department,
        folderDepartment: existingMCQBank.folderDepartment,
        folderSubcategory: existingMCQBank.folderSubcategory,
        mcqs: existingMCQBank.mcqs,
        generatedAt: existingMCQBank.generatedAt,
        totalQuestions: existingMCQBank.totalQuestions,
        difficultyDistribution: existingMCQBank.difficultyDistribution,
        aiModel: existingMCQBank.aiModel,
        language: existingMCQBank.language,
        archivedAt: new Date(),
      });

      // Delete the live MCQ Bank so it can be regenerated for the new version
      await MCQBank.deleteOne({ sopId: existingSOP._id });
      console.log('✅ MCQ Bank archived and removed from live collection');
    } else {
      console.log('ℹ️ No existing MCQ Bank found for this SOP');
    }

    // -----------------------------------------------
    // 6. Local file path under uploads/ (for preview / download)
    // -----------------------------------------------
    const department = newDepartment || existingSOP.department;
    const sanitizedDept = department.replace(/[^a-zA-Z0-9-_]/g, '_');

    const sopIdentifier = newSopIdentifier || existingSOP.identifier;
    const fileName = `${sopIdentifier}_v${newVersion}_${Date.now()}.${fileExtension}`;
    const fileUrl = `/uploads/sops/${sanitizedDept}/${fileName}`;
    try {
      await persistUploadPath(fileUrl, buffer);
      console.log('✅ SOP file saved to disk:', fileName);
    } catch (persistErr) {
      console.error('⚠️ Failed to persist replaced SOP file:', persistErr);
    }

    // -----------------------------------------------
    // 7. Extract dates from new content
    // -----------------------------------------------
    const { extractDatesFromBuffer } = await import('@/lib/dateExtractor');
    const extractedDates = await extractDatesFromBuffer(buffer, fileType, parsed.content);

    // -----------------------------------------------
    // 8. Update the live SOP with new version info
    // -----------------------------------------------
    const sopName = newSopName || existingSOP.name;
    const updatedSOP = await SOP.findByIdAndUpdate(
      sopId,
      {
        name: sopName,
        identifier: sopIdentifier,
        department,
        fileUrl,
        fileType,
        content: parsed.content,
        language: newLanguage,
        checksum,
        version: newVersion,
        status: 'uploaded',
        mcqCount: 0,
        effectiveDate: extractedDates.effectiveDate,
        reviewDate: extractedDates.reviewDate,
        expiryDate: extractedDates.expiryDate,
        metadata: {
          fileSize: buffer.length,
          pageCount: parsed.metadata.pageCount,
          wordCount: parsed.metadata.wordCount,
        },
        updatedAt: new Date(),
      },
      { new: true }
    );
    console.log(`✅ SOP updated to version ${newVersion}`);

    // -----------------------------------------------
    // 9. Send notifications
    // -----------------------------------------------
    try {
      const usersInDept = await User.find({ department });
      if (usersInDept.length > 0) {
        const notifications = usersInDept.map(user => ({
          recipient: user._id,
          type: 'update',
          title: 'SOP Updated to New Version',
          message: `SOP "${sopName}" (${sopIdentifier}) has been updated from v${currentVersion} to v${newVersion}. Please review the changes and regenerate the MCQ bank.`,
          link: `/sop-library/${sopId}`,
          read: false,
          createdAt: new Date(),
        }));
        await Notification.insertMany(notifications);
        console.log(`🔔 Sent notifications to ${usersInDept.length} users in ${department}`);
      }
    } catch (err) {
      console.error('Failed to send notifications:', err);
    }

    return NextResponse.json({
      success: true,
      message: `SOP successfully replaced. Old version (${currentVersion}) archived. New version is ${newVersion}.`,
      sop: {
        id: updatedSOP?._id,
        name: updatedSOP?.name,
        identifier: updatedSOP?.identifier,
        previousVersion: currentVersion,
        newVersion,
        status: updatedSOP?.status,
        wordCount: updatedSOP?.metadata?.wordCount,
      },
      archive: {
        archivedSOPId: archivedSOP._id,
        archivedVersion: currentVersion,
        mcqsArchived: !!existingMCQBank,
      },
    }, { status: 200 });

  } catch (error) {
    console.error('💥 Error replacing SOP:', error);
    const message = error instanceof Error ? error.message : 'Failed to replace SOP';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
