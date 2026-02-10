'use client';

import { useState } from 'react';
import { Shield, Check, X, Loader2 } from 'lucide-react';

interface User {
  _id: string;
  name: string;
  username: string;
  role: string;
  department?: string;
  allowedDepartments?: string[];
}

interface DepartmentAccessManagerProps {
  user: User;
  onClose: () => void;
  onUpdate: () => void;
}

const ALL_DEPARTMENTS = [
  'QA',
  'QC',
  'Microbiology',
  'Production',
  'Store',
  'Engineering and Maintenance',
  'Personnel'
];

export default function DepartmentAccessManager({ user, onClose, onUpdate }: DepartmentAccessManagerProps) {
  const [selectedDepartments, setSelectedDepartments] = useState<string[]>(
    user.allowedDepartments || []
  );
  const [saving, setSaving] = useState(false);

  const toggleDepartment = (dept: string) => {
    setSelectedDepartments(prev =>
      prev.includes(dept)
        ? prev.filter(d => d !== dept)
        : [...prev, dept]
    );
  };

  const selectAll = () => {
    setSelectedDepartments(ALL_DEPARTMENTS);
  };

  const clearAll = () => {
    setSelectedDepartments([]);
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      const response = await fetch(`/api/admin/users/${user._id}/departments`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ allowedDepartments: selectedDepartments })
      });

      const data = await response.json();

      if (data.success) {
        alert('Department access updated successfully!');
        onUpdate();
        onClose();
      } else {
        alert(data.error || 'Failed to update department access');
      }
    } catch (error) {
      console.error('Error updating departments:', error);
      alert('Failed to update department access');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50">
      <div className="bg-slate-900 rounded-2xl max-w-2xl w-full border border-purple-500/30 shadow-[0_0_50px_rgba(0,0,0,0.5)]">
        {/* Header */}
        <div className="bg-gradient-to-r from-purple-600 to-pink-600 p-6 rounded-t-2xl">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-white/20 rounded-lg">
                <Shield className="h-6 w-6 text-white" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-white">Department Access Control</h2>
                <p className="text-sm text-purple-100">{user.name} (@{user.username})</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 hover:bg-white/20 rounded-lg transition-colors"
            >
              <X className="h-5 w-5 text-white" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-6">
          {/* User Info */}
          <div className="bg-white/5 rounded-lg p-4 mb-6 border border-white/10">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-gray-400">Role:</span>
                <span className="ml-2 text-white font-semibold">{user.role.toUpperCase()}</span>
              </div>
              <div>
                <span className="text-gray-400">Primary Department:</span>
                <span className="ml-2 text-white font-semibold">{user.department || 'Not Set'}</span>
              </div>
            </div>
          </div>

          {/* Quick Actions */}
          <div className="flex gap-2 mb-4">
            <button
              onClick={selectAll}
              className="flex-1 py-2 px-4 bg-green-600 hover:bg-green-700 text-white rounded-lg font-medium transition-all text-sm"
            >
              Select All
            </button>
            <button
              onClick={clearAll}
              className="flex-1 py-2 px-4 bg-red-600 hover:bg-red-700 text-white rounded-lg font-medium transition-all text-sm"
            >
              Clear All
            </button>
          </div>

          {/* Department Selection */}
          <div className="mb-6">
            <label className="block text-sm font-semibold text-gray-300 mb-3">
              Allowed Departments ({selectedDepartments.length}/{ALL_DEPARTMENTS.length})
            </label>
            <div className="grid grid-cols-2 gap-3">
              {ALL_DEPARTMENTS.map(dept => (
                <button
                  key={dept}
                  onClick={() => toggleDepartment(dept)}
                  className={`p-4 rounded-lg border-2 transition-all text-left ${
                    selectedDepartments.includes(dept)
                      ? 'bg-purple-500/20 border-purple-500 text-white'
                      : 'bg-white/5 border-white/10 text-gray-400 hover:border-white/30'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-medium">{dept}</span>
                    {selectedDepartments.includes(dept) && (
                      <Check className="h-5 w-5 text-purple-400" />
                    )}
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Info Message */}
          <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-4 mb-6">
            <div className="flex gap-3">
              <Shield className="h-5 w-5 text-blue-400 flex-shrink-0 mt-0.5" />
              <div className="text-sm text-blue-200">
                <p className="font-semibold mb-1">Access Control Information</p>
                <p className="text-blue-300/80">
                  User will only see MCQ banks from selected departments in the MCQ Bank tree view.
                  Admin and QA Head roles have all departments by default.
                </p>
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="flex-1 py-3 px-6 bg-white/10 hover:bg-white/20 text-white rounded-lg font-semibold transition-all"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex-1 py-3 px-6 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white rounded-lg font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {saving ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Check className="h-5 w-5" />
                  Save Changes
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
