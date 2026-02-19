import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IArchivedSOP extends Document {
  // Reference to the live SOP (retains same _id chain for version history)
  originalSOPId: mongoose.Types.ObjectId;

  // Core SOP fields (snapshot at time of archival)
  name: string;
  identifier: string;
  department: string;
  fileUrl: string;
  fileType: 'pdf' | 'docx';
  content: string;
  language?: 'English' | 'Gujarati';
  checksum?: string;
  version: string; // The version being archived (e.g., "1.0")
  
  uploadedAt: Date;
  processedAt?: Date;
  status: string;
  mcqCount: number;

  // Data-Driven Monitoring Fields
  processArea?: string;
  owner?: string;
  effectiveDate?: Date;
  reviewDate?: Date;
  expiryDate?: Date;
  guidelineReference?: string;
  lastReviewedBy?: string;
  remarks?: string;

  // Folder Hierarchy Fields
  folderPath?: string;
  parentFolder?: string;
  subfolderLevel?: number;
  originalFileName?: string;

  // Metadata
  metadata?: {
    fileSize: number;
    pageCount?: number;
    wordCount?: number;
  };

  // Archive-specific fields
  archivedAt: Date;
  archiveReason?: string; // e.g., "Replaced by v1.1"
  replacedByVersion?: string; // The new version that replaced this one

  createdAt: Date;
  updatedAt: Date;
}

const ArchivedSOPSchema = new Schema<IArchivedSOP>({
  originalSOPId: {
    type: Schema.Types.ObjectId,
    ref: 'SOP',
    required: true,
    index: true,
  },
  name: { type: String, required: true, trim: true },
  identifier: { type: String, required: true, trim: true },
  department: { type: String, required: true, trim: true, default: 'General' },
  fileUrl: { type: String, required: true },
  fileType: { type: String, enum: ['pdf', 'docx'], required: true },
  content: { type: String, required: true },
  language: { type: String, enum: ['English', 'Gujarati'], default: 'English' },
  checksum: { type: String, trim: true },
  version: { type: String, required: true, trim: true },

  uploadedAt: { type: Date },
  processedAt: { type: Date },
  status: { type: String, default: 'completed' },
  mcqCount: { type: Number, default: 0 },

  processArea: { type: String, trim: true },
  owner: { type: String, trim: true },
  effectiveDate: { type: Date },
  reviewDate: { type: Date },
  expiryDate: { type: Date },
  guidelineReference: { type: String, trim: true },
  lastReviewedBy: { type: String, trim: true },
  remarks: { type: String },

  folderPath: { type: String, trim: true },
  parentFolder: { type: String, trim: true },
  subfolderLevel: { type: Number, default: 0 },
  originalFileName: { type: String, trim: true },

  metadata: {
    fileSize: Number,
    pageCount: Number,
    wordCount: Number,
  },

  // Archive-specific
  archivedAt: { type: Date, default: Date.now, required: true },
  archiveReason: { type: String },
  replacedByVersion: { type: String, trim: true },
}, {
  timestamps: true,
});

ArchivedSOPSchema.index({ originalSOPId: 1, archivedAt: -1 });
ArchivedSOPSchema.index({ identifier: 1 });
ArchivedSOPSchema.index({ version: 1 });

const ArchivedSOP: Model<IArchivedSOP> =
  mongoose.models.ArchivedSOP ||
  mongoose.model<IArchivedSOP>('ArchivedSOP', ArchivedSOPSchema);

export default ArchivedSOP;
