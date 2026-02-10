import mongoose, { Schema, Document, Model } from 'mongoose';

export interface ISOPGuideline extends Document {
  name: string;
  folderName: string; // Which of the 4 folders this guideline came from
  filePath: string;
  pdfName: string; // Original PDF filename
  
  // OCR and Processing
  isScanned: boolean; // Whether OCR was performed
  ocrStatus: 'pending' | 'processing' | 'completed' | 'failed';
  rawText: string; // Full extracted text from PDF
  
  // Structured Guideline Data
  clauses: {
    clauseNumber: string; // e.g., "5.2.1", "Section A.3"
    clauseTitle: string; // e.g., "Documentation Requirements"
    clauseText: string; // Full text of this clause
    keywords: string[]; // Key terms extracted from this clause
    embedding?: number[]; // Vector embedding for semantic search (optional)
  }[];
  
  // Metadata
  guidelineType: string; // e.g., "ICH Q7", "FDA 21 CFR Part 211", "WHO GMP"
  category: string; // e.g., "Quality Control", "Manufacturing", "Documentation"
  version?: string;
  effectiveDate?: Date;
  
  // Legacy
  checklistItems: string[];
  uploadedBy: mongoose.Types.ObjectId;
  
  // Timestamps
  createdAt: Date;
  updatedAt: Date;
}

const SOPGuidelineSchema = new Schema<ISOPGuideline>({
  name: {
    type: String,
    required: true,
    trim: true,
  },
  folderName: {
    type: String,
    required: true,
    trim: true,
  },
  filePath: {
    type: String,
    required: true,
  },
  pdfName: {
    type: String,
    required: true,
    trim: true,
  },
  
  // OCR and Processing
  isScanned: {
    type: Boolean,
    default: false,
  },
  ocrStatus: {
    type: String,
    enum: ['pending', 'processing', 'completed', 'failed'],
    default: 'pending',
  },
  rawText: {
    type: String,
    default: '',
  },
  
  // Structured Guideline Data
  clauses: [{
    clauseNumber: { type: String, required: true },
    clauseTitle: { type: String, required: true },
    clauseText: { type: String, required: true },
    keywords: [{ type: String }],
    embedding: [{ type: Number }], // Optional vector embedding
  }],
  
  // Metadata
  guidelineType: {
    type: String,
    trim: true,
  },
  category: {
    type: String,
    trim: true,
  },
  version: {
    type: String,
    trim: true,
  },
  effectiveDate: {
    type: Date,
  },
  
  // Legacy
  checklistItems: {
    type: [String],
    default: [],
  },
  uploadedBy: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
}, {
  timestamps: true,
});

// Indexes for efficient querying
SOPGuidelineSchema.index({ folderName: 1, guidelineType: 1 });
SOPGuidelineSchema.index({ category: 1 });
SOPGuidelineSchema.index({ ocrStatus: 1 });
SOPGuidelineSchema.index({ createdAt: -1 }); // For sorting by creation date

const SOPGuideline: Model<ISOPGuideline> = mongoose.models.SOPGuideline || mongoose.model<ISOPGuideline>('SOPGuideline', SOPGuidelineSchema);

export default SOPGuideline;
