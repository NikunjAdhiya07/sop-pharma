'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Search, FolderTree, FileText, Video, Brain, Loader2 } from 'lucide-react';

interface MasterSOP {
  _id: string;
  sopIdentifier: string;
  sopName: string;
  department: string;
  departmentCode: string;
  folderPath: string;
  parentFolder?: string;
  subfolderLevel: number;
  sopDocument: {
    fileName: string;
    filePath: string;
    fileSize: number;
    uploadedAt: string;
  };
  metadata: {
    effectiveDate?: string;
    reviewDate?: string;
    expiryDate?: string;
    version?: string;
    wordCount: number;
  };
  resources: {
    hasVideos: boolean;
    videoCount: number;
    hasSlides: boolean;
    slideCount: number;
    hasMCQs: boolean;
    mcqCount: number;
  };
  createdAt: string;
  updatedAt: string;
}

export default function MasterSOPRepository() {
  const router = useRouter();
  
  // State
  const [sops, setSops] = useState<MasterSOP[]>([]);
  const [departments, setDepartments] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [repositoryDepartment, setRepositoryDepartment] = useState<string>('all');
  const [repositorySearch, setRepositorySearch] = useState('');

  // Fetch data from Master SOP Repository API
  useEffect(() => {
    fetchMasterRepository();
  }, [repositoryDepartment]);

  const fetchMasterRepository = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (repositoryDepartment !== 'all') {
        params.append('department', repositoryDepartment);
      }

      const response = await fetch(`/api/master-sop-repository?${params}`);
      const data = await response.json();

      if (data.success) {
        setSops(data.sops);
        setDepartments(data.departments);
      }
    } catch (error) {
      console.error('Error fetching Master SOP Repository:', error);
    } finally {
      setLoading(false);
    }
  };

  // Filter SOPs by search
  const getFilteredSOPs = () => {
    if (!repositorySearch) return sops;
    
    const search = repositorySearch.toLowerCase();
    return sops.filter(sop => 
      sop.sopName.toLowerCase().includes(search) ||
      sop.sopIdentifier.toLowerCase().includes(search) ||
      sop.folderPath?.toLowerCase().includes(search)
    );
  };

  const filteredSOPs = getFilteredSOPs();

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-12 w-12 text-green-400 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Repository Header */}
      <div className="bg-gradient-to-r from-green-900/30 to-emerald-900/30 border border-green-500/30 rounded-2xl p-6">
        <div className="flex items-center gap-3 mb-4">
          <FolderTree className="h-8 w-8 text-green-400" />
          <div>
            <h2 className="text-3xl font-bold text-white">Master SOP Repository</h2>
            <p className="text-gray-300">
              Centralized repository of all SOPs uploaded via folder structure ({sops.length} SOPs)
            </p>
          </div>
        </div>

        {/* Filters */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Department Filter */}
          <div>
            <label className="block text-sm font-semibold text-gray-300 mb-2">
              Filter by Department
            </label>
            <select
              value={repositoryDepartment}
              onChange={(e) => setRepositoryDepartment(e.target.value)}
              className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-green-500"
            >
              <option value="all" className="bg-slate-800">All Departments</option>
              {departments.map(dept => (
                <option key={dept} value={dept} className="bg-slate-800">{dept}</option>
              ))}
            </select>
          </div>

          {/* Search */}
          <div>
            <label className="block text-sm font-semibold text-gray-300 mb-2">
              Search SOPs
            </label>
            <div className="relative">
              <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
              <input
                type="text"
                placeholder="Search by name, identifier, or folder..."
                value={repositorySearch}
                onChange={(e) => setRepositorySearch(e.target.value)}
                className="w-full pl-12 pr-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-green-500"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Repository SOPs Table */}
      <div className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-white/10">
              <tr>
                <th className="px-6 py-4 text-left text-sm font-semibold text-gray-300">SOP Identifier</th>
                <th className="px-6 py-4 text-left text-sm font-semibold text-gray-300">SOP Name</th>
                <th className="px-6 py-4 text-left text-sm font-semibold text-gray-300">Department</th>
                <th className="px-6 py-4 text-left text-sm font-semibold text-gray-300">Folder Path</th>
                <th className="px-6 py-4 text-left text-sm font-semibold text-gray-300">Resources</th>
                <th className="px-6 py-4 text-left text-sm font-semibold text-gray-300">File Info</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10">
              {filteredSOPs.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-gray-400">
                    No SOPs found in Master Repository. Upload folders to populate.
                  </td>
                </tr>
              ) : (
                filteredSOPs.map((sop) => (
                  <tr key={sop._id} className="hover:bg-white/5 transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <FileText className="h-5 w-5 text-green-400" />
                        <span className="font-semibold text-white">{sop.sopIdentifier}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-gray-300 max-w-md truncate" title={sop.sopName}>
                        {sop.sopName}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className="px-3 py-1 bg-purple-500/20 text-purple-300 rounded-lg text-sm font-semibold">
                        {sop.department}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-gray-400 text-sm max-w-xs truncate" title={sop.folderPath}>
                        📁 {sop.folderPath}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        {sop.resources.hasVideos && (
                          <div className="flex items-center gap-1 text-blue-400" title="Has Videos">
                            <Video className="h-4 w-4" />
                            <span className="text-xs">{sop.resources.videoCount}</span>
                          </div>
                        )}
                        {sop.resources.hasSlides && (
                          <div className="flex items-center gap-1 text-yellow-400" title="Has Slides">
                            <FileText className="h-4 w-4" />
                            <span className="text-xs">{sop.resources.slideCount}</span>
                          </div>
                        )}
                        {sop.resources.hasMCQs && (
                          <div className="flex items-center gap-1 text-green-400" title="Has MCQs">
                            <Brain className="h-4 w-4" />
                            <span className="text-xs">{sop.resources.mcqCount}</span>
                          </div>
                        )}
                        {!sop.resources.hasVideos && !sop.resources.hasSlides && !sop.resources.hasMCQs && (
                          <span className="text-gray-500 text-xs">No resources yet</span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-gray-400 text-xs">
                        <div className="font-semibold text-white mb-1">{sop.sopDocument.fileName}</div>
                        <div>{(sop.sopDocument.fileSize / 1024).toFixed(1)} KB</div>
                        <div>{new Date(sop.sopDocument.uploadedAt).toLocaleDateString()}</div>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-gradient-to-br from-green-900/30 to-emerald-900/30 border border-green-500/30 rounded-xl p-6">
          <div className="flex items-center gap-3 mb-2">
            <FileText className="h-6 w-6 text-green-400" />
            <span className="text-gray-300 font-semibold">Total SOPs</span>
          </div>
          <p className="text-3xl font-bold text-white">{sops.length}</p>
        </div>
        <div className="bg-gradient-to-br from-purple-900/30 to-pink-900/30 border border-purple-500/30 rounded-xl p-6">
          <div className="flex items-center gap-3 mb-2">
            <FolderTree className="h-6 w-6 text-purple-400" />
            <span className="text-gray-300 font-semibold">Departments</span>
          </div>
          <p className="text-3xl font-bold text-white">{departments.length}</p>
        </div>
        <div className="bg-gradient-to-br from-blue-900/30 to-indigo-900/30 border border-blue-500/30 rounded-xl p-6">
          <div className="flex items-center gap-3 mb-2">
            <Video className="h-6 w-6 text-blue-400" />
            <span className="text-gray-300 font-semibold">With Videos</span>
          </div>
          <p className="text-3xl font-bold text-white">
            {sops.filter(s => s.resources.hasVideos).length}
          </p>
        </div>
        <div className="bg-gradient-to-br from-yellow-900/30 to-orange-900/30 border border-yellow-500/30 rounded-xl p-6">
          <div className="flex items-center gap-3 mb-2">
            <Brain className="h-6 w-6 text-yellow-400" />
            <span className="text-gray-300 font-semibold">With MCQs</span>
          </div>
          <p className="text-3xl font-bold text-white">
            {sops.filter(s => s.resources.hasMCQs).length}
          </p>
        </div>
      </div>
    </div>
  );
}
