import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import SOP from '@/models/SOP';
import User from '@/models/User';
import { invalidateDashboardSopsCache } from '@/lib/dashboardSopsCache';
import { isValidObsoletePassword } from '@/lib/obsoletePasswordAuth';

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

    let authorized = await isValidObsoletePassword(password);
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

    const m = String(sopIdentifier).match(/^([A-Za-z]{2,6}\d+)-\d+$/);
    const prefix = m ? m[1] : null;
    const query = prefix
      ? { identifier: { $regex: `^${prefix}-`, $options: 'i' } }
      : { identifier: { $regex: `^${String(sopIdentifier).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, $options: 'i' } };

    const result = await SOP.deleteMany(query);

    if (result.deletedCount === 0) {
      return NextResponse.json({ error: 'SOP not found' }, { status: 404 });
    }

    void invalidateDashboardSopsCache();

    return NextResponse.json({
      success: true,
      message: `Deleted ${result.deletedCount} SOP record(s)`,
    });
  } catch (error) {
    console.error('[delete-sop] error:', error);
    return NextResponse.json({ error: 'Failed to delete SOP' }, { status: 500 });
  }
}
