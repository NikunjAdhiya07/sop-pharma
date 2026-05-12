'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthGuard } from '@/hooks/useAuthGuard';
import { 
  History, 
  ArrowLeft, 
  Search, 
  Filter, 
  Calendar,
  User,
  FileText,
  Activity,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Eye,
  Download,
  RefreshCw,
  TrendingUp,
  AlertCircle,
  CheckCircle,
  XCircle,
  Info
} from 'lucide-react';
import { format } from 'date-fns';

interface AuditLog {
  _id: string;
  logId: string;
  timestamp: string;
  userId: string;
  userName: string;
  userRole?: string;
  department?: string;
  actionType: string;
  module: string;
  sopId?: string;
  sopIdentifier?: string;
  sopName?: string;
  description: string;
  oldValue?: any;
  newValue?: any;
  fieldsChanged?: string[];
  ipAddress: string;
  userAgent: string;
  browser?: string;
  device?: string;
  os?: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  createdAt: string;
}

export default function AuditLogsPage() {
  useAuthGuard();
  const router = useRouter();
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedLog, setSelectedLog] = useState<AuditLog | null>(null);
  
  // Filters
  const [searchText, setSearchText] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [selectedUser, setSelectedUser] = useState('');
  const [selectedDepartment, setSelectedDepartment] = useState('');
  const [selectedActionType, setSelectedActionType] = useState('');
  const [selectedModule, setSelectedModule] = useState('');
  
  // Pagination
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  
  // Statistics
  const [stats, setStats] = useState<any>(null);
  
  // Filter visibility
  const [showFilters, setShowFilters] = useState(false);

  useEffect(() => {
    fetchLogs();
  }, [page, selectedActionType, selectedModule, selectedDepartment]);

  useEffect(() => {
    fetchStatistics();
  }, []);

  const fetchLogs = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams({
        type: 'list',
        page: page.toString(),
        limit: '20',
      });
      
      if (searchText) params.append('searchText', searchText);
      if (startDate) params.append('startDate', new Date(startDate).toISOString());
      if (endDate) params.append('endDate', new Date(endDate).toISOString());
      if (selectedUser) params.append('userId', selectedUser);
      if (selectedDepartment) params.append('department', selectedDepartment);
      if (selectedActionType) params.append('actionType', selectedActionType);
      if (selectedModule) params.append('module', selectedModule);
      
      const response = await fetch(`/api/audit-logs-sop?${params}`);
      const data = await response.json();
      
      if (data.success) {
        setLogs(data.logs);
        setTotal(data.total);
        setTotalPages(data.totalPages);
      }
    } catch (error) {
      console.error('Error fetching audit logs:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchStatistics = async () => {
    try {
      const params = new URLSearchParams({ type: 'statistics' });
      if (startDate) params.append('startDate', new Date(startDate).toISOString());
      if (endDate) params.append('endDate', new Date(endDate).toISOString());
      
      const response = await fetch(`/api/audit-logs-sop?${params}`);
      const data = await response.json();
      
      if (data.success) {
        setStats(data.statistics);
      }
    } catch (error) {
      console.error('Error fetching statistics:', error);
    }
  };

  const handleSearch = () => {
    setPage(1);
    fetchLogs();
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical': return 'bg-red-500/20 text-red-300 border-red-500/50';
      case 'high': return 'bg-orange-500/20 text-orange-300 border-orange-500/50';
      case 'medium': return 'bg-yellow-500/20 text-yellow-300 border-yellow-500/50';
      case 'low': return 'bg-blue-500/20 text-blue-300 border-blue-500/50';
      default: return 'bg-gray-500/20 text-gray-300 border-gray-500/50';
    }
  };

  const getSeverityIcon = (severity: string) => {
    switch (severity) {
      case 'critical': return <AlertCircle className="w-4 h-4" />;
      case 'high': return <XCircle className="w-4 h-4" />;
      case 'medium': return <Info className="w-4 h-4" />;
      case 'low': return <CheckCircle className="w-4 h-4" />;
      default: return <Info className="w-4 h-4" />;
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-purple-950 to-slate-950">
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-8">
          <button
            onClick={() => router.push('/sop-monitoring')}
            className="flex items-center text-purple-300 hover:text-white mb-4 transition-colors"
          >
            <ArrowLeft className="w-5 h-5 mr-2" />
            Back to SOP Monitoring
          </button>
          
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-4xl font-bold text-white mb-2 flex items-center">
                <History className="w-10 h-10 mr-4 text-purple-400" />
                Audit Logs
              </h1>
              <p className="text-gray-400">Complete audit trail of all SOP activities</p>
            </div>
            
            <button
              onClick={() => {
                fetchLogs();
                fetchStatistics();
              }}
              className="flex items-center gap-2 bg-purple-500/20 hover:bg-purple-500/30 text-purple-300 px-4 py-2 rounded-lg border border-purple-500/50 transition-all"
            >
              <RefreshCw className="w-4 h-4" />
              Refresh
            </button>
          </div>
        </div>

        {/* Statistics Cards */}
        {stats && (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
            <button
              onClick={() => {
                setSearchText('');
                setSelectedActionType('');
                setSelectedModule('');
                setSelectedDepartment('');
                setPage(1);
                fetchLogs();
              }}
              className="bg-gradient-to-br from-blue-500/10 to-blue-600/10 border border-blue-500/30 rounded-xl p-6 hover:from-blue-500/20 hover:to-blue-600/20 hover:border-blue-500/50 transition-all transform hover:scale-105 cursor-pointer text-left"
            >
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm text-blue-300 font-semibold">Total Logs</p>
                <Activity className="w-5 h-5 text-blue-400" />
              </div>
              <p className="text-3xl font-bold text-white">{stats.totalLogs}</p>
              <p className="text-xs text-blue-400 mt-2">Click to show all</p>
            </button>
            
            <div className="bg-gradient-to-br from-purple-500/10 to-purple-600/10 border border-purple-500/30 rounded-xl p-6 cursor-default">
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm text-purple-300 font-semibold">Unique Users</p>
                <User className="w-5 h-5 text-purple-400" />
              </div>
              <p className="text-3xl font-bold text-white">{stats.uniqueUsers}</p>
            </div>
            
            <div className="bg-gradient-to-br from-emerald-500/10 to-emerald-600/10 border border-emerald-500/30 rounded-xl p-6 cursor-default">
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm text-emerald-300 font-semibold">Unique SOPs</p>
                <FileText className="w-5 h-5 text-emerald-400" />
              </div>
              <p className="text-3xl font-bold text-white">{stats.uniqueSOPs}</p>
            </div>
            
            <button
              onClick={() => {
                if (stats.actionTypeCounts[0]?._id) {
                  setSelectedActionType(stats.actionTypeCounts[0]._id);
                  setPage(1);
                }
              }}
              disabled={!stats.actionTypeCounts[0]?._id}
              className="bg-gradient-to-br from-pink-500/10 to-pink-600/10 border border-pink-500/30 rounded-xl p-6 hover:from-pink-500/20 hover:to-pink-600/20 hover:border-pink-500/50 transition-all transform hover:scale-105 cursor-pointer text-left disabled:cursor-not-allowed disabled:opacity-50"
            >
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm text-pink-300 font-semibold">Top Action</p>
                <TrendingUp className="w-5 h-5 text-pink-400" />
              </div>
              <p className="text-lg font-bold text-white">
                {stats.actionTypeCounts[0]?._id?.replace(/_/g, ' ') || 'N/A'}
              </p>
              {stats.actionTypeCounts[0]?._id && (
                <p className="text-xs text-pink-400 mt-2">Click to filter</p>
              )}
            </button>
          </div>
        )}

        {/* Filters */}
        <div className="bg-white/5 border border-white/10 rounded-xl overflow-hidden mb-6">
          <button
            onClick={() => setShowFilters(!showFilters)}
            className="w-full p-6 flex items-center justify-between hover:bg-white/5 transition-colors"
          >
            <div className="flex items-center gap-2">
              <Filter className="w-5 h-5 text-purple-400" />
              <h2 className="text-xl font-bold text-white">Filters</h2>
              {(searchText || startDate || endDate || selectedActionType || selectedModule || selectedDepartment) && (
                <span className="ml-2 px-2 py-1 bg-purple-500/20 text-purple-300 text-xs rounded-full border border-purple-500/50">
                  Active
                </span>
              )}
            </div>
            {showFilters ? (
              <ChevronUp className="w-5 h-5 text-purple-400" />
            ) : (
              <ChevronDown className="w-5 h-5 text-purple-400" />
            )}
          </button>
          
          {showFilters && (
            <div className="px-6 pb-6 border-t border-white/10">
              <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-4 mt-4">
                {/* Search */}
                <div className="md:col-span-2">
                  <label className="block text-sm font-semibold text-purple-300 mb-2">
                    Search
                  </label>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                      type="text"
                      value={searchText}
                      onChange={(e) => setSearchText(e.target.value)}
                      onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
                      placeholder="Search by SOP, user, or description..."
                      className="w-full pl-10 pr-4 py-2 bg-white/5 border border-white/20 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-purple-500"
                    />
                  </div>
                </div>
                
                {/* Date Range */}
                <div>
                  <label className="block text-sm font-semibold text-purple-300 mb-2">
                    Start Date
                  </label>
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="w-full px-4 py-2 bg-white/5 border border-white/20 rounded-lg text-white focus:outline-none focus:border-purple-500"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-semibold text-purple-300 mb-2">
                    End Date
                  </label>
                  <input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="w-full px-4 py-2 bg-white/5 border border-white/20 rounded-lg text-white focus:outline-none focus:border-purple-500"
                  />
                </div>
                
                {/* Action Type */}
                <div>
                  <label className="block text-sm font-semibold text-purple-300 mb-2">
                    Action Type
                  </label>
                  <select
                    value={selectedActionType}
                    onChange={(e) => setSelectedActionType(e.target.value)}
                    className="w-full px-4 py-2 bg-white/5 border border-white/20 rounded-lg text-white focus:outline-none focus:border-purple-500"
                  >
                    <option value="" className="bg-slate-900">All Actions</option>
                    <option value="sop_created" className="bg-slate-900">SOP Created</option>
                    <option value="sop_edited" className="bg-slate-900">SOP Edited</option>
                    <option value="sop_viewed" className="bg-slate-900">SOP Viewed</option>
                    <option value="sop_downloaded" className="bg-slate-900">SOP Downloaded</option>
                    <option value="sop_review_date_changed" className="bg-slate-900">Review Date Changed</option>
                    <option value="sop_expiry_date_changed" className="bg-slate-900">Expiry Date Changed</option>
                    <option value="sop_version_updated" className="bg-slate-900">Version Updated</option>
                  </select>
                </div>
                
                {/* Module */}
                <div>
                  <label className="block text-sm font-semibold text-purple-300 mb-2">
                    Module
                  </label>
                  <select
                    value={selectedModule}
                    onChange={(e) => setSelectedModule(e.target.value)}
                    className="w-full px-4 py-2 bg-white/5 border border-white/20 rounded-lg text-white focus:outline-none focus:border-purple-500"
                  >
                    <option value="" className="bg-slate-900">All Modules</option>
                    <option value="SOP Master" className="bg-slate-900">SOP Master</option>
                    <option value="Review" className="bg-slate-900">Review</option>
                    <option value="Upload" className="bg-slate-900">Upload</option>
                    <option value="Exam" className="bg-slate-900">Exam</option>
                    <option value="Monitoring" className="bg-slate-900">Monitoring</option>
                    <option value="Library" className="bg-slate-900">Library</option>
                    <option value="Admin" className="bg-slate-900">Admin</option>
                  </select>
                </div>
                
                {/* Department */}
                <div>
                  <label className="block text-sm font-semibold text-purple-300 mb-2">
                    Department
                  </label>
                  <input
                    type="text"
                    value={selectedDepartment}
                    onChange={(e) => setSelectedDepartment(e.target.value)}
                    placeholder="Enter department..."
                    className="w-full px-4 py-2 bg-white/5 border border-white/20 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-purple-500"
                  />
                </div>
                
                {/* Search Button */}
                <div className="flex items-end">
                  <button
                    onClick={handleSearch}
                    className="w-full px-6 py-2 bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white rounded-lg font-semibold transition-all transform hover:scale-105 shadow-lg shadow-purple-500/30"
                  >
                    Apply Filters
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Logs Table */}
        <div className="bg-white/5 border border-white/10 rounded-xl overflow-hidden">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-20">
              <div className="w-12 h-12 border-4 border-purple-500 border-t-transparent rounded-full animate-spin mb-4"></div>
              <p className="text-gray-400">Loading audit logs...</p>
            </div>
          ) : logs.length === 0 ? (
            <div className="text-center py-20 px-6">
              <History className="w-16 h-16 text-gray-500 mx-auto mb-4" />
              <p className="text-gray-400 text-lg font-semibold mb-2">No audit logs found</p>
              <p className="text-sm text-gray-500">Audit logs will appear here once you perform SOP actions</p>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-white/10 bg-white/5">
                      <th className="px-4 py-4 text-left text-xs font-bold text-purple-300 uppercase tracking-wider">Timestamp</th>
                      <th className="px-4 py-4 text-left text-xs font-bold text-purple-300 uppercase tracking-wider">User</th>
                      <th className="px-4 py-4 text-left text-xs font-bold text-purple-300 uppercase tracking-wider">Action</th>
                      <th className="px-4 py-4 text-left text-xs font-bold text-purple-300 uppercase tracking-wider">SOP</th>
                      <th className="px-4 py-4 text-left text-xs font-bold text-purple-300 uppercase tracking-wider">Description</th>
                      <th className="px-4 py-4 text-left text-xs font-bold text-purple-300 uppercase tracking-wider">Severity</th>
                      <th className="px-4 py-4 text-left text-xs font-bold text-purple-300 uppercase tracking-wider">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {logs.map((log) => (
                      <tr key={log._id} className="hover:bg-white/5 transition-colors">
                        <td className="px-4 py-4 whitespace-nowrap">
                          <div className="text-sm text-white">
                            {format(new Date(log.timestamp), 'MMM dd, yyyy')}
                          </div>
                          <div className="text-xs text-gray-500">
                            {format(new Date(log.timestamp), 'HH:mm:ss')}
                          </div>
                        </td>
                        <td className="px-4 py-4">
                          <div className="text-sm font-semibold text-white">{log.userName}</div>
                          <div className="text-xs text-gray-500">{log.department || 'N/A'}</div>
                        </td>
                        <td className="px-4 py-4">
                          <span className="px-2 py-1 bg-blue-500/20 text-blue-300 border border-blue-500/50 rounded text-xs font-semibold">
                            {log.actionType.replace(/_/g, ' ').toUpperCase()}
                          </span>
                          <div className="text-xs text-gray-500 mt-1">{log.module}</div>
                        </td>
                        <td className="px-4 py-4">
                          <div className="text-sm text-white font-mono">{log.sopIdentifier || 'N/A'}</div>
                          {log.sopName && (
                            <div className="text-xs text-gray-500 truncate max-w-xs">{log.sopName}</div>
                          )}
                        </td>
                        <td className="px-4 py-4">
                          <div className="text-sm text-gray-300 max-w-md truncate">{log.description}</div>
                        </td>
                        <td className="px-4 py-4">
                          <span className={`px-2 py-1 rounded text-xs font-semibold border flex items-center gap-1 w-fit ${getSeverityColor(log.severity)}`}>
                            {getSeverityIcon(log.severity)}
                            {log.severity.toUpperCase()}
                          </span>
                        </td>
                        <td className="px-4 py-4">
                          <button
                            onClick={() => setSelectedLog(log)}
                            className="p-2 text-purple-400 hover:bg-purple-500/20 rounded-lg transition-all border border-transparent hover:border-purple-500/50"
                            title="View Details"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              <div className="flex items-center justify-between px-6 py-4 border-t border-white/10 bg-white/5">
                <p className="text-sm text-gray-400">
                  Showing <span className="text-white font-bold">{(page - 1) * 20 + 1}</span> to{' '}
                  <span className="text-white font-bold">{Math.min(page * 20, total)}</span> of{' '}
                  <span className="text-white font-bold">{total}</span> logs
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => setPage(page - 1)}
                    disabled={page === 1}
                    className="p-2 bg-white/5 hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed rounded-lg border border-white/20 transition-all text-white"
                  >
                    <ChevronLeft className="w-5 h-5" />
                  </button>
                  <span className="px-4 py-2 bg-white/5 rounded-lg border border-white/20 text-white font-semibold">
                    Page {page} of {totalPages}
                  </span>
                  <button
                    onClick={() => setPage(page + 1)}
                    disabled={page === totalPages}
                    className="p-2 bg-white/5 hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed rounded-lg border border-white/20 transition-all text-white"
                  >
                    <ChevronRight className="w-5 h-5" />
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Detail Modal */}
      {selectedLog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-gradient-to-br from-slate-900 to-purple-900 rounded-2xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto border border-white/20">
            <div className="p-6 border-b border-white/10 sticky top-0 bg-gradient-to-r from-purple-900/90 to-pink-900/90 backdrop-blur-xl z-10">
              <div className="flex items-center justify-between">
                <h3 className="text-2xl font-bold text-white flex items-center">
                  <FileText className="w-7 h-7 mr-3 text-purple-400" />
                  Audit Log Details
                </h3>
                <button
                  onClick={() => setSelectedLog(null)}
                  className="text-gray-400 hover:text-white hover:bg-white/10 p-2 rounded-lg transition-all"
                >
                  <XCircle className="w-6 h-6" />
                </button>
              </div>
            </div>

            <div className="p-6 space-y-6">
              {/* Description */}
              <div className="bg-white/5 rounded-xl p-4 border border-white/10">
                <p className="text-sm text-gray-400 mb-2">Description</p>
                <p className="text-lg text-white font-semibold">{selectedLog.description}</p>
              </div>

              {/* Basic Info */}
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-white/5 rounded-xl p-4 border border-white/10">
                  <p className="text-sm text-gray-400 mb-1">Log ID</p>
                  <p className="font-mono text-white text-sm">{selectedLog.logId}</p>
                </div>
                <div className="bg-white/5 rounded-xl p-4 border border-white/10">
                  <p className="text-sm text-gray-400 mb-1">Timestamp</p>
                  <p className="text-white">{format(new Date(selectedLog.timestamp), 'MMM dd, yyyy HH:mm:ss')}</p>
                </div>
                <div className="bg-white/5 rounded-xl p-4 border border-white/10">
                  <p className="text-sm text-gray-400 mb-1">User</p>
                  <p className="text-white font-semibold">{selectedLog.userName}</p>
                  <p className="text-xs text-gray-500">{selectedLog.userRole}</p>
                </div>
                <div className="bg-white/5 rounded-xl p-4 border border-white/10">
                  <p className="text-sm text-gray-400 mb-1">Department</p>
                  <p className="text-white">{selectedLog.department || 'N/A'}</p>
                </div>
                <div className="bg-white/5 rounded-xl p-4 border border-white/10">
                  <p className="text-sm text-gray-400 mb-1">Module</p>
                  <p className="text-white">{selectedLog.module}</p>
                </div>
                <div className="bg-white/5 rounded-xl p-4 border border-white/10">
                  <p className="text-sm text-gray-400 mb-1">Severity</p>
                  <span className={`px-3 py-1 rounded text-xs font-semibold border inline-flex items-center gap-1 ${getSeverityColor(selectedLog.severity)}`}>
                    {getSeverityIcon(selectedLog.severity)}
                    {selectedLog.severity.toUpperCase()}
                  </span>
                </div>
              </div>

              {/* SOP Info */}
              {selectedLog.sopIdentifier && (
                <div className="bg-blue-500/10 rounded-xl p-4 border border-blue-500/30">
                  <p className="text-sm text-blue-300 font-semibold mb-3">SOP Information</p>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-xs text-gray-400 mb-1">SOP Identifier</p>
                      <p className="text-white font-mono">{selectedLog.sopIdentifier}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-400 mb-1">SOP Name</p>
                      <p className="text-white">{selectedLog.sopName || 'N/A'}</p>
                    </div>
                  </div>
                </div>
              )}

              {/* Changes */}
              {selectedLog.fieldsChanged && selectedLog.fieldsChanged.length > 0 && (
                <div className="bg-yellow-500/10 rounded-xl p-4 border border-yellow-500/30">
                  <p className="text-sm text-yellow-300 font-semibold mb-3">Changes Made</p>
                  <div className="space-y-3">
                    {selectedLog.fieldsChanged.map((field) => (
                      <div key={field} className="bg-white/5 rounded-lg p-3">
                        <p className="text-xs text-gray-400 mb-2 font-semibold">{field}</p>
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <p className="text-xs text-red-400 mb-1">Old Value</p>
                            <p className="text-sm text-white font-mono bg-red-500/10 px-2 py-1 rounded">
                              {JSON.stringify(selectedLog.oldValue?.[field]) || 'N/A'}
                            </p>
                          </div>
                          <div>
                            <p className="text-xs text-emerald-400 mb-1">New Value</p>
                            <p className="text-sm text-white font-mono bg-emerald-500/10 px-2 py-1 rounded">
                              {JSON.stringify(selectedLog.newValue?.[field]) || 'N/A'}
                            </p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Technical Details */}
              <div className="bg-white/5 rounded-xl p-4 border border-white/10">
                <p className="text-sm text-gray-400 font-semibold mb-3">Technical Details</p>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="text-xs text-gray-500 mb-1">IP Address</p>
                    <p className="text-white font-mono">{selectedLog.ipAddress}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 mb-1">Browser</p>
                    <p className="text-white">{selectedLog.browser || 'Unknown'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 mb-1">Device</p>
                    <p className="text-white">{selectedLog.device || 'Unknown'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 mb-1">OS</p>
                    <p className="text-white">{selectedLog.os || 'Unknown'}</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
