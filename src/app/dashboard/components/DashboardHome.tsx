'use client';
import { AlertTriangle, CheckCircle2, FileText } from 'lucide-react';

interface DashboardHomeProps {
  userName?: string;
  totalSOPs: number;
  expiredCount: number;
  nearExpiryCount: number;
  onReviewExpired?: () => void;
  onReviewNear?: () => void;
}

export default function DashboardHome({
  userName,
  totalSOPs,
  expiredCount,
  nearExpiryCount,
  onReviewExpired,
  onReviewNear,
}: DashboardHomeProps) {
  const hasAlerts = expiredCount > 0 || nearExpiryCount > 0;

  return (
    <section className="bg-gray-100 border-b border-gray-200 px-6 py-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-purple-100">
              <FileText className="h-5 w-5 text-purple-600" />
            </div>
            <div>
              <h2 className="text-base font-bold text-gray-900 tracking-tight">
                {userName ? `Welcome back, ${userName}` : 'SOP Control Center'}
              </h2>
              <p className="text-xs text-gray-500 font-medium">
                {totalSOPs} SOPs in registry · Master dashboard for audit and compliance
              </p>
            </div>
          </div>
        </div>

        {hasAlerts ? (
          <div className="flex items-center gap-3">
            {expiredCount > 0 && (
              <button
                type="button"
                onClick={onReviewExpired}
                className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-left transition-colors hover:bg-red-100 hover:border-red-300"
              >
                <AlertTriangle className="h-4 w-4 text-red-600 shrink-0" />
                <div>
                  <span className="block text-xs font-bold text-red-700">
                    {expiredCount} SOP{expiredCount !== 1 ? 's' : ''} expired
                  </span>
                  <span className="text-[10px] font-medium text-red-600">Review now</span>
                </div>
              </button>
            )}
            {nearExpiryCount > 0 && (
              <button
                type="button"
                onClick={onReviewNear}
                className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-left transition-colors hover:bg-amber-100 hover:border-amber-300"
              >
                <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
                <div>
                  <span className="block text-xs font-bold text-amber-800">
                    {nearExpiryCount} near expiry
                  </span>
                  <span className="text-[10px] font-medium text-amber-700">Due soon</span>
                </div>
              </button>
            )}
          </div>
        ) : (
          <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2">
            <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
            <span className="text-xs font-bold text-emerald-800">All SOPs within review cycle</span>
          </div>
        )}
      </div>
    </section>
  );
}
