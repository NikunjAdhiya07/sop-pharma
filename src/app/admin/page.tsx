'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { 
  Users, 
  ClipboardList, 
  Award, 
  CheckCircle, 
  XCircle, 
  Edit, 
  Trash2, 
  Eye, 
  ArrowLeft,
  UserPlus,
  FileText,
  TrendingUp,
  Activity,
  Shield,
  Search,
  Filter
} from 'lucide-react';

interface User {
  _id: string;
  username: string;
  name: string;
  role: string;
  employeeId?: string;
  department?: string;
  email?: string;
  testsAssigned: number;
  testsCompleted: number;
  completionRate: number;
  averageScore: number;
  isTrainerEligible: boolean;
  recentTests?: any[];
  recentResults?: any[];
}

interface TestAssignment {
  _id: string;
  userId: any;
  testType: string;
  testName: string;
  status: string;
  assignedAt: string;
  deadline?: string;
  score?: number;
  isPassed?: boolean;
  sopIds?: any[];
  departments?: string[];
  assignedBy?: any;
}

export default function AdminDashboard() {
  const router = useRouter();
  const [users, setUsers] = useState<User[]>([]);
  const [assignments, setAssignments] = useState<TestAssignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'users' | 'assignments' | 'trainers'>('users');
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [showCreateUser, setShowCreateUser] = useState(false);
  const [showAssignTest, setShowAssignTest] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [usersRes, assignmentsRes] = await Promise.all([
        fetch('/api/admin/users'),
        fetch('/api/admin/assignments'),
      ]);

      const usersData = await usersRes.json();
      const assignmentsData = await assignmentsRes.json();

      if (usersData.success) setUsers(usersData.users);
      if (assignmentsData.success) setAssignments(assignmentsData.assignments);
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  };

  const trainerEligibleUsers = users.filter(u => u.isTrainerEligible);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed': return 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/50';
      case 'in-progress': return 'bg-blue-500/20 text-blue-300 border border-blue-500/50';
      case 'pending': return 'bg-yellow-500/20 text-yellow-300 border border-yellow-500/50';
      case 'overdue': return 'bg-red-500/20 text-red-300 border border-red-500/50';
      default: return 'bg-gray-500/20 text-gray-300 border border-gray-500/50';
    }
  };

  const getRoleColor = (role: string) => {
    switch (role) {
      case 'admin': return 'bg-purple-500/20 text-purple-300 border border-purple-500/50';
      case 'trainer': return 'bg-blue-500/20 text-blue-300 border border-blue-500/50';
      default: return 'bg-gray-500/20 text-gray-300 border border-gray-500/50';
    }
  };

  const handleEditUser = (user: User) => {
    setEditingUser(user);
  };

  const handleDeleteUser = async (userId: string, username: string) => {
    if (username === 'demo') {
      alert('Cannot delete the demo admin user');
      return;
    }

    if (!confirm(`Are you sure you want to delete this user? This action cannot be undone.`)) {
      return;
    }

    try {
      const response = await fetch(`/api/admin/users/${userId}`, {
        method: 'DELETE',
      });

      const data = await response.json();

      if (data.success) {
        alert('User deleted successfully');
        fetchData(); // Refresh the data
      } else {
        alert(data.message || 'Failed to delete user');
      }
    } catch (error) {
      console.error('Error deleting user:', error);
      alert('Failed to delete user');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex items-center justify-center">
        <div className="flex flex-col items-center">
          <div className="w-16 h-16 border-4 border-purple-500 border-t-transparent rounded-full animate-spin mb-4"></div>
          <p className="text-white text-xl font-medium">Loading Admin Dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
      {/* Animated background elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-purple-500/10 rounded-full blur-3xl animate-pulse"></div>
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-pink-500/10 rounded-full blur-3xl animate-pulse delay-1000"></div>
        <div className="absolute top-1/2 right-1/3 w-64 h-64 bg-blue-500/10 rounded-full blur-3xl animate-pulse delay-500"></div>
      </div>

      <div className="relative z-10">
        {/* Header */}
        <header className="bg-white/5 backdrop-blur-xl border-b border-white/10 sticky top-0 z-50">
          <div className="max-w-7xl mx-auto px-6 py-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-4">
                <div className="bg-gradient-to-br from-purple-600 to-pink-600 p-3 rounded-xl shadow-lg shadow-purple-500/50">
                  <Shield className="h-8 w-8 text-white" />
                </div>
                <div>
                  <h1 className="text-3xl font-bold bg-gradient-to-r from-purple-200 to-pink-200 bg-clip-text text-transparent">
                    Admin Dashboard
                  </h1>
                  <p className="text-gray-400 mt-1">Manage users, tests, and trainer eligibility</p>
                </div>
              </div>
              <button
                onClick={() => router.push('/dashboard')}
                className="flex items-center space-x-2 bg-white/10 hover:bg-white/20 text-white px-4 py-2.5 rounded-xl border border-white/20 transition-all hover:shadow-lg hover:shadow-white/10"
              >
                <ArrowLeft className="h-5 w-5" />
                <span className="font-medium">Back to Dashboard</span>
              </button>
            </div>
          </div>
        </header>

        {/* Stats Overview */}
        <div className="max-w-7xl mx-auto px-6 py-8">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
            <div className="bg-gradient-to-br from-white/10 to-white/5 backdrop-blur-lg rounded-2xl p-6 border border-white/20 hover:border-blue-500/50 transition-all duration-300 hover:shadow-xl hover:shadow-blue-500/10 group">
              <div className="flex items-center justify-between mb-4">
                <div className="bg-gradient-to-br from-blue-500 to-blue-600 p-3 rounded-xl shadow-lg group-hover:scale-110 transition-transform">
                  <Users className="h-7 w-7 text-white" />
                </div>
                <TrendingUp className="h-5 w-5 text-green-400" />
              </div>
              <p className="text-gray-400 text-sm font-medium mb-1">Total Users</p>
              <p className="text-4xl font-bold text-white mb-1">{users.length}</p>
              <p className="text-xs text-gray-500">Active accounts</p>
            </div>

            <div className="bg-gradient-to-br from-white/10 to-white/5 backdrop-blur-lg rounded-2xl p-6 border border-white/20 hover:border-emerald-500/50 transition-all duration-300 hover:shadow-xl hover:shadow-emerald-500/10 group">
              <div className="flex items-center justify-between mb-4">
                <div className="bg-gradient-to-br from-emerald-500 to-emerald-600 p-3 rounded-xl shadow-lg group-hover:scale-110 transition-transform">
                  <ClipboardList className="h-7 w-7 text-white" />
                </div>
                <TrendingUp className="h-5 w-5 text-green-400" />
              </div>
              <p className="text-gray-400 text-sm font-medium mb-1">Test Assignments</p>
              <p className="text-4xl font-bold text-white mb-1">{assignments.length}</p>
              <p className="text-xs text-gray-500">Total assigned</p>
            </div>

            <div className="bg-gradient-to-br from-white/10 to-white/5 backdrop-blur-lg rounded-2xl p-6 border border-white/20 hover:border-purple-500/50 transition-all duration-300 hover:shadow-xl hover:shadow-purple-500/10 group">
              <div className="flex items-center justify-between mb-4">
                <div className="bg-gradient-to-br from-purple-500 to-purple-600 p-3 rounded-xl shadow-lg group-hover:scale-110 transition-transform">
                  <Award className="h-7 w-7 text-white" />
                </div>
                <TrendingUp className="h-5 w-5 text-green-400" />
              </div>
              <p className="text-gray-400 text-sm font-medium mb-1">Eligible Trainers</p>
              <p className="text-4xl font-bold text-white mb-1">{trainerEligibleUsers.length}</p>
              <p className="text-xs text-gray-500">100% completion</p>
            </div>

            <div className="bg-gradient-to-br from-white/10 to-white/5 backdrop-blur-lg rounded-2xl p-6 border border-white/20 hover:border-pink-500/50 transition-all duration-300 hover:shadow-xl hover:shadow-pink-500/10 group">
              <div className="flex items-center justify-between mb-4">
                <div className="bg-gradient-to-br from-pink-500 to-pink-600 p-3 rounded-xl shadow-lg group-hover:scale-110 transition-transform">
                  <Activity className="h-7 w-7 text-white" />
                </div>
              </div>
              <p className="text-gray-400 text-sm font-medium mb-1">Completed Tests</p>
              <p className="text-4xl font-bold text-white mb-1">
                {assignments.filter(a => a.status === 'completed').length}
              </p>
              <p className="text-xs text-gray-500">Successfully finished</p>
            </div>
          </div>

          {/* Tabs */}
          <div className="bg-gradient-to-br from-white/10 to-white/5 backdrop-blur-lg rounded-2xl border border-white/20 overflow-hidden shadow-xl">
            <div className="border-b border-white/10">
              <div className="flex">
                <button
                  onClick={() => setActiveTab('users')}
                  className={`px-8 py-4 font-semibold transition-all relative ${
                    activeTab === 'users'
                      ? 'text-purple-300 bg-purple-500/20'
                      : 'text-gray-400 hover:text-white hover:bg-white/5'
                  }`}
                >
                  <span className="flex items-center space-x-2">
                    <Users className="h-5 w-5" />
                    <span>All Users ({users.length})</span>
                  </span>
                  {activeTab === 'users' && (
                    <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r from-purple-500 to-pink-500"></div>
                  )}
                </button>
                <button
                  onClick={() => setActiveTab('assignments')}
                  className={`px-8 py-4 font-semibold transition-all relative ${
                    activeTab === 'assignments'
                      ? 'text-purple-300 bg-purple-500/20'
                      : 'text-gray-400 hover:text-white hover:bg-white/5'
                  }`}
                >
                  <span className="flex items-center space-x-2">
                    <ClipboardList className="h-5 w-5" />
                    <span>Test Assignments ({assignments.length})</span>
                  </span>
                  {activeTab === 'assignments' && (
                    <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r from-purple-500 to-pink-500"></div>
                  )}
                </button>
                <button
                  onClick={() => setActiveTab('trainers')}
                  className={`px-8 py-4 font-semibold transition-all relative ${
                    activeTab === 'trainers'
                      ? 'text-purple-300 bg-purple-500/20'
                      : 'text-gray-400 hover:text-white hover:bg-white/5'
                  }`}
                >
                  <span className="flex items-center space-x-2">
                    <Award className="h-5 w-5" />
                    <span>Eligible Trainers ({trainerEligibleUsers.length})</span>
                  </span>
                  {activeTab === 'trainers' && (
                    <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r from-purple-500 to-pink-500"></div>
                  )}
                </button>
              </div>
            </div>

            <div className="p-6">
              {/* Users Tab */}
              {activeTab === 'users' && (
                <div>
                  <div className="flex justify-between items-center mb-6">
                    <h2 className="text-2xl font-bold text-white flex items-center">
                      <Users className="h-7 w-7 mr-3 text-purple-400" />
                      User Management
                    </h2>
                    <button
                      onClick={() => setShowCreateUser(true)}
                      className="flex items-center space-x-2 bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white px-5 py-2.5 rounded-xl font-medium transition-all transform hover:scale-105 shadow-lg shadow-purple-500/30"
                    >
                      <UserPlus className="h-5 w-5" />
                      <span>Add User</span>
                    </button>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-white/10">
                          <th className="px-4 py-4 text-left text-xs font-bold text-purple-300 uppercase tracking-wider">User</th>
                          <th className="px-4 py-4 text-left text-xs font-bold text-purple-300 uppercase tracking-wider">Role</th>
                          <th className="px-4 py-4 text-left text-xs font-bold text-purple-300 uppercase tracking-wider">Department</th>
                          <th className="px-4 py-4 text-left text-xs font-bold text-purple-300 uppercase tracking-wider">Tests</th>
                          <th className="px-4 py-4 text-left text-xs font-bold text-purple-300 uppercase tracking-wider">Completion</th>
                          <th className="px-4 py-4 text-left text-xs font-bold text-purple-300 uppercase tracking-wider">Avg Score</th>
                          <th className="px-4 py-4 text-left text-xs font-bold text-purple-300 uppercase tracking-wider">Trainer Status</th>
                          <th className="px-4 py-4 text-left text-xs font-bold text-purple-300 uppercase tracking-wider">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/5">
                        {users.map((user) => (
                          <tr key={user._id} className="hover:bg-white/5 transition-colors">
                            <td className="px-4 py-4">
                              <div>
                                <p className="font-semibold text-white">{user.name}</p>
                                <p className="text-sm text-gray-400">@{user.username}</p>
                                {user.employeeId && (
                                  <p className="text-xs text-gray-500">ID: {user.employeeId}</p>
                                )}
                              </div>
                            </td>
                            <td className="px-4 py-4">
                              <span className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${getRoleColor(user.role)}`}>
                                {user.role.toUpperCase()}
                              </span>
                            </td>
                            <td className="px-4 py-4">
                              <span className="text-sm text-gray-300">{user.department || '-'}</span>
                            </td>
                            <td className="px-4 py-4">
                              <span className="text-sm text-white font-semibold">
                                {user.testsCompleted} / {user.testsAssigned}
                              </span>
                            </td>
                            <td className="px-4 py-4">
                              <div className="flex items-center gap-3">
                                <div className="flex-1 bg-white/10 rounded-full h-2.5 max-w-[120px]">
                                  <div
                                    className={`h-2.5 rounded-full transition-all ${
                                      user.completionRate === 100 
                                        ? 'bg-gradient-to-r from-emerald-500 to-green-500' 
                                        : 'bg-gradient-to-r from-blue-500 to-purple-500'
                                    }`}
                                    style={{ width: `${user.completionRate}%` }}
                                  ></div>
                                </div>
                                <span className="text-sm font-bold text-white min-w-[45px]">{user.completionRate}%</span>
                              </div>
                            </td>
                            <td className="px-4 py-4">
                              <span className={`text-sm font-bold ${
                                user.averageScore >= 80 ? 'text-emerald-400' : 'text-gray-300'
                              }`}>
                                {user.averageScore}%
                              </span>
                            </td>
                            <td className="px-4 py-4">
                              {user.isTrainerEligible ? (
                                <span className="px-3 py-1.5 bg-emerald-500/20 text-emerald-300 border border-emerald-500/50 rounded-lg text-xs font-semibold flex items-center gap-2 w-fit">
                                  <CheckCircle className="w-4 h-4" />
                                  Eligible
                                </span>
                              ) : (
                                <span className="px-3 py-1.5 bg-gray-500/20 text-gray-400 border border-gray-500/50 rounded-lg text-xs font-semibold flex items-center gap-2 w-fit">
                                  <XCircle className="w-4 h-4" />
                                  Not Eligible
                                </span>
                              )}
                            </td>
                            <td className="px-4 py-4">
                              <div className="flex items-center gap-2">
                                <button
                                  onClick={() => handleEditUser(user)}
                                  className="p-2 text-blue-400 hover:bg-blue-500/20 rounded-lg transition-all border border-transparent hover:border-blue-500/50"
                                  title="Edit User"
                                >
                                  <Edit className="w-4 h-4" />
                                </button>
                                <button
                                  onClick={() => handleDeleteUser(user._id, user.username)}
                                  className="p-2 text-red-400 hover:bg-red-500/20 rounded-lg transition-all border border-transparent hover:border-red-500/50"
                                  title="Delete User"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                                <button
                                  onClick={() => setSelectedUser(user)}
                                  className="px-3 py-1.5 text-sm text-purple-300 hover:bg-purple-500/20 rounded-lg font-medium transition-all border border-purple-500/50 hover:border-purple-400"
                                >
                                  <Eye className="w-4 h-4 inline mr-1" />
                                  Details
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Assignments Tab */}
              {activeTab === 'assignments' && (
                <div>
                  <div className="flex justify-between items-center mb-6">
                    <h2 className="text-2xl font-bold text-white flex items-center">
                      <ClipboardList className="h-7 w-7 mr-3 text-purple-400" />
                      Test Assignments
                    </h2>
                    <button
                      onClick={() => setShowAssignTest(true)}
                      className="flex items-center space-x-2 bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white px-5 py-2.5 rounded-xl font-medium transition-all transform hover:scale-105 shadow-lg shadow-purple-500/30"
                    >
                      <FileText className="h-5 w-5" />
                      <span>Assign Test</span>
                    </button>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-white/10">
                          <th className="px-4 py-4 text-left text-xs font-bold text-purple-300 uppercase tracking-wider">User</th>
                          <th className="px-4 py-4 text-left text-xs font-bold text-purple-300 uppercase tracking-wider">Test Name</th>
                          <th className="px-4 py-4 text-left text-xs font-bold text-purple-300 uppercase tracking-wider">Type</th>
                          <th className="px-4 py-4 text-left text-xs font-bold text-purple-300 uppercase tracking-wider">Status</th>
                          <th className="px-4 py-4 text-left text-xs font-bold text-purple-300 uppercase tracking-wider">Assigned</th>
                          <th className="px-4 py-4 text-left text-xs font-bold text-purple-300 uppercase tracking-wider">Score</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/5">
                        {assignments.map((assignment) => (
                          <tr key={assignment._id} className="hover:bg-white/5 transition-colors">
                            <td className="px-4 py-4">
                              <div>
                                <p className="font-semibold text-white">{assignment.userId?.name || 'Unknown'}</p>
                                <p className="text-sm text-gray-400">{assignment.userId?.department || '-'}</p>
                              </div>
                            </td>
                            <td className="px-4 py-4">
                              <p className="font-medium text-white">{assignment.testName}</p>
                            </td>
                            <td className="px-4 py-4">
                              <span className="px-3 py-1.5 bg-blue-500/20 text-blue-300 border border-blue-500/50 rounded-lg text-xs font-semibold">
                                {assignment.testType}
                              </span>
                            </td>
                            <td className="px-4 py-4">
                              <span className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${getStatusColor(assignment.status)}`}>
                                {assignment.status.toUpperCase()}
                              </span>
                            </td>
                            <td className="px-4 py-4">
                              <p className="text-sm text-gray-300">
                                {new Date(assignment.assignedAt).toLocaleDateString()}
                              </p>
                              {assignment.assignedBy && (
                                <p className="text-xs text-gray-500">by {assignment.assignedBy.name}</p>
                              )}
                            </td>
                            <td className="px-4 py-4">
                              {assignment.score !== undefined ? (
                                <div className="flex items-center gap-2">
                                  <span className={`font-bold text-lg ${
                                    assignment.isPassed ? 'text-emerald-400' : 'text-red-400'
                                  }`}>
                                    {assignment.score}%
                                  </span>
                                  {assignment.isPassed && (
                                    <CheckCircle className="w-5 h-5 text-emerald-400" />
                                  )}
                                </div>
                              ) : (
                                <span className="text-sm text-gray-500">-</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Trainers Tab */}
              {activeTab === 'trainers' && (
                <div>
                  <h2 className="text-2xl font-bold text-white mb-4 flex items-center">
                    <Award className="h-7 w-7 mr-3 text-purple-400" />
                    Eligible Trainers
                  </h2>
                  <p className="text-gray-400 mb-8 leading-relaxed">
                    Users who have achieved 100% test completion with an average score of 80% or higher are eligible to become trainers.
                  </p>

                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {trainerEligibleUsers.map((user) => (
                      <div key={user._id} className="bg-gradient-to-br from-emerald-500/10 to-green-500/10 border-2 border-emerald-500/30 rounded-2xl p-6 shadow-xl hover:shadow-2xl hover:shadow-emerald-500/20 transition-all hover:scale-[1.02]">
                        <div className="flex items-start justify-between mb-4">
                          <div>
                            <h3 className="font-bold text-white text-xl">{user.name}</h3>
                            <p className="text-sm text-gray-400">@{user.username}</p>
                            {user.employeeId && (
                              <p className="text-xs text-gray-500 mt-1">ID: {user.employeeId}</p>
                            )}
                          </div>
                          <div className="w-14 h-14 bg-gradient-to-br from-emerald-500 to-green-500 rounded-xl flex items-center justify-center shadow-lg shadow-emerald-500/50">
                            <CheckCircle className="w-8 h-8 text-white" />
                          </div>
                        </div>

                        <div className="space-y-3">
                          <div className="flex justify-between items-center py-2 border-b border-emerald-500/20">
                            <span className="text-sm text-gray-400">Department</span>
                            <span className="text-sm font-semibold text-white">{user.department || '-'}</span>
                          </div>
                          <div className="flex justify-between items-center py-2 border-b border-emerald-500/20">
                            <span className="text-sm text-gray-400">Tests Completed</span>
                            <span className="text-sm font-semibold text-white">{user.testsCompleted}/{user.testsAssigned}</span>
                          </div>
                          <div className="flex justify-between items-center py-2 border-b border-emerald-500/20">
                            <span className="text-sm text-gray-400">Completion Rate</span>
                            <span className="text-sm font-bold text-emerald-400">{user.completionRate}%</span>
                          </div>
                          <div className="flex justify-between items-center py-2">
                            <span className="text-sm text-gray-400">Average Score</span>
                            <span className="text-sm font-bold text-emerald-400">{user.averageScore}%</span>
                          </div>
                        </div>

                        <div className="mt-5 pt-5 border-t border-emerald-500/30">
                          <span className="px-4 py-2 bg-gradient-to-r from-emerald-500 to-green-500 text-white rounded-xl text-xs font-bold flex items-center gap-2 w-fit shadow-lg shadow-emerald-500/30">
                            <Award className="w-4 h-4" />
                            TRAINER ELIGIBLE
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>

                  {trainerEligibleUsers.length === 0 && (
                    <div className="text-center py-16">
                      <div className="w-20 h-20 bg-gray-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
                        <Users className="w-10 h-10 text-gray-500" />
                      </div>
                      <p className="text-gray-400 font-semibold text-lg">No eligible trainers yet</p>
                      <p className="text-sm text-gray-500 mt-2">Users need 100% completion rate and 80%+ average score</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* User Details Modal */}
      {selectedUser && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-gradient-to-br from-slate-900 to-purple-900 rounded-2xl shadow-2xl max-w-3xl w-full max-h-[90vh] overflow-y-auto border border-white/20">
            <div className="p-6 border-b border-white/10 sticky top-0 bg-gradient-to-r from-purple-900/90 to-pink-900/90 backdrop-blur-xl z-10">
              <div className="flex items-center justify-between">
                <h3 className="text-3xl font-bold text-white">{selectedUser.name}</h3>
                <button
                  onClick={() => setSelectedUser(null)}
                  className="text-gray-400 hover:text-white hover:bg-white/10 p-2 rounded-lg transition-all"
                >
                  <XCircle className="w-6 h-6" />
                </button>
              </div>
            </div>

            <div className="p-6 space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-white/5 rounded-xl p-4 border border-white/10">
                  <p className="text-sm text-gray-400 mb-1">Username</p>
                  <p className="font-semibold text-white">@{selectedUser.username}</p>
                </div>
                <div className="bg-white/5 rounded-xl p-4 border border-white/10">
                  <p className="text-sm text-gray-400 mb-1">Role</p>
                  <span className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${getRoleColor(selectedUser.role)}`}>
                    {selectedUser.role.toUpperCase()}
                  </span>
                </div>
                {selectedUser.employeeId && (
                  <div className="bg-white/5 rounded-xl p-4 border border-white/10">
                    <p className="text-sm text-gray-400 mb-1">Employee ID</p>
                    <p className="font-semibold text-white">{selectedUser.employeeId}</p>
                  </div>
                )}
                {selectedUser.department && (
                  <div className="bg-white/5 rounded-xl p-4 border border-white/10">
                    <p className="text-sm text-gray-400 mb-1">Department</p>
                    <p className="font-semibold text-white">{selectedUser.department}</p>
                  </div>
                )}
                {selectedUser.email && (
                  <div className="bg-white/5 rounded-xl p-4 border border-white/10 col-span-2">
                    <p className="text-sm text-gray-400 mb-1">Email</p>
                    <p className="font-semibold text-white">{selectedUser.email}</p>
                  </div>
                )}
              </div>

              <div className="border-t border-white/10 pt-6">
                <h4 className="font-bold text-white text-xl mb-4 flex items-center">
                  <Activity className="h-6 w-6 mr-2 text-purple-400" />
                  Test Statistics
                </h4>
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-gradient-to-br from-blue-500/20 to-blue-600/20 rounded-xl p-5 border border-blue-500/30">
                    <p className="text-sm text-blue-300 font-semibold mb-2">Tests Assigned</p>
                    <p className="text-4xl font-bold text-white">{selectedUser.testsAssigned}</p>
                  </div>
                  <div className="bg-gradient-to-br from-emerald-500/20 to-emerald-600/20 rounded-xl p-5 border border-emerald-500/30">
                    <p className="text-sm text-emerald-300 font-semibold mb-2">Tests Completed</p>
                    <p className="text-4xl font-bold text-white">{selectedUser.testsCompleted}</p>
                  </div>
                  <div className="bg-gradient-to-br from-purple-500/20 to-purple-600/20 rounded-xl p-5 border border-purple-500/30">
                    <p className="text-sm text-purple-300 font-semibold mb-2">Completion Rate</p>
                    <p className="text-4xl font-bold text-white">{selectedUser.completionRate}%</p>
                  </div>
                  <div className="bg-gradient-to-br from-pink-500/20 to-pink-600/20 rounded-xl p-5 border border-pink-500/30">
                    <p className="text-sm text-pink-300 font-semibold mb-2">Average Score</p>
                    <p className="text-4xl font-bold text-white">{selectedUser.averageScore}%</p>
                  </div>
                </div>
              </div>

              <div className="border-t border-white/10 pt-6">
                <h4 className="font-bold text-white text-xl mb-4 flex items-center">
                  <Award className="h-6 w-6 mr-2 text-purple-400" />
                  Trainer Eligibility
                </h4>
                {selectedUser.isTrainerEligible ? (
                  <div className="bg-gradient-to-br from-emerald-500/20 to-green-500/20 border-2 border-emerald-500/50 rounded-xl p-6">
                    <div className="flex items-center gap-4">
                      <div className="w-16 h-16 bg-gradient-to-br from-emerald-500 to-green-500 rounded-xl flex items-center justify-center shadow-lg shadow-emerald-500/50">
                        <CheckCircle className="w-10 h-10 text-white" />
                      </div>
                      <div>
                        <p className="font-bold text-white text-xl">Eligible for Trainer Role</p>
                        <p className="text-sm text-emerald-300 mt-1">100% completion with 80%+ average score</p>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="bg-white/5 border-2 border-white/10 rounded-xl p-6">
                    <p className="font-semibold text-gray-300 mb-3 text-lg">Not yet eligible</p>
                    <p className="text-sm text-gray-400 mb-4">Requirements:</p>
                    <ul className="text-sm text-gray-300 space-y-3">
                      <li className="flex items-center gap-3">
                        {selectedUser.completionRate === 100 ? (
                          <CheckCircle className="w-5 h-5 text-emerald-400 flex-shrink-0" />
                        ) : (
                          <XCircle className="w-5 h-5 text-gray-500 flex-shrink-0" />
                        )}
                        <span>100% test completion rate (currently {selectedUser.completionRate}%)</span>
                      </li>
                      <li className="flex items-center gap-3">
                        {selectedUser.averageScore >= 80 ? (
                          <CheckCircle className="w-5 h-5 text-emerald-400 flex-shrink-0" />
                        ) : (
                          <XCircle className="w-5 h-5 text-gray-500 flex-shrink-0" />
                        )}
                        <span>Average score of 80% or higher (currently {selectedUser.averageScore}%)</span>
                      </li>
                    </ul>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Create User Modal */}
      {showCreateUser && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-gradient-to-br from-slate-900 to-purple-900 rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto border border-white/20">
            <div className="p-6 border-b border-white/10 sticky top-0 bg-gradient-to-r from-purple-900/90 to-pink-900/90 backdrop-blur-xl z-10">
              <div className="flex items-center justify-between">
                <h3 className="text-3xl font-bold text-white flex items-center">
                  <UserPlus className="h-8 w-8 mr-3 text-purple-400" />
                  Create New User
                </h3>
                <button
                  onClick={() => setShowCreateUser(false)}
                  className="text-gray-400 hover:text-white hover:bg-white/10 p-2 rounded-lg transition-all"
                >
                  <XCircle className="w-6 h-6" />
                </button>
              </div>
            </div>

            <form
              onSubmit={async (e) => {
                e.preventDefault();
                const formData = new FormData(e.currentTarget);
                
                // Collect all checked sections
                const allowedSections = formData.getAll('allowedSections') as string[];
                
                const userData = {
                  username: formData.get('username'),
                  name: formData.get('name'),
                  password: formData.get('password'),
                  role: formData.get('role'),
                  employeeId: formData.get('employeeId'),
                  department: formData.get('department'),
                  email: formData.get('email'),
                  allowedSections: allowedSections.length > 0 ? allowedSections : ['dashboard', 'mcq-tests'],
                };

                try {
                  const response = await fetch('/api/admin/users', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(userData),
                  });

                  const data = await response.json();

                  if (data.success) {
                    alert('User created successfully!');
                    setShowCreateUser(false);
                    fetchData();
                  } else {
                    alert(data.message || 'Failed to create user');
                  }
                } catch (error) {
                  console.error('Error creating user:', error);
                  alert('Failed to create user');
                }
              }}
              className="p-6 space-y-6"
            >
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-semibold text-purple-300 mb-2">
                    Username <span className="text-red-400">*</span>
                  </label>
                  <input
                    type="text"
                    name="username"
                    required
                    className="w-full px-4 py-3 bg-white/5 border border-white/20 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-500/20 transition-all"
                    placeholder="Enter username"
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-purple-300 mb-2">
                    Full Name <span className="text-red-400">*</span>
                  </label>
                  <input
                    type="text"
                    name="name"
                    required
                    className="w-full px-4 py-3 bg-white/5 border border-white/20 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-500/20 transition-all"
                    placeholder="Enter full name"
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-purple-300 mb-2">
                    Password <span className="text-red-400">*</span>
                  </label>
                  <input
                    type="password"
                    name="password"
                    required
                    minLength={6}
                    className="w-full px-4 py-3 bg-white/5 border border-white/20 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-500/20 transition-all"
                    placeholder="Min. 6 characters"
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-purple-300 mb-2">
                    Role <span className="text-red-400">*</span>
                  </label>
                  <select
                    name="role"
                    required
                    className="w-full px-4 py-3 bg-white/5 border border-white/20 rounded-xl text-white focus:outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-500/20 transition-all"
                  >
                    <option value="user" className="bg-slate-900">User</option>
                    <option value="trainer" className="bg-slate-900">Trainer</option>
                    <option value="admin" className="bg-slate-900">Admin</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-purple-300 mb-2">
                    Employee ID
                  </label>
                  <input
                    type="text"
                    name="employeeId"
                    className="w-full px-4 py-3 bg-white/5 border border-white/20 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-500/20 transition-all"
                    placeholder="Optional"
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-purple-300 mb-2">
                    Department
                  </label>
                  <input
                    type="text"
                    name="department"
                    className="w-full px-4 py-3 bg-white/5 border border-white/20 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-500/20 transition-all"
                    placeholder="Optional"
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="block text-sm font-semibold text-purple-300 mb-2">
                    Email
                  </label>
                  <input
                    type="email"
                    name="email"
                    className="w-full px-4 py-3 bg-white/5 border border-white/20 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-500/20 transition-all"
                    placeholder="Optional"
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="block text-sm font-semibold text-purple-300 mb-3">
                    Allowed Sections <span className="text-gray-400 text-xs font-normal">(Select modules user can access)</span>
                  </label>
                  <div className="grid grid-cols-2 gap-3">
                    {[
                      { id: 'dashboard', label: 'Dashboard', icon: '🏠' },
                      { id: 'sop-upload', label: 'SOP Upload', icon: '📤' },
                      { id: 'mcq-bank', label: 'MCQ Bank', icon: '📚' },
                      { id: 'bulk-process', label: 'Bulk Process', icon: '⚡' },
                      { id: 'files-manager', label: 'Files Manager', icon: '📁' },
                      { id: 'admin', label: 'Admin Panel', icon: '⚙️' },
                      { id: 'mcq-tests', label: 'MCQ Tests', icon: '✅' },
                    ].map(section => (
                      <label
                        key={section.id}
                        className="flex items-center space-x-3 bg-white/5 p-3 rounded-lg hover:bg-white/10 transition-all cursor-pointer border border-white/10 hover:border-purple-500/50"
                      >
                        <input
                          type="checkbox"
                          name="allowedSections"
                          value={section.id}
                          defaultChecked={section.id === 'dashboard' || section.id === 'mcq-tests'}
                          className="w-4 h-4 rounded border-gray-400 text-purple-600 focus:ring-purple-500 focus:ring-2"
                        />
                        <span className="text-lg">{section.icon}</span>
                        <span className="text-white text-sm font-medium flex-1">
                          {section.label}
                        </span>
                      </label>
                    ))}
                  </div>
                  <p className="text-xs text-gray-400 mt-2">
                    💡 Tip: Dashboard and MCQ Tests are selected by default for all users
                  </p>
                </div>
              </div>

              <div className="flex items-center justify-end space-x-4 pt-4 border-t border-white/10">
                <button
                  type="button"
                  onClick={() => setShowCreateUser(false)}
                  className="px-6 py-3 bg-white/5 hover:bg-white/10 text-gray-300 rounded-xl font-medium transition-all border border-white/20"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-6 py-3 bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white rounded-xl font-semibold transition-all transform hover:scale-105 shadow-lg shadow-purple-500/30 flex items-center space-x-2"
                >
                  <UserPlus className="h-5 w-5" />
                  <span>Create User</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit User Modal */}
      {editingUser && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-gradient-to-br from-slate-900 to-purple-900 rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto border border-white/20">
            <div className="p-6 border-b border-white/10 sticky top-0 bg-gradient-to-r from-purple-900/90 to-pink-900/90 backdrop-blur-xl z-10">
              <div className="flex items-center justify-between">
                <h3 className="text-3xl font-bold text-white flex items-center">
                  <Edit className="h-8 w-8 mr-3 text-purple-400" />
                  Edit User: {editingUser.name}
                </h3>
                <button
                  onClick={() => setEditingUser(null)}
                  className="text-gray-400 hover:text-white hover:bg-white/10 p-2 rounded-lg transition-all"
                >
                  <XCircle className="w-6 h-6" />
                </button>
              </div>
            </div>

            <form
              onSubmit={async (e) => {
                e.preventDefault();
                const formData = new FormData(e.currentTarget);
                
                // Collect all checked sections
                const allowedSections = formData.getAll('allowedSections') as string[];
                
                const userData = {
                  name: formData.get('name'),
                  role: formData.get('role'),
                  employeeId: formData.get('employeeId'),
                  department: formData.get('department'),
                  email: formData.get('email'),
                  allowedSections: allowedSections.length > 0 ? allowedSections : ['dashboard', 'mcq-tests'],
                };

                // Only include password if it's provided
                const password = formData.get('password') as string;
                if (password && password.trim()) {
                  (userData as any).password = password;
                }

                try {
                  const response = await fetch(`/api/admin/users/${editingUser._id}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(userData),
                  });

                  const data = await response.json();

                  if (data.success) {
                    alert('User updated successfully!');
                    setEditingUser(null);
                    fetchData();
                  } else {
                    alert(data.message || 'Failed to update user');
                  }
                } catch (error) {
                  console.error('Error updating user:', error);
                  alert('Failed to update user');
                }
              }}
              className="p-6 space-y-6"
            >
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-semibold text-purple-300 mb-2">
                    Username
                  </label>
                  <input
                    type="text"
                    value={editingUser.username}
                    disabled
                    className="w-full px-4 py-3 bg-white/5 border border-white/20 rounded-xl text-gray-400 cursor-not-allowed"
                  />
                  <p className="text-xs text-gray-500 mt-1">Username cannot be changed</p>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-purple-300 mb-2">
                    Full Name <span className="text-red-400">*</span>
                  </label>
                  <input
                    type="text"
                    name="name"
                    required
                    defaultValue={editingUser.name}
                    className="w-full px-4 py-3 bg-white/5 border border-white/20 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-500/20 transition-all"
                    placeholder="Enter full name"
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-purple-300 mb-2">
                    New Password
                  </label>
                  <input
                    type="password"
                    name="password"
                    minLength={6}
                    className="w-full px-4 py-3 bg-white/5 border border-white/20 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-500/20 transition-all"
                    placeholder="Leave blank to keep current"
                  />
                  <p className="text-xs text-gray-500 mt-1">Min. 6 characters (optional)</p>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-purple-300 mb-2">
                    Role <span className="text-red-400">*</span>
                  </label>
                  <select
                    name="role"
                    required
                    defaultValue={editingUser.role}
                    className="w-full px-4 py-3 bg-white/5 border border-white/20 rounded-xl text-white focus:outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-500/20 transition-all"
                  >
                    <option value="user" className="bg-slate-900">User</option>
                    <option value="trainer" className="bg-slate-900">Trainer</option>
                    <option value="admin" className="bg-slate-900">Admin</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-purple-300 mb-2">
                    Employee ID
                  </label>
                  <input
                    type="text"
                    name="employeeId"
                    defaultValue={editingUser.employeeId || ''}
                    className="w-full px-4 py-3 bg-white/5 border border-white/20 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-500/20 transition-all"
                    placeholder="Optional"
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-purple-300 mb-2">
                    Department
                  </label>
                  <input
                    type="text"
                    name="department"
                    defaultValue={editingUser.department || ''}
                    className="w-full px-4 py-3 bg-white/5 border border-white/20 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-500/20 transition-all"
                    placeholder="Optional"
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="block text-sm font-semibold text-purple-300 mb-2">
                    Email
                  </label>
                  <input
                    type="email"
                    name="email"
                    defaultValue={editingUser.email || ''}
                    className="w-full px-4 py-3 bg-white/5 border border-white/20 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-500/20 transition-all"
                    placeholder="Optional"
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="block text-sm font-semibold text-purple-300 mb-3">
                    Allowed Sections <span className="text-gray-400 text-xs font-normal">(Select modules user can access)</span>
                  </label>
                  <div className="grid grid-cols-2 gap-3">
                    {[
                      { id: 'dashboard', label: 'Dashboard', icon: '🏠' },
                      { id: 'sop-upload', label: 'SOP Upload', icon: '📤' },
                      { id: 'mcq-bank', label: 'MCQ Bank', icon: '📚' },
                      { id: 'bulk-process', label: 'Bulk Process', icon: '⚡' },
                      { id: 'files-manager', label: 'Files Manager', icon: '📁' },
                      { id: 'admin', label: 'Admin Panel', icon: '⚙️' },
                      { id: 'mcq-tests', label: 'MCQ Tests', icon: '✅' },
                    ].map(section => (
                      <label
                        key={section.id}
                        className="flex items-center space-x-3 bg-white/5 p-3 rounded-lg hover:bg-white/10 transition-all cursor-pointer border border-white/10 hover:border-purple-500/50"
                      >
                        <input
                          type="checkbox"
                          name="allowedSections"
                          value={section.id}
                          defaultChecked={(editingUser as any).allowedSections?.includes(section.id) || section.id === 'dashboard' || section.id === 'mcq-tests'}
                          className="w-4 h-4 rounded border-gray-400 text-purple-600 focus:ring-purple-500 focus:ring-2"
                        />
                        <span className="text-lg">{section.icon}</span>
                        <span className="text-white text-sm font-medium flex-1">
                          {section.label}
                        </span>
                      </label>
                    ))}
                  </div>
                  <p className="text-xs text-gray-400 mt-2">
                    💡 Tip: Dashboard and MCQ Tests are recommended for all users
                  </p>
                </div>
              </div>

              <div className="flex items-center justify-end space-x-4 pt-4 border-t border-white/10">
                <button
                  type="button"
                  onClick={() => setEditingUser(null)}
                  className="px-6 py-3 bg-white/5 hover:bg-white/10 text-gray-300 rounded-xl font-medium transition-all border border-white/20"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-6 py-3 bg-gradient-to-r from-blue-500 to-cyan-500 hover:from-blue-600 hover:to-cyan-600 text-white rounded-xl font-semibold transition-all transform hover:scale-105 shadow-lg shadow-blue-500/30 flex items-center space-x-2"
                >
                  <Edit className="h-5 w-5" />
                  <span>Update User</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
