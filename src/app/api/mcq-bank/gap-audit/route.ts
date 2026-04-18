import { NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import SOP from '@/models/SOP';
import SOPLibrary from '@/models/SOPLibrary';
import mongoose from 'mongoose';

export const dynamic = 'force-dynamic';

/**
 * GET /api/mcq-bank/gap-audit
 *
 * Finds SOPs that have MCQ banks with questions generated but are NOT
 * counted in the dashboard registry (SOPLibrary), broken down by department.
 *
 * Returns: sopNo (identifier), name, department, questionCount, languages
 */
export async function GET() {
  try {
    await connectDB();

    const db = mongoose.connection.db;
    if (!db) throw new Error('Database not connected');

    // 1. Get all non-obsolete SOPs from the SOP model that have MCQ banks with questions
    const sopsWithMCQs = await db.collection('mcqbanks').aggregate([
      {
        $match: {
          $or: [{ isObsolete: { $ne: true } }, { isObsolete: { $exists: false } }],
        },
      },
      {
        $project: {
          sopId: 1,
          sopName: 1,
          sopIdentifier: 1,
          department: 1,
          folderDepartment: 1,
          language: 1,
          questionCount: { $size: { $ifNull: ['$mcqs', []] } },
        },
      },
      // Only keep banks that actually have questions
      { $match: { questionCount: { $gt: 0 } } },
    ]).toArray();

    // 2. Get all SOPs from the SOP model to enrich with name/identifier
    const allSOPs = await SOP.find({
      $or: [{ isObsolete: { $ne: true } }, { isObsolete: { $exists: false } }],
    })
      .select('_id name identifier department language')
      .lean() as any[];

    const sopById = new Map<string, any>();
    for (const s of allSOPs) {
      sopById.set(s._id.toString(), s);
    }

    // 3. Merge banks by identifier — deduplicate EN+GU into one logical SOP
    const mergedByIdentifier = new Map<string, {
      identifier: string;
      name: string;
      department: string;
      languages: string[];
      totalQuestions: number;
    }>();

    for (const bank of sopsWithMCQs) {
      // Resolve identifier: prefer bank.sopIdentifier, else look up from SOP model
      let identifier = (bank.sopIdentifier || '').trim().toUpperCase();
      let name = bank.sopName || '';
      let dept = bank.folderDepartment || bank.department || '';

      if (!identifier && bank.sopId) {
        const sop = sopById.get(bank.sopId.toString());
        if (sop) {
          identifier = (sop.identifier || '').trim().toUpperCase();
          if (!name) name = sop.name || '';
          if (!dept) dept = sop.department || '';
        }
      }

      if (!identifier) continue;

      const lang = bank.language || 'English';

      if (mergedByIdentifier.has(identifier)) {
        const existing = mergedByIdentifier.get(identifier)!;
        if (!existing.languages.includes(lang)) existing.languages.push(lang);
        existing.totalQuestions += bank.questionCount;
      } else {
        mergedByIdentifier.set(identifier, {
          identifier,
          name,
          department: dept,
          languages: [lang],
          totalQuestions: bank.questionCount,
        });
      }
    }

    // 4. Get all identifiers present in SOPLibrary (registry) — these are "dashboard-visible"
    const libraryDocs = await SOPLibrary.find({
      sopIdentifier: { $regex: /^[A-Z]{2,6}\d{1,4}-\d{1,3}$/i },
      sopName: { $not: /annexure/i },
    })
      .select('sopIdentifier department')
      .lean() as any[];

    const libraryIdentifiers = new Set<string>(
      libraryDocs.map((d: any) => (d.sopIdentifier || '').trim().toUpperCase())
    );

    // 5. Find the gap: in MCQ bank but NOT in registry
    const gapSOPs = [];
    for (const [identifier, info] of mergedByIdentifier) {
      if (!libraryIdentifiers.has(identifier)) {
        gapSOPs.push({
          sopNo: identifier,
          name: info.name,
          department: info.department,
          languages: info.languages,
          totalQuestions: info.totalQuestions,
        });
      }
    }

    // Sort by department then identifier
    gapSOPs.sort((a, b) =>
      a.department.localeCompare(b.department) || a.sopNo.localeCompare(b.sopNo)
    );

    return NextResponse.json({
      success: true,
      summary: {
        totalWithMCQs: mergedByIdentifier.size,
        totalInRegistry: libraryIdentifiers.size,
        gapCount: gapSOPs.length,
      },
      gapSOPs,
    });

  } catch (error) {
    return NextResponse.json(
      { error: 'Gap audit failed', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
