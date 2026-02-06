'use client';

import { useState, useEffect } from 'react';
import { PlayCircle, FileText, CheckCircle, Lock, MonitorPlay, BookOpen } from 'lucide-react';
import PageHeader from '@/components/PageHeader';
import SecureVideoPlayer from '@/components/SecureVideoPlayer';
import SecureSOPViewer from '@/components/SecureSOPViewer';

export default function InductionDashboard() {
  const [activeTab, setActiveTab] = useState<'videos' | 'sops'>('videos');
  const [selectedResource, setSelectedResource] = useState<any>(null);
  const [progress, setProgress] = useState({ videos: 0, sops: 0, total: 0 });
  
  // Mock Data (In real app, fetch from API)
  const videos = [
    { _id: 'v1', title: 'GMP Basics', duration: 120, completed: false, url: '/videos/gmp-intro.mp4' },
    { _id: 'v2', title: 'Safety Protocols', duration: 300, completed: false, url: '/videos/safety.mp4' }
  ];
  
  const sops = [
    { _id: 's1', title: 'SOP-QA-001: Documentation', content: '<p>Standard Operating Procedure for Documentation...</p>', completed: false },
    { _id: 's2', title: 'SOP-PROD-005: Gowning', content: '<p>Gowning procedure for sterile areas...</p>', completed: false }
  ];

  return (
    <div className="min-h-screen bg-slate-50 p-8">
      {selectedResource ? (
         // Viewer Mode
         <div className="max-w-6xl mx-auto animate-in fade-in zoom-in-95">
             <button 
                onClick={() => setSelectedResource(null)}
                className="mb-4 text-sm font-bold text-slate-500 hover:text-purple-600 flex items-center gap-2"
             >
                 ← Back to Dashboard
             </button>
             
             {selectedResource.type === 'video' ? (
                 <SecureVideoPlayer 
                    resourceId={selectedResource._id}
                    title={selectedResource.title}
                    src={selectedResource.url}
                    onComplete={() => {
                        // Optimistic update locally or refetch
                        alert("Video Completed! Progress logged.");
                    }}
                 />
             ) : (
                 <SecureSOPViewer 
                    sopId={selectedResource._id}
                    title={selectedResource.title}
                    content={selectedResource.content}
                    userIdentifier="Induction User (You)"
                 />
             )}
         </div>
      ) : (
        // Dashboard Mode
        <div className="max-w-6xl mx-auto space-y-8">
            <PageHeader 
                title="Induction Training" 
                subtitle="Complete all modules to proceed to full access."
                icon={MonitorPlay}
                showBack={false}
            />

            {/* Progress Overview */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex items-center gap-4">
                    <div className="p-3 bg-purple-100 text-purple-600 rounded-xl">
                        <PlayCircle className="w-8 h-8" />
                    </div>
                    <div>
                        <p className="text-sm font-medium text-slate-500">Videos Watched</p>
                        <h3 className="text-2xl font-bold text-slate-800">0 / {videos.length}</h3>
                    </div>
                </div>
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex items-center gap-4">
                     <div className="p-3 bg-emerald-100 text-emerald-600 rounded-xl">
                        <BookOpen className="w-8 h-8" />
                    </div>
                    <div>
                        <p className="text-sm font-medium text-slate-500">SOPs Read</p>
                        <h3 className="text-2xl font-bold text-slate-800">0 / {sops.length}</h3>
                    </div>
                </div>
                 <div className="bg-gradient-to-br from-slate-800 to-slate-900 p-6 rounded-2xl shadow-lg border border-slate-700 text-white flex items-center justify-between">
                    <div>
                        <p className="text-sm font-medium text-slate-400">Overall Status</p>
                        <h3 className="text-xl font-bold">Induction Mode</h3>
                    </div>
                    <Lock className="w-8 h-8 text-slate-500" />
                </div>
            </div>

            {/* Content Tabs */}
            <div className="bg-white rounded-3xl shadow-sm border border-slate-100 overflow-hidden min-h-[500px]">
                <div className="flex border-b border-slate-100">
                    <button 
                        onClick={() => setActiveTab('videos')}
                        className={`flex-1 py-4 font-bold text-sm flex items-center justify-center gap-2 transition-colors ${activeTab === 'videos' ? 'bg-purple-50 text-purple-600 border-b-2 border-purple-600' : 'text-slate-500 hover:bg-slate-50'}`}
                    >
                        <PlayCircle className="w-4 h-4" /> Training Videos
                    </button>
                    <button 
                         onClick={() => setActiveTab('sops')}
                         className={`flex-1 py-4 font-bold text-sm flex items-center justify-center gap-2 transition-colors ${activeTab === 'sops' ? 'bg-purple-50 text-purple-600 border-b-2 border-purple-600' : 'text-slate-500 hover:bg-slate-50'}`}
                    >
                        <FileText className="w-4 h-4" /> Required SOPs
                    </button>
                </div>

                <div className="p-8">
                    {activeTab === 'videos' ? (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            {videos.map(video => (
                                <div key={video._id} className="group relative bg-slate-50 rounded-2xl overflow-hidden border border-slate-200 hover:shadow-md transition-all cursor-pointer" onClick={() => setSelectedResource({ ...video, type: 'video' })}>
                                    <div className="aspect-video bg-slate-200 flex items-center justify-center group-hover:bg-slate-300 transition-colors">
                                        <PlayCircle className="w-16 h-16 text-slate-400 group-hover:text-purple-600 transition-colors" />
                                    </div>
                                    <div className="p-4">
                                        <h4 className="font-bold text-slate-800 mb-1">{video.title}</h4>
                                        <p className="text-xs text-slate-500">{Math.floor(video.duration / 60)} mins • Pending</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="space-y-4">
                            {sops.map(sop => (
                                <div key={sop._id} className="flex items-center justify-between p-4 bg-slate-50 rounded-xl border border-slate-200 hover:border-purple-200 hover:bg-purple-50/50 transition-all cursor-pointer" onClick={() => setSelectedResource({ ...sop, type: 'sop' })}>
                                    <div className="flex items-center gap-4">
                                        <div className="p-2 bg-white rounded-lg border border-slate-100 text-purple-600">
                                            <FileText className="w-6 h-6" />
                                        </div>
                                        <div>
                                            <h4 className="font-bold text-slate-800">{sop.title}</h4>
                                            <p className="text-xs text-slate-500">Read carefully strictly no copying</p>
                                        </div>
                                    </div>
                                    <button className="px-4 py-2 bg-white border border-slate-200 rounded-lg text-xs font-bold text-slate-600 hover:text-purple-600 hover:border-purple-200 transition-colors">
                                        Read Now
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
      )}
    </div>
  );
}
