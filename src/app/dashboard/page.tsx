import { Suspense } from "react";
import DashboardPageClient from "./dashboard-page-client";

export default function DashboardPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-gray-50">
          <p className="text-sm text-gray-600">Loading dashboard…</p>
        </div>
      }>
      <DashboardPageClient />
    </Suspense>
  );
}
