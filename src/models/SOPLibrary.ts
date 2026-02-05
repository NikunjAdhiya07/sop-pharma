import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IVideoFile {
  fileName: string;
  filePath: string;
  title?: string;
  description?: string;
  duration?: number;
  uploadedAt: Date;
  fileSize: number;
}

export interface ISlideFile {
  fileName: string;
  filePath: string;
  title?: string;
  fileType: 'pdf' | 'ppt' | 'pptx';
  uploadedAt: Date;
  fileSize: number;
}

export interface ISOPDocument {
  fileName: string;
  filePath: string;
  fileType: 'pdf' | 'docx';
  uploadedAt: Date;
  fileSize: number;
}

export interface ISOPLibrary extends Document {
  sopId: mongoose.Types.ObjectId;
  sopName: string;
  sopIdentifier: string;
  department: string;
  departmentCode: string;
  mcqBankId?: mongoose.Types.ObjectId;
  videos: IVideoFile[];
  slides: ISlideFile[];
  sopDocuments: ISOPDocument[];
  completionStatus: {
    hasVideos: boolean;
    hasSlides: boolean;
    hasMCQs: boolean;
    hasSOPDoc: boolean;
    percentage: number;
  };
  metadata: {
    views: number;
    lastAccessed?: Date;
    totalMCQs?: number;
  };
  complianceStatus?: 'compliant' | 'partial' | 'non-compliant' | 'pending';
  complianceNotes?: string;
  expiryDate?: Date;
  lastReviewDate?: Date;
  
  // Folder Hierarchy Fields (mirrored from SOP)
  folderPath?: string;
  parentFolder?: string;
  subfolderLevel?: number;
  
  createdAt: Date;
  updatedAt: Date;
}

const VideoFileSchema = new Schema<IVideoFile>({
  fileName: {
    type: String,
    required: true,
  },
  filePath: {
    type: String,
    required: true,
  },
  title: {
    type: String,
  },
  description: {
    type: String,
  },
  duration: {
    type: Number,
  },
  uploadedAt: {
    type: Date,
    default: Date.now,
  },
  fileSize: {
    type: Number,
    required: true,
  },
}, { _id: false });

const SlideFileSchema = new Schema<ISlideFile>({
  fileName: {
    type: String,
    required: true,
  },
  filePath: {
    type: String,
    required: true,
  },
  title: {
    type: String,
  },
  fileType: {
    type: String,
    enum: ['pdf', 'ppt', 'pptx'],
    required: true,
  },
  uploadedAt: {
    type: Date,
    default: Date.now,
  },
  fileSize: {
    type: Number,
    required: true,
  },
}, { _id: false });

const SOPDocumentSchema = new Schema<ISOPDocument>({
  fileName: {
    type: String,
    required: true,
  },
  filePath: {
    type: String,
    required: true,
  },
  fileType: {
    type: String,
    enum: ['pdf', 'docx'],
    required: true,
  },
  uploadedAt: {
    type: Date,
    default: Date.now,
  },
  fileSize: {
    type: Number,
    required: true,
  },
}, { _id: false });

const SOPLibrarySchema = new Schema<ISOPLibrary>({
  sopId: {
    type: Schema.Types.ObjectId,
    ref: 'SOP',
    required: true,
  },
  sopName: {
    type: String,
    required: true,
    trim: true,
  },
  sopIdentifier: {
    type: String,
    required: true,
    trim: true,
    unique: true,
  },
  department: {
    type: String,
    required: true,
    trim: true,
  },
  departmentCode: {
    type: String,
    required: true,
    trim: true,
  },
  mcqBankId: {
    type: Schema.Types.ObjectId,
    ref: 'MCQBank',
  },
  videos: {
    type: [VideoFileSchema],
    default: [],
  },
  slides: {
    type: [SlideFileSchema],
    default: [],
  },
  sopDocuments: {
    type: [SOPDocumentSchema],
    default: [],
  },
  completionStatus: {
    hasVideos: {
      type: Boolean,
      default: false,
    },
    hasSlides: {
      type: Boolean,
      default: false,
    },
    hasMCQs: {
      type: Boolean,
      default: false,
    },
    hasSOPDoc: {
      type: Boolean,
      default: false,
    },
    percentage: {
      type: Number,
      default: 0,
    },
  },
  metadata: {
    views: {
      type: Number,
      default: 0,
    },
    lastAccessed: {
      type: Date,
    },
    totalMCQs: {
      type: Number,
      default: 0,
    },
  },
  complianceStatus: {
    type: String,
    enum: ['compliant', 'partial', 'non-compliant', 'pending'],
    default: 'pending',
  },
  complianceNotes: {
    type: String,
    trim: true,
  },
  expiryDate: {
    type: Date,
  },
  lastReviewDate: {
    type: Date,
    default: Date.now,
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
}, {
  timestamps: true,
});

// Indexes for efficient querying
SOPLibrarySchema.index({ sopId: 1 });
SOPLibrarySchema.index({ sopIdentifier: 1 });
SOPLibrarySchema.index({ department: 1 });
SOPLibrarySchema.index({ departmentCode: 1 });
SOPLibrarySchema.index({ mcqBankId: 1 });
SOPLibrarySchema.index({ folderPath: 1 });
SOPLibrarySchema.index({ department: 1, folderPath: 1 });

// Pre-save hook to calculate completion status
SOPLibrarySchema.pre('save', function(next) {
  const hasVideos = this.videos.length > 0;
  const hasSlides = this.slides.length > 0;
  const hasMCQs = !!this.mcqBankId;
  const hasSOPDoc = this.sopDocuments.length > 0;
  
  // Calculate percentage (SOP doc is optional, so out of 3 required items)
  let completed = 0;
  if (hasVideos) completed++;
  if (hasSlides) completed++;
  if (hasMCQs) completed++;
  
  this.completionStatus = {
    hasVideos,
    hasSlides,
    hasMCQs,
    hasSOPDoc,
    percentage: Math.round((completed / 3) * 100),
  };
  
  next();
});

const SOPLibrary: Model<ISOPLibrary> = mongoose.models.SOPLibrary || mongoose.model<ISOPLibrary>('SOPLibrary', SOPLibrarySchema);

export default SOPLibrary;
