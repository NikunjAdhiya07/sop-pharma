'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { 
  User, 
  Mail, 
  Shield, 
  Award, 
  Clock, 
  Calendar,
  ChevronLeft,
  Edit,
  Save,
  X
} from 'lucide-react';

interface UserData {
  id: string;
  username: string;
  name: string;
  role: string;
  trainingStage?: 'induction' | 'active' | 'certified';
  department?: string;
  email?: string;
  joinDate?: string;
}

export default function UserProfilePage() {
  const router = useRouter();
  const [user, setUser] = useState<UserData | null>(null);
  const [loading, setLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  // Mock additional details since they might not be in the basic auth token
  const [details, setDetails] = useState({
    department: 'Quality Assurance',
    email: '',
    phone: '+91 98765 43210',
    location: 'Mumbai, India',
    bio: 'Dedicated QA professional with a focus on SOP compliance and process optimization.'
  });

  useEffect(() => {
    // Check if user is logged in
    const userData = localStorage.getItem('user');
    if (!userData) {
      router.push('/login');
      return;
    }

    try {
      const parsedUser = JSON.parse(userData);
      setUser(parsedUser);
      setDetails(prev => ({
        ...prev,
        email: parsedUser.username.includes('@') ? parsedUser.username : `${parsedUser.username.toLowerCase()}@soppharma.com`
      }));
    } catch (error) {
      console.error('Error parsing user data:', error);
      router.push('/login');
    } finally {
      setLoading(false);
    }
  }, [router]);

  const handleSave = () => {
    // In a real app, this would make an API call
    setIsEditing(false);
    // Refresh user data or show toast
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex items-center justify-center">
        <div className="flex flex-col items-center">
          <div className="w-16 h-16 border-4 border-purple-500 border-t-transparent rounded-full animate-spin mb-4"></div>
          <p className="text-white text-xl font-medium">Loading Profile...</p>
        </div>
      </div>
    );
  }

  if (!user) return null;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 pb-20">
      {/* Header */}
      <header className="bg-white/5 backdrop-blur-xl border-b border-white/10 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <Link href="/dashboard" className="p-2 hover:bg-white/10 rounded-full transition-colors text-white">
                <ChevronLeft className="h-6 w-6" />
              </Link>
              <h1 className="text-2xl font-bold bg-gradient-to-r from-purple-200 to-pink-200 bg-clip-text text-transparent">
                My Profile
              </h1>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Profile Card */}
        <div className="bg-white/10 backdrop-blur-lg rounded-3xl border border-white/20 overflow-hidden shadow-2xl">
          {/* Banner Area */}
          <div className="h-48 bg-gradient-to-r from-purple-600 to-pink-600 relative">
            <div className="absolute inset-0 bg-black/20"></div>
          </div>

          <div className="px-8 pb-8 relative">
            {/* Avatar - overlapping the banner */}
            <div className="relative -mt-24 mb-6 flex justify-between items-end">
              <div className="rounded-full p-1.5 bg-slate-900 inline-block">
                <div className="h-40 w-40 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center border-4 border-slate-900 shadow-xl">
                   <span className="text-6xl font-bold text-white">
                     {user.name.charAt(0).toUpperCase()}
                   </span>
                </div>
              </div>
              
              <button 
                onClick={() => setIsEditing(!isEditing)}
                className="mb-4 px-6 py-2.5 rounded-xl font-semibold flex items-center space-x-2 transition-all transform hover:scale-105 shadow-lg bg-white/10 hover:bg-white/20 text-white border border-white/20"
              >
                {isEditing ? (
                  <>
                    <X className="w-4 h-4" />
                    <span>Cancel</span>
                  </>
                ) : (
                  <>
                    <Edit className="w-4 h-4" />
                    <span>Edit Profile</span>
                  </>
                )}
              </button>
            </div>

            {/* Basic Info */}
            <div className="mb-8">
              <h2 className="text-3xl font-bold text-white mb-1">{user.name}</h2>
              <p className="text-lg text-purple-300 flex items-center">
                 <Shield className="w-4 h-4 mr-2" />
                 {user.role.charAt(0).toUpperCase() + user.role.slice(1)} Access
              </p>
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
               <div className="bg-white/5 rounded-2xl p-4 border border-white/10">
                  <p className="text-gray-400 text-xs uppercase font-bold tracking-wider mb-1">Status</p>
                  <div className="flex items-center text-green-400 font-bold text-lg">
                    <div className="w-2.5 h-2.5 bg-green-500 rounded-full mr-2 animate-pulse"></div>
                    Active
                  </div>
               </div>
               <div className="bg-white/5 rounded-2xl p-4 border border-white/10">
                  <p className="text-gray-400 text-xs uppercase font-bold tracking-wider mb-1">Joined</p>
                  <div className="flex items-center text-white font-bold text-lg">
                    <Calendar className="w-4 h-4 mr-2 text-purple-400" />
                    Jan 2024
                  </div>
               </div>
               <div className="bg-white/5 rounded-2xl p-4 border border-white/10">
                  <p className="text-gray-400 text-xs uppercase font-bold tracking-wider mb-1">Training</p>
                  <div className="flex items-center text-blue-300 font-bold text-lg">
                    <Award className="w-4 h-4 mr-2 text-blue-400" />
                    {user.trainingStage ? user.trainingStage.toUpperCase() : 'STANDARD'}
                  </div>
               </div>
               <div className="bg-white/5 rounded-2xl p-4 border border-white/10">
                  <p className="text-gray-400 text-xs uppercase font-bold tracking-wider mb-1">Last Login</p>
                  <div className="flex items-center text-orange-300 font-bold text-lg">
                    <Clock className="w-4 h-4 mr-2 text-orange-400" />
                    Just now
                  </div>
               </div>
            </div>

            {/* Detailed Info Form */}
            <div className="bg-white/5 rounded-2xl p-8 border border-white/10">
               <h3 className="text-xl font-bold text-white mb-6 border-b border-white/10 pb-4">
                 Personal Information
               </h3>
               
               <div className="grid md:grid-cols-2 gap-8">
                  <div className="space-y-6">
                     <div>
                        <label className="block text-gray-400 text-sm mb-2">Full Name</label>
                        {isEditing ? (
                           <input 
                             type="text" 
                             defaultValue={user.name}
                             className="w-full bg-slate-900 border border-white/20 rounded-lg px-4 py-3 text-white focus:ring-2 focus:ring-purple-500 outline-none"
                           />
                        ) : (
                           <div className="text-white text-lg font-medium">{user.name}</div>
                        )}
                     </div>
                     
                     <div>
                        <label className="block text-gray-400 text-sm mb-2">Email Address</label>
                        {isEditing ? (
                           <input 
                             type="email" 
                             defaultValue={details.email}
                             className="w-full bg-slate-900 border border-white/20 rounded-lg px-4 py-3 text-white focus:ring-2 focus:ring-purple-500 outline-none"
                           />
                        ) : (
                           <div className="text-white text-lg font-medium flex items-center">
                             <Mail className="w-4 h-4 mr-2 text-gray-400" />
                             {details.email}
                           </div>
                        )}
                     </div>

                     <div>
                        <label className="block text-gray-400 text-sm mb-2">Department</label>
                        {isEditing ? (
                           <input 
                             type="text" 
                             defaultValue={details.department}
                             className="w-full bg-slate-900 border border-white/20 rounded-lg px-4 py-3 text-white focus:ring-2 focus:ring-purple-500 outline-none"
                           />
                        ) : (
                           <div className="text-white text-lg font-medium">
                             {details.department}
                           </div>
                        )}
                     </div>
                  </div>

                  <div className="space-y-6">
                     <div>
                        <label className="block text-gray-400 text-sm mb-2">Role</label>
                        <div className="text-white text-lg font-medium opacity-70">
                           {user.role} <span className="text-xs text-gray-500 ml-2">(ReadOnly)</span>
                        </div>
                     </div>
                      
                     <div>
                        <label className="block text-gray-400 text-sm mb-2">Username</label>
                        <div className="text-white text-lg font-medium flex items-center opacity-70">
                           <User className="w-4 h-4 mr-2 text-gray-400" />
                           {user.username}
                        </div>
                     </div>

                     <div>
                        <label className="block text-gray-400 text-sm mb-2">Location</label>
                        {isEditing ? (
                           <input 
                             type="text" 
                             defaultValue={details.location}
                             className="w-full bg-slate-900 border border-white/20 rounded-lg px-4 py-3 text-white focus:ring-2 focus:ring-purple-500 outline-none"
                           />
                        ) : (
                           <div className="text-white text-lg font-medium">
                             {details.location}
                           </div>
                        )}
                     </div>
                  </div>
               </div>

               {isEditing && (
                 <div className="mt-8 flex justify-end">
                    <button 
                      onClick={handleSave}
                      className="px-8 py-3 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white rounded-xl font-bold shadow-lg transform hover:scale-105 transition-all flex items-center"
                    >
                      <Save className="w-5 h-5 mr-2" />
                      Save Changes
                    </button>
                 </div>
               )}
            </div>

            {/* Account Settings Area (Read Only for now) */}
            <div className="mt-8 bg-white/5 rounded-2xl p-8 border border-white/10 opacity-60">
                <h3 className="text-xl font-bold text-white mb-4">Account Security</h3>
                <p className="text-gray-400 mb-6">Password and security settings can be managed by the administrator.</p>
                <div className="flex gap-4">
                    <button disabled className="px-4 py-2 border border-white/20 rounded-lg text-gray-400 text-sm cursor-not-allowed">Change Password</button>
                    <button disabled className="px-4 py-2 border border-white/20 rounded-lg text-gray-400 text-sm cursor-not-allowed">Two-Factor Authentication</button>
                </div>
            </div>

          </div>
        </div>
      </main>
    </div>
  );
}
