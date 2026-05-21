import mongoose from 'mongoose';

export interface ITrainingSlide extends mongoose.Document {
  title: string;
  department: string;
  sopNo?: string;
  version?: string;
  description?: string;
  /** Inferred language so dual-language SOPs can credit both EN + GUJ slots. */
  language?: 'English' | 'Gujarati';

  /** Bunny CDN URL of the slide PDF. */
  bunnyCdnUrl: string;
  /** Bunny storage path (relative, without host). */
  storagePath: string;

  fileName: string;
  /** Currently only PDF slides are supported. */
  fileType: 'pdf';
  mimeType: string;
  sizeBytes: number;

  uploadedByName?: string;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const TrainingSlideSchema = new mongoose.Schema<ITrainingSlide>(
  {
    title: { type: String, required: true, trim: true },
    department: { type: String, required: true, trim: true, index: true },
    sopNo: { type: String, trim: true, index: true },
    version: { type: String, trim: true },
    description: { type: String, trim: true },
    language: { type: String, enum: ['English', 'Gujarati'], index: true },

    bunnyCdnUrl: { type: String, required: true },
    storagePath: { type: String, required: true },

    fileName: { type: String, required: true },
    fileType: { type: String, enum: ['pdf'], required: true, default: 'pdf' },
    mimeType: { type: String, required: true },
    sizeBytes: { type: Number, required: true },

    uploadedByName: { type: String },
    active: { type: Boolean, default: true, index: true },
  },
  { timestamps: true },
);

TrainingSlideSchema.index({ department: 1, sopNo: 1, version: 1 });
TrainingSlideSchema.index({ createdAt: -1 });

export default (mongoose.models.TrainingSlide as mongoose.Model<ITrainingSlide>) ||
  mongoose.model<ITrainingSlide>('TrainingSlide', TrainingSlideSchema);
