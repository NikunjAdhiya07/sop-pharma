import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import SOP from '@/models/SOP';
import MCQBank from '@/models/MCQBank';
import ArchivedMCQBank from '@/models/ArchivedMCQBank';
import { parseDocument, validateDocumentContent } from '@/lib/documentParser';
import { resolveSopLanguageForUpload } from '@/lib/detectSopLanguage';
import crypto from 'crypto';
import mongoose from 'mongoose';
import User from '@/models/User';
import { Notification } from '@/models/Notification';
import { uploadToBunny, generateSOPDocumentPath } from '@/lib/bunnyStorage';
import { persistUploadPath } from '@/lib/persistUploadPath';
import { invalidateDashboardSopsCache } from '@/lib/dashboardSopsCache';

export async function POST(request: NextRequest) {
  console.log('📤 Upload API called');
  
  try {
    console.log('🔌 Connecting to MongoDB...');
    await connectDB();
    console.log('✅ MongoDB connected');

    console.log('📋 Parsing form data...');
    const formData = await request.formData();
    const file = formData.get('file') as File;
    const sopName = formData.get('sopName') as string;
    const sopIdentifier = formData.get('sopIdentifier') as string;
    const department = formData.get('department') as string || 'General';
    const languageRaw = ((formData.get('language') as string) || 'auto').trim();
    const batchLanguage: 'English' | 'Gujarati' | 'auto' =
      languageRaw.toLowerCase() === 'auto'
        ? 'auto'
        : languageRaw === 'Gujarati'
          ? 'Gujarati'
          : 'English';
    const overwrite = formData.get('overwrite') === 'true';

    console.log('📝 Form data received:', {
      hasFile: !!file,
      fileName: file?.name,
      sopName,
      sopIdentifier,
      overwrite
    });

    // Validation
    if (!file) {
      console.error('❌ No file uploaded');
      return NextResponse.json(
        { error: 'No file uploaded' },
        { status: 400 }
      );
    }

    if (!sopName || !sopIdentifier) {
      console.error('❌ Missing SOP name or identifier');
      return NextResponse.json(
        { error: 'SOP name and identifier are required' },
        { status: 400 }
      );
    }

    // Allow re-uploading same SOP (for regenerating MCQs)
    console.log('✅ SOP can be uploaded (duplicates allowed for re-generation)');

    // Validate file type
    console.log('🔍 Validating file type...');
    const fileExtension = file.name.split('.').pop()?.toLowerCase();
    if (!fileExtension || !['pdf', 'docx'].includes(fileExtension)) {
      console.error('❌ Invalid file type:', fileExtension);
      return NextResponse.json(
        { error: 'Only PDF and DOCX files are supported' },
        { status: 400 }
      );
    }

    const fileType = fileExtension as 'pdf' | 'docx';
    console.log('✅ File type valid:', fileType);

    // Convert file to buffer
    console.log('📦 Converting file to buffer...');
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    console.log('✅ Buffer created, size:', buffer.length, 'bytes');

    // Calculate Checksum
    const checksum = crypto.createHash('sha256').update(buffer).digest('hex');
    console.log('🔐 File Checksum:', checksum);

    // Parse document (needed for auto language + validation before duplicate check)
    console.log('📖 Parsing document...');
    const parsed = await parseDocument(buffer, fileType);
    console.log('✅ Document parsed, word count:', parsed.metadata.wordCount);

    console.log('✔️ Validating content...');
    const validation = validateDocumentContent(parsed.content);
    if (!validation.isValid) {
      console.error('❌ Content validation failed:', validation.error);
      return NextResponse.json(
        { error: validation.error },
        { status: 400 }
      );
    }
    console.log('✅ Content validated');

    const baseName = (file.name || '').replace(/^.*[/\\]/, '');
    const language: 'English' | 'Gujarati' = resolveSopLanguageForUpload({
      batchLanguage,
      text: parsed.content,
      relativePath: '',
      baseName,
    });
    console.log('🌐 Resolved language:', language, batchLanguage === 'auto' ? '(auto)' : '(fixed)');

    // Duplicate Check (uses resolved language so EN/GU rows stay separate)
    if (!overwrite) {
      console.log('🔍 Checking for duplicates...');
      const duplicateSOP = await SOP.findOne({
        $or: [
          { identifier: sopIdentifier, language: language },
          { name: sopName, language: language },
          { checksum: checksum }
        ]
      });

      if (duplicateSOP) {
        let duplicateReason = 'unknown';
        if (duplicateSOP.identifier === sopIdentifier) duplicateReason = 'identifier';
        else if (duplicateSOP.name === sopName) duplicateReason = 'name';
        else if (duplicateSOP.checksum === checksum) duplicateReason = 'content';

        console.log(`⚠️ Duplicate found: ${duplicateReason} matches SOP ${duplicateSOP.identifier}`);

        return NextResponse.json(
          {
            error: 'Duplicate SOP detected',
            type: duplicateReason,
            existingSOP: {
              id: duplicateSOP._id,
              name: duplicateSOP.name,
              identifier: duplicateSOP.identifier,
              uploadedAt: duplicateSOP.uploadedAt
            }
          },
          { status: 409 }
        );
      }
      console.log('✅ No duplicates found');
    }

    const sanitizedDept = department.replace(/[^a-zA-Z0-9-_]/g, '_');
    const fileName = `${sopIdentifier}_${Date.now()}.${fileExtension}`;
    let fileUrl: string;

    const useBunny = Boolean(
      (process.env.BUNNY_STORAGE_ZONE || process.env.BUNNY_STORAGE_ZONE_NAME) &&
      (process.env.BUNNY_STORAGE_PASSWORD || process.env.BUNNY_API_KEY) &&
      (process.env.BUNNY_PULL_ZONE_URL || process.env.BUNNY_CDN_HOSTNAME)
    );

    if (useBunny) {
      console.log('💾 Uploading to Bunny Storage...');
      const bunnyPath = generateSOPDocumentPath(department, sopIdentifier, file.name || fileName);
      const cdnUrl = await uploadToBunny(buffer, bunnyPath);
      if (cdnUrl) {
        fileUrl = cdnUrl;
        console.log('✅ File stored in Bunny:', cdnUrl);
      } else {
        console.warn('⚠️ Bunny upload failed, falling back to local uploads/');
        fileUrl = `/uploads/sops/${sanitizedDept}/${fileName}`;
      }
    } else {
      fileUrl = `/uploads/sops/${sanitizedDept}/${fileName}`;
      console.log('✅ Local file path (saved under project uploads/):', fileName);
    }

    const storedRemotely =
      fileUrl.startsWith('http://') ||
      fileUrl.startsWith('https://') ||
      fileUrl.startsWith('bunny://');
    if (!storedRemotely) {
      try {
        await persistUploadPath(fileUrl, buffer);
      } catch (persistErr) {
        console.error('⚠️ Failed to persist SOP file to disk:', persistErr);
      }
    }

    // Extract dates and metadata from content
    console.log('📅 Extracting dates from document...');
    const { extractDatesFromContent } = await import('@/lib/dateExtractor');
    const extractedDates = extractDatesFromContent(parsed.content);
    console.log('✅ Dates extracted:', extractedDates);

    // --- OVERWRITE: Archive old MCQ bank before replacing the SOP ---
    if (overwrite) {
      try {
        const db = mongoose.connection.db;
        if (db) {
          const collection = db.collection('mcqbanks');
          // Find all MCQ banks for this identifier + language (could be multiple)
          const oldBanks = await collection.find({ sopIdentifier, language }).toArray();
          for (const oldBank of oldBanks) {
            await ArchivedMCQBank.create({
              archivedSOPId: oldBank.sopId || oldBank._id,
              originalSOPId: oldBank.sopId || oldBank._id,
              sopName: oldBank.sopName || sopName,
              sopIdentifier: oldBank.sopIdentifier || sopIdentifier,
              sopVersion: oldBank.version || '1.0',
              department: oldBank.department || department,
              folderDepartment: oldBank.folderDepartment,
              folderSubcategory: oldBank.folderSubcategory,
              mcqs: oldBank.mcqs || [],
              generatedAt: oldBank.generatedAt || oldBank.createdAt || new Date(),
              totalQuestions: oldBank.totalQuestions || oldBank.mcqs?.length || 0,
              difficultyDistribution: oldBank.difficultyDistribution || { easy: 0, medium: 0, hard: 0 },
              aiModel: oldBank.aiModel,
              language: oldBank.language || language,
              archivedAt: new Date(),
            });
            await collection.deleteOne({ _id: oldBank._id });
            console.log(`📦 [OVERWRITE] Archived old MCQ bank: ${sopIdentifier} (${language})`);
          }
        }
      } catch (archiveErr) {
        console.error('[OVERWRITE] Failed to archive old MCQ bank:', archiveErr);
        // Don't block the upload — log and continue
      }
    }

    // Create or Update SOP record
    console.log(`💾 ${overwrite ? 'Updating' : 'Creating'} SOP record in database...`);

    let sop;
    if (overwrite) {
      // Find and update existing SOP by identifier AND language so Gujarati never overwrites English
      sop = await SOP.findOneAndUpdate(
        { identifier: sopIdentifier, language: language },
        {
          name: sopName,
          identifier: sopIdentifier,
          department: department,
          fileUrl,
          fileType,
          originalFileName: file.name,
          content: parsed.content,
          language: language,
          checksum: checksum,
          status: 'uploaded',
          effectiveDate: extractedDates.effectiveDate,
          reviewDate: extractedDates.reviewDate,
          expiryDate: extractedDates.expiryDate,
          version: extractedDates.version,
          metadata: {
            fileSize: buffer.length,
            pageCount: parsed.metadata.pageCount,
            wordCount: parsed.metadata.wordCount,
          },
          updatedAt: new Date()
        },
        { new: true, upsert: true, setDefaultsOnInsert: true }
      );
    } else {
      sop = await SOP.create({
        name: sopName,
        identifier: sopIdentifier,
        department: department,
        fileUrl,
        fileType,
        originalFileName: file.name,
        content: parsed.content,
        language: language,
        checksum: checksum,
        status: 'uploaded',
        effectiveDate: extractedDates.effectiveDate,
        reviewDate: extractedDates.reviewDate,
        expiryDate: extractedDates.expiryDate,
        version: extractedDates.version,
        metadata: {
          fileSize: buffer.length,
          pageCount: parsed.metadata.pageCount,
          wordCount: parsed.metadata.wordCount,
        },
      });
    }

    // Trigger Notifications on Overwrite (Update)
    if (overwrite && sop) {
      try {
          // Notify users in the same department
          const usersInDept = await User.find({ department: department });
          if (usersInDept.length > 0) {
              const notifications = usersInDept.map(user => ({
                  recipient: user._id,
                  type: 'update',
                  title: 'SOP Updated',
                  message: `SOP "${sopName}" (${sopIdentifier}) has been updated. Please review the changes.`,
                  link: `/sop-library/${sop._id}`,
                  read: false,
                  createdAt: new Date()
              }));
              await Notification.insertMany(notifications);
              console.log(`🔔 Sent update notifications to ${usersInDept.length} users in ${department}`);
          }
      } catch (error) {
          console.error('Failed to send notifications:', error);
      }
    }

    console.log('✅ SOP saved with ID:', sop._id);

    // AUTOMATIC VERSION SHIFT: Detect and record older revisions as version artifacts
    // AND automatically mark all older revisions + their MCQ banks as obsolete
    try {
      const { normalizeSopIdentifierKey, sopFamilyKeyFromIdentifier, parseRevisionFromSopIdentifier } =
        await import('@/lib/sopIdentifierNormalize');
      const SOPVersionArtifacts = (await import('@/models/SOPVersionArtifacts')).default;

      const currentRevision = parseRevisionFromSopIdentifier(sopIdentifier.toUpperCase());
      const normalizedId = normalizeSopIdentifierKey(sopIdentifier.toUpperCase());
      const familyKey = sopFamilyKeyFromIdentifier(sopIdentifier.toUpperCase());

      if (currentRevision != null && familyKey) {
        // familyKey format: "LETTERS:docNumber" e.g. "QAGE:28" for QAGE28-01
        // Build an exact family doc string: letters + docNumber (e.g. "QAGE28")
        const familyParts = familyKey.split(':'); // ["QAGE", "28"]
        const familyLetters = familyParts[0];     // "QAGE"
        const familyDocNum  = familyParts[1];     // "28"
        // Match ONLY this exact document number with different revisions (e.g. QAGE28-00, QAGE28-01)
        // Uses zero-padded variants too (QAGE028, QAGE28) but NOT QAGE29, QAGE27, etc.
        const escapedLetters = familyLetters.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const docNumInt = parseInt(familyDocNum || '0', 10);
        // Match both zero-padded (QAGE028) and non-padded (QAGE28) variants of the doc number
        const familyPattern = new RegExp(
          `^${escapedLetters}0*${docNumInt}-\\d+$`,
          'i'
        );

        const relatedSops = await SOP.find({
          identifier: familyPattern,
          _id: { $ne: sop._id }, // Exclude the newly uploaded SOP itself
        }).lean();

        const obsoleteNow = new Date();
        const obsoleteReason = `Superseded by ${sopIdentifier}`;

        for (const related of relatedSops) {
          const relatedRev = parseRevisionFromSopIdentifier(String(related.identifier || '').toUpperCase());
          if (relatedRev == null) continue;

          const isOlderRevision = relatedRev < currentRevision;

          if (isOlderRevision) {
            // Mark SOP as obsolete (regardless of language — older revision is obsolete for all languages)
            await SOP.findByIdAndUpdate(related._id, {
              isObsolete: true,
              obsoleteAt: obsoleteNow,
              obsoleteReason,
            });

            // Mark all MCQ banks for this SOP identifier + language as obsolete
            await MCQBank.updateMany(
              { sopIdentifier: related.identifier },
              {
                $set: {
                  isObsolete: true,
                  obsoleteAt: obsoleteNow,
                  obsoleteReason,
                },
              }
            );

            console.log(
              `[VERSION_SHIFT] Auto-obsoleted ${related.identifier} (rev ${relatedRev}) ` +
              `— superseded by ${sopIdentifier} (rev ${currentRevision})`
            );

            // Record as version artifact for history
            const ext = (related.fileType || 'docx').toLowerCase();
            const existing = await SOPVersionArtifacts.findOne({
              identifier: normalizedId,
              language: related.language || language,
              'entries.version': relatedRev,
            });

            if (!existing) {
              await SOPVersionArtifacts.findOneAndUpdate(
                { identifier: normalizedId, language: related.language || language },
                {
                  $push: {
                    entries: {
                      version: relatedRev,
                      docxPath: ext === 'docx' ? related.fileUrl : undefined,
                      pdfPath: ext === 'pdf' ? related.fileUrl : undefined,
                    }
                  }
                },
                { upsert: true, setDefaultsOnInsert: true }
              );
            }
          }
        }
      }
    } catch (versionShiftErr) {
      console.error('[VERSION_SHIFT] Error in auto-obsolete / version shift:', versionShiftErr);
      // Don't fail the upload — log and continue
    }

    // --- AUTO PIPELINE: Trigger full automated pipeline for ALL uploads (new + overwrite) ---
    {
      const sopIdStr = sop._id.toString();
      const baseUrl =
        process.env.NEXTAUTH_URL?.replace(/\/$/, '') ||
        process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '') ||
        (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000');

      fetch(`${baseUrl}/api/sop/pipeline/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sopId: sopIdStr,
          sopIdentifier,
          sopName: sop.name,
          department: sop.department,
          language: language || sop.language || 'English',
        }),
      }).catch((err) =>
        console.error('[PIPELINE] Auto pipeline trigger failed:', err)
      );

      console.log(`🚀 [PIPELINE] Triggered automated pipeline for ${sopIdentifier} (${language})`);
    }

    const response = {
      success: true,
      message: overwrite
        ? 'SOP updated successfully! Automated pipeline started: MCQ generation → Similarity check → Compliance check.'
        : 'SOP uploaded successfully! Automated pipeline started in the background.',
      sop: {
        id: sop._id,
        name: sop.name,
        identifier: sop.identifier,
        status: sop.status,
        wordCount: sop.metadata?.wordCount,
        language: sop.language,
      },
      pipelineStarted: true,
    };

    console.log('🎉 Upload successful!', response);
    invalidateDashboardSopsCache();
    return NextResponse.json(response, { status: 201 });

  } catch (error) {
    console.error('💥 Error uploading SOP:', error);
    console.error('Error stack:', error instanceof Error ? error.stack : 'No stack trace');
    
    // Extract detailed error message
    let errorMessage = 'Failed to upload SOP';
    let errorDetails = 'Unknown error';
    
    if (error instanceof Error) {
      errorMessage = error.message;
      errorDetails = error.message;
      
      // Add more context for specific errors
      if (error.message.includes('scanned images')) {
        errorDetails = error.message + '\n\nThis usually happens when:\n1. The PDF was created by scanning physical documents\n2. The PDF contains images of text rather than actual text\n3. OCR (Optical Character Recognition) was not applied during scanning';
      } else if (error.message.includes('password')) {
        errorDetails = error.message + '\n\nPlease remove password protection using:\n1. Adobe Acrobat\n2. Online PDF tools\n3. Command-line tools like qpdf';
      }
    }
    
    return NextResponse.json(
      { 
        error: errorMessage,
        details: errorDetails
      },
      { status: 500 }
    );
  }
}
