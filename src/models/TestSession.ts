import mongoose, { Schema, Document, Model } from 'mongoose';

export interface ITestQuestion {
  question: string;
  options: string[];
  correctAnswer: string;
  userAnswer?: string;
  isCorrect?: boolean;
}

export interface ITestSession extends Document {
  matrixId: mongoose.Types.ObjectId; // Link back to training record
  employeeName: string;
  sopIdentifier: string;
  sopName: string;
  questions: ITestQuestion[];
  score: number;
  totalQuestions: number;
  correctCount: number;
  status: 'Started' | 'Submitted' | 'Re-test Required' | 'Completed';
  isRetest: boolean;
  parentSessionId?: mongoose.Types.ObjectId; // If this is a retest, link to original
  attemptNumber: number;
  startedAt: Date;
  completedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const TestQuestionSchema = new Schema<ITestQuestion>({
  question: { type: String, required: true },
  options: [{ type: String, required: true }],
  correctAnswer: { type: String, required: true },
  userAnswer: { type: String },
  isCorrect: { type: Boolean },
}, { _id: false });

const TestSessionSchema = new Schema<ITestSession>({
  matrixId: {
    type: Schema.Types.ObjectId,
    ref: 'TrainingMatrix',
    required: true,
    index: true,
  },
  employeeName: {
    type: String,
    required: true,
  },
  sopIdentifier: {
    type: String,
    required: true,
    index: true,
  },
  sopName: {
    type: String,
    required: true,
  },
  questions: [TestQuestionSchema],
  score: {
    type: Number,
    default: 0,
  },
  totalQuestions: {
    type: Number,
    required: true,
  },
  correctCount: {
    type: Number,
    default: 0,
  },
  status: {
    type: String,
    enum: ['Started', 'Submitted', 'Re-test Required', 'Completed'],
    default: 'Started',
  },
  isRetest: {
    type: Boolean,
    default: false,
  },
  parentSessionId: {
    type: Schema.Types.ObjectId,
    ref: 'TestSession',
  },
  attemptNumber: {
    type: Number,
    default: 1,
  },
  startedAt: {
    type: Date,
    default: Date.now,
  },
  completedAt: {
    type: Date,
  }
}, {
  timestamps: true,
});

const TestSession: Model<ITestSession> = mongoose.models.TestSession || mongoose.model<ITestSession>('TestSession', TestSessionSchema);

export default TestSession;
