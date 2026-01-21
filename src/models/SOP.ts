import mongoose, { Schema, Document, Model } from 'mongoose';

export interface ISOP extends Document {
  name: string;
  identifier: string;
  department: string;
  fileUrl: string;
  fileType: 'pdf' | 'docx';
  content: string;
  uploadedAt: Date;
  processedAt?: Date;
  status: 'uploaded' | 'processing' | 'completed' | 'failed';
  mcqCount: number;
  metadata?: {
    fileSize: number;
    pageCount?: number;
    wordCount?: number;
  };
}

const SOPSchema = new Schema<ISOP>({
  name: {
    type: String,
    required: true,
    trim: true,
  },
  identifier: {
    type: String,
    required: true,
    trim: true,
  },
  department: {
    type: String,
    required: true,
    trim: true,
    default: 'General',
  },
  fileUrl: {
    type: String,
    required: true,
  },
  fileType: {
    type: String,
    enum: ['pdf', 'docx'],
    required: true,
  },
  content: {
    type: String,
    required: true,
  },
  uploadedAt: {
    type: Date,
    default: Date.now,
  },
  processedAt: {
    type: Date,
  },
  status: {
    type: String,
    enum: ['uploaded', 'processing', 'completed', 'failed'],
    default: 'uploaded',
  },
  mcqCount: {
    type: Number,
    default: 0,
  },
  metadata: {
    fileSize: Number,
    pageCount: Number,
    wordCount: Number,
  },
}, {
  timestamps: true,
});

// Index for faster queries
SOPSchema.index({ identifier: 1 });
SOPSchema.index({ status: 1 });
SOPSchema.index({ uploadedAt: -1 });

const SOP: Model<ISOP> = mongoose.models.SOP || mongoose.model<ISOP>('SOP', SOPSchema);

export default SOP;
