'use client';

import { useState } from 'react';
import { Loader2, CheckCircle, AlertCircle } from 'lucide-react';

export default function MigrateDepartmentsPage() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState('');

  const runMigration = async () => {
    setLoading(true);
    setError('');
    setResult(null);

    try {
      const response = await fetch('/api/admin/migrate-departments', {
        method: 'POST',
      });

      const data = await response.json();

      if (data.success) {
        setResult(data);
      } else {
        setError(`${data.error}: ${data.details || 'No details available'}`);
      }
    } catch (err) {
      setError(`Request failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 p-8">
      <div className="max-w-4xl mx-auto">
        <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-8 shadow-2xl border border-white/20">
          <h1 className="text-4xl font-bold text-white mb-4">
            Department Migration Tool
          </h1>
          <p className="text-gray-300 mb-8">
            This will update all SOPs and MCQ Banks to use the new 7-department structure:
          </p>

          <div className="bg-white/5 rounded-xl p-6 mb-8">
            <h2 className="text-xl font-bold text-white mb-4">New Departments:</h2>
            <ul className="text-gray-300 space-y-2">
              <li>✅ QA</li>
              <li>✅ QC</li>
              <li>✅ Microbiology</li>
              <li>✅ Production</li>
              <li>✅ Store</li>
              <li>✅ Engineering and Maintenance</li>
              <li>✅ Personnel</li>
            </ul>
          </div>

          <button
            onClick={runMigration}
            disabled={loading}
            className="w-full py-4 px-6 bg-gradient-to-r from-purple-600 to-pink-600 text-white font-bold rounded-xl hover:from-purple-700 hover:to-pink-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-300 transform hover:scale-[1.02] active:scale-[0.98] shadow-lg flex items-center justify-center"
          >
            {loading ? (
              <>
                <Loader2 className="animate-spin mr-2 h-5 w-5" />
                Migrating...
              </>
            ) : (
              'Run Migration'
            )}
          </button>

          {error && (
            <div className="mt-6 bg-red-500/20 border border-red-500 rounded-xl p-4 flex items-start">
              <AlertCircle className="h-5 w-5 text-red-400 mr-3 mt-0.5 flex-shrink-0" />
              <p className="text-red-200">{error}</p>
            </div>
          )}

          {result && (
            <div className="mt-6 bg-green-500/20 border border-green-500 rounded-xl p-6">
              <div className="flex items-center mb-4">
                <CheckCircle className="h-6 w-6 text-green-400 mr-3" />
                <h3 className="text-xl font-bold text-white">Migration Successful!</h3>
              </div>

              <div className="space-y-4">
                <div className="bg-white/5 rounded-lg p-4">
                  <h4 className="text-white font-semibold mb-2">SOPs:</h4>
                  <p className="text-gray-300">
                    Total: {result.results.sops.total} | Updated: {result.results.sops.updated}
                  </p>
                </div>

                <div className="bg-white/5 rounded-lg p-4">
                  <h4 className="text-white font-semibold mb-2">MCQ Banks:</h4>
                  <p className="text-gray-300">
                    Total: {result.results.mcqBanks.total} | Updated: {result.results.mcqBanks.updated}
                  </p>
                </div>

                {result.departmentCounts && (
                  <div className="bg-white/5 rounded-lg p-4">
                    <h4 className="text-white font-semibold mb-3">Final Department Counts:</h4>
                    <div className="grid grid-cols-2 gap-2">
                      {Object.entries(result.departmentCounts).map(([dept, count]: [string, any]) => (
                        <div key={dept} className="text-gray-300">
                          <span className="font-semibold text-purple-300">{dept}:</span> {count}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div className="mt-6 bg-blue-500/20 border border-blue-500/50 rounded-lg p-4">
                <p className="text-blue-200 text-sm">
                  ✅ Migration complete! Please refresh your SOP Monitoring page to see the updated departments.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
