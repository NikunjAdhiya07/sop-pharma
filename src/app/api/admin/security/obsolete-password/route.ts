import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import connectDB from "@/lib/mongodb";
import { hasObsoletePasswordConfigured, setObsoletePassword } from "@/lib/obsoletePasswordAuth";

function isAllowed(session: any) {
  return session?.user && (session.user.role === "admin" || session.user.role === "qa-head");
}

export async function GET() {
  try {
    const session: any = await getServerSession();
    if (!isAllowed(session)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    await connectDB();
    const configured = await hasObsoletePasswordConfigured();
    return NextResponse.json({ success: true, configured });
  } catch (e) {
    return NextResponse.json({ success: false, error: "Failed" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session: any = await getServerSession();
    if (!isAllowed(session)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const body = await request.json().catch(() => ({}));
    const { newPassword, settingsPassword } = body || {};

    // Optional extra protection: if ADMIN_SETTINGS_PASSWORD is set, require it.
    const gate = (process.env.ADMIN_SETTINGS_PASSWORD || "").trim();
    if (gate) {
      if (String(settingsPassword || "") !== gate) {
        return NextResponse.json({ error: "Incorrect settings password" }, { status: 403 });
      }
    }

    const p = String(newPassword || "").trim();
    if (p.length < 6) {
      return NextResponse.json({ error: "New password must be at least 6 characters" }, { status: 400 });
    }

    await connectDB();
    await setObsoletePassword(p);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[admin/security/obsolete-password]", error);
    return NextResponse.json({ error: "Failed to update password" }, { status: 500 });
  }
}

