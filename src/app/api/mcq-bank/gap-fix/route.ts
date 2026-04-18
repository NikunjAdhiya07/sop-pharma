import { NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import SOP from '@/models/SOP';
import SOPLibrary from '@/models/SOPLibrary';
import MCQBank from '@/models/MCQBank';
import mongoose from 'mongoose';

export const dynamic = 'force-dynamic';

/**
 * POST /api/mcq-bank/gap-fix
 *
 * Fixes the two classes of gap SOPs found by /api/mcq-bank/gap-audit:
 *
 * Fix A — Wrong department in MCQ banks:
 *   PRCL22-05  stored as "QA"  → correct to "Production"
 *   QCGE07-00  stored as "QA"  → correct to "QC"
 *
 * Fix B — Missing SOPLibrary entries:
 *   QAMI38-06  exists in SOP model + mcqbanks but not in SOPLibrary → create entry
 *   QCMI07-00  exists in SOP model + mcqbanks but not in SOPLibrary → create entry
 */

const PREFIX_TO_DEPT: Record<string, string> = {
  QAGE: 'QA', ANNE: 'QA',
  QCGE: 'QC', QAIC: 'QC', QAIO: 'QC',
  QAMI: 'Microbiology', QCMI: 'Microbiology',
  PRAA: 'Production', PRCL: 'Production', PRED: 'Production',
  PREO: 'Production', PREP: 'Production', PRGE: 'Production',
  PRMA: 'Production', PRPA: 'Production',
  BSGE: 'Store', STCL: 'Store', STGE: 'Store',
  STOP: 'Store', STPA: 'Store', STRM: 'Store',
  MAGE: 'Engineering and Maintenance', PREG: 'Engineering and Maintenance',
  PEGE: 'Personnel',
};

function deptFromIdentifier(identifier: string): string {
  const m = identifier.toUpperCase().trim().match(/^([A-Z]{2,6})\d/);
  if (m && PREFIX_TO_DEPT[m[1]]) return PREFIX_TO_DEPT[m[1]];
  return 'Other';
}

function deptCodeFromIdentifier(identifier: string): string {
  const m = identifier.toUpperCase().trim().match(/^([A-Z]{2,6})\d/);
  return m?.[1] ?? '';
}

export async function GET() {
  try {
    await connectDB();

    const db = mongoose.connection.db;
    if (!db) throw new Error('Database not connected');

    const results: Record<string, any> = {};

    // ── Fix A: Correct wrong department in MCQ banks ──────────────────────────
    // PRCL22-05: "QA" → "Production"
    // QCGE07-00: "QA" → "QC"
    const wrongDeptFixes = [
      { identifier: 'PRCL22-05', correctDept: 'Production', correctFolderDept: 'Production' },
      { identifier: 'QCGE07-00', correctDept: 'QC', correctFolderDept: 'QC' },
    ];

    results.fixA = [];
    for (const fix of wrongDeptFixes) {
      const updateResult = await db.collection('mcqbanks').updateMany(
        { sopIdentifier: fix.identifier },
        {
          $set: {
            department: fix.correctDept,
            folderDepartment: fix.correctFolderDept,
          },
        }
      );
      results.fixA.push({
        identifier: fix.identifier,
        correctedTo: fix.correctDept,
        banksUpdated: updateResult.modifiedCount,
      });
    }

    // ── Fix B: Create missing SOPLibrary entries ──────────────────────────────
    // All 4 gap SOPs are missing from SOPLibrary — PRCL22-05 and QCGE07-00 also
    // need registry entries in addition to the department correction above.
    const missingFromRegistry = ['QAMI38-06', 'QCMI07-00', 'PRCL22-05', 'QCGE07-00'];

    results.fixB = [];
    for (const identifier of missingFromRegistry) {
      // Find the SOP document
      const sop = await SOP.findOne({
        identifier: { $regex: new RegExp(`^${identifier}$`, 'i') },
        $or: [{ isObsolete: { $ne: true } }, { isObsolete: { $exists: false } }],
      }).lean() as any;

      if (!sop) {
        results.fixB.push({ identifier, status: 'skipped', reason: 'SOP not found in SOP model' });
        continue;
      }

      // Find the MCQ bank for this SOP
      const mcqBank = await MCQBank.findOne({
        sopIdentifier: { $regex: new RegExp(`^${identifier}$`, 'i') },
        $or: [{ isObsolete: { $ne: true } }, { isObsolete: { $exists: false } }],
      }).lean() as any;

      // Check if SOPLibrary entry already exists (safety check)
      const existing = await SOPLibrary.findOne({
        sopIdentifier: { $regex: new RegExp(`^${identifier}$`, 'i') },
      }).lean();

      if (existing) {
        results.fixB.push({ identifier, status: 'skipped', reason: 'Already exists in SOPLibrary' });
        continue;
      }

      const dept = deptFromIdentifier(identifier);
      const deptCode = deptCodeFromIdentifier(identifier);

      // Build sopDocuments array from the SOP record
      const sopDocuments = [];
      if (sop.fileUrl) {
        sopDocuments.push({
          fileName: sop.originalFileName || sop.name || identifier,
          filePath: sop.fileUrl,
          storageType: 'bunny',
          fileType: (sop.fileType || 'pdf') as 'pdf' | 'docx',
          uploadedAt: sop.uploadedAt || new Date(),
          fileSize: sop.metadata?.fileSize || 0,
          language: (sop.language || 'English') as 'English' | 'Gujarati',
        });
      }

      const libraryEntry = new SOPLibrary({
        sopId: sop._id,
        sopName: sop.name || identifier,
        sopIdentifier: identifier.toUpperCase(),
        department: dept,
        departmentCode: deptCode,
        language: (sop.language || 'English') as 'English' | 'Gujarati',
        mcqBankId: mcqBank?._id ?? undefined,
        sopDocuments,
        videos: [],
        slides: [],
        folderPath: sop.folderPath || dept,
        parentFolder: sop.parentFolder || dept,
        subfolderLevel: sop.subfolderLevel ?? 0,
        metadata: {
          views: 0,
          totalMCQs: mcqBank?.totalQuestions ?? 0,
        },
        complianceStatus: 'pending',
        expiryDate: sop.expiryDate ?? undefined,
        lastReviewDate: sop.reviewDate ?? new Date(),
      });

      await libraryEntry.save();

      results.fixB.push({
        identifier,
        status: 'created',
        department: dept,
        mcqBankLinked: !!mcqBank,
        totalQuestions: mcqBank?.totalQuestions ?? 0,
        sopLibraryId: libraryEntry._id,
      });
    }

    return NextResponse.json({
      success: true,
      message: 'Gap fix complete. Run /api/mcq-bank/gap-audit again to verify.',
      results,
    });

  } catch (error) {
    return NextResponse.json(
      { error: 'Gap fix failed', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
