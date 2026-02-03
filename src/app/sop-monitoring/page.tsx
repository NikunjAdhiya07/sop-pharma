'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import PageHeader from '@/components/PageHeader';
import { 
  AlertTriangle, 
  Clock, 
  CheckCircle2, 
  FileQuestion,
  Calendar,
  Edit,
  Loader2,
  Building2,
  X,
  User,
  Layers,
  ArrowUpDown,
  Filter,
  GitMerge
} from 'lucide-react';
import { format } from 'date-fns';

interface SOP {
  _id: string;
  name: string;
  identifier: string;
  department: string;
  processArea?: string;
  owner?: string;
  version?: string;
  effectiveDate?: string;
  reviewDate?: string;
  expiryDate?: string;
  guidelineReference?: string;
  mergedSOPId?: string;
  lastReviewedBy?: string;
  remarks?: string;
  uploadedAt: string;
  createdAt: string;
  computedStatus?: string;
  priority?: number;
  daysToExpiry?: number;
  daysToReview?: number;
}

type ViewType = 'needsReviewThisWeek' | 'expiringNext30Days' | 'expired' | 'missingDates' | 'all';
type SortField = 'expiryDate' | 'reviewDate' | 'department' | 'owner' | 'priority';

export default function SOPMonitoringPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<any>(null);
  const [activeView, setActiveView] = useState<ViewType>('needsReviewThisWeek');
  const [sortField, setSortField] = useState<SortField>('priority');
  const [sortAsc, setSortAsc] = useState(false);
  const [filterDepartment, setFilterDepartment] = useState<string>('');
  const [filterOwner, setFilterOwner] = useState<string>('');
  
  // Edit Modal State
  const [selectedSOP, setSelectedSOP] = useState<SOP | null>(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editForm, setEditForm] = useState({
    reviewDate: '',
    expiryDate: '',
    owner: '',
    processArea: '',
    version: '',
    effectiveDate: '',
    guidelineReference: '',
    remarks: '',
  });
  const [saving, setSaving] = useState(false);
  
  // Modal drag state
  const [modalPosition, setModalPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

  useEffect(() => {
    fetchMonitoringData();
  }, []);

  const fetchMonitoringData = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/sop-monitoring');
      const result = await response.json();
      if (result.success) {
        setData(result.data);
      }
    } catch (error) {
      console.error('Error fetching monitoring data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenEditModal = (sop: SOP) => {
    setSelectedSOP(sop);
    setEditForm({
      reviewDate: sop.reviewDate ? format(new Date(sop.reviewDate), 'yyyy-MM-dd') : '',
      expiryDate: sop.expiryDate ? format(new Date(sop.expiryDate), 'yyyy-MM-dd') : '',
      owner: sop.owner || '',
      processArea: sop.processArea || '',
      version: sop.version || '1.0',
      effectiveDate: sop.effectiveDate ? format(new Date(sop.effectiveDate), 'yyyy-MM-dd') : '',
      guidelineReference: sop.guidelineReference || '',
      remarks: sop.remarks || '',
    });
    setModalPosition({ x: 0, y: 0 }); // Reset position when opening
    setShowEditModal(true);
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    setDragStart({
      x: e.clientX - modalPosition.x,
      y: e.clientY - modalPosition.y,
    });
  };

  const handleMouseMove = (e: MouseEvent) => {
    if (isDragging) {
      setModalPosition({
        x: e.clientX - dragStart.x,
        y: e.clientY - dragStart.y,
      });
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  useEffect(() => {
    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      return () => {
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [isDragging, dragStart]);

  const handleSaveSOPUpdate = async () => {
    if (!selectedSOP) return;
    
    setSaving(true);
    try {
      const response = await fetch('/api/sop-monitoring/update', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sopId: selectedSOP._id,
          ...editForm
        })
      });
      
      const result = await response.json();
      if (result.success) {
        setShowEditModal(false);
        fetchMonitoringData();
      } else {
        alert('Error: ' + result.error);
      }
    } catch (error) {
      console.error('Error updating SOP:', error);
      alert('Failed to update SOP');
    } finally {
      setSaving(false);
    }
  };

  const getCurrentSOPs = () => {
    if (!data?.sops) return [];
    
    let sops = [];
    switch (activeView) {
      case 'needsReviewThisWeek':
        sops = data.sops.needsReviewThisWeek || [];
        break;
      case 'expiringNext30Days':
        sops = data.sops.expiringNext30Days || [];
        break;
      case 'expired':
        sops = data.sops.expired || [];
        break;
      case 'missingDates':
        sops = data.sops.missingDates || [];
        break;
      case 'all':
        sops = data.sops.all || [];
        break;
      default:
        sops = [];
    }
    
    // Apply filters
    if (filterDepartment) {
      sops = sops.filter((s: SOP) => s.department === filterDepartment);
    }
    if (filterOwner) {
      sops = sops.filter((s: SOP) => s.owner === filterOwner);
    }
    
    // Apply sorting
    sops = [...sops].sort((a: SOP, b: SOP) => {
      let aVal, bVal;
      
      switch (sortField) {
        case 'expiryDate':
          aVal = a.expiryDate ? new Date(a.expiryDate).getTime() : Infinity;
          bVal = b.expiryDate ? new Date(b.expiryDate).getTime() : Infinity;
          break;
        case 'reviewDate':
          aVal = a.reviewDate ? new Date(a.reviewDate).getTime() : Infinity;
          bVal = b.reviewDate ? new Date(b.reviewDate).getTime() : Infinity;
          break;
        case 'department':
          aVal = a.department || '';
          bVal = b.department || '';
          return sortAsc ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
        case 'owner':
          aVal = a.owner || '';
          bVal = b.owner || '';
          return sortAsc ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
        case 'priority':
        default:
          aVal = a.priority || 0;
          bVal = b.priority || 0;
          break;
      }
      
      return sortAsc ? aVal - bVal : bVal - aVal;
    });
    
    return sops;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex items-center justify-center">
        <Loader2 className="h-12 w-12 text-purple-400 animate-spin" />
      </div>
    );
  }

  const currentSOPs = getCurrentSOPs();
  const departments = data?.departmentStats?.map((d: any) => d.name) || [];
  const owners = data?.ownerStats?.map((o: any) => o.name) || [];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 p-8">
      <div className="max-w-7xl mx-auto">
        <PageHeader />

        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-white mb-2">
            SOP Monitoring & Compliance
          </h1>
          <p className="text-gray-300">Data-driven tracking - Focus on what needs action today</p>
        </div>

        {/* Actionable Cards - What needs attention NOW */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          {/* Review This Week - HIGHEST PRIORITY */}
          <button
            onClick={() => setActiveView('needsReviewThisWeek')}
            className={`p-6 rounded-2xl border-2 transition-all text-left ${
              activeView === 'needsReviewThisWeek'
                ? 'bg-red-500/20 border-red-500 shadow-lg shadow-red-500/20'
                : 'bg-white/5 border-red-500/30 hover:border-red-500/50 hover:bg-red-500/10'
            }`}
          >
            <div className="flex items-center justify-between mb-3">
              <Calendar className="h-8 w-8 text-red-400" />
              <span className="text-3xl font-black text-white">{data?.actionable?.needsReviewThisWeek || 0}</span>
            </div>
            <h3 className="text-sm font-bold text-red-400 uppercase tracking-wider">Review This Week</h3>
            <p className="text-xs text-gray-400 mt-1">Needs immediate attention</p>
          </button>

          {/* Expiring in 30 Days */}
          <button
            onClick={() => setActiveView('expiringNext30Days')}
            className={`p-6 rounded-2xl border-2 transition-all text-left ${
              activeView === 'expiringNext30Days'
                ? 'bg-orange-500/20 border-orange-500 shadow-lg shadow-orange-500/20'
                : 'bg-white/5 border-orange-500/30 hover:border-orange-500/50 hover:bg-orange-500/10'
            }`}
          >
            <div className="flex items-center justify-between mb-3">
              <Clock className="h-8 w-8 text-orange-400" />
              <span className="text-3xl font-black text-white">{data?.actionable?.expiringNext30Days || 0}</span>
            </div>
            <h3 className="text-sm font-bold text-orange-400 uppercase tracking-wider">Expiring Soon</h3>
            <p className="text-xs text-gray-400 mt-1">Within next 30 days</p>
          </button>

          {/* Already Expired */}
          <button
            onClick={() => setActiveView('expired')}
            className={`p-6 rounded-2xl border-2 transition-all text-left ${
              activeView === 'expired'
                ? 'bg-yellow-500/20 border-yellow-500 shadow-lg shadow-yellow-500/20'
                : 'bg-white/5 border-yellow-500/30 hover:border-yellow-500/50 hover:bg-yellow-500/10'
            }`}
          >
            <div className="flex items-center justify-between mb-3">
              <AlertTriangle className="h-8 w-8 text-yellow-400" />
              <span className="text-3xl font-black text-white">{data?.actionable?.expired || 0}</span>
            </div>
            <h3 className="text-sm font-bold text-yellow-400 uppercase tracking-wider">Expired</h3>
            <p className="text-xs text-gray-400 mt-1">Past expiry date</p>
          </button>

          {/* Missing Dates - Data Issue */}
          <button
            onClick={() => setActiveView('missingDates')}
            className={`p-6 rounded-2xl border-2 transition-all text-left ${
              activeView === 'missingDates'
                ? 'bg-purple-500/20 border-purple-500 shadow-lg shadow-purple-500/20'
                : 'bg-white/5 border-purple-500/30 hover:border-purple-500/50 hover:bg-purple-500/10'
            }`}
          >
            <div className="flex items-center justify-between mb-3">
              <FileQuestion className="h-8 w-8 text-purple-400" />
              <span className="text-3xl font-black text-white">{data?.actionable?.missingDates || 0}</span>
            </div>
            <h3 className="text-sm font-bold text-purple-400 uppercase tracking-wider">Missing Dates</h3>
            <p className="text-xs text-gray-400 mt-1">No review/expiry set</p>
          </button>
        </div>

        {/* Department Overview */}
        {data?.departmentStats && data.departmentStats.length > 0 && (
          <div className="bg-white/5 backdrop-blur-xl border border-white/20 rounded-2xl p-6 mb-8">
            <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
              <Building2 className="h-5 w-5 text-purple-400" />
              Department Overview
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {data.departmentStats.map((dept: any) => (
                <div key={dept.name} className="bg-white/5 border border-white/10 rounded-xl p-4">
                  <h3 className="font-bold text-white mb-2">{dept.name}</h3>
                  <div className="space-y-1 text-sm">
                    <div className="flex justify-between">
                      <span className="text-gray-400">Total:</span>
                      <span className="text-white font-semibold">{dept.total}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-red-400">Needs Review:</span>
                      <span className="text-red-400 font-semibold">{dept.needsReview}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-yellow-400">Expired:</span>
                      <span className="text-yellow-400 font-semibold">{dept.expired}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-orange-400">Expiring Soon:</span>
                      <span className="text-orange-400 font-semibold">{dept.expiringSoon}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-purple-400">Missing Dates:</span>
                      <span className="text-purple-400 font-semibold">{dept.missingDates}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* SOP List - Beautiful Card Design */}
        <div className="bg-gradient-to-br from-purple-900/20 via-indigo-900/20 to-purple-900/20 backdrop-blur-xl border-2 border-purple-500/30 rounded-3xl overflow-hidden shadow-[0_0_60px_rgba(168,85,247,0.3)]">
          {/* Header */}
          <div className="px-8 py-6 bg-gradient-to-r from-purple-900/40 to-indigo-900/40 border-b border-purple-500/20">
            <h2 className="text-2xl font-bold text-white flex items-center gap-3">
              {activeView === 'needsReviewThisWeek' && 'SOPs Needing Review This Week'}
              {activeView === 'expiringNext30Days' && 'SOPs Expiring in Next 30 Days'}
              {activeView === 'expired' && 'Expired SOPs'}
              {activeView === 'missingDates' && 'SOPs with Missing Dates'}
              {activeView === 'all' && 'All SOPs'}
              <span className="text-purple-300 text-lg font-normal">({currentSOPs.length})</span>
            </h2>
            
            {/* Filters Row */}
            <div className="flex gap-3 mt-4">
              <div className="flex items-center gap-2 px-4 py-2 bg-purple-800/30 border border-purple-500/30 rounded-lg">
                <Filter className="h-4 w-4 text-purple-300" />
                <span className="text-sm text-purple-200">Department:</span>
                <select
                  value={filterDepartment}
                  onChange={(e) => setFilterDepartment(e.target.value)}
                  className="bg-transparent text-white text-sm focus:outline-none cursor-pointer"
                  style={{ colorScheme: 'dark' }}
                >
                  <option value="">Quality Assurance</option>
                  {departments.map((dept: string) => (
                    <option key={dept} value={dept}>{dept}</option>
                  ))}
                </select>
              </div>

              <div className="flex items-center gap-2 px-4 py-2 bg-purple-800/30 border border-purple-500/30 rounded-lg">
                <User className="h-4 w-4 text-purple-300" />
                <span className="text-sm text-purple-200">Owner:</span>
                <select
                  value={filterOwner}
                  onChange={(e) => setFilterOwner(e.target.value)}
                  className="bg-transparent text-white text-sm focus:outline-none cursor-pointer"
                  style={{ colorScheme: 'dark' }}
                >
                  <option value="">All Owners</option>
                  {owners.map((owner: string) => (
                    <option key={owner} value={owner}>{owner}</option>
                  ))}
                </select>
              </div>

              <div className="flex items-center gap-2 px-4 py-2 bg-purple-800/30 border border-purple-500/30 rounded-lg ml-auto">
                <ArrowUpDown className="h-4 w-4 text-purple-300" />
                <span className="text-sm text-purple-200">Sort by:</span>
                <select
                  value={sortField}
                  onChange={(e) => setSortField(e.target.value as SortField)}
                  className="bg-transparent text-white text-sm focus:outline-none cursor-pointer"
                  style={{ colorScheme: 'dark' }}
                >
                  <option value="priority">Priority ↓</option>
                  <option value="expiryDate">Expiry Date</option>
                  <option value="reviewDate">Review Date</option>
                  <option value="department">Department</option>
                  <option value="owner">Owner</option>
                </select>
              </div>
            </div>
          </div>

          {/* Table Header */}
          <div className="px-8 py-4 bg-purple-900/20 border-b border-purple-500/20">
            <div className="grid grid-cols-12 gap-4 text-sm font-semibold text-purple-200">
              <div className="col-span-2">SOP ID</div>
              <div className="col-span-2">Name</div>
              <div className="col-span-2">Department & Owner</div>
              <div className="col-span-2">Process Area & Guideline</div>
              <div className="col-span-2">Review Date</div>
              <div className="col-span-1">Expiry Date</div>
              <div className="col-span-1 text-right">Action</div>
            </div>
          </div>

          {/* Table Body */}
          <div className="divide-y divide-purple-500/10">
            {currentSOPs.length === 0 ? (
              <div className="p-16 text-center">
                <CheckCircle2 className="h-20 w-20 text-green-500/30 mx-auto mb-4" />
                <p className="text-gray-400 text-xl">No SOPs in this category</p>
              </div>
            ) : (
              currentSOPs.map((sop: SOP) => (
                <div 
                  key={sop._id} 
                  className="px-8 py-6 hover:bg-purple-800/10 transition-all group bg-gradient-to-r from-transparent via-purple-900/5 to-transparent"
                >
                  <div className="grid grid-cols-12 gap-4 items-start">
                    {/* SOP ID & Version */}
                    <div className="col-span-2">
                      <div className="flex items-center gap-2">
                        <span className="text-white font-bold text-sm">{sop.identifier}</span>
                        {sop.version && (
                          <span className="px-2 py-0.5 bg-purple-500/30 border border-purple-400/40 rounded-md text-purple-200 text-xs font-bold">
                            v{sop.version}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Name */}
                    <div className="col-span-2">
                      <p className="text-white font-medium text-sm leading-tight">{sop.name}</p>
                    </div>

                    {/* Department & Owner */}
                    <div className="col-span-2 space-y-1">
                      <div className="flex items-center gap-2">
                        <Building2 className="h-3.5 w-3.5 text-purple-300" />
                        <span className="text-purple-100 text-xs">{sop.department}</span>
                      </div>
                      {sop.owner && (
                        <div className="flex items-center gap-2">
                          <User className="h-3.5 w-3.5 text-purple-300" />
                          <span className="text-purple-100 text-xs">{sop.owner}</span>
                        </div>
                      )}
                    </div>

                    {/* Process Area & Guideline */}
                    <div className="col-span-2 space-y-1">
                      {sop.processArea && (
                        <div className="flex items-center gap-2">
                          <Layers className="h-3.5 w-3.5 text-purple-300" />
                          <span className="text-purple-100 text-xs">{sop.processArea}</span>
                        </div>
                      )}
                      {sop.guidelineReference && (
                        <div className="flex items-center gap-2">
                          <span className="text-purple-300 text-xs">📄</span>
                          <span className="text-purple-100 text-xs">{sop.guidelineReference}</span>
                        </div>
                      )}
                    </div>

                    {/* Review Date */}
                    <div className="col-span-2">
                      {sop.reviewDate ? (
                        <div className="space-y-1">
                          <p className="text-white text-sm font-medium">
                            {format(new Date(sop.reviewDate), 'MMM dd, yyyy')}
                          </p>
                          {sop.daysToReview !== null && sop.daysToReview !== undefined && (
                            <span className={`inline-block px-2 py-0.5 rounded-md text-xs font-bold ${
                              sop.daysToReview < 0 
                                ? 'bg-red-500/20 text-red-300 border border-red-500/30' 
                                : sop.daysToReview <= 2
                                ? 'bg-orange-500/20 text-orange-300 border border-orange-500/30'
                                : sop.daysToReview <= 7
                                ? 'bg-yellow-500/20 text-yellow-300 border border-yellow-500/30'
                                : 'bg-green-500/20 text-green-300 border border-green-500/30'
                            }`}>
                              {sop.daysToReview < 0 
                                ? `overdue by ${Math.abs(sop.daysToReview)} day${Math.abs(sop.daysToReview) !== 1 ? 's' : ''}` 
                                : `${sop.daysToReview} day${sop.daysToReview !== 1 ? 's' : ''} left`}
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className="text-gray-500 text-xs">Not set</span>
                      )}
                    </div>

                    {/* Expiry Date */}
                    <div className="col-span-1">
                      {sop.expiryDate ? (
                        <div className="space-y-1">
                          <p className="text-white text-sm font-medium">
                            {format(new Date(sop.expiryDate), 'MMM dd, yyyy')}
                          </p>
                          {sop.daysToExpiry !== null && sop.daysToExpiry !== undefined && (
                            <span className={`inline-block px-2 py-0.5 rounded-md text-xs font-bold ${
                              sop.daysToExpiry < 0 
                                ? 'bg-red-500/20 text-red-300 border border-red-500/30' 
                                : sop.daysToExpiry <= 30
                                ? 'bg-yellow-500/20 text-yellow-300 border border-yellow-500/30'
                                : 'bg-green-500/20 text-green-300 border border-green-500/30'
                            }`}>
                              ({sop.daysToExpiry < 0 
                                ? `${Math.abs(sop.daysToExpiry)} days` 
                                : `${sop.daysToExpiry} days`})
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className="text-gray-500 text-xs">Not set</span>
                      )}
                    </div>

                    {/* Action Button */}
                    <div className="col-span-1 flex justify-end">
                      <button
                        onClick={() => handleOpenEditModal(sop)}
                        className="px-4 py-2 bg-gradient-to-r from-purple-600 to-purple-500 hover:from-purple-700 hover:to-purple-600 text-white rounded-lg text-sm font-semibold transition-all flex items-center gap-2 shadow-lg shadow-purple-500/30 opacity-0 group-hover:opacity-100"
                      >
                        <Edit className="h-3.5 w-3.5" />
                        Edit
                      </button>
                    </div>
                  </div>

                  {/* Remarks Row (if exists) */}
                  {sop.remarks && (
                    <div className="mt-3 flex items-start gap-2 px-4 py-2 bg-cyan-500/10 border border-cyan-500/20 rounded-lg">
                      <span className="text-cyan-400 text-xs">ℹ️</span>
                      <p className="text-cyan-200 text-xs flex-1">
                        <span className="font-semibold">Remarks:</span> {sop.remarks}
                      </p>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>

        {/* Potential Merges Section */}
        {data?.potentialMerges && data.potentialMerges.length > 0 && (
          <div className="bg-white/5 backdrop-blur-xl border border-white/20 rounded-2xl p-6 mt-8">
            <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
              <GitMerge className="h-5 w-5 text-purple-400" />
              Potential SOP Merges ({data.potentialMerges.length})
            </h2>
            <div className="space-y-3">
              {data.potentialMerges.slice(0, 10).map((merge: any, idx: number) => (
                <div key={idx} className="bg-white/5 border border-white/10 rounded-lg p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <span className="text-white font-semibold">{merge.sop1.identifier}</span>
                        <span className="text-gray-400">↔</span>
                        <span className="text-white font-semibold">{merge.sop2.identifier}</span>
                      </div>
                      <p className="text-sm text-gray-400">{merge.reason}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Edit Modal */}
        {showEditModal && selectedSOP && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
            <div 
              className="bg-gradient-to-br from-[#1a1f3a] via-[#2a2f4a] to-[#1a1f3a] rounded-3xl border-2 border-purple-500/40 w-full max-w-3xl shadow-[0_0_50px_rgba(168,85,247,0.4)] max-h-[90vh] overflow-hidden pointer-events-auto"
              style={{
                transform: `translate(${modalPosition.x}px, ${modalPosition.y}px)`,
                cursor: isDragging ? 'grabbing' : 'default',
              }}
            >
              {/* Header with gradient - Draggable area */}
              <div 
                className="bg-gradient-to-r from-purple-600/80 via-blue-600/80 to-purple-600/80 px-8 py-5 border-b border-purple-400/30 flex items-center justify-between cursor-grab active:cursor-grabbing"
                onMouseDown={handleMouseDown}
              >
                <div>
                  <h2 className="text-2xl font-bold text-white">Edit SOP Details</h2>
                  <p className="text-purple-100 text-sm mt-1">{selectedSOP.name}</p>
                  <p className="text-purple-200/70 text-xs font-mono mt-0.5">{selectedSOP.identifier}</p>
                </div>
                <button
                  onClick={() => setShowEditModal(false)}
                  className="p-2 hover:bg-white/20 rounded-lg transition-all text-white"
                  onMouseDown={(e) => e.stopPropagation()}
                >
                  <X className="h-6 w-6" />
                </button>
              </div>

              {/* Body with scrollable content */}
              <div className="p-8 space-y-5 max-h-[calc(90vh-200px)] overflow-y-auto">
                <div className="grid grid-cols-2 gap-5">
                  <div>
                    <label className="block text-white font-semibold mb-2 text-sm">Review Date *</label>
                    <input
                      type="date"
                      value={editForm.reviewDate}
                      onChange={(e) => setEditForm({ ...editForm, reviewDate: e.target.value })}
                      className="w-full px-4 py-3 bg-[#2d3548] border border-gray-600/50 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all"
                      style={{ colorScheme: 'dark' }}
                    />
                  </div>

                  <div>
                    <label className="block text-white font-semibold mb-2 text-sm">Expiry Date *</label>
                    <input
                      type="date"
                      value={editForm.expiryDate}
                      onChange={(e) => setEditForm({ ...editForm, expiryDate: e.target.value })}
                      className="w-full px-4 py-3 bg-[#2d3548] border border-gray-600/50 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all"
                      style={{ colorScheme: 'dark' }}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-5">
                  <div>
                    <label className="block text-white font-semibold mb-2 text-sm">Owner</label>
                    <input
                      type="text"
                      value={editForm.owner}
                      onChange={(e) => setEditForm({ ...editForm, owner: e.target.value })}
                      placeholder="e.g., John Doe"
                      className="w-full px-4 py-3 bg-[#2d3548] border border-gray-600/50 rounded-xl text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all"
                    />
                  </div>

                  <div>
                    <label className="block text-white font-semibold mb-2 text-sm">Process Area</label>
                    <input
                      type="text"
                      value={editForm.processArea}
                      onChange={(e) => setEditForm({ ...editForm, processArea: e.target.value })}
                      placeholder="e.g., Quality Control"
                      className="w-full px-4 py-3 bg-[#2d3548] border border-gray-600/50 rounded-xl text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-5">
                  <div>
                    <label className="block text-white font-semibold mb-2 text-sm">Version</label>
                    <input
                      type="text"
                      value={editForm.version}
                      onChange={(e) => setEditForm({ ...editForm, version: e.target.value })}
                      placeholder="1.0"
                      className="w-full px-4 py-3 bg-[#2d3548] border border-gray-600/50 rounded-xl text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all"
                    />
                  </div>

                  <div>
                    <label className="block text-white font-semibold mb-2 text-sm">Effective Date</label>
                    <input
                      type="date"
                      value={editForm.effectiveDate}
                      onChange={(e) => setEditForm({ ...editForm, effectiveDate: e.target.value })}
                      className="w-full px-4 py-3 bg-[#2d3548] border border-gray-600/50 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all"
                      style={{ colorScheme: 'dark' }}
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-white font-semibold mb-2 text-sm">Guideline Reference</label>
                  <input
                    type="text"
                    value={editForm.guidelineReference}
                    onChange={(e) => setEditForm({ ...editForm, guidelineReference: e.target.value })}
                    placeholder="e.g., ICH Q7, FDA 21 CFR Part 211"
                    className="w-full px-4 py-3 bg-[#2d3548] border border-gray-600/50 rounded-xl text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all"
                  />
                </div>

                <div>
                  <label className="block text-white font-semibold mb-2 text-sm">Remarks</label>
                  <textarea
                    value={editForm.remarks}
                    onChange={(e) => setEditForm({ ...editForm, remarks: e.target.value })}
                    rows={4}
                    placeholder="Add any notes or remarks about this SOP..."
                    className="w-full px-4 py-3 bg-[#2d3548] border border-gray-600/50 rounded-xl text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent resize-none transition-all"
                  />
                </div>
              </div>

              {/* Footer with buttons */}
              <div className="px-8 py-5 border-t border-purple-400/20 bg-gradient-to-r from-[#1a1f3a] to-[#2a2f4a] flex gap-4 justify-end">
                <button
                  onClick={() => setShowEditModal(false)}
                  className="px-8 py-3 bg-gray-700/50 hover:bg-gray-600/50 border border-gray-600/50 text-white rounded-xl font-semibold transition-all"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveSOPUpdate}
                  disabled={saving}
                  className="px-8 py-3 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white rounded-xl font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 shadow-lg shadow-purple-500/30"
                >
                  {saving ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    'Save Changes'
                  )}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
