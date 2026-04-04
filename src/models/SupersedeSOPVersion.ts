import mongoose, { Document, Model, Schema } from 'mongoose';

export interface ISupersedeSOPVersion extends Document {
  sopNo: string;
  language: 'English' | 'Gujarati';
  version: number;
  docxPath?: string;
  pdfPath?: string;
  createdBy?: string;
  createdAt: Date;
  updatedAt: Date;
}

const SupersedeSOPVersionSchema = new Schema<ISupersedeSOPVersion>(
  {
    sopNo: { type: String, required: true, trim: true, uppercase: true },
    language: { type: String, enum: ['English', 'Gujarati'], required: true },
    version: { type: Number, required: true, min: 0 },
    docxPath: { type: String },
    pdfPath: { type: String },
    createdBy: { type: String, trim: true },
  },
  { timestamps: true },
);

SupersedeSOPVersionSchema.index(
  { sopNo: 1, language: 1, version: 1 },
  { unique: true },
);

const SupersedeSOPVersion: Model<ISupersedeSOPVersion> =
  mongoose.models.SupersedeSOPVersion ||
  mongoose.model<ISupersedeSOPVersion>(
    'SupersedeSOPVersion',
    SupersedeSOPVersionSchema,
  );

export default SupersedeSOPVersion;
