import { X, Building2, Globe2 } from 'lucide-react';
import React, { useMemo } from 'react';

interface DepartmentStatsModalProps {
  isOpen: boolean;
  onClose: () => void;
  data: any[]; // The raw SOP data
}

export default function DepartmentStatsModal({ isOpen, onClose, data }: DepartmentStatsModalProps) {
  const stats = useMemo(() => {
    const rawStats: Record<string, { total: number, englishOnly: number, gujaratiOnly: number, dual: number }> = {};
    
    // Initialize standard departments
    const standardDepts = ['Engineering', 'Microbiology', 'Personnel', 'Production', 'QA', 'QC', 'Store'];
    standardDepts.forEach(dept => {
      rawStats[dept] = { total: 0, englishOnly: 0, gujaratiOnly: 0, dual: 0 };
    });

    data.forEach(row => {
      const dept = row.department || 'Unknown';
      if (!rawStats[dept]) {
        rawStats[dept] = { total: 0, englishOnly: 0, gujaratiOnly: 0, dual: 0 };
      }
      
      rawStats[dept].total++;
      if (row.englishVersion && row.gujaratiVersion) {
        rawStats[dept].dual++;
      } else if (row.gujaratiVersion) {
        rawStats[dept].gujaratiOnly++;
      } else {
        // Default to English if neither is explicitly marked, or if it's explicitly English only
        rawStats[dept].englishOnly++;
      }
    });

    return Object.entries(rawStats)
      .map(([department, counts]) => ({ department, ...counts }))
      .sort((a, b) => a.department.localeCompare(b.department));
  }, [data]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 animate-in fade-in duration-200">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl flex flex-col overflow-hidden animate-in slide-in-from-bottom-4 duration-300">
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 bg-gray-50/80">
          <div className="flex items-center gap-3">
            <div className="bg-purple-100 p-2 rounded-lg">
              <Building2 className="h-5 w-5 text-purple-700" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-gray-900 tracking-tight">Department Statistics</h2>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">SOP Counts &amp; Language Distribution</p>
            </div>
          </div>
          <button 
            type="button"
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto max-h-[70vh]">
          <div className="border border-gray-200 rounded-xl overflow-hidden shadow-sm">
            <table className="w-full text-left border-collapse">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-4 py-3 text-xs font-bold text-gray-600 uppercase tracking-widest">Department</th>
                  <th className="px-4 py-3 text-xs font-bold text-gray-600 uppercase tracking-widest text-center">Total SOPs</th>
                  <th className="px-4 py-3 text-xs font-bold text-gray-600 uppercase tracking-widest text-center border-l border-gray-200">English Only</th>
                  <th className="px-4 py-3 text-xs font-bold text-gray-600 uppercase tracking-widest text-center">Gujarati Only</th>
                  <th className="px-4 py-3 text-xs font-bold text-purple-700 uppercase tracking-widest text-center bg-purple-50">Dual Language</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {stats.map((dept, idx) => (
                  <tr key={dept.department ?? `dept-${idx}`} className={`hover:bg-gray-50 transition-colors ${dept.total === 0 ? 'opacity-60 bg-gray-50/50' : ''}`}>
                    <td className="px-4 py-3 font-semibold text-gray-800 text-sm">
                      {dept.department}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className="font-bold text-gray-900 bg-gray-100 px-2.5 py-1 rounded-md text-sm">
                        {dept.total}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center border-l border-gray-200">
                      <span className={`font-semibold text-sm ${dept.englishOnly > 0 ? 'text-blue-700' : 'text-gray-400'}`}>
                        {dept.englishOnly}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`font-semibold text-sm ${dept.gujaratiOnly > 0 ? 'text-orange-700' : 'text-gray-400'}`}>
                        {dept.gujaratiOnly}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center bg-purple-50/30">
                      <span className={`font-bold text-sm ${dept.dual > 0 ? 'text-purple-700 bg-purple-100 px-2 py-0.5 rounded' : 'text-purple-300'}`}>
                        {dept.dual}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-gray-50/80 border-t-2 border-gray-200">
                <tr>
                  <td className="px-4 py-3 text-xs font-black text-gray-700 uppercase tracking-widest">Grand Total</td>
                  <td className="px-4 py-3 text-center font-black text-gray-900 text-base">
                    {stats.reduce((acc, curr) => acc + curr.total, 0)}
                  </td>
                  <td className="px-4 py-3 text-center font-bold text-blue-700 text-sm border-l border-gray-200">
                    {stats.reduce((acc, curr) => acc + curr.englishOnly, 0)}
                  </td>
                  <td className="px-4 py-3 text-center font-bold text-orange-700 text-sm">
                    {stats.reduce((acc, curr) => acc + curr.gujaratiOnly, 0)}
                  </td>
                  <td className="px-4 py-3 text-center font-black text-purple-700 text-base bg-purple-100/50">
                    {stats.reduce((acc, curr) => acc + curr.dual, 0)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

      </div>
    </div>
  );
}
