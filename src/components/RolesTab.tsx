'use client';

import React, { useState, useEffect } from 'react';
import { Loader2, Plus, Search, Shield, Building2, CheckCircle2, ChevronDown, ChevronUp, BookOpen } from 'lucide-react';

interface SOPOption {
  sopIdentifier: string;
  sopName: string;
  hasExam: boolean;
  department?: string;
}

interface Role {
  _id: string;
  name: string;
  employeeName: string;
  department: string;
  description: string;
  sops: SOPOption[];
  createdAt: string;
}

export default function RolesTab() {
  const [roles, setRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  
  // MCQ Bank SOPs (Dropdown options)
  const [allSops, setAllSops] = useState<SOPOption[]>([]);
  const [sopsLoading, setSopsLoading] = useState(false);
  const [sopSearch, setSopSearch] = useState('');

  // Form State
  const [formData, setFormData] = useState({
    name: '',
    employeeName: '',
    department: '',
    description: '',
  });
  const [selectedSops, setSelectedSops] = useState<SOPOption[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // UI State
  const [expandedRole, setExpandedRole] = useState<string | null>(null);

  useEffect(() => {
    fetchRoles();
    fetchSponsors(); // Fetch all SOPs from MCQ Bank
  }, []);

  const fetchRoles = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/training/roles');
      const data = await res.json();
      if (data.success) {
        setRoles(data.roles);
      }
    } catch (err) {
      console.error('Error fetching roles:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchSponsors = async () => {
    try {
      setSopsLoading(true);
      // Fetch summary to get identifier, name, etc.
      const res = await fetch('/api/mcq-bank?limit=1000&summary=true');
      const data = await res.json();
      if (data.success && data.mcqBanks) {
        const sopsList = data.mcqBanks.map((bank: any) => ({
          sopIdentifier: bank.sopIdentifier,
          sopName: bank.sopName,
          hasExam: bank.totalQuestions > 0, // Since it's from MCQ Bank, it has an exam if questions exist
          department: bank.department || 'General',
        }));
        
        // Remove duplicates if any (grouped by identifier)
        const uniqueSops = Array.from(new Map(sopsList.map((item: any) => [item.sopIdentifier, item])).values());
        setAllSops(uniqueSops as SOPOption[]);
      }
    } catch (err) {
      console.error('Error fetching SOPs:', err);
    } finally {
      setSopsLoading(false);
    }
  };

  const toggleSopSelection = (sop: SOPOption) => {
    setSelectedSops(prev => {
      const isSelected = prev.some(s => s.sopIdentifier === sop.sopIdentifier);
      if (isSelected) return prev.filter(s => s.sopIdentifier !== sop.sopIdentifier);
      return [...prev, sop];
    });
  };

  const handleSaveRole = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name || !formData.employeeName || !formData.department) {
      setError('Role name, employee name, and department are required.');
      return;
    }
    
    try {
      setSaving(true);
      setError('');
      const res = await fetch('/api/training/roles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          sops: selectedSops
        }),
      });
      const data = await res.json();
      if (data.success) {
        setRoles([data.role, ...roles]);
        setShowForm(false);
        setFormData({ name: '', employeeName: '', department: '', description: '' });
        setSelectedSops([]);
      } else {
        setError(data.error || 'Failed to create role');
      }
    } catch (err) {
      setError('An error occurred.');
    } finally {
      setSaving(false);
    }
  };

  const filteredSops = allSops.filter(sop => {
    const matchesSearch = sop.sopIdentifier.toLowerCase().includes(sopSearch.toLowerCase()) || 
                          sop.sopName.toLowerCase().includes(sopSearch.toLowerCase());
    const matchesDept = formData.department 
      ? sop.department?.toLowerCase().includes(formData.department.toLowerCase())
      : true;
    return matchesSearch && matchesDept;
  });

  if (loading) {
    return (
      <div className="flex justify-center items-center py-20">
        <Loader2 className="h-8 w-8 text-indigo-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header section */}
      <div className="flex justify-between items-center bg-white/[0.025] border border-white/5 rounded-3xl p-6">
        <div>
          <h2 className="text-xl font-black text-white flex items-center gap-2">
            <Shield className="h-6 w-6 text-indigo-400" />
            Role Management
          </h2>
          <p className="text-slate-400 text-sm mt-1">Create and manage employee roles along with their required SOPs.</p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 rounded-xl font-bold text-xs transition-all shadow-lg shadow-indigo-500/20"
        >
          {showForm ? 'Cancel' : <><Plus className="h-4 w-4" /> Create Role</>}
        </button>
      </div>

      {showForm && (
        <div className="bg-white/[0.02] border border-white/5 rounded-3xl p-6 space-y-6 animation-fade-in">
          <h3 className="text-sm font-black text-indigo-300 uppercase tracking-widest border-b border-white/5 pb-4">
            Create New Role
          </h3>
          
          {error && (
            <div className="bg-red-500/10 border border-red-500/30 text-red-400 px-4 py-3 rounded-xl text-sm font-medium">
              {error}
            </div>
          )}

          <form onSubmit={handleSaveRole} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-400 uppercase">Role Name</label>
                <input 
                  type="text"
                  required
                  value={formData.name}
                  onChange={e => setFormData({ ...formData, name: e.target.value })}
                  placeholder="e.g. Quality Analyst L1"
                  className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-indigo-500 transition-colors"
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-400 uppercase">Employee Name</label>
                <input 
                  type="text"
                  required
                  value={formData.employeeName}
                  onChange={e => setFormData({ ...formData, employeeName: e.target.value })}
                  placeholder="e.g. John Doe"
                  className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-indigo-500 transition-colors"
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-400 uppercase">Department</label>
                <div className="relative">
                  <select 
                    required
                    value={formData.department}
                    onChange={e => setFormData({ ...formData, department: e.target.value })}
                    className="w-full bg-black/40 border border-white/10 rounded-xl pl-4 pr-10 py-3 text-sm text-white focus:outline-none focus:border-indigo-500 transition-colors cursor-pointer appearance-none"
                  >
                    <option value="" disabled>Select a department...</option>
                    {Array.from(new Set(allSops.map(sop => sop.department).filter(Boolean))).sort().map(dept => (
                      <option key={dept} value={dept}>{dept}</option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
                </div>
              </div>
            </div>
            
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-400 uppercase">Description (Optional)</label>
              <textarea 
                value={formData.description}
                onChange={e => setFormData({ ...formData, description: e.target.value })}
                placeholder="Brief description of this role's responsibilities..."
                className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-indigo-500 transition-colors h-24 resize-none"
              />
            </div>

            {/* SOP Selection Area */}
            <div className="space-y-4 pt-4 border-t border-white/5">
              <div className="flex justify-between items-end">
                <div>
                  <label className="text-xs font-bold text-indigo-300 uppercase tracking-widest flex items-center gap-2">
                    <BookOpen className="h-4 w-4" /> Required SOPs
                  </label>
                  <p className="text-[10px] text-slate-500 mt-1">Select the SOP trainings applicable for this role.</p>
                </div>
                
                {/* Embedded Search */}
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
                  <input
                    type="text"
                    placeholder="Search SOP by code or name..."
                    value={sopSearch}
                    onChange={(e) => setSopSearch(e.target.value)}
                    className="pl-9 pr-4 py-2 bg-black/40 border border-white/10 rounded-lg text-xs text-white focus:border-indigo-500 outline-none w-64"
                  />
                </div>
              </div>

              {sopsLoading ? (
                <div className="flex items-center justify-center p-8 bg-black/20 rounded-xl border border-white/5">
                  <Loader2 className="h-6 w-6 text-indigo-500 animate-spin" />
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 max-h-80 overflow-y-auto pr-2 custom-scrollbar">
                  {filteredSops.map(sop => {
                    const isSelected = selectedSops.some(s => s.sopIdentifier === sop.sopIdentifier);
                    return (
                      <div 
                        key={sop.sopIdentifier}
                        onClick={() => toggleSopSelection(sop)}
                        className={`p-3 rounded-xl border cursor-pointer transition-all flex items-start gap-3 ${
                          isSelected 
                            ? 'bg-indigo-600/10 border-indigo-500/50' 
                            : 'bg-black/40 border-white/5 hover:border-white/20'
                        }`}
                      >
                        <div className={`mt-0.5 w-4 h-4 rounded-full flex items-center justify-center border shrink-0 transition-colors ${
                          isSelected ? 'bg-indigo-500 border-indigo-400' : 'border-slate-600'
                        }`}>
                          {isSelected && <CheckCircle2 className="h-3 w-3 text-white" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className={`font-mono text-[10px] font-black tracking-wider ${isSelected ? 'text-indigo-300' : 'text-slate-400'}`}>
                            {sop.sopIdentifier}
                          </p>
                          <p className={`text-xs mt-0.5 truncate ${isSelected ? 'text-white font-medium' : 'text-slate-300'}`}>
                            {sop.sopName}
                          </p>
                          {sop.hasExam && (
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[8px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 mt-1.5">
                              Exam Available
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                  {filteredSops.length === 0 && (
                    <div className="col-span-full py-8 text-center text-slate-500 text-sm">
                      No matching SOPs found. Ensure your MCQ Bank is populated.
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="flex justify-end pt-4 border-t border-white/5">
              <button
                type="submit"
                disabled={saving || !formData.name || !formData.employeeName || !formData.department}
                className="px-6 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl font-bold text-sm transition-all text-white flex items-center gap-2"
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Shield className="h-4 w-4" />}
                Save Role
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Roles List */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {roles.map(role => {
          const isExpanded = expandedRole === role._id;
          return (
            <div key={role._id} className={`bg-white/[0.02] border rounded-2xl transition-colors ${
              isExpanded ? 'border-indigo-500/30 bg-indigo-500/5' : 'border-white/5 hover:border-white/10'
            }`}>
              <div 
                className="p-5 cursor-pointer flex items-start justify-between"
                onClick={() => setExpandedRole(isExpanded ? null : role._id)}
              >
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-lg font-black text-white">{role.name}</h3>
                    <span className="text-xs text-indigo-200 bg-indigo-500/10 px-2 py-0.5 rounded-md border border-indigo-500/20 font-bold">
                      {role.employeeName}
                    </span>
                    <span className="px-2 py-0.5 bg-slate-800 rounded-md text-slate-300 text-[10px] font-bold border border-white/10 flex items-center gap-1">
                      <Building2 className="h-3 w-3" /> {role.department}
                    </span>
                  </div>
                  {role.description && (
                    <p className="text-xs text-slate-400 mt-2 line-clamp-2">{role.description}</p>
                  )}
                  <div className="mt-4 flex items-center gap-3 text-[10px] font-bold">
                    <span className="text-indigo-400 bg-indigo-500/10 px-2 py-1 rounded-lg border border-indigo-500/20">
                      {role.sops.length} Required SOPs
                    </span>
                    <span className="text-slate-500">
                      Created {new Date(role.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                </div>
                <div className={`p-2 rounded-lg transition-colors ${isExpanded ? 'bg-indigo-500/20 text-indigo-400' : 'bg-white/5 text-slate-400'}`}>
                  {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </div>
              </div>

              {isExpanded && (
                <div className="p-5 border-t border-white/5 bg-black/20 rounded-b-2xl">
                  <h4 className="text-[10px] uppercase font-black tracking-widest text-slate-500 mb-3">Required SOP Trainings</h4>
                  <div className="space-y-2">
                    {role.sops.map(sop => (
                      <div key={sop.sopIdentifier} className="flex justify-between items-center bg-black/40 p-3 rounded-xl border border-white/5">
                        <div>
                          <p className="font-mono text-[11px] font-black text-indigo-300">{sop.sopIdentifier}</p>
                          <p className="text-xs font-medium text-slate-300 mt-0.5">{sop.sopName}</p>
                        </div>
                        {sop.hasExam && (
                          <span className="px-2 py-1 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded text-[9px] font-bold uppercase tracking-wide flex items-center gap-1">
                            <CheckCircle2 className="h-3 w-3" /> Exam
                          </span>
                        )}
                      </div>
                    ))}
                    {role.sops.length === 0 && (
                      <p className="text-xs text-slate-500 italic">No SOPs assigned to this role.</p>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
        {roles.length === 0 && !showForm && (
          <div className="col-span-full py-20 text-center border border-white/5 rounded-3xl bg-white/[0.01]">
            <Shield className="h-12 w-12 text-slate-600 mx-auto mb-4 opacity-50" />
            <h3 className="text-lg font-bold text-slate-300">No Roles Created</h3>
            <p className="text-sm text-slate-500 mt-2 max-w-sm mx-auto">Create employee roles and assign required SOPs to streamline the training structure.</p>
            <button
              onClick={() => setShowForm(true)}
              className="mt-6 px-6 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl font-bold text-sm transition-all"
            >
              Create First Role
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
