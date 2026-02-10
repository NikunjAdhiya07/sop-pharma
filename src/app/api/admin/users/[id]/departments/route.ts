import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import connectDB from '@/lib/mongodb';
import User from '@/models/User';

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession() as any;
    
    if (!session || (session.user.role !== 'admin' && session.user.role !== 'qa-head')) {
      return NextResponse.json(
        { error: 'Unauthorized - Admin or QA Head access required' },
        { status: 403 }
      );
    }

    await connectDB();

    const { allowedDepartments } = await request.json();

    if (!Array.isArray(allowedDepartments)) {
      return NextResponse.json(
        { error: 'allowedDepartments must be an array' },
        { status: 400 }
      );
    }

    const validDepartments = [
      'QA',
      'QC',
      'Microbiology',
      'Production',
      'Store',
      'Engineering and Maintenance',
      'Personnel'
    ];

    const invalidDepts = allowedDepartments.filter(
      dept => !validDepartments.includes(dept)
    );

    if (invalidDepts.length > 0) {
      return NextResponse.json(
        { error: `Invalid departments: ${invalidDepts.join(', ')}` },
        { status: 400 }
      );
    }

    const user = await User.findByIdAndUpdate(
      params.id,
      { allowedDepartments },
      { new: true, runValidators: true }
    ).select('-password');

    if (!user) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      user,
      message: 'Department access updated successfully'
    });

  } catch (error) {
    console.error('Error updating user departments:', error);
    return NextResponse.json(
      {
        error: 'Failed to update department access',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
