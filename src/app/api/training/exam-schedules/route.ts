import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import MatrixEntry from '@/models/MatrixEntry';
import MCQBank from '@/models/MCQBank';
import TestResult from '@/models/TestResult';
import User from '@/models/User';

export async function GET(request: NextRequest) {
  try {
    await connectDB();
    const currentDate = new Date();
    const currentMonth = currentDate.getMonth() + 1; // 1-12
    const currentYear = currentDate.getFullYear();

    // 1. Fetch Matrix Entries
    const matrixEntries = await MatrixEntry.find().lean();
    
    // 2. Map Users
    const distinctNames = [...new Set(matrixEntries.map(e => e.employeeName))];
    const users = await User.find({ name: { $in: distinctNames } }).select('_id name').lean();
    const userToIdMap = users.reduce((acc: Record<string, string>, u: any) => {
       acc[u.name.toLowerCase().trim()] = u._id.toString();
       return acc;
    }, {});

    // 3. Fetch Test Results
    const userIds = Object.values(userToIdMap);
    const results = await TestResult.find({ userId: { $in: userIds } }).select('userId isPassed completedAt questions').lean();

    const completedExamsMap: Record<string, any> = {};
    for (const r of results) {
       const uId = r.userId.toString();
       if (!r.questions) continue;
       const sops = [...new Set(r.questions.map((q: any) => q.sopIdentifier).filter(Boolean))];
       
       for (const rawSop of sops) {
           const cleanSop = rawSop.trim();
           const key = `${uId}_${cleanSop}`;
           // Prefer retaining a passed result. If none exists yet, just store the first result.
           if (r.isPassed || !completedExamsMap[key]) {
               completedExamsMap[key] = {
                   completedAt: r.completedAt,
                   isPassed: r.isPassed,
               };
           }
       }
    }

    // 4. Fetch SOP metadata
    const sopsFromBank = await MCQBank.find().select('sopIdentifier sopName').lean();

    const getSopInfo = (matrixCode: string) => {
        const cleanCode = matrixCode.trim();
        const matched = sopsFromBank.find((b: any) => {
           const cleanBankId = b.sopIdentifier.trim();
           return cleanBankId === cleanCode || cleanBankId.startsWith(`${cleanCode}-`);
        });
        if (matched) return { id: matched.sopIdentifier.trim(), name: matched.sopName.trim() };
        return { id: cleanCode, name: 'Unknown SOP' };
    };

    // 5. Categorization
    const todayExams: any[] = [];
    const upcomingExams: any[] = [];
    const completedExams: any[] = [];

    for (const entry of matrixEntries) {
        const uId = userToIdMap[entry.employeeName.toLowerCase().trim()];
        const sopInfo = getSopInfo(entry.sopCode);
        
        let resultInfo = null;
        if (uId) {
            if (completedExamsMap[`${uId}_${sopInfo.id}`]) {
                resultInfo = completedExamsMap[`${uId}_${sopInfo.id}`];
            } else if (completedExamsMap[`${uId}_${entry.sopCode.trim()}`]) {
                resultInfo = completedExamsMap[`${uId}_${entry.sopCode.trim()}`];
            }
        }

        const scheduledData = {
           _id: entry._id.toString(),
           trainerName: entry.employeeName,
           department: entry.department,
           sopName: sopInfo.name,
           sopCode: sopInfo.id,
           matrixMonth: entry.monthName,
           matrixMonthIndex: entry.month,
           matrixYear: entry.year,
        };

        if (resultInfo) {
           completedExams.push({
               ...scheduledData,
               completedAt: resultInfo.completedAt,
               status: resultInfo.isPassed ? 'Passed' : 'Failed'
           });
        } else {
           // Evaluates if Due Now / Overdue (i.e. 'Today' limit relative to Matrix logic)
           if (entry.year < currentYear || (entry.year === currentYear && entry.month <= currentMonth)) {
               todayExams.push(scheduledData);
           } else {
               upcomingExams.push(scheduledData);
           }
        }
    }

    return NextResponse.json({
        success: true,
        todayExams,
        completedExams,
        upcomingExams
    });

  } catch (error: any) {
     console.error('API Error in exam-schedules:', error);
     return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
