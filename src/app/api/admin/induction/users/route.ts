import { NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import User from '@/models/User';
import { getServerSession } from 'next-auth';

export async function GET(request: Request) {
  try {
    const session = await getServerSession();
    if (!session || !session.user) {
        return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
    }

    await dbConnect();
    
    // Check Admin Role
    const admin = await User.findOne({ email: session.user.email });
    if (!admin || (admin.role !== 'admin' && admin.role !== 'trainer')) {
         return NextResponse.json({ success: false, message: 'Forbidden' }, { status: 403 });
    }

    // Fetch users in induction stage
    // Optionally sort by those who have completed their inductionProgress
    const inductionUsers = await User.find({ trainingStage: 'induction' })
      .select('name email username inductionProgress createdAt')
      .sort({ 'inductionProgress.completed': -1, createdAt: -1 })
      .lean();

    return NextResponse.json({ success: true, users: inductionUsers });

  } catch (error) {
    console.error('Fetch induction users error:', error);
    return NextResponse.json(
      { success: false, message: 'Server error' },
      { status: 500 }
    );
  }
}
