import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import SOP from '@/models/SOP';

const OBSOLETE_FIXED_PASSWORD = 'indiana@132';

// Extract family prefix: "QAGE01-10" → "QAGE01"
function familyPrefix(identifier: string): string | null {
  const m = identifier.match(/^([A-Za-z]{2,6}\d+)-\d+$/);
  return m ? m[1] : null;
}

export async function POST(request: NextRequest) {
  try {
    await connectDB();

    const body = await request.json();
    const { sopIdentifier, password } = body;

    if (!sopIdentifier) {
      return NextResponse.json({ error: 'sopIdentifier is required' }, { status: 400 });
    }
    if (!password || password !== OBSOLETE_FIXED_PASSWORD) {
      return NextResponse.json({ error: 'Incorrect password' }, { status: 403 });
    }

    // Restore ALL revisions of this SOP family
    const prefix = familyPrefix(sopIdentifier);
    const query = prefix
      ? { identifier: { $regex: `^${prefix}-`, $options: 'i' }, isObsolete: true }
      : { identifier: { $regex: `^${sopIdentifier.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, $options: 'i' }, isObsolete: true };

    const result = await SOP.updateMany(
      query,
      {
        $set: { isObsolete: false },
        $unset: { obsoleteAt: 1, obsoleteReason: 1 },
      },
    );

    console.log(`[remove-obsolete] "${sopIdentifier}" → matched: ${result.matchedCount}, modified: ${result.modifiedCount}`);

    if (result.matchedCount === 0) {
      return NextResponse.json({
        success: false,
        error: `No obsolete records found for "${sopIdentifier}". It may already be active.`,
      }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      message: `Restored ${result.modifiedCount} SOP record(s) to the active registry.`,
    });

  } catch (error: any) {
    console.error('remove-obsolete error:', error?.message || error);
    return NextResponse.json({ error: 'Failed to remove SOP from obsolete' }, { status: 500 });
  }
}
