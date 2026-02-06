import { NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import User from '@/models/User';
import { getServerSession } from 'next-auth';

export async function POST(request: Request) {
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

    const { userId, newStage } = await request.json();
    
    if (!['induction', 'active', 'certified'].includes(newStage)) {
         return NextResponse.json({ success: false, message: 'Invalid stage' }, { status: 400 });
    }

    const updatedUser = await User.findByIdAndUpdate(
        userId, 
        { trainingStage: newStage },
        { new: true }
    );

    if (!updatedUser) {
        return NextResponse.json({ success: false, message: 'User not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true, user: updatedUser });

  } catch (error) {
    console.error('Move stage error:', error);
    return NextResponse.json(
      { success: false, message: 'Server error' },
      { status: 500 }
    );
  }
}
