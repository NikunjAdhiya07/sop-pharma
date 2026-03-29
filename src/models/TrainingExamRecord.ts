import mongoose, { Document, Schema } from 'mongoose';

export interface ITrainingExamRecord extends Document {
  employeeName: string;
  department: string;
  designation?: string;
  sopCode: string;
  sopName?: string;
  examDate: Date;
  score?: number;
  maxScore?: number;
  passFail: 'pass' | 'fail' | 'pending';
  retrainingRequired: boolean;
  remarks?: string;
  uploadId?: mongoose.Types.ObjectId;
  month: number;
  year: number;
  createdAt: Date;
  updatedAt: Date;
}

const TrainingExamRecordSchema = new Schema<ITrainingExamRecord>({
  employeeName:       { type: String, required: true, index: true },
  department:         { type: String, required: true, index: true },
  designation:        { type: String },
  sopCode:            { type: String, required: true },
  sopName:            { type: String },
  examDate:           { type: Date, required: true },
  score:              { type: Number },
  maxScore:           { type: Number },
  passFail:           { type: String, enum: ['pass','fail','pending'], default: 'pending' },
  retrainingRequired: { type: Boolean, default: false },
  remarks:            { type: String },
  uploadId:           { type: Schema.Types.ObjectId, ref: 'TrainingMatrixUpload' },
  month:              { type: Number, required: true },
  year:               { type: Number, required: true },
}, { timestamps: true });

TrainingExamRecordSchema.index({ department: 1, year: 1, month: 1 });
TrainingExamRecordSchema.index({ employeeName: 1, sopCode: 1 });

export default mongoose.models.TrainingExamRecord ||
  mongoose.model<ITrainingExamRecord>('TrainingExamRecord', TrainingExamRecordSchema);
