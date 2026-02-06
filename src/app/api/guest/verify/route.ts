import { NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import GuestAccess from '@/models/GuestAccess';
import { cookies } from 'next/headers';

export async function POST(request: Request) {
  try {
    await dbConnect();
    
    const { token, name, dob } = await request.json();

    if (!token || !name || !dob) {
      return NextResponse.json(
        { success: false, message: 'Missing credentials' },
        { status: 400 }
      );
    }

    const guestAccess = await GuestAccess.findOne({ token });

    if (!guestAccess) {
      return NextResponse.json(
        { success: false, message: 'Invalid link' },
        { status: 404 }
      );
    }

    if (guestAccess.status !== 'pending' && guestAccess.status !== 'started') {
       return NextResponse.json(
        { success: false, message: 'This link has already been used or expired' },
        { status: 403 }
      );
    }

    if (new Date() > new Date(guestAccess.expiresAt)) {
        guestAccess.status = 'expired';
        await guestAccess.save();
        return NextResponse.json(
            { success: false, message: 'Link expired' },
            { status: 403 }
        );
    }

    // Verify Name (Case insensitive)
    if (guestAccess.targetName.toLowerCase().trim() !== name.toLowerCase().trim()) {
      return NextResponse.json(
        { success: false, message: 'Identity verification failed' },
        { status: 401 }
      );
    }

    // Verify DOB
    const inputDate = new Date(dob).toISOString().split('T')[0];
    const targetDate = new Date(guestAccess.targetDob).toISOString().split('T')[0];
    
    if (inputDate !== targetDate) {
         return NextResponse.json(
        { success: false, message: 'Identity verification failed' },
        { status: 401 }
      );
    }

    // Success! 
    // Set a secure cookie for the session
    // We can't use NextAuth easily here for a purely transient user without polluting the DB user list permanently 
    // unless we use the Shadow User pattern fully.
    
    return NextResponse.json({
      success: true,
      valid: true,
      guestName: guestAccess.targetName
    });

  } catch (error) {
    console.error('Guest verification error:', error);
    return NextResponse.json(
      { success: false, message: 'Server error' },
      { status: 500 }
    );
  }
}
