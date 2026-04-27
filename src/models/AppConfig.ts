import mongoose, { Schema, type Model } from "mongoose";

export interface IAppConfig {
  key: string;
  value: string;
  updatedAt: Date;
}

const AppConfigSchema = new Schema<IAppConfig>(
  {
    key: { type: String, required: true, unique: true, index: true },
    value: { type: String, required: true },
    updatedAt: { type: Date, default: Date.now },
  },
  { timestamps: false },
);

const AppConfig: Model<IAppConfig> =
  mongoose.models.AppConfig || mongoose.model<IAppConfig>("AppConfig", AppConfigSchema);

export default AppConfig;

