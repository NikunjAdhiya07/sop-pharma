import mongoose, { Schema, Document } from 'mongoose';

export interface IMCQBankTestResult extends Document {
  userId: mongoose.Types.ObjectId;
  username: string;
  userFullName: string;
  mcqBankId: mongoose.Types.ObjectId;
  sopName: string;
  sopIdentifier: string;
  testName: string;
  questions: Array<{
    questionIndex: number;
    question: string;
    aiIcon: string;
    difficulty: 'Easy' | 'Medium' | 'Hard';
    difficultyStars: '⭐' | '⭐⭐' | '⭐⭐⭐';
    options: string[];
    selectedAnswer: string;
    correctAnswer: string;
    isCorrect: boolean;
    explanation: string;
    sopReference: string;
  }>;
  totalQuestions: number;
  correctAnswers: number;
  incorrectAnswers: number;
  skippedQuestions: number;
  score: number; // Percentage
  grade: 'A+' | 'A' | 'B+' | 'B' | 'C' | 'D' | 'F';
  isPassed: boolean;
  passingScore: number;
  difficultyBreakdown: {
    easy: { correct: number; total: number };
    medium: { correct: number; total: number };
    hard: { correct: number; total: number };
  };
  timeTaken: number; // in seconds
  startedAt: Date;
  completedAt: Date;
  reviewed: boolean;
  reviewedAt?: Date;
  attemptNumber: number;
}

const MCQBankTestResultSchema = new Schema<IMCQBankTestResult>({
  userId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  },
  username: {
    type: String,
    required: true,
  },
  userFullName: {
    type: String,
    required: true,
  },
  mcqBankId: {
    type: Schema.Types.ObjectId,
    ref: 'MCQBank',
    required: true,
    index: true,
  },
  sopName: {
    type: String,
    required: true,
  },
  sopIdentifier: {
    type: String,
    required: true,
  },
  testName: {
    type: String,
    required: true,
  },
  questions: [{
    questionIndex: Number,
    question: String,
    aiIcon: String,
    difficulty: {
      type: String,
      enum: ['Easy', 'Medium', 'Hard'],
    },
    difficultyStars: {
      type: String,
      enum: ['⭐', '⭐⭐', '⭐⭐⭐'],
    },
    options: [String],
    selectedAnswer: String,
    correctAnswer: String,
    isCorrect: Boolean,
    explanation: String,
    sopReference: String,
  }],
  totalQuestions: {
    type: Number,
    required: true,
  },
  correctAnswers: {
    type: Number,
    required: true,
  },
  incorrectAnswers: {
    type: Number,
    required: true,
  },
  skippedQuestions: {
    type: Number,
    default: 0,
  },
  score: {
    type: Number,
    required: true,
    min: 0,
    max: 100,
  },
  grade: {
    type: String,
    enum: ['A+', 'A', 'B+', 'B', 'C', 'D', 'F'],
    required: true,
  },
  isPassed: {
    type: Boolean,
    required: true,
  },
  passingScore: {
    type: Number,
    default: 70,
  },
  difficultyBreakdown: {
    easy: {
      correct: { type: Number, default: 0 },
      total: { type: Number, default: 0 },
    },
    medium: {
      correct: { type: Number, default: 0 },
      total: { type: Number, default: 0 },
    },
    hard: {
      correct: { type: Number, default: 0 },
      total: { type: Number, default: 0 },
    },
  },
  timeTaken: {
    type: Number,
    required: true,
  },
  startedAt: {
    type: Date,
    required: true,
  },
  completedAt: {
    type: Date,
    required: true,
  },
  reviewed: {
    type: Boolean,
    default: false,
  },
  reviewedAt: {
    type: Date,
  },
  attemptNumber: {
    type: Number,
    required: true,
    default: 1,
  },
}, {
  timestamps: true,
});

// Indexes for efficient querying
MCQBankTestResultSchema.index({ userId: 1, completedAt: -1 });
MCQBankTestResultSchema.index({ mcqBankId: 1, score: -1 });
MCQBankTestResultSchema.index({ score: -1 });
MCQBankTestResultSchema.index({ isPassed: 1 });

export default mongoose.models.MCQBankTestResult || mongoose.model<IMCQBankTestResult>('MCQBankTestResult', MCQBankTestResultSchema);
