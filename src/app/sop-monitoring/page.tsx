'use client';

import { useState, useEffect } from 'react';
import { 
  Calendar, 
  Search, 
  Filter, 
  AlertCircle, 
  CheckCircle2, 
  Clock, 
  Merge, 
  ShieldCheck, 
  Upload, 
  Loader2,
  ChevronRight,
  TrendingUp,
  History,
  Info
} from 'lucide-react';
import PageHeader from '@/components/PageHeader';
import { format } from 'date-fns';

interface SOP {
  _id: string;
  sopName: string;
  sopIdentifier: string;
  department: string;
  expiryDate?: string;
  complianceStatus?: 'compliant' | 'partial' | 'non-compliant' | 'pending';
  complianceNotes?: string;
  createdAt: string;
}

interface MergeSuggestion {
  _id: string;
  sopIds: string[];
  sopNames: string[];
  reason: string;
  similarityScore: number;
  status: string;
}

export default function SOPMonitoringPage() {
  const [activeTab, setActiveTab] = useState<'expiry' | 'merge' | 'compliance'>('expiry');
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<any>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [analyzing, setAnalyzing] = useState(false);
  const [uploadingGuideline, setUploadingGuideline] = useState(false);
  const [guidelineFile, setGuidelineFile] = useState<File | null>(null);

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

  const handleAnalyzeMerges = async () => {
    setAnalyzing(true);
    try {
      const response = await fetch('/api/sop-monitoring/analyze', { method: 'POST' });
      const result = await response.json();
      if (result.success) {
        fetchMonitoringData();
        alert(result.message);
      }
    } catch (error) {
      console.error('Error analyzing merges:', error);
    } finally {
      setAnalyzing(false);
    }
  };

  const handleUploadGuideline = async () => {
    if (!guidelineFile) return;
    setUploadingGuideline(true);
    try {
      const formData = new FormData();
      formData.append('file', guidelineFile);
      const user = JSON.parse(localStorage.getItem('user') || '{}');
      formData.append('userId', user._id || user.id);

      const response = await fetch('/api/sop-monitoring/compliance', {
        method: 'POST',
        body: formData
      });
      const result = await response.json();
      if (result.success) {
        fetchMonitoringData();
        alert(result.message);
      }
    } catch (error) {
      console.error('Error uploading guideline:', error);
    } finally {
      setUploadingGuideline(false);
      setGuidelineFile(null);
    }
  };

  const getStatusColor = (expiryDate?: string) => {
    if (!expiryDate) return 'text-gray-400';
    const date = new Date(expiryDate);
    const today = new Date();
    const thirtyDays = new Date();
    thirtyDays.setDate(today.getDate() + 30);

    if (date < today) return 'text-red-400 bg-red-400/10 border-red-500/20';
    if (date <= thirtyDays) return 'text-yellow-400 bg-yellow-400/10 border-yellow-500/20';
    return 'text-green-400 bg-green-400/10 border-green-500/20';
  };

  const getComplianceBadge = (status?: string) => {
    switch (status) {
      case 'compliant': return 'bg-green-500/20 text-green-400 border-green-500/30';
      case 'partial': return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30';
      case 'non-compliant': return 'bg-red-500/10 text-red-500 border-red-500/20';
      default: return 'bg-blue-500/10 text-blue-400 border-blue-500/20';
    }
  };

  const filteredSops = data?.allSops?.filter((sop: SOP) => 
    sop.sopName.toLowerCase().includes(searchQuery.toLowerCase()) ||
    sop.sopIdentifier.toLowerCase().includes(searchQuery.toLowerCase()) ||
    sop.department.toLowerCase().includes(searchQuery.toLowerCase())
  ) || [];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 p-8">
      <div className="max-w-7xl mx-auto">
        <PageHeader />

        {/* Header */}
        <div className="mb-8 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div>
            <h1 className="text-4xl font-bold text-white mb-2 bg-clip-text text-transparent bg-gradient-to-r from-purple-400 to-pink-600">
              SOP Monitoring & Compliance
            </h1>
            <p className="text-gray-300">Track validity, organization, and adherence to guidelines.</p>
          </div>
          
          <div className="flex bg-white/5 p-1 rounded-xl border border-white/10">
            <button 
              onClick={() => setActiveTab('expiry')}
              className={`px-6 py-2.5 rounded-lg font-bold text-sm transition-all flex items-center gap-2 ${activeTab === 'expiry' ? 'bg-purple-600 text-white shadow-lg' : 'text-gray-400 hover:text-white'}`}
            >
              <Calendar className="w-4 h-4" /> Expiry Tracking
            </button>
            <button 
              onClick={() => setActiveTab('merge')}
              className={`px-6 py-2.5 rounded-lg font-bold text-sm transition-all flex items-center gap-2 ${activeTab === 'merge' ? 'bg-purple-600 text-white shadow-lg' : 'text-gray-400 hover:text-white'}`}
            >
              <Merge className="w-4 h-4" /> Merge Suggestions
            </button>
            <button 
              onClick={() => setActiveTab('compliance')}
              className={`px-6 py-2.5 rounded-lg font-bold text-sm transition-all flex items-center gap-2 ${activeTab === 'compliance' ? 'bg-purple-600 text-white shadow-lg' : 'text-gray-400 hover:text-white'}`}
            >
              <ShieldCheck className="w-4 h-4" /> Compliance Check
            </button>
          </div>
        </div>

        {loading ? (
          <div className="flex flex-col items-center justify-center py-20">
            <Loader2 className="w-12 h-12 text-purple-500 animate-spin mb-4" />
            <p className="text-gray-400 text-lg font-medium">Loading monitoring data...</p>
          </div>
        ) : (
          <div className="space-y-8">
            {/* Stats Overview */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="bg-white/5 border border-white/10 p-6 rounded-2xl">
                <div className="flex items-center gap-4 mb-2 text-red-400">
                  <AlertCircle className="w-5 h-5" />
                  <span className="text-sm font-bold uppercase tracking-widest">Expired</span>
                </div>
                <div className="text-4xl font-black text-white">{data?.expired?.length || 0}</div>
              </div>
              <div className="bg-white/5 border border-white/10 p-6 rounded-2xl">
                <div className="flex items-center gap-4 mb-2 text-yellow-400">
                  <Clock className="w-5 h-5" />
                  <span className="text-sm font-bold uppercase tracking-widest">Expiring Soon</span>
                </div>
                <div className="text-4xl font-black text-white">{data?.expiringSoon?.length || 0}</div>
              </div>
              <div className="bg-white/5 border border-white/10 p-6 rounded-2xl">
                <div className="flex items-center gap-4 mb-2 text-green-400">
                  <CheckCircle2 className="w-5 h-5" />
                  <span className="text-sm font-bold uppercase tracking-widest">Compliant</span>
                </div>
                <div className="text-4xl font-black text-white">{data?.complianceStats?.compliant || 0}</div>
              </div>
              <div className="bg-white/5 border border-white/10 p-6 rounded-2xl">
                <div className="flex items-center gap-4 mb-2 text-blue-400">
                  <TrendingUp className="w-5 h-5" />
                  <span className="text-sm font-bold uppercase tracking-widest">Suggestions</span>
                </div>
                <div className="text-4xl font-black text-white">{data?.mergeSuggestions?.length || 0}</div>
              </div>
            </div>

            {/* TAB CONTENT: EXPIRY TRACKING */}
            {activeTab === 'expiry' && (
              <div className="bg-white/10 backdrop-blur-xl border border-white/20 rounded-3xl overflow-hidden shadow-2xl">
                <div className="p-6 border-b border-white/10 flex flex-col md:flex-row justify-between gap-4">
                  <h2 className="text-xl font-bold text-white flex items-center gap-2">
                    <Calendar className="text-purple-400" />
                    SOP Expiry Matrix
                  </h2>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                    <input 
                      type="text"
                      placeholder="Search SOPs..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="bg-white/5 border border-white/10 rounded-xl py-2 pl-10 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 text-white min-w-[300px]"
                    />
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="bg-white/5 text-gray-400 text-xs font-bold uppercase tracking-wider">
                        <th className="px-6 py-4">SOP Details</th>
                        <th className="px-6 py-4">Department</th>
                        <th className="px-6 py-4">Expiry Date</th>
                        <th className="px-6 py-4">Compliance Status</th>
                        <th className="px-6 py-4 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {filteredSops.map((sop: SOP) => (
                        <tr key={sop._id} className="hover:bg-white/5 transition-colors group">
                          <td className="px-6 py-4">
                            <div className="text-white font-bold text-sm mb-1">{sop.sopName}</div>
                            <div className="text-gray-500 text-xs font-mono">{sop.sopIdentifier}</div>
                          </td>
                          <td className="px-6 py-4">
                            <span className="px-3 py-1 bg-white/5 border border-white/10 rounded-lg text-xs text-gray-300">
                              {sop.department}
                            </span>
                          </td>
                          <td className="px-6 py-4">
                            <div className={`text-sm font-bold ${getStatusColor(sop.expiryDate).split(' ')[0]}`}>
                              {sop.expiryDate ? format(new Date(sop.expiryDate), 'MMM dd, yyyy') : 'No Date Set'}
                            </div>
                            <div className="text-[10px] text-gray-500 uppercase font-bold mt-1">
                              {sop.expiryDate ? (new Date(sop.expiryDate) < new Date() ? 'EXPIRED' : 'VALID') : 'PENDING REVIEW'}
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <span className={`px-3 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest border ${getComplianceBadge(sop.complianceStatus)}`}>
                              {sop.complianceStatus || 'pending'}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-right">
                            <button className="p-2 text-gray-400 hover:text-white transition-colors bg-white/5 rounded-lg border border-white/10">
                              <Info className="w-4 h-4" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {filteredSops.length === 0 && (
                    <div className="p-20 text-center text-gray-500 italic">No SOPs match your current view</div>
                  )}
                </div>
              </div>
            )}

            {/* TAB CONTENT: MERGE SUGGESTIONS */}
            {activeTab === 'merge' && (
              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <div className="bg-blue-500/10 border border-blue-500/20 p-4 rounded-2xl flex items-center gap-4 max-w-2xl">
                    <Info className="text-blue-400 flex-shrink-0" />
                    <p className="text-sm text-blue-100">AI has analyzed your SOP repository to find redundant or highly similar procedures that could be unified for better organization.</p>
                  </div>
                  <button 
                    onClick={handleAnalyzeMerges}
                    disabled={analyzing}
                    className="px-6 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-xl font-bold flex items-center gap-2 hover:scale-105 active:scale-95 transition-all shadow-xl disabled:opacity-50"
                  >
                    {analyzing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Merge className="w-4 h-4" />}
                    Refresh Analysis
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {data?.mergeSuggestions?.map((suggestion: MergeSuggestion) => (
                    <div key={suggestion._id} className="bg-white/10 backdrop-blur-xl border border-white/20 rounded-3xl p-6 shadow-xl relative overflow-hidden group">
                      <div className="absolute top-0 right-0 p-4">
                        <div className="flex flex-col items-end">
                          <span className="text-[10px] text-gray-500 font-black uppercase tracking-wider mb-1">Similarity</span>
                          <span className="text-2xl font-black text-blue-400">{suggestion.similarityScore}%</span>
                        </div>
                      </div>
                      
                      <div className="mb-6">
                        <div className="flex items-center gap-2 text-xs font-bold text-gray-500 uppercase tracking-widest mb-3">
                          <Merge className="w-3 h-3" /> Potential Unity
                        </div>
                        <div className="space-y-3">
                          {suggestion.sopNames.map((name, i) => (
                            <div key={i} className="flex items-center gap-3">
                              <div className="w-8 h-8 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center text-xs font-bold text-gray-400">{i+1}</div>
                              <div className="text-white font-bold text-sm truncate">{name}</div>
                            </div>
                          ))}
                        </div>
                      </div>

                      <div className="bg-white/5 border border-white/10 p-4 rounded-xl mb-6">
                        <div className="text-[10px] text-gray-500 font-bold uppercase mb-2">AI Reasonings</div>
                        <p className="text-gray-300 text-xs italic leading-relaxed">"{suggestion.reason}"</p>
                      </div>

                      <div className="flex gap-2">
                        <button className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl transition-all shadow-lg">Review Comparison</button>
                        <button className="px-4 py-2.5 bg-white/5 hover:bg-white/10 text-gray-300 text-xs font-bold rounded-xl border border-white/10 transition-all">Dismiss</button>
                      </div>
                    </div>
                  ))}
                  {(!data?.mergeSuggestions || data.mergeSuggestions.length === 0) && (
                    <div className="md:col-span-2 p-20 text-center border-2 border-dashed border-white/10 rounded-3xl">
                      <div className="bg-white/5 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
                        <CheckCircle2 className="text-gray-600 w-8 h-8" />
                      </div>
                      <p className="text-gray-500 font-bold">No redundant SOPs detected yet. Try running a fresh analysis.</p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* TAB CONTENT: COMPLIANCE CHECK */}
            {activeTab === 'compliance' && (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Upload Section */}
                <div className="lg:col-span-1 space-y-6">
                  <div className="bg-white/10 backdrop-blur-xl border border-white/20 rounded-3xl p-8 shadow-xl">
                    <h3 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
                       <Upload className="text-purple-400" />
                       Upload Standard Guidelines
                    </h3>
                    <p className="text-gray-400 text-sm mb-8 leading-relaxed">Upload your official SOP Policy or Guidelines document. AI will extract core requirements and audit your existing SOPs against them.</p>
                    
                    <div 
                      className="border-2 border-dashed border-white/10 rounded-2xl p-8 text-center hover:border-purple-500/50 hover:bg-white/5 transition-all cursor-pointer group mb-6"
                      onClick={() => document.getElementById('guideline-upload')?.click()}
                    >
                      <input 
                        type="file" 
                        id="guideline-upload" 
                        className="hidden" 
                        accept=".pdf,.docx"
                        onChange={(e) => setGuidelineFile(e.target.files?.[0] || null)}
                      />
                      <History className="w-10 h-10 text-gray-500 mx-auto mb-4 group-hover:text-purple-400 transition-all" />
                      <p className="text-white font-bold text-sm mb-1">{guidelineFile ? guidelineFile.name : 'Select Policy Document'}</p>
                      <p className="text-gray-500 text-[10px] uppercase font-bold tracking-widest">PDF or DOCX (Max 10MB)</p>
                    </div>

                    <button 
                      onClick={handleUploadGuideline}
                      disabled={!guidelineFile || uploadingGuideline}
                      className="w-full py-4 bg-gradient-to-r from-purple-600 to-pink-600 text-white rounded-2xl font-black text-sm uppercase tracking-widest hover:brightness-110 active:scale-95 transition-all shadow-2xl disabled:opacity-50"
                    >
                      {uploadingGuideline ? <Loader2 className="w-5 h-5 animate-spin mx-auto" /> : 'Run Compliance Audit'}
                    </button>
                  </div>

                  <div className="bg-emerald-500/10 border border-emerald-500/20 p-6 rounded-3xl">
                    <h4 className="text-emerald-400 font-bold text-sm mb-4 flex items-center gap-2">
                      <TrendingUp className="w-4 h-4" /> Audit Methodology
                    </h4>
                    <ul className="space-y-3">
                      <li className="flex items-start gap-3 text-xs text-emerald-100/70">
                        <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 mt-1.5" />
                        Gemini AI identifies mandatory structure elements.
                      </li>
                      <li className="flex items-start gap-3 text-xs text-emerald-100/70">
                        <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 mt-1.5" />
                        Each procedure is cross-checked for missing sections.
                      </li>
                      <li className="flex items-start gap-3 text-xs text-emerald-100/70">
                        <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 mt-1.5" />
                        Adherence score is calculated based on coverage.
                      </li>
                    </ul>
                  </div>
                </div>

                {/* Audit Results */}
                <div className="lg:col-span-2 space-y-6">
                  <div className="bg-white/10 backdrop-blur-xl border border-white/20 rounded-3xl p-8 shadow-xl">
                    <h3 className="text-xl font-bold text-white mb-8 border-b border-white/10 pb-4">Recent Audit Insights</h3>
                    
                    <div className="space-y-4">
                      {filteredSops.filter((s: SOP) => s.complianceStatus && s.complianceStatus !== 'pending').map((sop: SOP) => (
                        <div key={sop._id} className="bg-white/5 border border-white/10 rounded-2xl p-6 hover:bg-white/[0.08] transition-all">
                          <div className="flex items-center justify-between mb-4">
                            <div>
                              <h4 className="text-white font-bold">{sop.sopName}</h4>
                              <p className="text-gray-500 text-xs font-mono">{sop.sopIdentifier}</p>
                            </div>
                            <span className={`px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest border ${getComplianceBadge(sop.complianceStatus)}`}>
                              {sop.complianceStatus}
                            </span>
                          </div>
                          
                          <div className="bg-black/20 p-4 rounded-xl">
                            <div className="text-[10px] text-gray-500 font-bold uppercase tracking-widest mb-2">Evaluator Notes</div>
                            <p className="text-gray-300 text-xs leading-relaxed whitespace-pre-line">{sop.complianceNotes}</p>
                          </div>
                        </div>
                      ))}
                      {filteredSops.filter((s: SOP) => s.complianceStatus && s.complianceStatus !== 'pending').length === 0 && (
                        <div className="py-20 text-center opacity-30 grayscale">
                          <ShieldCheck className="w-16 h-16 mx-auto mb-4" />
                          <p className="text-xl font-bold uppercase tracking-widest">No audit data available</p>
                          <p className="text-sm">Run a compliance audit to see results here</p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
