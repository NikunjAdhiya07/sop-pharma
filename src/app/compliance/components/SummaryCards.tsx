'use client';

import React from 'react';

export interface SummaryCardsProps {
  totalChecked: number;
  compliant: number;
  partial: number;
  nonCompliant: number;
  notApplicable?: number;
  overallScore?: number;
  complianceStatus?: string;
}

export default function SummaryCards({
  totalChecked,
  compliant,
  partial,
  nonCompliant,
  notApplicable = 0,
  overallScore,
  complianceStatus,
}: SummaryCardsProps) {
  const applicableTotal = totalChecked - notApplicable;
  const compliantPercentage = applicableTotal > 0 ? Math.round((compliant / applicableTotal) * 100) : 0;
  const partialPercentage = applicableTotal > 0 ? Math.round((partial / applicableTotal) * 100) : 0;
  const nonCompliantPercentage = applicableTotal > 0 ? Math.round((nonCompliant / applicableTotal) * 100) : 0;

  return (
    <div className="space-y-4">
      {/* Overall Score Card (if provided) */}
      {overallScore !== undefined && (
        <div className="bg-gradient-to-br from-purple-600/20 to-pink-600/20 border border-purple-500/30 rounded-2xl p-6 backdrop-blur-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-gray-400 text-sm mb-1">Overall Compliance Score</p>
              <p className="text-5xl font-bold bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent">
                {overallScore.toFixed(1)}<span className="text-2xl">/10</span>
              </p>
              {complianceStatus && (
                <p className={`mt-2 text-sm font-semibold ${
                  complianceStatus === 'Fully Compliant' ? 'text-emerald-400' :
                  complianceStatus === 'Partially Compliant' ? 'text-amber-400' :
                  'text-red-400'
                }`}>
                  {complianceStatus}
                </p>
              )}
            </div>
            <div className="text-6xl">
              {overallScore >= 8.5 ? '🟢' : overallScore >= 5 ? '🟡' : '🔴'}
            </div>
          </div>
        </div>
      )}

      {/* Summary Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {/* Total Checked */}
        <SummaryCard
          title="Total Checked"
          value={totalChecked}
          icon="📋"
          color="blue"
          subtitle={notApplicable > 0 ? `${applicableTotal} applicable` : undefined}
        />

        {/* Compliant */}
        <SummaryCard
          title="Compliant"
          value={compliant}
          icon="✅"
          color="green"
          percentage={compliantPercentage}
        />

        {/* Partial */}
        <SummaryCard
          title="Partial"
          value={partial}
          icon="⚠️"
          color="yellow"
          percentage={partialPercentage}
        />

        {/* Non-Compliant */}
        <SummaryCard
          title="Non-Compliant"
          value={nonCompliant}
          icon="❌"
          color="red"
          percentage={nonCompliantPercentage}
        />
      </div>

      {/* Progress Bar */}
      {applicableTotal > 0 && (
        <div className="bg-white/5 border border-white/10 rounded-xl p-4">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm text-gray-400">Compliance Distribution</p>
            <p className="text-xs text-gray-500">{applicableTotal} applicable clauses</p>
          </div>
          <div className="h-4 bg-black/30 rounded-full overflow-hidden flex">
            {compliant > 0 && (
              <div
                className="bg-emerald-500 flex items-center justify-center text-xs font-bold text-white"
                style={{ width: `${compliantPercentage}%` }}
                title={`${compliant} compliant (${compliantPercentage}%)`}
              >
                {compliantPercentage >= 10 && `${compliantPercentage}%`}
              </div>
            )}
            {partial > 0 && (
              <div
                className="bg-amber-500 flex items-center justify-center text-xs font-bold text-white"
                style={{ width: `${partialPercentage}%` }}
                title={`${partial} partial (${partialPercentage}%)`}
              >
                {partialPercentage >= 10 && `${partialPercentage}%`}
              </div>
            )}
            {nonCompliant > 0 && (
              <div
                className="bg-red-500 flex items-center justify-center text-xs font-bold text-white"
                style={{ width: `${nonCompliantPercentage}%` }}
                title={`${nonCompliant} non-compliant (${nonCompliantPercentage}%)`}
              >
                {nonCompliantPercentage >= 10 && `${nonCompliantPercentage}%`}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// Individual Summary Card Component
interface SummaryCardProps {
  title: string;
  value: number;
  icon: string;
  color: 'blue' | 'green' | 'yellow' | 'red';
  percentage?: number;
  subtitle?: string;
}

function SummaryCard({ title, value, icon, color, percentage, subtitle }: SummaryCardProps) {
  const colorConfig = {
    blue: {
      bg: 'bg-blue-600/20',
      border: 'border-blue-500/30',
      text: 'text-blue-300',
      valueText: 'text-blue-400',
    },
    green: {
      bg: 'bg-emerald-600/20',
      border: 'border-emerald-500/30',
      text: 'text-emerald-300',
      valueText: 'text-emerald-400',
    },
    yellow: {
      bg: 'bg-amber-600/20',
      border: 'border-amber-500/30',
      text: 'text-amber-300',
      valueText: 'text-amber-400',
    },
    red: {
      bg: 'bg-red-600/20',
      border: 'border-red-500/30',
      text: 'text-red-300',
      valueText: 'text-red-400',
    },
  };

  const style = colorConfig[color];

  return (
    <div className={`${style.bg} border ${style.border} rounded-xl p-4 backdrop-blur-sm transition-all hover:scale-105`}>
      <div className="flex items-center justify-between mb-2">
        <p className={`text-xs font-semibold ${style.text}`}>{title}</p>
        <span className="text-2xl">{icon}</span>
      </div>
      <div className="flex items-baseline gap-2">
        <p className={`text-3xl font-bold ${style.valueText}`}>{value}</p>
        {percentage !== undefined && percentage > 0 && (
          <p className="text-sm text-gray-400">({percentage}%)</p>
        )}
      </div>
      {subtitle && (
        <p className="text-xs text-gray-500 mt-1">{subtitle}</p>
      )}
    </div>
  );
}
