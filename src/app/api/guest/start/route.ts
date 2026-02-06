import { NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import GuestAccess from '@/models/GuestAccess';
import User from '@/models/User';
import TestAssignment from '@/models/TestAssignment';
import MCQBank from '@/models/MCQBank';
import crypto from 'crypto';

export async function POST(request: Request) {
  try {
    await dbConnect();
    const { token, name, dob } = await request.json(); // Re-verify for security

    // 1. Re-validate
    const guestAccess = await GuestAccess.findOne({ token });
    if (!guestAccess || guestAccess.targetName.toLowerCase().trim() !== name.toLowerCase().trim()) {
         return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
    }

    // 2. Create Shadow User if not exists
    let shadowUser;
    if (guestAccess.shadowUserId) {
        shadowUser = await User.findById(guestAccess.shadowUserId);
    }

    if (!shadowUser) {
        const username = `guest_${token}_${Date.now()}`; // Unique username
        shadowUser = await User.create({
            username: username,
            password: crypto.randomBytes(16).toString('hex'), // Unknowable password
            name: guestAccess.targetName,
            role: 'user', // Or 'guest' if we add that to enum, but 'user' works for now
            department: 'Guest',
            employeeId: 'GUEST',
            isTrainerEligible: false
        });
        
        guestAccess.shadowUserId = shadowUser._id;
        guestAccess.status = 'started';
        await guestAccess.save();
    }

    // 3. Create Test Assignment
    // Check if valid assignment already exists
    let assignment = await TestAssignment.findOne({
        userId: shadowUser._id,
        testName: guestAccess.assignedTest.testName,
        status: 'in-progress'
    });

    if (!assignment) {
        assignment = await TestAssignment.create({
            userId: shadowUser._id,
            testType: 'regular', // or 'guest' specific type
            testName: guestAccess.assignedTest.testName,
            sopIds: guestAccess.assignedTest.sopIds,
            departments: ['Guest'],
            difficulty: guestAccess.assignedTest.difficulty,
            questionCount: guestAccess.assignedTest.questionCount,
            assignedBy: guestAccess.createdBy,
            assignedAt: new Date(),
            status: 'in-progress',
            maxAttempts: 1,
            attempts: 0
        });
    }

    // 4. Fetch Questions (Simplified logic from test generator)
    const { sopIds, questionCount, difficulty } = guestAccess.assignedTest;
    
    // Fetch MCQs from the assigned SOPs
    // This is a simplified fetch - ideally we reuse a specialized service
    const banks = await MCQBank.find({ sopId: { $in: sopIds } });
    
    let allQuestions: any[] = [];
    banks.forEach((bank: any) => {
        allQuestions = [...allQuestions, ...bank.mcqs.map((q: any) => ({
            ...q.toObject(),
            sopId: bank.sopId,
            sopName: bank.sopName,
            sopIdentifier: bank.sopIdentifier,
            mcqBankId: bank._id
        }))];
    });

    // Shuffle and slice
    const shuffled = allQuestions.sort(() => 0.5 - Math.random());
    const selectedQuestions = shuffled.slice(0, questionCount);

    return NextResponse.json({
        success: true,
        assignmentId: assignment._id,
        questions: selectedQuestions,
        userId: shadowUser._id, // Needed for submission
    });

  } catch (error) {
    console.error('Guest start exam error:', error);
    return NextResponse.json(
      { success: false, message: 'Server error' },
      { status: 500 }
    );
  }
}
