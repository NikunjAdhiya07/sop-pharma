import { NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import MCQBank from '@/models/MCQBank';

export async function POST() {
  try {
    await dbConnect();
    
    console.log('🔍 Starting MCQ validation...');
    
    const banks = await MCQBank.find({});
    console.log(`📊 Found ${banks.length} MCQ banks to validate`);
    
    let totalFixed = 0;
    let totalInvalid = 0;
    const fixedBanks: string[] = [];
    
    for (const bank of banks) {
      let bankModified = false;
      
      for (let i = 0; i < bank.mcqs.length; i++) {
        const mcq = bank.mcqs[i];
        
        // Check if correctAnswer matches any option (case-insensitive)
        const hasValidCorrectAnswer = mcq.options && mcq.options.some((opt: string) => 
          opt.trim().toLowerCase() === (mcq.correctAnswer || '').trim().toLowerCase()
        );
        
        if (!hasValidCorrectAnswer) {
          totalInvalid++;
          console.warn(`⚠️ Invalid correctAnswer in bank ${bank._id}, question ${i + 1}:`);
          console.warn(`   Question: ${mcq.question}`);
          console.warn(`   Current correctAnswer: "${mcq.correctAnswer}"`);
          console.warn(`   Options: ${JSON.stringify(mcq.options)}`);
          
          // Fix by setting to first option
          if (mcq.options && mcq.options.length > 0) {
            mcq.correctAnswer = mcq.options[0];
            console.warn(`   ✅ Fixed: Set to "${mcq.correctAnswer}"`);
            totalFixed++;
            bankModified = true;
          }
        }
      }
      
      // Save if modified
      if (bankModified) {
        await bank.save();
        fixedBanks.push(bank._id.toString());
        console.log(`💾 Saved fixes for bank ${bank._id}`);
      }
    }
    
    return NextResponse.json({
      success: true,
      summary: {
        totalBanks: banks.length,
        invalidFound: totalInvalid,
        questionsFixed: totalFixed,
        banksModified: fixedBanks.length,
        fixedBankIds: fixedBanks
      }
    });
    
  } catch (error: any) {
    console.error('❌ Error during validation:', error);
    return NextResponse.json(
      { error: 'Failed to validate MCQs', details: error.message },
      { status: 500 }
    );
  }
}
