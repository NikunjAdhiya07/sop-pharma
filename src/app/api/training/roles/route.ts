import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import EmployeeRole from '@/models/EmployeeRole';
import MCQBank from '@/models/MCQBank';

export async function GET(request: NextRequest) {
  try {
    await connectDB();
    const roles = await EmployeeRole.find().sort({ createdAt: -1 }).lean();
    return NextResponse.json({ success: true, roles });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    await connectDB();
    const body = await request.json();
    
    if (!body.name || !body.employeeName || !body.department) {
      return NextResponse.json({ success: false, error: 'Name, Employee Name, and Department are required' }, { status: 400 });
    }

    const newRole = await EmployeeRole.create({
      name: body.name,
      employeeName: body.employeeName,
      department: body.department,
      description: body.description || '',
      sops: body.sops || [],
    });

    return NextResponse.json({ success: true, role: newRole }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
