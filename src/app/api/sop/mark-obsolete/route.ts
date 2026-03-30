import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import SOP from '@/models/SOP';
import User from '@/models/User';

const OBSOLETE_FIXED_PASSWORD = 'obsolete@sop';

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

    // Validate password: accept fixed password OR the user's own login password
    let authorized = password === OBSOLETE_FIXED_PASSWORD;
    if (!authorized && username) {
      const user = await User.findOne({ username }).lean() as any;
      if (user && user.password === password) {
        // Only admin or qa-head can mark obsolete
        if (user.role === 'admin' || user.role === 'qa-head') {
          authorized = true;
        }
      }
    }

    if (!authorized) {
      return NextResponse.json({ error: 'Incorrect password' }, { status: 403 });
    }

    // Mark all SOPs with this identifier as obsolete
    const result = await SOP.updateMany(
      { identifier: sopIdentifier },
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
