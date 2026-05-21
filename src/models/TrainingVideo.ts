import mongoose from 'mongoose';

export interface ITrainingVideo extends mongoose.Document {
  title: string;
  department: string;
  designation?: string;
  sopNo?: string;
  sopId?: mongoose.Types.ObjectId;
  version?: string;
  description?: string;
  /** Inferred from filename: `brief` or `explainer`. Used to fill the dashboard Videos slots. */
  videoKind?: 'brief' | 'explainer';
  /** Inferred language so dual-language SOPs can credit both EN + GUJ slots. */
  language?: 'English' | 'Gujarati';

  /** Bunny CDN URL of the video file (no blob stored in DB). */
  bunnyCdnUrl: string;
  /** Bunny storage path (relative, without host) used for delete/move. */
  storagePath: string;
  /** Bunny CDN URL of the thumbnail, optional. */
  thumbnailUrl?: string;
  thumbnailStoragePath?: string;

  fileName: string;
  fileType: 'mp4' | 'mov' | 'webm';
  mimeType: string;
  sizeBytes: number;
  durationSeconds?: number;

  uploadedBy?: string;
  uploadedByName?: string;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const TrainingVideoSchema = new mongoose.Schema<ITrainingVideo>(
  {
    title: { type: String, required: true, trim: true },
    department: { type: String, required: true, trim: true, index: true },
    designation: { type: String, trim: true },
    sopNo: { type: String, trim: true, index: true },
    sopId: { type: mongoose.Schema.Types.ObjectId, ref: 'MasterSOPRepository' },
    version: { type: String, trim: true },
    description: { type: String, trim: true },
    videoKind: { type: String, enum: ['brief', 'explainer'], index: true },
    language: { type: String, enum: ['English', 'Gujarati'], index: true },

    bunnyCdnUrl: { type: String, required: true },
    storagePath: { type: String, required: true },
    thumbnailUrl: { type: String },
    thumbnailStoragePath: { type: String },

    fileName: { type: String, required: true },
    fileType: { type: String, enum: ['mp4', 'mov', 'webm'], required: true },
    mimeType: { type: String, required: true },
    sizeBytes: { type: Number, required: true },
    durationSeconds: { type: Number },

    uploadedBy: { type: String },
    uploadedByName: { type: String },
    active: { type: Boolean, default: true, index: true },
  },
  { timestamps: true },
);

TrainingVideoSchema.index({ department: 1, sopNo: 1, version: 1 });
TrainingVideoSchema.index({ createdAt: -1 });

export default (mongoose.models.TrainingVideo as mongoose.Model<ITrainingVideo>) ||
  mongoose.model<ITrainingVideo>('TrainingVideo', TrainingVideoSchema);
