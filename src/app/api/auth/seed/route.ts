import { NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import User from '@/models/User';

export async function POST() {
  try {
    await dbConnect();

    // Check if demo user already exists
    const existingUser = await User.findOne({ username: 'demo' });
    
    if (existingUser) {
      return NextResponse.json({
        success: true,
        message: 'Demo user already exists',
      });
    }

    // Create demo user
    const demoUser = new User({
      username: 'demo',
      password: '123456', // In production, hash this password
      name: 'Demo User',
      role: 'admin',
    });

    await demoUser.save();

    return NextResponse.json({
      success: true,
      message: 'Demo user created successfully',
      user: {
        username: demoUser.username,
        name: demoUser.name,
        role: demoUser.role,
      },
    });
  } catch (error) {
    console.error('Seed error:', error);
    return NextResponse.json(
      { success: false, message: 'Server error' },
      { status: 500 }
    );
  }
}
