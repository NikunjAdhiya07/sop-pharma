import { NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import User from '@/models/User';
import TestAssignment from '@/models/TestAssignment';
import TestResult from '@/models/TestResult';

export async function GET() {
  try {
    await dbConnect();

    // Get all users with their test statistics
    const users = await User.find({})
      .select('-password')
      .lean();

    // Get test assignments for each user
    const usersWithStats = await Promise.all(
      users.map(async (user) => {
        const assignments = await TestAssignment.find({ userId: user._id })
          .populate('assignedBy', 'name')
          .lean();

        const results = await TestResult.find({ userId: user._id })
          .sort({ completedAt: -1 })
          .lean();

        const completedTests = assignments.filter(a => a.status === 'completed').length;
        const totalAssigned = assignments.length;
        const completionRate = totalAssigned > 0 ? (completedTests / totalAssigned) * 100 : 0;

        // Calculate average score from results
        const avgScore = results.length > 0
          ? results.reduce((sum, r) => sum + r.score, 0) / results.length
          : 0;

        // Check trainer eligibility (100% completion rate with average score >= 80)
        const isTrainerEligible = completionRate === 100 && avgScore >= 80 && totalAssigned > 0;

        return {
          ...user,
          testsAssigned: totalAssigned,
          testsCompleted: completedTests,
          completionRate: Math.round(completionRate),
          averageScore: Math.round(avgScore),
          isTrainerEligible,
          recentTests: assignments.slice(0, 5),
          recentResults: results.slice(0, 3),
        };
      })
    );

    return NextResponse.json({
      success: true,
      users: usersWithStats,
    });
  } catch (error) {
    console.error('Error fetching users:', error);
    return NextResponse.json(
      { success: false, message: 'Failed to fetch users' },
      { status: 500 }
    );
  }
}

// Create a new user
export async function POST(request: Request) {
  try {
    await dbConnect();

    const { username, password, name, role, employeeId, department, email, allowedSections } = await request.json();

    if (!username || !password || !name) {
      return NextResponse.json(
        { success: false, message: 'Username, password, and name are required' },
        { status: 400 }
      );
    }

    // Check if user already exists
    const existingUser = await User.findOne({ username: username.toLowerCase() });
    if (existingUser) {
      return NextResponse.json(
        { success: false, message: 'Username already exists' },
        { status: 400 }
      );
    }

    const newUser = new User({
      username: username.toLowerCase(),
      password, // In production, hash this
      name,
      role: role || 'user',
      employeeId,
      department,
      email,
      allowedSections: allowedSections && allowedSections.length > 0 
        ? allowedSections 
        : undefined, // Let schema default handle it
    });

    await newUser.save();

    return NextResponse.json({
      success: true,
      message: 'User created successfully',
      user: {
        id: newUser._id,
        username: newUser.username,
        name: newUser.name,
        role: newUser.role,
        employeeId: newUser.employeeId,
        department: newUser.department,
        email: newUser.email,
      },
    });
  } catch (error) {
    console.error('Error creating user:', error);
    return NextResponse.json(
      { success: false, message: 'Failed to create user' },
      { status: 500 }
    );
  }
}
