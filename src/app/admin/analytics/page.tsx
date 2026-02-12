'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import PageHeader from '@/components/PageHeader';
import {
  TrendingUp,
  Users,
  ClipboardList,
  Target,
  Filter,
  Search,
  ChevronDown,
  Eye,
  Download,
  RefreshCw,
  Loader2,
  AlertCircle,
  CheckCircle,
  XCircle,
  BarChart3
} from 'lucide-react';
import { formatSOPDisplayName } from '@/lib/sopLibraryHelper';

interface SOPStat {
  sopId: string;
  sopName: string;
  sopIdentifier: string;
  department: string;
  totalUsers: number;
  completedUsers: number;
  pendingUsers: number;
  completionRate: number;
  totalTests: number;
  passedTests: number;
  failedTests: number;
  averageScore: number;
  targetProgress: {
    total: number;
    completed: number;
    pending: number;
    percentage: number;
  };
}

interface DepartmentStat {
  department: string;
  totalSOPs: number;
  totalPendingTests: number;
  totalCompletedTests: number;
  averageCompletion: number;
}

interface UserStat {
  userId: string;
  name: string;
  username: string;
  department: string;
  role: string;
  completedTests: number;
  pendingTests: number;
  passedTests: number;
  averageScore: number;
  completionRate: number;
}

interface AnalyticsData {
  sopStats: SOPStat[];
  departmentStats: DepartmentStat[];
  userStats: UserStat[];
  overall: {
    totalSOPs: number;
    totalUsers: number;
    totalPendingTests: number;
    totalCompletedTests: number;
    overallCompletion: number;
    totalDepartments: number;
  };
  filters: {
    departments: string[];
    sops: Array<{ _id: string; sopName: string; sopIdentifier: string; department: string }>;
    users: Array<{ _id: string; name: string; username: string; department: string }>;
  };
}

export default function AdminAnalyticsDashboard() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [data, setData] = useState<AnalyticsData | null>(null);

  // Filter states
  const [selectedDepartment, setSelectedDepartment] = useState('all');
  const [selectedSOP, setSelectedSOP] = useState('all');
  const [selectedUser, setSelectedUser] = useState('all');
  const [selectedStatus, setSelectedStatus] = useState('all');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [searchTerm, setSearchTerm] = useState('');

  // Sort states
  const [sortBy, setSortBy] = useState('pendingTests');
  const [sortOrder, setSortOrder] = useState('desc');

  useEffect(() => {
    fetchAnalytics();
  }, [selectedDepartment, selectedSOP, selectedUser, selectedStatus, startDate, endDate, sortBy, sortOrder]);

  const fetchAnalytics = async () => {
    try {
      const params = new URLSearchParams();
      if (selectedDepartment !== 'all') params.append('department', selectedDepartment);
      if (selectedSOP !== 'all') params.append('sopId', selectedSOP);
      if (selectedUser !== 'all') params.append('userId', selectedUser);
      if (selectedStatus !== 'all') params.append('status', selectedStatus);
      if (startDate) params.append('startDate', startDate);
      if (endDate) params.append('endDate', endDate);
      params.append('sortBy', sortBy);
      params.append('sortOrder', sortOrder);

      const response = await fetch(`/api/admin/analytics?${params}`);
      const result = await response.json();

      if (result.success) {
        setData(result.data);
      }
    } catch (error) {
      console.error('Error fetching analytics:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleRefresh = () => {
    setRefreshing(true);
    fetchAnalytics();
  };

  const getProgressColor = (percentage: number) => {
    if (percentage >= 80) return 'bg-green-500';
    if (percentage >= 50) return 'bg-yellow-500';
    return 'bg-red-500';
  };

  const getProgressTextColor = (percentage: number) => {
    if (percentage >= 80) return 'text-green-400';
    if (percentage >= 50) return 'text-yellow-400';
    return 'text-red-400';
  };

  const filteredSOPStats = data?.sopStats.filter(stat =>
    stat.sopName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    stat.sopIdentifier.toLowerCase().includes(searchTerm.toLowerCase())
  ) || [];

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex items-center justify-center">
        <Loader2 className="h-12 w-12 text-purple-400 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 p-8">
      <div className="max-w-7xl mx-auto">
        <PageHeader />

        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-5xl font-bold text-white mb-2 bg-clip-text text-transparent bg-gradient-to-r from-purple-400 to-pink-600">
                📊 Admin Analytics Dashboard
              </h1>
              <p className="text-gray-300 text-lg">
                Comprehensive SOP test tracking, targets, and compliance monitoring
              </p>
            </div>
            <button
              onClick={handleRefresh}
              disabled={refreshing}
              className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-semibold rounded-xl hover:from-blue-700 hover:to-indigo-700 transition-all shadow-lg disabled:opacity-50"
            >
              <RefreshCw className={`h-5 w-5 ${refreshing ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>
        </div>

        {/* Overview Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          {/* Total SOPs */}
          <div className="bg-gradient-to-br from-purple-900/50 to-purple-800/30 backdrop-blur-lg rounded-2xl p-6 border border-purple-500/30 shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <ClipboardList className="h-10 w-10 text-purple-400" />
              <span className="text-3xl font-bold text-white">{data?.overall.totalSOPs || 0}</span>
            </div>
            <h3 className="text-gray-300 font-semibold">Total SOPs</h3>
            <p className="text-sm text-gray-400 mt-1">Across {data?.overall.totalDepartments || 0} departments</p>
          </div>

          {/* Total Users */}
          <div className="bg-gradient-to-br from-blue-900/50 to-blue-800/30 backdrop-blur-lg rounded-2xl p-6 border border-blue-500/30 shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <Users className="h-10 w-10 text-blue-400" />
              <span className="text-3xl font-bold text-white">{data?.overall.totalUsers || 0}</span>
            </div>
            <h3 className="text-gray-300 font-semibold">Total Users</h3>
            <p className="text-sm text-gray-400 mt-1">Active in system</p>
          </div>

          {/* Pending Tests */}
          <div className="bg-gradient-to-br from-red-900/50 to-red-800/30 backdrop-blur-lg rounded-2xl p-6 border border-red-500/30 shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <AlertCircle className="h-10 w-10 text-red-400" />
              <span className="text-3xl font-bold text-white">{data?.overall.totalPendingTests || 0}</span>
            </div>
            <h3 className="text-gray-300 font-semibold">Pending Tests</h3>
            <p className="text-sm text-gray-400 mt-1">Require attention</p>
          </div>

          {/* Completion Rate */}
          <div className="bg-gradient-to-br from-green-900/50 to-green-800/30 backdrop-blur-lg rounded-2xl p-6 border border-green-500/30 shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <Target className="h-10 w-10 text-green-400" />
              <span className="text-3xl font-bold text-white">
                {data?.overall.overallCompletion.toFixed(1) || 0}%
              </span>
            </div>
            <h3 className="text-gray-300 font-semibold">Overall Completion</h3>
            <p className="text-sm text-gray-400 mt-1">System-wide average</p>
          </div>
        </div>

        {/* Filters Bar */}
        <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-6 shadow-2xl border border-white/20 mb-8">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-4">
            {/* Department Filter */}
            <div className="relative">
              <label className="block text-sm font-semibold text-gray-300 mb-2">Department</label>
              <select
                value={selectedDepartment}
                onChange={(e) => setSelectedDepartment(e.target.value)}
                className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-purple-500 appearance-none cursor-pointer"
                style={{ colorScheme: 'dark' }}
              >
                <option value="all" className="bg-slate-800">All Departments</option>
                {data?.filters.departments.map(dept => (
                  <option key={dept} value={dept} className="bg-slate-800">{dept}</option>
                ))}
              </select>
              <ChevronDown className="absolute right-3 top-11 h-5 w-5 text-gray-400 pointer-events-none" />
            </div>

            {/* SOP Filter */}
            <div className="relative">
              <label className="block text-sm font-semibold text-gray-300 mb-2">SOP</label>
              <select
                value={selectedSOP}
                onChange={(e) => setSelectedSOP(e.target.value)}
                className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-purple-500 appearance-none cursor-pointer"
                style={{ colorScheme: 'dark' }}
              >
                <option value="all" className="bg-slate-800">All SOPs</option>
                {data?.filters.sops.map(sop => (
                  <option key={sop._id} value={sop._id} className="bg-slate-800">
                    {formatSOPDisplayName(sop.sopName, sop.sopIdentifier)}
                  </option>
                ))}
              </select>
              <ChevronDown className="absolute right-3 top-11 h-5 w-5 text-gray-400 pointer-events-none" />
            </div>

            {/* User Filter */}
            <div className="relative">
              <label className="block text-sm font-semibold text-gray-300 mb-2">User</label>
              <select
                value={selectedUser}
                onChange={(e) => setSelectedUser(e.target.value)}
                className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-purple-500 appearance-none cursor-pointer"
                style={{ colorScheme: 'dark' }}
              >
                <option value="all" className="bg-slate-800">All Users</option>
                {data?.filters.users.map(user => (
                  <option key={user._id} value={user._id} className="bg-slate-800">
                    {user.name} ({user.username})
                  </option>
                ))}
              </select>
              <ChevronDown className="absolute right-3 top-11 h-5 w-5 text-gray-400 pointer-events-none" />
            </div>

            {/* Status Filter */}
            <div className="relative">
              <label className="block text-sm font-semibold text-gray-300 mb-2">Status</label>
              <select
                value={selectedStatus}
                onChange={(e) => setSelectedStatus(e.target.value)}
                className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-purple-500 appearance-none cursor-pointer"
                style={{ colorScheme: 'dark' }}
              >
                <option value="all" className="bg-slate-800">All Status</option>
                <option value="completed" className="bg-slate-800">Completed</option>
                <option value="pending" className="bg-slate-800">Pending</option>
              </select>
              <ChevronDown className="absolute right-3 top-11 h-5 w-5 text-gray-400 pointer-events-none" />
            </div>

            {/* Sort By */}
            <div className="relative">
              <label className="block text-sm font-semibold text-gray-300 mb-2">Sort By</label>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-purple-500 appearance-none cursor-pointer"
                style={{ colorScheme: 'dark' }}
              >
                <option value="pendingTests" className="bg-slate-800">Most Pending Tests</option>
                <option value="completionRate" className="bg-slate-800">Completion Rate</option>
                <option value="averageScore" className="bg-slate-800">Average Score</option>
                <option value="sopName" className="bg-slate-800">SOP Name</option>
                <option value="department" className="bg-slate-800">Department</option>
              </select>
              <ChevronDown className="absolute right-3 top-11 h-5 w-5 text-gray-400 pointer-events-none" />
            </div>

            {/* Sort Order */}
            <div className="relative">
              <label className="block text-sm font-semibold text-gray-300 mb-2">Order</label>
              <select
                value={sortOrder}
                onChange={(e) => setSortOrder(e.target.value)}
                className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-purple-500 appearance-none cursor-pointer"
                style={{ colorScheme: 'dark' }}
              >
                <option value="desc" className="bg-slate-800">Descending</option>
                <option value="asc" className="bg-slate-800">Ascending</option>
              </select>
              <ChevronDown className="absolute right-3 top-11 h-5 w-5 text-gray-400 pointer-events-none" />
            </div>
          </div>

          {/* Search Bar */}
          <div className="relative">
            <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
            <input
              type="text"
              placeholder="Search by SOP name or identifier..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-12 pr-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500"
            />
          </div>
        </div>

        {/* SOP Test Tracking Table */}
        <div className="bg-white/5 backdrop-blur-lg rounded-2xl border border-white/20 overflow-hidden mb-8">
          <div className="px-6 py-4 border-b border-white/10">
            <h2 className="text-2xl font-bold text-white flex items-center gap-2">
              <BarChart3 className="h-6 w-6 text-purple-400" />
              SOP Test Tracking
            </h2>
            <p className="text-gray-400 text-sm mt-1">
              Showing {filteredSOPStats.length} of {data?.sopStats.length || 0} SOPs
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-white/5">
                <tr>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-300 uppercase tracking-wider">
                    SOP Code
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-300 uppercase tracking-wider">
                    SOP Name
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-300 uppercase tracking-wider">
                    Department
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-300 uppercase tracking-wider">
                    Progress
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-300 uppercase tracking-wider">
                    Pending
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-300 uppercase tracking-wider">
                    Avg Score
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-300 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10">
                {filteredSOPStats.map((stat) => (
                  <tr key={stat.sopId} className="hover:bg-white/5 transition-colors">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="font-mono text-sm font-semibold text-purple-300">
                        {stat.sopIdentifier}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-sm font-semibold text-white max-w-xs truncate" title={stat.sopName}>
                        {stat.sopName}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="px-3 py-1 bg-blue-500/20 text-blue-300 rounded-full text-xs font-semibold">
                        {stat.department}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="w-48">
                        <div className="flex items-center justify-between mb-1">
                          <span className={`text-xs font-bold ${getProgressTextColor(stat.completionRate)}`}>
                            {stat.completionRate.toFixed(1)}%
                          </span>
                          <span className="text-xs text-gray-400">
                            {stat.completedUsers}/{stat.totalUsers}
                          </span>
                        </div>
                        <div className="w-full bg-gray-700 rounded-full h-2">
                          <div
                            className={`h-2 rounded-full transition-all ${getProgressColor(stat.completionRate)}`}
                            style={{ width: `${stat.completionRate}%` }}
                          />
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <AlertCircle className="h-4 w-4 text-red-400" />
                        <span className="text-sm font-bold text-red-300">
                          {stat.pendingUsers}
                        </span>
                        <span className="text-xs text-gray-400">users</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`text-sm font-bold ${getProgressTextColor(stat.averageScore)}`}>
                        {stat.averageScore.toFixed(1)}%
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <button
                        onClick={() => router.push(`/admin/sop-details/${stat.sopId}`)}
                        className="flex items-center gap-1 px-3 py-1 bg-purple-600 text-white text-xs font-semibold rounded-lg hover:bg-purple-700 transition-all"
                      >
                        <Eye className="h-3 w-3" />
                        View
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {filteredSOPStats.length === 0 && (
            <div className="text-center py-12">
              <ClipboardList className="h-12 w-12 text-gray-500 mx-auto mb-3" />
              <p className="text-gray-400">No SOPs found matching your filters</p>
            </div>
          )}
        </div>

        {/* Department Performance */}
        <div className="bg-white/5 backdrop-blur-lg rounded-2xl border border-white/20 overflow-hidden mb-8">
          <div className="px-6 py-4 border-b border-white/10">
            <h2 className="text-2xl font-bold text-white flex items-center gap-2">
              <TrendingUp className="h-6 w-6 text-green-400" />
              Department Performance
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 p-6">
            {data?.departmentStats.map((dept) => (
              <div
                key={dept.department}
                className="bg-gradient-to-br from-slate-800/50 to-slate-900/50 rounded-xl p-5 border border-white/10 hover:border-purple-500/50 transition-all"
              >
                <h3 className="text-lg font-bold text-white mb-3">{dept.department}</h3>
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-400">Total SOPs:</span>
                    <span className="font-semibold text-white">{dept.totalSOPs}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-400">Pending Tests:</span>
                    <span className="font-semibold text-red-300">{dept.totalPendingTests}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-400">Completed:</span>
                    <span className="font-semibold text-green-300">{dept.totalCompletedTests}</span>
                  </div>
                  <div className="pt-2 border-t border-white/10">
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-gray-400">Avg Completion:</span>
                      <span className={`text-lg font-bold ${getProgressTextColor(dept.averageCompletion)}`}>
                        {dept.averageCompletion.toFixed(1)}%
                      </span>
                    </div>
                    <div className="w-full bg-gray-700 rounded-full h-2 mt-2">
                      <div
                        className={`h-2 rounded-full ${getProgressColor(dept.averageCompletion)}`}
                        style={{ width: `${dept.averageCompletion}%` }}
                      />
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
