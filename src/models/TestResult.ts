import mongoose from 'mongoose';

export interface ITestResult extends mongoose.Document {
  assignmentId: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  testType: 'induction' | 'regular' | 'kapa' | 'interview' | 'change-control';
  questions: Array<{
    questionId: string;
    question: string;
    selectedAnswer: string;
    correctAnswer: string;
    isCorrect: boolean;
    sopName?: string;
    sopIdentifier?: string;
  }>;
  score: number;
  totalQuestions: number;
  correctAnswers: number;
  isPassed: boolean;
  passingScore: number;
  startedAt: Date;
  completedAt: Date;
  timeTaken: number; // in seconds
  attemptNumber: number;
}

const TestResultSchema = new mongoose.Schema<ITestResult>({
  assignmentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'TestAssignment',
    required: true,
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  testType: {
    type: String,
    enum: ['induction', 'regular', 'kapa', 'interview', 'change-control'],
    required: true,
  },
  questions: [{
    questionId: String,
    question: String,
    selectedAnswer: String,
    correctAnswer: String,
    isCorrect: Boolean,
    sopName: String,
    sopIdentifier: String,
  }],
  score: {
    type: Number,
    required: true,
    min: 0,
    max: 100,
  },
  totalQuestions: {
    type: Number,
    required: true,
  },
  correctAnswers: {
    type: Number,
    required: true,
  },
  isPassed: {
    type: Boolean,
    required: true,
  },
  passingScore: {
    type: Number,
    default: 80,
  },
  startedAt: {
    type: Date,
    required: true,
  },
  completedAt: {
    type: Date,
    required: true,
  },
  timeTaken: {
    type: Number,
    required: true,
  },
  attemptNumber: {
    type: Number,
    required: true,
  },
});

// Index for efficient queries
TestResultSchema.index({ userId: 1, completedAt: -1 });
TestResultSchema.index({ assignmentId: 1 });
TestResultSchema.index({ testType: 1 });

export default mongoose.models.TestResult || mongoose.model<ITestResult>('TestResult', TestResultSchema);
