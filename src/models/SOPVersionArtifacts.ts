import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IVersionFileEntry {
  version: number;
  docxPath?: string;
  pdfPath?: string;
}

export interface ISOPVersionArtifacts extends Document {
  identifier: string;
  department: string;
  /** Optional display title parsed from folder names (e.g. QAGE01-10 – Title) */
  sopName?: string;
  language: 'English' | 'Gujarati';
  /** Prior revision rows (below the SOP id suffix when applicable), each with optional DOCX/PDF paths; count is uncapped by schema */
  entries: IVersionFileEntry[];
  createdAt: Date;
  updatedAt: Date;
}

const VersionFileEntrySchema = new Schema<IVersionFileEntry>(
  {
    version: { type: Number, required: true },
    docxPath: { type: String },
    pdfPath: { type: String },
  },
  { _id: false },
);

const SOPVersionArtifactsSchema = new Schema<ISOPVersionArtifacts>(
  {
    identifier: { type: String, required: true, trim: true, uppercase: true },
    department: { type: String, default: 'General', trim: true },
    sopName: { type: String, trim: true },
    language: { type: String, enum: ['English', 'Gujarati'], default: 'English' },
    entries: { type: [VersionFileEntrySchema], default: [] },
  },
  { timestamps: true },
);

SOPVersionArtifactsSchema.index({ identifier: 1, language: 1 }, { unique: true });

const SOPVersionArtifacts: Model<ISOPVersionArtifacts> =
  mongoose.models.SOPVersionArtifacts ||
  mongoose.model<ISOPVersionArtifacts>('SOPVersionArtifacts', SOPVersionArtifactsSchema);

export default SOPVersionArtifacts;
