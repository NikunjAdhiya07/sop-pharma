import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IAttemptQuestion {
  questionId: string; // MCQ bank question _id ref
  question: string;
  options: string[];
  correctAnswer: string;
  userAnswer?: string;
  isCorrect?: boolean;
}

export interface ITrainingSopAttempt extends Document {
  matrixId: mongoose.Types.ObjectId;         // Link to TrainingMatrix record
  employeeName: string;
  employeeCode?: string;
  department: string;
  sopIdentifier: string;
  sopName?: string;
  attemptNumber: number;                     // 1 to 5
  totalQuestions: number;
  questions: IAttemptQuestion[];
  score: number;                             // percentage
  correctCount: number;
  wrongCount: number;
  status: 'in_progress' | 'passed' | 'failed' | 'maxed_out';
  startedAt: Date;
  completedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const AttemptQuestionSchema = new Schema<IAttemptQuestion>({
  questionId: { type: String },
  question: { type: String, required: true },
  options: [{ type: String }],
  correctAnswer: { type: String, required: true },
  userAnswer: { type: String },
  isCorrect: { type: Boolean },
}, { _id: false });

const TrainingSopAttemptSchema = new Schema<ITrainingSopAttempt>({
  matrixId: { type: Schema.Types.ObjectId, ref: 'TrainingMatrix', required: true, index: true },
  employeeName: { type: String, required: true, index: true },
  employeeCode: { type: String },
  department: { type: String, required: true, index: true },
  sopIdentifier: { type: String, required: true, index: true },
  sopName: { type: String },
  attemptNumber: { type: Number, required: true, default: 1 },
  totalQuestions: { type: Number, required: true },
  questions: [AttemptQuestionSchema],
  score: { type: Number, default: 0 },
  correctCount: { type: Number, default: 0 },
  wrongCount: { type: Number, default: 0 },
  status: {
    type: String,
    enum: ['in_progress', 'passed', 'failed', 'maxed_out'],
    default: 'in_progress',
  },
  startedAt: { type: Date, default: Date.now },
  completedAt: { type: Date },
}, { timestamps: true });

TrainingSopAttemptSchema.index({ matrixId: 1, attemptNumber: 1 });
TrainingSopAttemptSchema.index({ employeeName: 1, sopIdentifier: 1 });

const TrainingSopAttempt: Model<ITrainingSopAttempt> =
  mongoose.models.TrainingSopAttempt ||
  mongoose.model<ITrainingSopAttempt>('TrainingSopAttempt', TrainingSopAttemptSchema);

export default TrainingSopAttempt;
