'use client';

import { useAuthGuard } from '@/hooks/useAuthGuard';

import { useState, useEffect } from 'react';
import { Loader2, Save, Search, Filter, Calendar } from 'lucide-react';
import PageHeader from '@/components/PageHeader';

interface SOP {
  _id: string;
  name: string;
  identifier: string;
  department: string;
  reviewDate?: string;
  expiryDate?: string;
  effectiveDate?: string;
  version?: string;
  owner?: string;
}

export default function BulkEditSOPsPage() {
  useAuthGuard({ allowedRoles: ['admin', 'qa-head'] });
  const [sops, setSOPs] = useState<SOP[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [departmentFilter, setDepartmentFilter] = useState('all');
  const [editedSOPs, setEditedSOPs] = useState<Set<string>>(new Set());
  const [departments, setDepartments] = useState<string[]>([]);

  useEffect(() => {
    fetchSOPs();
  }, []);

  const fetchSOPs = async () => {
    try {
      const response = await fetch('/api/sop-monitoring');
      const data = await response.json();
      
      if (data.success) {
        setSOPs(data.data.allSOPs || []);
        
        // Extract unique departments
        const depts = [...new Set(data.data.allSOPs.map((s: SOP) => s.department))];
        setDepartments(depts as string[]);
      }
    } catch (error) {
      console.error('Error fetching SOPs:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleFieldChange = (sopId: string, field: keyof SOP, value: string) => {
    setSOPs(prevSOPs =>
      prevSOPs.map(sop =>
        sop._id === sopId ? { ...sop, [field]: value } : sop
      )
    );
    setEditedSOPs(prev => new Set(prev).add(sopId));
  };

  const saveChanges = async () => {
    setSaving(true);
    try {
      const sopsToUpdate = sops.filter(sop => editedSOPs.has(sop._id));
      
      const response = await fetch('/api/sop-monitoring/bulk-update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sops: sopsToUpdate }),
      });

      const data = await response.json();
      
      if (data.success) {
        alert(`Successfully updated ${data.updatedCount} SOPs!`);
        setEditedSOPs(new Set());
        fetchSOPs();
      } else {
        alert('Failed to update SOPs: ' + data.error);
      }
    } catch (error) {
      alert('Error saving changes: ' + (error instanceof Error ? error.message : 'Unknown error'));
    } finally {
      setSaving(false);
    }
  };

  const filteredSOPs = sops.filter(sop => {
    const matchesSearch = 
      sop.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      sop.identifier.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesDepartment = 
      departmentFilter === 'all' || sop.department === departmentFilter;
    
    return matchesSearch && matchesDepartment;
  });

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex items-center justify-center">
        <Loader2 className="h-12 w-12 text-purple-400 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 p-8">
      <div className="max-w-[1800px] mx-auto">
        <PageHeader />

        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-white mb-2">
            Bulk Edit SOP Dates
          </h1>
          <p className="text-gray-300">
            Quickly add or update dates for multiple SOPs at once
          </p>
        </div>

        {/* Filters */}
        <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-6 shadow-2xl border border-white/20 mb-6">
          <div className="flex flex-col md:flex-row gap-4">
            {/* Search */}
            <div className="flex-1 relative">
              <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
              <input
                type="text"
                placeholder="Search by SOP name or identifier..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-12 pr-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500"
              />
            </div>

            {/* Department Filter */}
            <div className="relative">
              <Filter className="absolute left-4 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
              <select
                value={departmentFilter}
                onChange={(e) => setDepartmentFilter(e.target.value)}
                className="pl-12 pr-8 py-3 bg-white/10 border border-white/20 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-purple-500 min-w-[200px]"
              >
                <option value="all" className="bg-slate-800">All Departments</option>
                {departments.map(dept => (
                  <option key={dept} value={dept} className="bg-slate-800">{dept}</option>
                ))}
              </select>
            </div>

            {/* Save Button */}
            <button
              onClick={saveChanges}
              disabled={saving || editedSOPs.size === 0}
              className="px-6 py-3 bg-gradient-to-r from-green-600 to-emerald-600 text-white font-semibold rounded-xl hover:from-green-700 hover:to-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center gap-2"
            >
              {saving ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="h-5 w-5" />
                  Save {editedSOPs.size > 0 ? `(${editedSOPs.size})` : ''}
                </>
              )}
            </button>
          </div>
        </div>

        {/* Table */}
        <div className="bg-white/10 backdrop-blur-lg rounded-2xl shadow-2xl border border-white/20 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-white/5">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-300 uppercase tracking-wider">
                    SOP Identifier
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-300 uppercase tracking-wider">
                    Department
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-300 uppercase tracking-wider">
                    Effective Date
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-300 uppercase tracking-wider">
                    Review Date
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-300 uppercase tracking-wider">
                    Expiry Date
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-300 uppercase tracking-wider">
                    Version
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-300 uppercase tracking-wider">
                    Owner
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10">
                {filteredSOPs.map((sop) => (
                  <tr
                    key={sop._id}
                    className={`hover:bg-white/5 transition-colors ${
                      editedSOPs.has(sop._id) ? 'bg-green-500/10' : ''
                    }`}
                  >
                    <td className="px-4 py-3">
                      <div className="text-white font-semibold">{sop.identifier}</div>
                      <div className="text-gray-400 text-xs truncate max-w-xs">{sop.name}</div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-gray-300 text-sm">{sop.department}</span>
                    </td>
                    <td className="px-4 py-3">
                      <input
                        type="date"
                        value={sop.effectiveDate || ''}
                        onChange={(e) => handleFieldChange(sop._id, 'effectiveDate', e.target.value)}
                        className="px-3 py-2 bg-white/10 border border-white/20 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                      />
                    </td>
                    <td className="px-4 py-3">
                      <input
                        type="date"
                        value={sop.reviewDate || ''}
                        onChange={(e) => handleFieldChange(sop._id, 'reviewDate', e.target.value)}
                        className="px-3 py-2 bg-white/10 border border-white/20 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                      />
                    </td>
                    <td className="px-4 py-3">
                      <input
                        type="date"
                        value={sop.expiryDate || ''}
                        onChange={(e) => handleFieldChange(sop._id, 'expiryDate', e.target.value)}
                        className="px-3 py-2 bg-white/10 border border-white/20 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                      />
                    </td>
                    <td className="px-4 py-3">
                      <input
                        type="text"
                        value={sop.version || ''}
                        onChange={(e) => handleFieldChange(sop._id, 'version', e.target.value)}
                        placeholder="e.g., 1.0"
                        className="px-3 py-2 bg-white/10 border border-white/20 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 w-24"
                      />
                    </td>
                    <td className="px-4 py-3">
                      <input
                        type="text"
                        value={sop.owner || ''}
                        onChange={(e) => handleFieldChange(sop._id, 'owner', e.target.value)}
                        placeholder="Owner name"
                        className="px-3 py-2 bg-white/10 border border-white/20 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 w-40"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {filteredSOPs.length === 0 && (
            <div className="text-center py-12">
              <Calendar className="h-16 w-16 text-gray-500 mx-auto mb-4" />
              <p className="text-gray-400 text-lg">No SOPs found</p>
            </div>
          )}
        </div>

        {/* Summary */}
        <div className="mt-6 bg-white/10 backdrop-blur-lg rounded-xl p-4 border border-white/20">
          <div className="flex items-center justify-between text-sm">
            <span className="text-gray-300">
              Showing {filteredSOPs.length} of {sops.length} SOPs
            </span>
            {editedSOPs.size > 0 && (
              <span className="text-green-300 font-semibold">
                {editedSOPs.size} SOP(s) modified - Click Save to update
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
