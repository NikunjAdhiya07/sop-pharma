/**
 * Cleanup Script: Remove MCQs with Section Reference Questions
 * 
 * This script identifies and removes MCQs that ask questions based on section references
 * (e.g., "In section 4.4.2, what is stated?", "What does section X.Y say?")
 * 
 * Usage: npx tsx scripts/cleanup-section-reference-mcqs.ts
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';

// Load environment variables
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

// Define the MCQ schema inline to avoid import issues
interface IOptionVariant {
  text: string;
  isCorrect: boolean;
}

interface IMCQ {
  aiIcon: string;
  question: string;
  difficulty: 'Easy' | 'Medium' | 'Hard';
  difficultyStars: '⭐' | '⭐⭐' | '⭐⭐⭐';
  options: string[];
  correctAnswer: string;
  explanation: string;
  sopReference: string;
  optionVariants: IOptionVariant[];
}

interface IMCQBank extends mongoose.Document {
  sopId: mongoose.Types.ObjectId;
  sopName: string;
  sopIdentifier: string;
  mcqs: IMCQ[];
  generatedAt: Date;
  totalQuestions: number;
  difficultyDistribution: {
    easy: number;
    medium: number;
    hard: number;
  };
  aiModel?: string;
}

const OptionVariantSchema = new mongoose.Schema<IOptionVariant>({
  text: { type: String, required: true },
  isCorrect: { type: Boolean, required: true },
}, { _id: false });

const MCQSchema = new mongoose.Schema<IMCQ>({
  aiIcon: { type: String, required: true },
  question: { type: String, required: true },
  difficulty: { type: String, enum: ['Easy', 'Medium', 'Hard'], required: true },
  difficultyStars: { type: String, enum: ['⭐', '⭐⭐', '⭐⭐⭐'], required: true },
  options: { type: [String], required: true },
  correctAnswer: { type: String, required: true },
  explanation: { type: String, required: true },
  sopReference: { type: String, required: true },
  optionVariants: { type: [OptionVariantSchema], default: [] },
}, { _id: false });

const MCQBankSchema = new mongoose.Schema<IMCQBank>({
  sopId: { type: mongoose.Schema.Types.ObjectId, ref: 'SOP', required: true },
  sopName: { type: String, required: true },
  sopIdentifier: { type: String, required: true },
  mcqs: { type: [MCQSchema], required: true },
  generatedAt: { type: Date, default: Date.now },
  totalQuestions: { type: Number, required: true },
  difficultyDistribution: {
    easy: { type: Number, default: 0 },
    medium: { type: Number, default: 0 },
    hard: { type: Number, default: 0 },
  },
  aiModel: { type: String, default: 'gemini-3-pro-preview' },
}, { timestamps: true });

const MCQBank = mongoose.models.MCQBank || mongoose.model<IMCQBank>('MCQBank', MCQBankSchema);

/**
 * Patterns to identify section reference questions
 */
const SECTION_REFERENCE_PATTERNS = [
  /in\s+section\s+\d+(\.\d+)*/i,           // "In section 4.4.2"
  /section\s+\d+(\.\d+)*\s+(states?|says?|mentions?|describes?)/i, // "Section 4.4.2 states"
  /what\s+(does|is)\s+section\s+\d+(\.\d+)*/i, // "What does section 4.4.2"
  /according\s+to\s+section\s+\d+(\.\d+)*/i,   // "According to section 4.4.2"
  /as\s+per\s+section\s+\d+(\.\d+)*/i,         // "As per section 4.4.2"
  /refer\s+to\s+section\s+\d+(\.\d+)*/i,       // "Refer to section 4.4.2"
  /in\s+\d+(\.\d+)+,?\s+what/i,                // "In 4.4.2, what"
  /clause\s+\d+(\.\d+)*\s+(states?|says?)/i,   // "Clause 4.4.2 states"
];

/**
 * Check if a question is a section reference question
 */
function isSectionReferenceQuestion(question: string): boolean {
  return SECTION_REFERENCE_PATTERNS.some(pattern => pattern.test(question));
}

/**
 * Main cleanup function
 */
async function cleanupSectionReferenceMCQs() {
  try {
    // Connect to MongoDB
    const mongoUri = process.env.MONGODB_URI;
    if (!mongoUri) {
      throw new Error('MONGODB_URI is not defined in environment variables');
    }

    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(mongoUri);
    console.log('✅ Connected to MongoDB\n');

    // Fetch all MCQ banks
    const mcqBanks = await MCQBank.find({});
    console.log(`📊 Found ${mcqBanks.length} MCQ banks to analyze\n`);

    let totalBanksModified = 0;
    let totalMCQsRemoved = 0;
    const detailedReport: Array<{
      sopName: string;
      sopIdentifier: string;
      removedCount: number;
      removedQuestions: string[];
    }> = [];

    // Process each bank
    for (const bank of mcqBanks) {
      const originalCount = bank.mcqs.length;
      const removedQuestions: string[] = [];

      // Filter out section reference questions
      const filteredMCQs = bank.mcqs.filter((mcq: IMCQ) => {
        const isSectionRef = isSectionReferenceQuestion(mcq.question);
        if (isSectionRef) {
          removedQuestions.push(mcq.question);
        }
        return !isSectionRef;
      });

      // If any MCQs were removed, update the bank
      if (filteredMCQs.length < originalCount) {
        const removedCount = originalCount - filteredMCQs.length;
        
        bank.mcqs = filteredMCQs;
        bank.totalQuestions = filteredMCQs.length;
        
        // Recalculate difficulty distribution
        bank.difficultyDistribution = {
          easy: filteredMCQs.filter((m: IMCQ) => m.difficulty === 'Easy').length,
          medium: filteredMCQs.filter((m: IMCQ) => m.difficulty === 'Medium').length,
          hard: filteredMCQs.filter((m: IMCQ) => m.difficulty === 'Hard').length,
        };

        await bank.save();
        
        totalBanksModified++;
        totalMCQsRemoved += removedCount;
        
        detailedReport.push({
          sopName: bank.sopName,
          sopIdentifier: bank.sopIdentifier,
          removedCount,
          removedQuestions,
        });

        console.log(`✅ ${bank.sopName} (${bank.sopIdentifier})`);
        console.log(`   Removed: ${removedCount} MCQs`);
        console.log(`   Remaining: ${filteredMCQs.length} MCQs\n`);
      }
    }

    // Print summary
    console.log('\n' + '='.repeat(60));
    console.log('📋 CLEANUP SUMMARY');
    console.log('='.repeat(60));
    console.log(`Total MCQ Banks Analyzed: ${mcqBanks.length}`);
    console.log(`Total MCQ Banks Modified: ${totalBanksModified}`);
    console.log(`Total MCQs Removed: ${totalMCQsRemoved}`);
    console.log('='.repeat(60) + '\n');

    // Print detailed report
    if (detailedReport.length > 0) {
      console.log('📝 DETAILED REPORT\n');
      detailedReport.forEach((report, index) => {
        console.log(`${index + 1}. ${report.sopName} (${report.sopIdentifier})`);
        console.log(`   Removed ${report.removedCount} question(s):\n`);
        report.removedQuestions.forEach((q, i) => {
          console.log(`   ${i + 1}. ${q}`);
        });
        console.log('');
      });
    } else {
      console.log('✨ No section reference questions found! All MCQs are clean.\n');
    }

    // Disconnect
    await mongoose.disconnect();
    console.log('🔌 Disconnected from MongoDB');
    console.log('✅ Cleanup completed successfully!');

  } catch (error) {
    console.error('❌ Error during cleanup:', error);
    process.exit(1);
  }
}

// Run the cleanup
cleanupSectionReferenceMCQs();
