'use client';

import { useEffect, useState } from 'react';

interface DepartmentStat {
  department: string;
  totalSOPs: number;
  totalQuestions: number;
  reviewedQuestions: number;
  notReviewedQuestions: number;
  totalReviewsInQueue: number;
  reviewPercentage: number;
}

interface OverallStats {
  totalDepartments: number;
  totalSOPs: number;
  totalQuestions: number;
  totalReviewed: number;
  totalNotReviewed: number;
  totalInReviewQueue: number;
  reviewPercentage: number;
}

interface MCQReviewData {
  success: boolean;
  overall: OverallStats;
  byDepartment: DepartmentStat[];
  reviewStatusBreakdown: Record<string, number>;
}

// Circular stat badge component
function StatBadge({ label, value, color }: { label: string; value: number | string; color: 'purple' | 'blue' | 'green' | 'orange' | 'red' | 'cyan' }) {
  const colorClasses = {
    purple: 'bg-purple-100 text-purple-700',
    blue: 'bg-blue-100 text-blue-700',
    green: 'bg-green-100 text-green-700',
    orange: 'bg-orange-100 text-orange-700',
    red: 'bg-red-100 text-red-700',
    cyan: 'bg-cyan-100 text-cyan-700',
  };

  return (
    <div className="flex flex-col items-center gap-2">
      <div className={`w-24 h-24 ${colorClasses[color]} rounded-full flex items-center justify-center shadow-md border-2 border-opacity-20`}>
        <span className="text-3xl font-bold">{value}</span>
      </div>
      <p className="text-xs text-gray-600 text-center font-medium max-w-20">{label}</p>
    </div>
  );
}

export function MCQReviewStats() {
  const [data, setData] = useState<MCQReviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const response = await fetch('/api/dashboard/mcq-review-stats');
        if (!response.ok) throw new Error('Failed to fetch MCQ review stats');
        const result = await response.json();
        console.log('MCQ Stats Data:', result);
        setData(result);
      } catch (err) {
        console.error('Error fetching data:', err);
        setError(err instanceof Error ? err.message : 'An error occurred');
      } finally {
        setLoading(false);
      }
    };

    fetchStats();
  }, []);

  if (loading) {
    return (
      <div className="w-full bg-white rounded-lg p-8">
        <div className="text-center text-gray-500 py-12">Loading MCQ review statistics...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="w-full bg-white rounded-lg p-8">
        <div className="text-center text-red-500 py-12">Error: {error}</div>
      </div>
    );
  }

  if (!data || !data.success) {
    return (
      <div className="w-full bg-white rounded-lg p-8">
        <div className="text-center text-gray-500 py-12">No data available</div>
      </div>
    );
  }

  const { overall, byDepartment } = data;

  return (
    <div className="w-full space-y-8">
      {/* Header */}
      <div className="bg-gradient-to-r from-purple-600 to-pink-600 text-white p-6 rounded-lg">
        <h2 className="text-2xl font-bold mb-2">MCQ Question Bank</h2>
        <p className="text-sm opacity-90">Create and manage your generated MCQ questions and track SOP reviews</p>
      </div>

      {/* Overall Stats */}
      <div className="bg-white rounded-lg p-8 border border-gray-200">
        <h3 className="text-lg font-bold text-gray-800 mb-8">Overall Statistics</h3>
        <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-4 gap-6">
          <StatBadge label="Total Questions" value={overall.totalQuestions} color="purple" />
          <StatBadge label="Reviewed" value={overall.totalReviewed} color="green" />
          <StatBadge label="Not Reviewed" value={overall.totalNotReviewed} color="red" />
          <StatBadge label="Progress %" value={`${overall.reviewPercentage}%`} color="blue" />
        </div>
      </div>

      {/* Department Breakdown */}
      <div className="bg-white rounded-lg p-8 border border-gray-200">
        <h3 className="text-lg font-bold text-gray-800 mb-8">Department Wise Statistics</h3>
        <div className="space-y-8">
          {byDepartment.map((dept) => (
            <div key={dept.department} className="border-b pb-8 last:border-b-0">
              <div className="mb-6">
                <h4 className="text-base font-bold text-gray-800">{dept.department}</h4>
                <p className="text-sm text-gray-500">{dept.totalSOPs} SOPs</p>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-4 gap-6">
                <StatBadge label="Total Q's" value={dept.totalQuestions} color="purple" />
                <StatBadge label="Reviewed" value={dept.reviewedQuestions} color="green" />
                <StatBadge label="Pending" value={dept.notReviewedQuestions} color="orange" />
                <StatBadge label="Progress %" value={`${dept.reviewPercentage}%`} color="cyan" />
              </div>

              {/* Progress bar */}
              {dept.totalReviewsInQueue > 0 && (
                <div className="mt-4">
                  <div className="flex justify-between text-xs text-gray-600 mb-2">
                    <span>Review Progress</span>
                    <span>{dept.reviewedQuestions} / {dept.totalReviewsInQueue}</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div
                      className="bg-green-500 h-2 rounded-full transition-all"
                      style={{ width: `${dept.reviewPercentage}%` }}
                    />
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Summary */}
      <div className="bg-gradient-to-r from-purple-50 to-pink-50 border border-purple-200 rounded-lg p-8">
        <h3 className="text-lg font-bold text-gray-800 mb-6">Summary</h3>
        <div className="grid grid-cols-3 gap-6 text-center">
          <div>
            <p className="text-gray-600 text-sm mb-2">Total Departments</p>
            <p className="text-3xl font-bold text-purple-700">{overall.totalDepartments}</p>
          </div>
          <div>
            <p className="text-gray-600 text-sm mb-2">Total SOPs</p>
            <p className="text-3xl font-bold text-purple-700">{overall.totalSOPs}</p>
          </div>
          <div>
            <p className="text-gray-600 text-sm mb-2">Overall Progress</p>
            <p className="text-3xl font-bold text-purple-700">{overall.reviewPercentage}%</p>
          </div>
        </div>
      </div>
    </div>
  );
}
