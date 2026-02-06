import { NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import GuestAccess from '@/models/GuestAccess';
import crypto from 'crypto';
import { getServerSession } from 'next-auth';
import User from '@/models/User';

export async function POST(request: Request) {
  try {
    const session = await getServerSession();
    // In a real app with NextAuth options properly exported, we'd pass authOptions here.
    // For now assuming session exists = authenticated. 
    // We should also check if the user is an admin or trainer.
    
    // Manual check until authOptions is available in this context, 
    // or we assume the middleware protects this route (it should).
    if (!session || !session.user) {
       // Placeholder for session validation if middleware doesn't catch it
       // But let's assume valid for now, or check email against DB
    }

    await dbConnect();

    // Verify creator role
    const creator = await User.findOne({ email: session?.user?.email });
    if (!creator || (creator.role !== 'admin' && creator.role !== 'trainer')) {
        return NextResponse.json(
            { success: false, message: 'Unauthorized' },
            { status: 401 }
        );
    }

    const body = await request.json();
    const { targetName, targetDob, sopIds, questionCount, difficulty, expiresInMinutes, testName } = body;

    if (!targetName || !targetDob || !sopIds || sopIds.length === 0 || !testName) {
      return NextResponse.json(
        { success: false, message: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Generate unique token
    const token = crypto.randomBytes(32).toString('hex');
    
    // Calculate expiry
    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + (expiresInMinutes || 60)); // Default 1 hour

    const guestAccess = await GuestAccess.create({
      token,
      targetName,
      targetDob: new Date(targetDob),
      assignedTest: {
        sopIds,
        questionCount: questionCount || 20,
        difficulty: difficulty || 'Medium',
        testName
      },
      expiresAt,
      createdBy: creator._id,
      status: 'pending'
    });

    const link = `${process.env.NEXT_PUBLIC_APP_URL || ''}/guest/verify/${token}`;

    return NextResponse.json({
      success: true,
      link,
      token,
      expiresAt
    });

  } catch (error) {
    console.error('Guest link generation error:', error);
    return NextResponse.json(
      { success: false, message: 'Server error' },
      { status: 500 }
    );
  }
}
