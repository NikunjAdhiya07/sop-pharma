import mongoose, { Schema, Document, Model } from 'mongoose';

export type PipelineStatus =
  | 'idle'
  | 'mcq_generating'
  | 'similarity_checking'
  | 'compliance_checking'
  | 'compliance_fixing'
  | 'updating_platform'
  | 'approved'
  | 'failed';

export type StageStatus = 'pending' | 'running' | 'completed' | 'failed' | 'skipped';

export interface IStageDetail {
  status: StageStatus;
  progress: number;
  startedAt?: Date;
  completedAt?: Date;
  detail?: string;
  errorMessage?: string;
}

export interface ISOPPipeline extends Document {
  sopId: mongoose.Types.ObjectId;
  sopIdentifier: string;
  sopName: string;
  department: string;
  language?: string;

  pipelineStatus: PipelineStatus;

  stages: {
    mcqGeneration: IStageDetail;
    similarityCheck: IStageDetail;
    complianceFix: IStageDetail;
    platformUpdate: IStageDetail;
  };

  mcqBankId?: mongoose.Types.ObjectId;
  complianceReportId?: mongoose.Types.ObjectId;
  similarityIterations: number;
  complianceScore?: number;
  complianceStatus?: string;
  unresolvedFindings: number;

  errorStage?: string;
  errorMessage?: string;
  errorAt?: Date;

  startedAt: Date;
  completedAt?: Date;
  lastHeartbeat: Date;

  createdAt: Date;
  updatedAt: Date;
}

const StageDetailSchema = new Schema<IStageDetail>(
  {
    status: {
      type: String,
      enum: ['pending', 'running', 'completed', 'failed', 'skipped'],
      default: 'pending',
    },
    progress: { type: Number, default: 0, min: 0, max: 100 },
    startedAt: Date,
    completedAt: Date,
    detail: String,
    errorMessage: String,
  },
  { _id: false }
);

const defaultStage = (): IStageDetail => ({
  status: 'pending',
  progress: 0,
});

const SOPPipelineSchema = new Schema<ISOPPipeline>(
  {
    sopId: { type: Schema.Types.ObjectId, ref: 'SOP', required: true },
    sopIdentifier: { type: String, required: true },
    sopName: { type: String, required: true },
    department: { type: String, required: true },
    language: { type: String },

    pipelineStatus: {
      type: String,
      enum: [
        'idle',
        'mcq_generating',
        'similarity_checking',
        'compliance_checking',
        'compliance_fixing',
        'updating_platform',
        'approved',
        'failed',
      ],
      default: 'idle',
      index: true,
    },

    stages: {
      mcqGeneration: { type: StageDetailSchema, default: defaultStage },
      similarityCheck: { type: StageDetailSchema, default: defaultStage },
      complianceFix: { type: StageDetailSchema, default: defaultStage },
      platformUpdate: { type: StageDetailSchema, default: defaultStage },
    },

    mcqBankId: { type: Schema.Types.ObjectId, ref: 'MCQBank' },
    complianceReportId: { type: Schema.Types.ObjectId, ref: 'ComplianceReport' },
    similarityIterations: { type: Number, default: 0 },
    complianceScore: Number,
    complianceStatus: String,
    unresolvedFindings: { type: Number, default: 0 },

    errorStage: String,
    errorMessage: String,
    errorAt: Date,

    startedAt: { type: Date, default: Date.now },
    completedAt: Date,
    lastHeartbeat: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

SOPPipelineSchema.index({ sopId: 1 }, { unique: true });
SOPPipelineSchema.index({ pipelineStatus: 1 });
SOPPipelineSchema.index({ department: 1, pipelineStatus: 1 });
// Auto-delete completed pipeline docs after 90 days
SOPPipelineSchema.index(
  { completedAt: 1 },
  { expireAfterSeconds: 90 * 24 * 60 * 60, sparse: true }
);

const SOPPipeline: Model<ISOPPipeline> =
  mongoose.models.SOPPipeline ||
  mongoose.model<ISOPPipeline>('SOPPipeline', SOPPipelineSchema);

export default SOPPipeline;
