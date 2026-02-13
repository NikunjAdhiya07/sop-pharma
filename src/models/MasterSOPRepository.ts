import mongoose, { Schema, Document, Model } from 'mongoose';

// Interface for Master SOP Repository document
export interface IMasterSOPRepository extends Document {
  sopIdentifier: string;
  sopName: string;
  department: string;
  departmentCode: string;
  folderPath: string;
  parentFolder?: string;
  subfolderLevel: number;
  language?: 'English' | 'Gujarati';
  
  // SOP Document info
  sopDocument: {
    fileName: string;
    filePath: string;
    fileSize: number;
    uploadedAt: Date;
  };
  
  // Extracted metadata from DOCX
  metadata: {
    effectiveDate?: Date;
    reviewDate?: Date;
    expiryDate?: Date;
    version?: string;
    wordCount: number;
  };
  
  // Resource tracking
  resources: {
    hasVideos: boolean;
    videoCount: number;
    hasSlides: boolean;
    slideCount: number;
    hasMCQs: boolean;
    mcqCount: number;
  };
  
  // Timestamps
  createdAt: Date;
  updatedAt: Date;
}

const MasterSOPRepositorySchema = new Schema<IMasterSOPRepository>(
  {
    sopIdentifier: {
      type: String,
      required: true,
      uppercase: true,
      trim: true,
      index: true,
    },
    sopName: {
      type: String,
      required: true,
      uppercase: true,
      trim: true,
    },
    department: {
      type: String,
      required: true,
      uppercase: true,
      enum: [
        'QA',
        'QC',
        'MICROBIOLOGY',
        'PRODUCTION',
        'STORE',
        'ENGINEERING AND MAINTENANCE',
        'PERSONNEL',
      ],
      index: true,
    },
    departmentCode: {
      type: String,
      required: true,
      uppercase: true,
    },
    folderPath: {
      type: String,
      required: true,
      index: true,
    },
    parentFolder: {
      type: String,
      default: null,
    },
    subfolderLevel: {
      type: Number,
      default: 0,
    },
    language: {
      type: String,
      enum: ['English', 'Gujarati'],
      default: 'English',
    },
    sopDocument: {
      fileName: {
        type: String,
        required: true,
      },
      filePath: {
        type: String,
        required: true,
      },
      fileSize: {
        type: Number,
        required: true,
      },
      uploadedAt: {
        type: Date,
        default: Date.now,
      },
    },
    metadata: {
      effectiveDate: {
        type: Date,
        default: null,
      },
      reviewDate: {
        type: Date,
        default: null,
      },
      expiryDate: {
        type: Date,
        default: null,
      },
      version: {
        type: String,
        default: '1.0',
      },
      wordCount: {
        type: Number,
        default: 0,
      },
    },
    resources: {
      hasVideos: {
        type: Boolean,
        default: false,
      },
      videoCount: {
        type: Number,
        default: 0,
      },
      hasSlides: {
        type: Boolean,
        default: false,
      },
      slideCount: {
        type: Number,
        default: 0,
      },
      hasMCQs: {
        type: Boolean,
        default: false,
      },
      mcqCount: {
        type: Number,
        default: 0,
      },
    },
  },
  {
    timestamps: true,
  }
);

// Indexes for efficient querying
MasterSOPRepositorySchema.index({ department: 1, folderPath: 1 });
MasterSOPRepositorySchema.index({ sopIdentifier: 1, language: 1 }, { unique: true });
MasterSOPRepositorySchema.index({ folderPath: 1 });

// Prevent model recompilation in development
const MasterSOPRepository: Model<IMasterSOPRepository> =
  mongoose.models.MasterSOPRepository ||
  mongoose.model<IMasterSOPRepository>('MasterSOPRepository', MasterSOPRepositorySchema);

export default MasterSOPRepository;
