'use client';

import { useState, useEffect } from 'react';
import { Eye, User, FileText, Clock, MapPin, Monitor, Filter, Download } from 'lucide-react';

interface AccessLog {
  _id: string;
  userId: string;
  username: string;
  userEmail?: string;
  resourceType: string;
  resourceId?: string;
  resourceName?: string;
  action: string;
  ipAddress?: string;
  userAgent?: string;
  timestamp: string;
  metadata?: any;
}

export default function AccessLogsViewer() {
  const [logs, setLogs] = useState<AccessLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'mcq-bank' | 'mcq-test' | 'sop-library'>('all');
  const [limit, setLimit] = useState(50);

  useEffect(() => {
    fetchLogs();
  }, [limit]);

  const fetchLogs = async () => {
    try {
      setLoading(true);
      const response = await fetch(`/api/admin/access-logs?type=recent&limit=${limit}`);
      const data = await response.json();
      
      if (data.success) {
        setLogs(data.logs);
      }
    } catch (error) {
      console.error('Error fetching access logs:', error);
    } finally {
      setLoading(false);
    }
  };

  const filteredLogs = filter === 'all' 
    ? logs 
    : logs.filter(log => log.resourceType === filter);

  const getActionColor = (action: string) => {
    switch (action) {
      case 'view': return 'text-blue-400';
      case 'access': return 'text-green-400';
      case 'start-test': return 'text-yellow-400';
      case 'submit-test': return 'text-purple-400';
      case 'view-result': return 'text-pink-400';
      case 'download': return 'text-red-400';
      default: return 'text-gray-400';
    }
  };

  const getResourceTypeIcon = (type: string) => {
    switch (type) {
      case 'mcq-bank': return '📚';
      case 'mcq-test': return '✅';
      case 'sop-library': return '📄';
      case 'test-result': return '📊';
      case 'review-center': return '🔍';
      default: return '📁';
    }
  };

  const formatTimestamp = (timestamp: string) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
  };

  const exportToCSV = () => {
    const csv = [
      ['Timestamp', 'Username', 'Email', 'Resource Type', 'Resource Name', 'Action', 'IP Address'].join(','),
      ...filteredLogs.map(log => [
        new Date(log.timestamp).toISOString(),
        log.username,
        log.userEmail || '',
        log.resourceType,
        log.resourceName || log.resourceId || '',
        log.action,
        log.ipAddress || ''
      ].join(','))
    ].join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `access-logs-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white flex items-center gap-3">
            <Eye className="h-7 w-7 text-purple-400" />
            Access Logs
          </h2>
          <p className="text-gray-400 mt-1">Monitor user activity and resource access</p>
        </div>
        <button
          onClick={exportToCSV}
          className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg font-medium transition-all flex items-center gap-2"
        >
          <Download className="h-4 w-4" />
          Export CSV
        </button>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-4 bg-white/5 p-4 rounded-xl border border-white/10">
        <Filter className="h-5 w-5 text-gray-400" />
        <div className="flex gap-2">
          {['all', 'mcq-bank', 'mcq-test', 'sop-library'].map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f as any)}
              className={`px-4 py-2 rounded-lg font-medium transition-all ${
                filter === f
                  ? 'bg-purple-600 text-white'
                  : 'bg-white/5 text-gray-400 hover:bg-white/10'
              }`}
            >
              {f === 'all' ? 'All' : f.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')}
            </button>
          ))}
        </div>
        <select
          value={limit}
          onChange={(e) => setLimit(parseInt(e.target.value))}
          className="ml-auto px-4 py-2 bg-white/5 text-white rounded-lg border border-white/10 focus:outline-none focus:border-purple-500"
        >
          <option value={25}>Last 25</option>
          <option value={50}>Last 50</option>
          <option value={100}>Last 100</option>
          <option value={200}>Last 200</option>
        </select>
      </div>

      {/* Logs Table */}
      <div className="bg-white/5 rounded-xl border border-white/10 overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-gray-400">
            <div className="animate-spin h-8 w-8 border-4 border-purple-500 border-t-transparent rounded-full mx-auto mb-4"></div>
            Loading access logs...
          </div>
        ) : filteredLogs.length === 0 ? (
          <div className="p-12 text-center text-gray-400">
            <Eye className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>No access logs found</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-white/5 border-b border-white/10">
                <tr>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-gray-300">Time</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-gray-300">User</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-gray-300">Resource</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-gray-300">Action</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-gray-300">IP Address</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-gray-300">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {filteredLogs.map((log) => (
                  <tr key={log._id} className="hover:bg-white/5 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2 text-sm text-gray-400">
                        <Clock className="h-4 w-4" />
                        {formatTimestamp(log.timestamp)}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <User className="h-4 w-4 text-blue-400" />
                        <div>
                          <div className="text-white font-medium">{log.username}</div>
                          {log.userEmail && (
                            <div className="text-xs text-gray-400">{log.userEmail}</div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className="text-xl">{getResourceTypeIcon(log.resourceType)}</span>
                        <div>
                          <div className="text-white text-sm">{log.resourceName || log.resourceId || 'N/A'}</div>
                          <div className="text-xs text-gray-400">{log.resourceType}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-3 py-1 rounded-full text-xs font-medium ${getActionColor(log.action)} bg-white/10`}>
                        {log.action}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2 text-sm text-gray-400">
                        <MapPin className="h-4 w-4" />
                        {log.ipAddress || 'N/A'}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {log.metadata && Object.keys(log.metadata).length > 0 && (
                        <div className="text-xs text-gray-400">
                          {log.metadata.questionsViewed && (
                            <div>Questions: {log.metadata.questionsViewed}</div>
                          )}
                          {log.metadata.testScore !== undefined && (
                            <div>Score: {log.metadata.testScore}%</div>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-gradient-to-br from-blue-500/20 to-blue-600/20 p-4 rounded-xl border border-blue-500/30">
          <div className="text-blue-400 text-sm font-medium">Total Logs</div>
          <div className="text-white text-2xl font-bold mt-1">{filteredLogs.length}</div>
        </div>
        <div className="bg-gradient-to-br from-green-500/20 to-green-600/20 p-4 rounded-xl border border-green-500/30">
          <div className="text-green-400 text-sm font-medium">Unique Users</div>
          <div className="text-white text-2xl font-bold mt-1">
            {new Set(filteredLogs.map(l => l.userId)).size}
          </div>
        </div>
        <div className="bg-gradient-to-br from-purple-500/20 to-purple-600/20 p-4 rounded-xl border border-purple-500/30">
          <div className="text-purple-400 text-sm font-medium">MCQ Views</div>
          <div className="text-white text-2xl font-bold mt-1">
            {filteredLogs.filter(l => l.resourceType === 'mcq-bank').length}
          </div>
        </div>
        <div className="bg-gradient-to-br from-pink-500/20 to-pink-600/20 p-4 rounded-xl border border-pink-500/30">
          <div className="text-pink-400 text-sm font-medium">Tests Taken</div>
          <div className="text-white text-2xl font-bold mt-1">
            {filteredLogs.filter(l => l.action === 'start-test').length}
          </div>
        </div>
      </div>
    </div>
  );
}
