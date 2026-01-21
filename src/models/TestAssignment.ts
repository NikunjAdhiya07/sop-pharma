import mongoose from 'mongoose';

export interface ITestAssignment extends mongoose.Document {
  userId: mongoose.Types.ObjectId;
  testType: 'induction' | 'regular' | 'kapa' | 'interview' | 'change-control';
  testName: string;
  sopIds: mongoose.Types.ObjectId[];
  departments: string[];
  difficulty?: string;
  questionCount: number;
  assignedBy: mongoose.Types.ObjectId;
  assignedAt: Date;
  deadline?: Date;
  status: 'pending' | 'in-progress' | 'completed' | 'overdue';
  completedAt?: Date;
  score?: number;
  isPassed?: boolean;
  attempts: number;
  maxAttempts: number;
}

const TestAssignmentSchema = new mongoose.Schema<ITestAssignment>({
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
  testName: {
    type: String,
    required: true,
    trim: true,
  },
  sopIds: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'SOP',
  }],
  departments: [{
    type: String,
    trim: true,
  }],
  difficulty: {
    type: String,
    enum: ['Easy', 'Medium', 'Hard', 'Any'],
  },
  questionCount: {
    type: Number,
    default: 20,
  },
  assignedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  assignedAt: {
    type: Date,
    default: Date.now,
  },
  deadline: {
    type: Date,
  },
  status: {
    type: String,
    enum: ['pending', 'in-progress', 'completed', 'overdue'],
    default: 'pending',
  },
  completedAt: {
    type: Date,
  },
  score: {
    type: Number,
    min: 0,
    max: 100,
  },
  isPassed: {
    type: Boolean,
  },
  attempts: {
    type: Number,
    default: 0,
  },
  maxAttempts: {
    type: Number,
    default: 3,
  },
});

// Index for efficient queries
TestAssignmentSchema.index({ userId: 1, status: 1 });
TestAssignmentSchema.index({ assignedBy: 1 });
TestAssignmentSchema.index({ testType: 1 });

export default mongoose.models.TestAssignment || mongoose.model<ITestAssignment>('TestAssignment', TestAssignmentSchema);
