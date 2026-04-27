import bcrypt from "bcryptjs";
import AppConfig from "@/models/AppConfig";

const CONFIG_KEY = "obsoletePasswordHash";

export async function isValidObsoletePassword(password: string): Promise<boolean> {
  const p = String(password || "");
  if (!p) return false;

  // 1) DB-configured password hash (preferred)
  try {
    const row: any = await AppConfig.findOne({ key: CONFIG_KEY }).lean();
    const hash = String(row?.value || "");
    if (hash) {
      return await bcrypt.compare(p, hash);
    }
  } catch {
    // ignore, fallback below
  }

  // 2) Environment variable fallback (legacy)
  const env = (process.env.OBSOLETE_PASSWORD || "").trim();
  if (!env) return false;
  return p === env;
}

export async function setObsoletePassword(newPassword: string): Promise<void> {
  const p = String(newPassword || "");
  if (!p) throw new Error("Password required");
  const hash = await bcrypt.hash(p, 10);
  await AppConfig.updateOne(
    { key: CONFIG_KEY },
    { $set: { key: CONFIG_KEY, value: hash, updatedAt: new Date() } },
    { upsert: true },
  );
}

export async function hasObsoletePasswordConfigured(): Promise<boolean> {
  const row: any = await AppConfig.findOne({ key: CONFIG_KEY }).lean();
  return Boolean(String(row?.value || "").trim());
}

