import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import MCQBank from '@/models/MCQBank';
import SOP from '@/models/SOP';

/**
 * All valid SOP identifier prefixes in the system.
 * Any MCQ bank whose identifier does NOT start with one of these is considered invalid/orphan.
 */
const VALID_PREFIXES = [
  'QAGE', 'QCGE', 'QAIC', 'QAIO', 'QAMI', 'QCMI',
  'PRAA', 'PRCL', 'PRED', 'PREO', 'PREP', 'PRGE', 'PRMA', 'PRPA', 'PREG',
  'BSGE', 'STCL', 'STGE', 'STOP', 'STPA', 'STRM',
  'MAGE',
  'PEGE',
  'ANNE',
];

function isValidIdentifier(identifier: string): boolean {
  if (!identifier) return false;
  const upper = identifier.toUpperCase().trim();
  return VALID_PREFIXES.some(prefix => upper.startsWith(prefix));
}

/**
 * GET  — Preview which MCQ banks would be deleted (dry-run, safe).
 * DELETE — Actually remove the invalid MCQ banks from the database.
 */
export async function GET(_request: NextRequest) {
  try {
    await connectDB();

    // Fetch all bank identifiers (summary only)
    const allBanks = await MCQBank.find({})
      .select('_id sopId sopIdentifier sopName department totalQuestions')
      .lean();

    // Load all valid SOP IDs from DB
    const validSopIds = new Set(
      (await SOP.find({}).select('_id').lean()).map(s => s._id.toString())
    );

    const invalid: any[] = [];
    const valid: any[] = [];

    for (const bank of allBanks) {
      const badIdentifier = !isValidIdentifier(bank.sopIdentifier || '');
      const orphanedSopId = !validSopIds.has(bank.sopId?.toString() || '');

      if (badIdentifier || orphanedSopId) {
        invalid.push({
          _id: bank._id,
          sopIdentifier: bank.sopIdentifier,
          sopName: bank.sopName,
          totalQuestions: bank.totalQuestions,
          reason: badIdentifier ? 'Invalid identifier prefix' : 'SOP no longer in database',
        });
      } else {
        valid.push({
          sopIdentifier: bank.sopIdentifier,
          sopName: bank.sopName,
          totalQuestions: bank.totalQuestions,
        });
      }
    }

    return NextResponse.json({
      success: true,
      summary: {
        total: allBanks.length,
        valid: valid.length,
        invalid: invalid.length,
      },
      invalid,
      message: `Found ${invalid.length} invalid MCQ bank(s) to remove. Call DELETE to permanently delete them.`,
    });
  } catch (error) {
    console.error('[cleanup-invalid] GET error:', error);
    return NextResponse.json({ error: 'Failed to scan MCQ banks' }, { status: 500 });
  }
}

export async function DELETE(_request: NextRequest) {
  try {
    await connectDB();

    const allBanks = await MCQBank.find({})
      .select('_id sopId sopIdentifier sopName totalQuestions')
      .lean();

    const validSopIds = new Set(
      (await SOP.find({}).select('_id').lean()).map(s => s._id.toString())
    );

    const idsToDelete: string[] = [];
    const deleted: any[] = [];

    for (const bank of allBanks) {
      const badIdentifier = !isValidIdentifier(bank.sopIdentifier || '');
      const orphanedSopId = !validSopIds.has(bank.sopId?.toString() || '');

      if (badIdentifier || orphanedSopId) {
        idsToDelete.push(bank._id.toString());
        deleted.push({
          sopIdentifier: bank.sopIdentifier,
          sopName: bank.sopName,
          totalQuestions: bank.totalQuestions,
          reason: badIdentifier ? 'Invalid identifier prefix' : 'Orphaned (SOP deleted)',
        });
      }
    }

    if (idsToDelete.length === 0) {
      return NextResponse.json({
        success: true,
        deletedCount: 0,
        message: 'No invalid MCQ banks found. Database is already clean.',
      });
    }

    const result = await MCQBank.deleteMany({
      _id: { $in: idsToDelete },
    });

    console.log(`🗑️ [cleanup-invalid] Deleted ${result.deletedCount} invalid MCQ banks:`, deleted.map(d => d.sopIdentifier));

    return NextResponse.json({
      success: true,
      deletedCount: result.deletedCount,
      deleted,
      message: `Successfully removed ${result.deletedCount} invalid MCQ bank(s) from the database.`,
    });
  } catch (error) {
    console.error('[cleanup-invalid] DELETE error:', error);
    return NextResponse.json({ error: 'Failed to delete invalid MCQ banks' }, { status: 500 });
  }
}
