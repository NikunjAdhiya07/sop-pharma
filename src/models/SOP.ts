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
  
  // Data-Driven Monitoring Fields
  processArea?: string; // e.g., "Quality Control", "Manufacturing"
  owner?: string; // Person responsible for the SOP
  version?: string; // e.g., "1.0", "2.1"
  effectiveDate?: Date; // When the SOP became effective
  reviewDate?: Date; // When the SOP needs to be reviewed
  expiryDate?: Date; // When the SOP expires
  guidelineReference?: string; // Reference to regulatory guideline (e.g., "ICH Q7", "FDA 21 CFR Part 211")
  mergedSOPId?: string; // Reference to another SOP if this one was merged
  lastReviewedBy?: string; // Who last reviewed this SOP
  remarks?: string; // General notes about the SOP
  
  // Folder Hierarchy Fields (for bulk folder upload)
  folderPath?: string; // Full path from department root (e.g., "QA/Calibration/Instruments")
  parentFolder?: string; // Immediate parent folder name
  subfolderLevel?: number; // Depth in folder hierarchy (0 = department root)
  originalFileName?: string; // Original DOCX filename before processing
  
  // Legacy Compliance Tracking (keeping for backward compatibility)
  validityPeriod?: number; // in months (e.g., 12, 24, 36)
  complianceStatus?: 'compliant' | 'partial' | 'non-compliant' | 'pending';
  complianceNotes?: string;
  lastReviewedAt?: Date;
  nextReviewDate?: Date;
  
  metadata?: {
    fileSize: number;
    pageCount?: number;
    wordCount?: number;
  };
  createdAt: Date;
  updatedAt: Date;
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
  
  // Data-Driven Monitoring Fields
  processArea: {
    type: String,
    trim: true,
  },
  owner: {
    type: String,
    trim: true,
  },
  version: {
    type: String,
    trim: true,
    default: '1.0',
  },
  effectiveDate: {
    type: Date,
  },
  reviewDate: {
    type: Date,
  },
  guidelineReference: {
    type: String,
    trim: true,
  },
  mergedSOPId: {
    type: String,
  },
  lastReviewedBy: {
    type: String,
    trim: true,
  },
  remarks: {
    type: String,
  },
  
  // Folder Hierarchy Fields
  folderPath: {
    type: String,
    trim: true,
  },
  parentFolder: {
    type: String,
    trim: true,
  },
  subfolderLevel: {
    type: Number,
    default: 0,
  },
  originalFileName: {
    type: String,
    trim: true,
  },
  
  // Legacy Expiry and Compliance Tracking
  expiryDate: {
    type: Date,
  },
  validityPeriod: {
    type: Number, // in months
    default: 24, // default 2 years
  },
  complianceStatus: {
    type: String,
    enum: ['compliant', 'partial', 'non-compliant', 'pending'],
    default: 'pending',
  },
  complianceNotes: {
    type: String,
  },
  lastReviewedAt: {
    type: Date,
  },
  nextReviewDate: {
    type: Date,
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
SOPSchema.index({ folderPath: 1 });
SOPSchema.index({ parentFolder: 1 });
SOPSchema.index({ department: 1, folderPath: 1 });

const SOP: Model<ISOP> = mongoose.models.SOP || mongoose.model<ISOP>('SOP', SOPSchema);

export default SOP;
