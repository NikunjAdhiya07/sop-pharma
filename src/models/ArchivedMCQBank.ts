import mongoose, { Schema, Document, Model } from 'mongoose';
import { IOptionVariant, IMCQ, DifficultyLevel } from './MCQBank';

export interface IArchivedMCQBank extends Document {
  // References
  archivedSOPId: mongoose.Types.ObjectId; // Ref to ArchivedSOP
  originalSOPId: mongoose.Types.ObjectId;  // Ref to the live SOP

  // Core MCQ Bank fields (snapshot)
  sopName: string;
  sopIdentifier: string;
  sopVersion: string; // The SOP version these MCQs belong to
  department: string;
  folderDepartment?: string;
  folderSubcategory?: string;
  mcqs: IMCQ[];
  generatedAt: Date;
  totalQuestions: number;
  difficultyDistribution: {
    easy: number;
    medium: number;
    hard: number;
  };
  aiModel?: string;
  language?: 'English' | 'Gujarati';

  // Archive-specific
  archivedAt: Date;

  createdAt: Date;
  updatedAt: Date;
}

const OptionVariantSchema = new Schema<IOptionVariant>({
  text: { type: String, required: true },
  isCorrect: { type: Boolean, required: true },
}, { _id: false });

const MCQSchema = new Schema<IMCQ>({
  aiIcon: { type: String, required: true },
  question: { type: String, required: true },
  difficulty: { type: String, enum: ['Easy', 'Medium', 'Hard'], required: true },
  difficultyStars: { type: String, enum: ['⭐', '⭐⭐', '⭐⭐⭐'], required: true },
  options: {
    type: [String],
    required: true,
    validate: {
      validator: (v: string[]) => v.length === 4,
      message: 'Exactly 4 options are required',
    },
  },
  correctAnswer: { type: String, required: true },
  explanation: { type: String, required: true },
  sopReference: { type: String, required: true },
  optionVariants: { type: [OptionVariantSchema], default: [] },
  isChecked: { type: Boolean, default: false },
  isReviewed: { type: Boolean, default: false },
  isSimilar: { type: Boolean, default: false },
}, { _id: false });

const ArchivedMCQBankSchema = new Schema<IArchivedMCQBank>({
  archivedSOPId: {
    type: Schema.Types.ObjectId,
    ref: 'ArchivedSOP',
    required: true,
    index: true,
  },
  originalSOPId: {
    type: Schema.Types.ObjectId,
    ref: 'SOP',
    required: true,
    index: true,
  },
  sopName: { type: String, required: true },
  sopIdentifier: { type: String, required: true },
  sopVersion: { type: String, required: true },
  department: { type: String, required: true, default: 'General' },
  folderDepartment: { type: String, required: false, index: true },
  folderSubcategory: { type: String, required: false, index: true },
  mcqs: { type: [MCQSchema], required: true },
  generatedAt: { type: Date, default: Date.now },
  totalQuestions: { type: Number, required: true },
  difficultyDistribution: {
    easy: { type: Number, default: 0 },
    medium: { type: Number, default: 0 },
    hard: { type: Number, default: 0 },
  },
  aiModel: { type: String },
  language: { type: String, enum: ['English', 'Gujarati'], default: 'English' },

  // Archive-specific
  archivedAt: { type: Date, default: Date.now, required: true },
}, {
  timestamps: true,
});

ArchivedMCQBankSchema.index({ originalSOPId: 1, archivedAt: -1 });
ArchivedMCQBankSchema.index({ archivedSOPId: 1 });

const ArchivedMCQBank: Model<IArchivedMCQBank> =
  mongoose.models.ArchivedMCQBank ||
  mongoose.model<IArchivedMCQBank>('ArchivedMCQBank', ArchivedMCQBankSchema);

export default ArchivedMCQBank;
