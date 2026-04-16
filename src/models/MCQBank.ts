import mongoose, { Schema, Document, Model } from 'mongoose';

export type DifficultyLevel = 'Easy' | 'Medium' | 'Hard';

export interface IOptionVariant {
  text: string;
  isCorrect: boolean;
}

export interface IMCQ {
  aiIcon: string;
  question: string;
  difficulty: DifficultyLevel;
  difficultyStars: '⭐' | '⭐⭐' | '⭐⭐⭐';
  options: string[];
  correctAnswer: string;
  explanation: string;
  sopReference: string;
  optionVariants: IOptionVariant[];
  isChecked?: boolean;
  isReviewed?: boolean;
  isSimilar?: boolean; // Flag for questions with detected similarities
}

export interface IMCQBank extends Document {
  sopId: mongoose.Types.ObjectId;
  sopName: string;
  sopIdentifier: string;
  department: string;
  folderDepartment?: string; // New: Hierarchical folder department (e.g., "QA", "PRODUCTION")
  folderSubcategory?: string; // New: Subcategory code (e.g., "QAGE", "PRMA")
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
  isObsolete?: boolean;
  obsoleteAt?: Date;
  obsoleteReason?: string;
  createdAt: Date;
  updatedAt: Date;
}

const OptionVariantSchema = new Schema<IOptionVariant>({
  text: {
    type: String,
    required: true,
  },
  isCorrect: {
    type: Boolean,
    required: true,
  },
}, { _id: false });

const MCQSchema = new Schema<IMCQ>({
  aiIcon: {
    type: String,
    required: true,
  },
  question: {
    type: String,
    required: true,
  },
  difficulty: {
    type: String,
    enum: ['Easy', 'Medium', 'Hard'],
    required: true,
  },
  difficultyStars: {
    type: String,
    enum: ['⭐', '⭐⭐', '⭐⭐⭐'],
    required: true,
  },
  options: {
    type: [String],
    required: true,
    validate: {
      validator: (v: string[]) => v.length === 4,
      message: 'Exactly 4 options are required',
    },
  },
  correctAnswer: {
    type: String,
    required: true,
  },
  explanation: {
    type: String,
    required: true,
  },
  sopReference: {
    type: String,
    required: true,
  },
  optionVariants: {
    type: [OptionVariantSchema],
    default: [],
  },
  isChecked: {
    type: Boolean,
    default: false,
  },
  isReviewed: {
    type: Boolean,
    default: false,
  },
  isSimilar: {
    type: Boolean,
    default: false,
  },
}, { _id: false });

const MCQBankSchema = new Schema<IMCQBank>({
  sopId: {
    type: Schema.Types.ObjectId,
    ref: 'SOP',
    required: true,
  },
  sopName: {
    type: String,
    required: true,
  },
  sopIdentifier: {
    type: String,
    required: true,
  },
  department: {
    type: String,
    required: true,
    default: 'General',
  },
  folderDepartment: {
    type: String,
    required: false,
  },
  folderSubcategory: {
    type: String,
    required: false,
  },
  mcqs: {
    type: [MCQSchema],
    required: true,
    validate: {
      validator: (v: IMCQ[]) => v.length >= 1 && v.length <= 500,
      message: 'MCQs must be between 1 and 500 questions',
    },
  },
  generatedAt: {
    type: Date,
    default: Date.now,
  },
  totalQuestions: {
    type: Number,
    required: true,
  },
  difficultyDistribution: {
    easy: {
      type: Number,
      default: 0,
    },
    medium: {
      type: Number,
      default: 0,
    },
    hard: {
      type: Number,
      default: 0,
    },
  },
  aiModel: {
    type: String,
    default: 'gemini-3-pro-preview',
  },
  language: {
    type: String,
    enum: ['English', 'Gujarati'],
    default: 'English',
  },
  isObsolete: { type: Boolean, default: false },
  obsoleteAt: { type: Date },
  obsoleteReason: { type: String },
}, {
  timestamps: true,
});

// Keep totalQuestions in sync with actual mcqs array length
MCQBankSchema.pre('save', function(next) {
  if (this.mcqs) {
    this.totalQuestions = this.mcqs.length;
  }
  next();
});

// Indexes for efficient querying
MCQBankSchema.index({ sopId: 1 });
MCQBankSchema.index({ sopId: 1, language: 1 }); // English + Gujarati banks per SOP
MCQBankSchema.index({ sopIdentifier: 1 });
MCQBankSchema.index({ department: 1 });
MCQBankSchema.index({ folderDepartment: 1 });
MCQBankSchema.index({ folderSubcategory: 1 });
MCQBankSchema.index({ folderDepartment: 1, folderSubcategory: 1 });
MCQBankSchema.index({ 'mcqs.difficulty': 1 });

// Delete cached model to ensure schema changes are picked up (e.g. isChecked, isReviewed)
if (mongoose.models.MCQBank) {
  delete mongoose.models.MCQBank;
}
const MCQBank: Model<IMCQBank> = mongoose.model<IMCQBank>('MCQBank', MCQBankSchema);

export default MCQBank;
