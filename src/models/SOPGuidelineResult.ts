import mongoose, { Schema, Document, Model } from 'mongoose';

/**
 * Persisted shuttle for SOP guideline compliance results.
 * Saved whenever a user runs a guideline check from the SOP registry wizard.
 * Allows pre-loading cached results on dashboard init (orange button shows history).
 */
export interface ISOPGuidelineResult extends Document {
  sopId?: mongoose.Types.ObjectId;
  sopNo: string;
  sopName: string;
  overallScore: number;
  clausesAnalyzed: number;
  guidelineDocumentsUsed: number;
  guidelineIds: string[];
  findings?: any[]; // Not persisted; exceeds BSON limit with large result sets
  runAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const SOPGuidelineResultSchema = new Schema<ISOPGuidelineResult>(
  {
    sopId: { type: Schema.Types.ObjectId, ref: 'SOP', index: true },
    sopNo: { type: String, required: true, trim: true, index: true },
    sopName: { type: String, default: '' },
    overallScore: { type: Number, default: 0 },
    clausesAnalyzed: { type: Number, default: 0 },
    guidelineDocumentsUsed: { type: Number, default: 0 },
    guidelineIds: [{ type: String }],
    // findings intentionally omitted — storing detailed array exceeds BSON 16MB limit
    // Results are returned to client; persist summary stats for caching and history
    runAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

// One result per SOP — upsert replaces old result
SOPGuidelineResultSchema.index({ sopNo: 1 }, { unique: true });

const SOPGuidelineResult: Model<ISOPGuidelineResult> =
  mongoose.models.SOPGuidelineResult ||
  mongoose.model<ISOPGuidelineResult>('SOPGuidelineResult', SOPGuidelineResultSchema);

export default SOPGuidelineResult;
