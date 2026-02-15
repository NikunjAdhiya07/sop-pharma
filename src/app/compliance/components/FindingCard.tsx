'use client';

import React from 'react';

export interface FindingCardProps {
  id: string;
  requirement: string;
  gap: string;
  impact: string;
  suggestion: string;
  reference: string;
  severity: 'critical' | 'major' | 'minor' | 'informational';
  status: 'compliant' | 'partial' | 'non-compliant' | 'not-applicable';
  confidence: number;
  sopSection?: string;
  sopTextSnippet?: string;
  suggestedText?: string;
}

const severityConfig = {
  critical: {
    bg: 'bg-red-600/20',
    border: 'border-red-500/30',
    text: 'text-red-300',
    badge: 'bg-red-600',
    icon: '🔴',
  },
  major: {
    bg: 'bg-orange-600/20',
    border: 'border-orange-500/30',
    text: 'text-orange-300',
    badge: 'bg-orange-600',
    icon: '🟠',
  },
  minor: {
    bg: 'bg-amber-600/20',
    border: 'border-amber-500/30',
    text: 'text-amber-300',
    badge: 'bg-amber-600',
    icon: '🟡',
  },
  informational: {
    bg: 'bg-blue-600/20',
    border: 'border-blue-500/30',
    text: 'text-blue-300',
    badge: 'bg-blue-600',
    icon: '🔵',
  },
};

const statusConfig = {
  compliant: {
    bg: 'bg-emerald-600/20',
    text: 'text-emerald-300',
    label: 'Compliant',
  },
  partial: {
    bg: 'bg-amber-600/20',
    text: 'text-amber-300',
    label: 'Partially Compliant',
  },
  'non-compliant': {
    bg: 'bg-red-600/20',
    text: 'text-red-300',
    label: 'Non-Compliant',
  },
  'not-applicable': {
    bg: 'bg-gray-600/20',
    text: 'text-gray-400',
    label: 'Not Applicable',
  },
};

export default function FindingCard({
  id,
  requirement,
  gap,
  impact,
  suggestion,
  reference,
  severity,
  status,
  confidence,
  sopSection,
  sopTextSnippet,
  suggestedText,
}: FindingCardProps) {
  const severityStyle = severityConfig[severity];
  const statusStyle = statusConfig[status];

  return (
    <div
      className={`rounded-xl border ${severityStyle.border} ${severityStyle.bg} backdrop-blur-sm overflow-hidden transition-all hover:shadow-lg hover:shadow-${severity === 'critical' ? 'red' : severity === 'major' ? 'orange' : 'amber'}-500/10`}
    >
      {/* Header */}
      <div className="p-4 border-b border-white/10 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-2xl">{severityStyle.icon}</span>
          <div>
            <div className="flex items-center gap-2">
              <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${severityStyle.badge} text-white`}>
                {severity.toUpperCase()}
              </span>
              <span className={`px-2 py-0.5 rounded-full text-xs ${statusStyle.bg} ${statusStyle.text}`}>
                {statusStyle.label}
              </span>
            </div>
            <p className="text-xs text-gray-400 mt-1">
              📋 {reference}
            </p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-xs text-gray-500">Confidence</p>
          <p className={`text-lg font-bold ${confidence >= 80 ? 'text-emerald-400' : confidence >= 60 ? 'text-amber-400' : 'text-red-400'}`}>
            {confidence}%
          </p>
        </div>
      </div>

      {/* Content */}
      <div className="p-4 space-y-4">
        {/* Requirement */}
        <Section title="📌 Guideline Requirement" icon="📌">
          <p className="text-white text-sm leading-relaxed">{requirement}</p>
        </Section>

        {/* SOP Current State (if available) */}
        {sopTextSnippet && (
          <Section title="📄 Current SOP Text" icon="📄">
            <div className="bg-white/5 border border-white/10 rounded-lg p-3">
              <p className="text-gray-300 text-sm italic leading-relaxed">"{sopTextSnippet}"</p>
              {sopSection && (
                <p className="text-xs text-gray-500 mt-2">From: {sopSection}</p>
              )}
            </div>
          </Section>
        )}

        {/* Gap */}
        <Section title="⚠️ Gap Identified" icon="⚠️">
          <div className="space-y-2">
            {gap.split('\n\n').map((part, idx) => {
              // Check if this part has a bold header (e.g., **Guideline Requires:**)
              const match = part.match(/^\*\*(.*?):\*\*\s*([\s\S]*)$/);
              if (match) {
                return (
                  <div key={idx} className="mb-2">
                    <p className="text-purple-400 font-semibold text-xs mb-1">{match[1]}:</p>
                    <p className="text-gray-300 text-sm leading-relaxed">{match[2]}</p>
                  </div>
                );
              }
              return (
                <p key={idx} className="text-gray-300 text-sm leading-relaxed">
                  {part}
                </p>
              );
            })}
          </div>
        </Section>

        {/* Impact */}
        <Section title="💥 Impact" icon="💥">
          <p className={`text-sm leading-relaxed ${severityStyle.text}`}>{impact}</p>
        </Section>

        {/* Suggested Action */}
        <Section title="✅ Suggested Action" icon="✅">
          <div className="space-y-3">
            {suggestion.split('\n\n').map((part, idx) => {
              // Check for bold headers
              const match = part.match(/^\*\*(.*?):\*\*\s*([\s\S]*)$/);
              if (match) {
                const header = match[1];
                const content = match[2];
                
                // Special handling for code blocks
                if (content.includes('```')) {
                  const codeMatch = content.match(/```\n([\s\S]*?)\n```/);
                  if (codeMatch) {
                    return (
                      <div key={idx}>
                        <p className="text-emerald-400 font-semibold text-xs mb-2">{header}:</p>
                        <div className="bg-black/30 border border-emerald-500/30 rounded-lg p-3 font-mono text-xs text-emerald-300 overflow-x-auto">
                          <pre className="whitespace-pre-wrap">{codeMatch[1]}</pre>
                        </div>
                      </div>
                    );
                  }
                }
                
                return (
                  <div key={idx}>
                    <p className="text-emerald-400 font-semibold text-xs mb-1">{header}:</p>
                    <p className="text-gray-300 text-sm leading-relaxed">{content}</p>
                  </div>
                );
              }
              return (
                <p key={idx} className="text-gray-300 text-sm leading-relaxed">
                  {part}
                </p>
              );
            })}
          </div>
        </Section>

        {/* Suggested Text (if available and not already shown) */}
        {suggestedText && !suggestion.includes('```') && (
          <Section title="📝 Suggested Text to Add" icon="📝">
            <div className="bg-black/30 border border-emerald-500/30 rounded-lg p-3 font-mono text-xs text-emerald-300 overflow-x-auto">
              <pre className="whitespace-pre-wrap">{suggestedText}</pre>
            </div>
          </Section>
        )}
      </div>
    </div>
  );
}

// Helper component for sections
function Section({ title, icon, children }: { title: string; icon: string; children: React.ReactNode }) {
  return (
    <div>
      <h4 className="text-xs font-semibold text-gray-400 mb-2 flex items-center gap-1.5">
        <span>{icon}</span>
        <span>{title}</span>
      </h4>
      <div>{children}</div>
    </div>
  );
}
