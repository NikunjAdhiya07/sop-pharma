import mongoose, { Schema, Document, Model } from 'mongoose';

export interface ITrainingCertificate extends Document {
  matrixId: mongoose.Types.ObjectId;
  attemptId: mongoose.Types.ObjectId;
  employeeName: string;
  employeeCode?: string;
  department: string;
  sopIdentifier: string;
  sopName?: string;
  attemptNumber: number;
  score: number;
  completedAt: Date;
  certificateNumber: string;  // auto-generated unique code
  createdAt: Date;
  updatedAt: Date;
}

const TrainingCertificateSchema = new Schema<ITrainingCertificate>({
  matrixId: { type: Schema.Types.ObjectId, ref: 'TrainingMatrix', required: true, index: true },
  attemptId: { type: Schema.Types.ObjectId, ref: 'TrainingSopAttempt', required: true },
  employeeName: { type: String, required: true, index: true },
  employeeCode: { type: String },
  department: { type: String, required: true },
  sopIdentifier: { type: String, required: true, index: true },
  sopName: { type: String },
  attemptNumber: { type: Number, required: true },
  score: { type: Number, required: true },
  completedAt: { type: Date, required: true },
  certificateNumber: { type: String, unique: true, required: true },
}, { timestamps: true });

const TrainingCertificate: Model<ITrainingCertificate> =
  mongoose.models.TrainingCertificate ||
  mongoose.model<ITrainingCertificate>('TrainingCertificate', TrainingCertificateSchema);

export default TrainingCertificate;
