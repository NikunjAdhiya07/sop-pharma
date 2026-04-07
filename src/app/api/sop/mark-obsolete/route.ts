import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import SOP from '@/models/SOP';
import User from '@/models/User';

const OBSOLETE_FIXED_PASSWORD = 'indiana@132';

// Extract family prefix: "QAGE01-10" → "QAGE01", "MAGE01-05" → "MAGE01"
function familyPrefix(identifier: string): string | null {
  const m = identifier.match(/^([A-Za-z]{2,6}\d+)-\d+$/);
  return m ? m[1] : null;
}

export async function POST(request: NextRequest) {
  try {
    await connectDB();

    const body = await request.json();
    const { sopIdentifier, password, username } = body;

    if (!sopIdentifier) {
      return NextResponse.json({ error: 'sopIdentifier is required' }, { status: 400 });
    }
    if (!password) {
      return NextResponse.json({ error: 'Password is required' }, { status: 400 });
    }

    // Validate password
    let authorized = password === OBSOLETE_FIXED_PASSWORD;
    if (!authorized && username) {
      const user = await User.findOne({ username }).lean() as any;
      if (user && user.password === password) {
        if (user.role === 'admin' || user.role === 'qa-head') {
          authorized = true;
        }
      }
    }

    if (!authorized) {
      return NextResponse.json({ error: 'Incorrect password' }, { status: 403 });
    }

    // Mark ALL revisions of this SOP family as obsolete
    // e.g. marking QAGE01-10 also marks QAGE01-09, QAGE01-11, etc.
    const prefix = familyPrefix(sopIdentifier);
    const query = prefix
      ? { identifier: { $regex: `^${prefix}-`, $options: 'i' } }
      : { identifier: { $regex: `^${sopIdentifier.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, $options: 'i' } };

    const result = await SOP.updateMany(
      query,
      {
        $set: {
          isObsolete: true,
          obsoleteAt: new Date(),
          obsoleteReason: 'Marked obsolete by admin',
        },
      },
    );

    if (result.matchedCount === 0) {
      return NextResponse.json({ error: 'SOP not found' }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      message: `Marked ${result.modifiedCount} SOP record(s) as obsolete`,
    });
  } catch (error) {
    console.error('mark-obsolete error:', error);
    return NextResponse.json({ error: 'Failed to mark SOP as obsolete' }, { status: 500 });
  }
}
