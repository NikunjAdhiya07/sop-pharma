'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { 
  Video, 
  FileText, 
  Brain, 
  BookOpen, 
  Loader2, 
  Upload,
  Download,
  Trash2,
  ArrowLeft,
  Play,
  Eye,
  X
} from 'lucide-react';

interface VideoFile {
  fileName: string;
  filePath: string;
  title?: string;
  description?: string;
  uploadedAt: string;
  fileSize: number;
}

interface SlideFile {
  fileName: string;
  filePath: string;
  title?: string;
  fileType: 'pdf' | 'ppt' | 'pptx';
  uploadedAt: string;
  fileSize: number;
}

interface SOPDocument {
  fileName: string;
  filePath: string;
  fileType: 'pdf' | 'docx';
  uploadedAt: string;
  fileSize: number;
}

interface MCQ {
  aiIcon: string;
  question: string;
  difficulty: 'Easy' | 'Medium' | 'Hard';
  difficultyStars: '⭐' | '⭐⭐' | '⭐⭐⭐';
  options: string[];
  correctAnswer: string;
  explanation: string;
  sopReference: string;
  optionVariants: Array<{
    text: string;
    isCorrect: boolean;
  }>;
}

interface MCQBank {
  totalQuestions: number;
  difficultyDistribution: {
    easy: number;
    medium: number;
    hard: number;
  };
}

interface SOPLibrary {
  _id: string;
  sopId: string;
  sopName: string;
  sopIdentifier: string;
  department: string;
  departmentCode: string;
  mcqBankId?: MCQBank;
  videos: VideoFile[];
  slides: SlideFile[];
  sopDocuments: SOPDocument[];
  completionStatus: {
    hasVideos: boolean;
    hasSlides: boolean;
    hasMCQs: boolean;
    hasSOPDoc: boolean;
    percentage: number;
  };
  metadata: {
    views: number;
    totalMCQs: number;
  };
}

export default function SOPDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter();
  const unwrappedParams = React.use(params);
  const [sopLibrary, setSopLibrary] = useState<SOPLibrary | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadType, setUploadType] = useState<'video' | 'slide' | 'document' | null>(null);
  const [showMCQModal, setShowMCQModal] = useState(false);
  const [mcqs, setMcqs] = useState<MCQ[]>([]);
  const [loadingMCQs, setLoadingMCQs] = useState(false);
  const [selectedMCQ, setSelectedMCQ] = useState<{mcq: MCQ, index: number} | null>(null);
  const [difficultyFilter, setDifficultyFilter] = useState<string>('All');
  
  const videoInputRef = useRef<HTMLInputElement>(null);
  const slideInputRef = useRef<HTMLInputElement>(null);
  const docInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchSOPLibrary();
  }, [unwrappedParams.id]);

  const fetchSOPLibrary = async () => {
    try {
      const response = await fetch(`/api/sop-library?id=${unwrappedParams.id}`);
      const data = await response.json();

      if (data.success && data.sopLibraries.length > 0) {
        setSopLibrary(data.sopLibraries[0]);
      }
    } catch (error) {
      console.error('Error fetching SOP library:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleFileUpload = async (files: FileList, fileType: 'video' | 'slide' | 'document') => {
    if (!sopLibrary || files.length === 0) return;

    setUploading(true);
    setUploadType(fileType);

    try {
      const formData = new FormData();
      formData.append('sopLibraryId', sopLibrary._id);
      formData.append('fileType', fileType);

      for (let i = 0; i < files.length; i++) {
        formData.append('files', files[i]);
      }

      const response = await fetch('/api/sop-library/upload', {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();

      if (data.success) {
        alert(`${files.length} file(s) uploaded successfully!`);
        await fetchSOPLibrary();
      } else {
        alert('Upload failed: ' + data.error);
      }
    } catch (error) {
      console.error('Error uploading files:', error);
      alert('An error occurred during upload');
    } finally {
      setUploading(false);
      setUploadType(null);
    }
  };

  const handleDeleteFile = async (filePath: string, fileType: 'video' | 'slide' | 'document') => {
    if (!sopLibrary || !confirm('Are you sure you want to delete this file?')) return;

    try {
      const response = await fetch(
        `/api/sop-library/upload?sopLibraryId=${sopLibrary._id}&fileType=${fileType}&filePath=${encodeURIComponent(filePath)}`,
        { method: 'DELETE' }
      );

      const data = await response.json();

      if (data.success) {
        alert('File deleted successfully');
        await fetchSOPLibrary();
      } else {
        alert('Delete failed: ' + data.error);
      }
    } catch (error) {
      console.error('Error deleting file:', error);
      alert('An error occurred during deletion');
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const fetchMCQs = async () => {
    if (!sopLibrary) return;
    
    setLoadingMCQs(true);
    try {
      const response = await fetch(`/api/mcq-bank?sopId=${sopLibrary.sopId}`);
      const data = await response.json();
      
      if (data.success && data.mcqBanks.length > 0) {
        setMcqs(data.mcqBanks[0].mcqs || []);
        setShowMCQModal(true);
      } else {
        alert('No MCQs found for this SOP');
      }
    } catch (error) {
      console.error('Error fetching MCQs:', error);
      alert('Failed to load MCQs');
    } finally {
      setLoadingMCQs(false);
    }
  };

  const getDifficultyColor = (difficulty: string) => {
    switch (difficulty) {
      case 'Easy':
        return 'bg-green-500/20 text-green-300 border-green-500';
      case 'Medium':
        return 'bg-yellow-500/20 text-yellow-300 border-yellow-500';
      case 'Hard':
        return 'bg-red-500/20 text-red-300 border-red-500';
      default:
        return 'bg-gray-500/20 text-gray-300 border-gray-500';
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex items-center justify-center">
        <Loader2 className="h-12 w-12 text-purple-400 animate-spin" />
      </div>
    );
  }

  if (!sopLibrary) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex items-center justify-center">
        <div className="text-center">
          <p className="text-white text-xl mb-4">SOP not found</p>
          <button
            onClick={() => router.push('/sop-library')}
            className="px-6 py-3 bg-gradient-to-r from-purple-600 to-pink-600 text-white font-semibold rounded-xl hover:from-purple-700 hover:to-pink-700 transition-all"
          >
            Back to Library
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 p-8">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <button
            onClick={() => router.push('/sop-library')}
            className="flex items-center gap-2 text-gray-300 hover:text-white mb-4 transition-colors"
          >
            <ArrowLeft className="h-5 w-5" />
            Back to Library
          </button>

          <div className="bg-gradient-to-r from-purple-600 to-pink-600 rounded-2xl p-8 shadow-2xl">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <h1 className="text-3xl font-bold text-white mb-2 uppercase">
                  {sopLibrary.sopIdentifier} - {sopLibrary.sopName}
                </h1>
                <p className="text-purple-100 font-mono text-lg mb-4">{sopLibrary.sopIdentifier}</p>
                <div className="flex items-center gap-4">
                  <span className="px-4 py-2 bg-white/20 rounded-lg text-white font-semibold">
                    {sopLibrary.department}
                  </span>
                  <span className="text-white text-2xl font-bold">
                    {sopLibrary.completionStatus.percentage}% Complete
                  </span>
                </div>
              </div>
              {sopLibrary.completionStatus.hasMCQs && (
                <button
                  onClick={() => router.push(`/mcq-tests?sopId=${sopLibrary.sopId}`)}
                  className="px-6 py-3 bg-white text-purple-600 font-bold rounded-xl hover:bg-gray-100 transition-all flex items-center gap-2"
                >
                  <Brain className="h-5 w-5" />
                  Take Test ({sopLibrary.metadata.totalMCQs} MCQs)
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Videos Section */}
        <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-6 shadow-2xl border border-white/20 mb-6">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <Video className="h-6 w-6 text-purple-400" />
              <h2 className="text-2xl font-bold text-white">Training Videos</h2>
              <span className="px-3 py-1 bg-purple-500/20 text-purple-300 rounded-full text-sm font-semibold">
                {sopLibrary.videos.length}
              </span>
            </div>
            <button
              onClick={() => videoInputRef.current?.click()}
              disabled={uploading}
              className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-purple-600 to-pink-600 text-white font-semibold rounded-lg hover:from-purple-700 hover:to-pink-700 transition-all disabled:opacity-50"
            >
              {uploading && uploadType === 'video' ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Uploading...
                </>
              ) : (
                <>
                  <Upload className="h-4 w-4" />
                  Upload Videos
                </>
              )}
            </button>
            <input
              ref={videoInputRef}
              type="file"
              accept="video/*"
              multiple
              className="hidden"
              onChange={(e) => e.target.files && handleFileUpload(e.target.files, 'video')}
            />
          </div>

          {sopLibrary.videos.length === 0 ? (
            <div className="text-center py-12 border-2 border-dashed border-gray-600 rounded-xl">
              <Video className="h-12 w-12 text-gray-500 mx-auto mb-3" />
              <p className="text-gray-400 mb-2">No videos uploaded yet</p>
              <p className="text-yellow-400 text-sm italic">📌 Training video will be uploaded soon</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {sopLibrary.videos.map((video, index) => (
                <div key={index} className="bg-white/5 rounded-xl p-4 border border-white/10 hover:border-purple-500/30 transition-all">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex-1">
                      <h3 className="text-white font-semibold mb-1">{video.title || video.fileName}</h3>
                      <p className="text-gray-400 text-sm">{formatFileSize(video.fileSize)}</p>
                      <p className="text-gray-500 text-xs">Uploaded: {formatDate(video.uploadedAt)}</p>
                    </div>
                    <button
                      onClick={() => handleDeleteFile(video.filePath, 'video')}
                      className="p-2 text-red-400 hover:bg-red-500/20 rounded-lg transition-all"
                      title="Delete video"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                  <div className="flex gap-2">
                    <a
                      href={`/api/files?path=${encodeURIComponent(video.filePath)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex-1 py-2 px-4 bg-purple-600 text-white font-semibold rounded-lg hover:bg-purple-700 transition-all flex items-center justify-center gap-2"
                    >
                      <Play className="h-4 w-4" />
                      Play
                    </a>
                    <a
                      href={`/api/files?path=${encodeURIComponent(video.filePath)}`}
                      download
                      className="py-2 px-4 bg-white/10 text-white font-semibold rounded-lg hover:bg-white/20 transition-all"
                    >
                      <Download className="h-4 w-4" />
                    </a>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Slides Section */}
        <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-6 shadow-2xl border border-white/20 mb-6">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <FileText className="h-6 w-6 text-purple-400" />
              <h2 className="text-2xl font-bold text-white">Training Slides</h2>
              <span className="px-3 py-1 bg-purple-500/20 text-purple-300 rounded-full text-sm font-semibold">
                {sopLibrary.slides.length}
              </span>
            </div>
            <button
              onClick={() => slideInputRef.current?.click()}
              disabled={uploading}
              className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-purple-600 to-pink-600 text-white font-semibold rounded-lg hover:from-purple-700 hover:to-pink-700 transition-all disabled:opacity-50"
            >
              {uploading && uploadType === 'slide' ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Uploading...
                </>
              ) : (
                <>
                  <Upload className="h-4 w-4" />
                  Upload Slides
                </>
              )}
            </button>
            <input
              ref={slideInputRef}
              type="file"
              accept=".pdf,.ppt,.pptx"
              multiple
              className="hidden"
              onChange={(e) => e.target.files && handleFileUpload(e.target.files, 'slide')}
            />
          </div>

          {sopLibrary.slides.length === 0 ? (
            <div className="text-center py-12 border-2 border-dashed border-gray-600 rounded-xl">
              <FileText className="h-12 w-12 text-gray-500 mx-auto mb-3" />
              <p className="text-gray-400 mb-2">No slides uploaded yet</p>
              <p className="text-yellow-400 text-sm italic">📌 Slides coming soon</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {sopLibrary.slides.map((slide, index) => (
                <div key={index} className="bg-white/5 rounded-xl p-4 border border-white/10 hover:border-purple-500/30 transition-all">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex-1">
                      <h3 className="text-white font-semibold mb-1">{slide.title || slide.fileName}</h3>
                      <p className="text-gray-400 text-sm">{slide.fileType.toUpperCase()} • {formatFileSize(slide.fileSize)}</p>
                      <p className="text-gray-500 text-xs">Uploaded: {formatDate(slide.uploadedAt)}</p>
                    </div>
                    <button
                      onClick={() => handleDeleteFile(slide.filePath, 'slide')}
                      className="p-2 text-red-400 hover:bg-red-500/20 rounded-lg transition-all"
                      title="Delete slide"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                  <div className="flex gap-2">
                    <a
                      href={`/api/files?path=${encodeURIComponent(slide.filePath)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex-1 py-2 px-4 bg-purple-600 text-white font-semibold rounded-lg hover:bg-purple-700 transition-all flex items-center justify-center gap-2"
                    >
                      <FileText className="h-4 w-4" />
                      View
                    </a>
                    <a
                      href={`/api/files?path=${encodeURIComponent(slide.filePath)}`}
                      download
                      className="py-2 px-4 bg-white/10 text-white font-semibold rounded-lg hover:bg-white/20 transition-all"
                    >
                      <Download className="h-4 w-4" />
                    </a>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* SOP Documents Section */}
        <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-6 shadow-2xl border border-white/20 mb-6">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <BookOpen className="h-6 w-6 text-purple-400" />
              <h2 className="text-2xl font-bold text-white">SOP Documents</h2>
              <span className="px-3 py-1 bg-gray-500/20 text-gray-300 rounded-full text-sm font-semibold">
                Optional
              </span>
              <span className="px-3 py-1 bg-purple-500/20 text-purple-300 rounded-full text-sm font-semibold">
                {sopLibrary.sopDocuments.length}
              </span>
            </div>
            <button
              onClick={() => docInputRef.current?.click()}
              disabled={uploading}
              className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-purple-600 to-pink-600 text-white font-semibold rounded-lg hover:from-purple-700 hover:to-pink-700 transition-all disabled:opacity-50"
            >
              {uploading && uploadType === 'document' ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Uploading...
                </>
              ) : (
                <>
                  <Upload className="h-4 w-4" />
                  Upload Document
                </>
              )}
            </button>
            <input
              ref={docInputRef}
              type="file"
              accept=".pdf,.doc,.docx"
              className="hidden"
              onChange={(e) => e.target.files && handleFileUpload(e.target.files, 'document')}
            />
          </div>

          {sopLibrary.sopDocuments.length === 0 ? (
            <div className="text-center py-12 border-2 border-dashed border-gray-600 rounded-xl">
              <BookOpen className="h-12 w-12 text-gray-500 mx-auto mb-3" />
              <p className="text-gray-400 mb-2">No SOP documents uploaded</p>
              <p className="text-gray-500 text-sm italic">SOP documents are optional</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {sopLibrary.sopDocuments.map((doc, index) => (
                <div key={index} className="bg-white/5 rounded-xl p-4 border border-white/10 hover:border-purple-500/30 transition-all">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex-1">
                      <h3 className="text-white font-semibold mb-1">{doc.fileName}</h3>
                      <p className="text-gray-400 text-sm">{doc.fileType.toUpperCase()} • {formatFileSize(doc.fileSize)}</p>
                      <p className="text-gray-500 text-xs">Uploaded: {formatDate(doc.uploadedAt)}</p>
                    </div>
                    <button
                      onClick={() => handleDeleteFile(doc.filePath, 'document')}
                      className="p-2 text-red-400 hover:bg-red-500/20 rounded-lg transition-all"
                      title="Delete document"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                  <div className="flex gap-2">
                    <a
                      href={`/api/files?path=${encodeURIComponent(doc.filePath)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex-1 py-2 px-4 bg-purple-600 text-white font-semibold rounded-lg hover:bg-purple-700 transition-all flex items-center justify-center gap-2"
                    >
                      <BookOpen className="h-4 w-4" />
                      View
                    </a>
                    <a
                      href={`/api/files?path=${encodeURIComponent(doc.filePath)}`}
                      download
                      className="py-2 px-4 bg-white/10 text-white font-semibold rounded-lg hover:bg-white/20 transition-all"
                    >
                      <Download className="h-4 w-4" />
                    </a>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* MCQ Section */}
        {sopLibrary.completionStatus.hasMCQs && (
          <div className="bg-gradient-to-r from-green-600/20 to-blue-600/20 backdrop-blur-lg rounded-2xl p-6 shadow-2xl border border-green-500/30">
            <div className="flex items-center justify-between mb-6">
              <div>
                <div className="flex items-center gap-3 mb-2">
                  <Brain className="h-6 w-6 text-green-400" />
                  <h2 className="text-2xl font-bold text-white">MCQ Assessment Available</h2>
                </div>
                <p className="text-gray-300">
                  {sopLibrary.metadata.totalMCQs} questions ready for testing
                </p>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <button
                onClick={fetchMCQs}
                disabled={loadingMCQs}
                className="px-6 py-4 bg-white/10 border-2 border-green-500/30 text-white font-bold rounded-xl hover:bg-white/20 hover:border-green-500/50 transition-all flex items-center justify-center gap-2 group disabled:opacity-50"
              >
                {loadingMCQs ? (
                  <>
                    <Loader2 className="h-5 w-5 text-green-400 animate-spin" />
                    <span>Loading...</span>
                  </>
                ) : (
                  <>
                    <Eye className="h-5 w-5 text-green-400 group-hover:scale-110 transition-transform" />
                    <span>View MCQs</span>
                    <span className="text-sm text-gray-400">({sopLibrary.metadata.totalMCQs})</span>
                  </>
                )}
              </button>

              <button
                onClick={() => router.push(`/mcq-tests?sopId=${sopLibrary.sopId}`)}
                className="px-6 py-4 bg-gradient-to-r from-green-600 to-blue-600 text-white font-bold rounded-xl hover:from-green-700 hover:to-blue-700 transition-all flex items-center justify-center gap-2 shadow-lg shadow-green-600/20"
              >
                <Brain className="h-5 w-5" />
                Start Test
              </button>
            </div>
          </div>
        )}
      </div>

      {/* MCQ Viewer Modal */}
      {showMCQModal && (
        <div className="fixed inset-0 bg-black/90 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-gradient-to-br from-slate-900 to-slate-800 rounded-2xl max-w-5xl w-full max-h-[90vh] overflow-hidden shadow-2xl border border-purple-500/30">
            {/* Modal Header */}
            <div className="bg-gradient-to-r from-purple-600 to-pink-600 p-6 flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-bold text-white mb-1">{sopLibrary?.sopName}</h2>
                <p className="text-purple-100 text-sm">{sopLibrary?.sopIdentifier}</p>
              </div>
              <button
                onClick={() => {
                  setShowMCQModal(false);
                  setSelectedMCQ(null);
                }}
                className="p-2 hover:bg-white/20 rounded-lg transition-colors"
              >
                <X className="h-6 w-6 text-white" />
              </button>
            </div>

            {/* Content */}
            <div className="overflow-y-auto max-h-[calc(90vh-100px)]">
              {selectedMCQ ? (
                /* Detailed MCQ View */
                <div className="p-6">
                  <button
                    onClick={() => setSelectedMCQ(null)}
                    className="flex items-center gap-2 text-gray-300 hover:text-white transition-colors mb-6"
                  >
                    <ArrowLeft className="h-5 w-5" />
                    Back to MCQ List
                  </button>

                  <div className="bg-slate-800/50 backdrop-blur-lg rounded-2xl p-8 border border-slate-700">
                    {/* Question Header */}
                    <div className="flex items-start gap-4 mb-6">
                      <div className="flex-shrink-0 w-12 h-12 rounded-full bg-purple-600 flex items-center justify-center text-white font-bold text-lg">
                        {selectedMCQ.index + 1}
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-3">
                          <span className="text-3xl">{selectedMCQ.mcq.aiIcon}</span>
                          <span className={`px-3 py-1 rounded-full text-xs font-bold flex items-center gap-1 ${getDifficultyColor(selectedMCQ.mcq.difficulty)}`}>
                            <span>⭐</span>
                            <span>{selectedMCQ.mcq.difficulty}</span>
                          </span>
                        </div>
                        <h3 className="text-xl font-bold text-white">{selectedMCQ.mcq.question}</h3>
                      </div>
                    </div>

                    {/* Options */}
                    <div className="space-y-3 mb-6">
                      {selectedMCQ.mcq.optionVariants.map((option, idx) => (
                        <div
                          key={idx}
                          className={`p-4 rounded-xl transition-all ${
                            option.isCorrect
                              ? 'bg-green-600/30 border-2 border-green-500 text-white'
                              : 'bg-slate-700/50 border border-slate-600 text-gray-300'
                          }`}
                        >
                          {option.text}
                        </div>
                      ))}
                    </div>

                    {/* Explanation */}
                    {selectedMCQ.mcq.explanation && (
                      <div className="bg-blue-500/10 border border-blue-500/30 rounded-xl p-4">
                        <h4 className="text-sm font-bold text-blue-300 mb-2">💡 Explanation</h4>
                        <p className="text-gray-300 text-sm leading-relaxed">{selectedMCQ.mcq.explanation}</p>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                /* MCQ List View */
                <div className="p-6">
                  {/* Filter */}
                  <div className="mb-6 flex items-center gap-3">
                    <span className="text-sm font-semibold text-gray-400 uppercase tracking-wider">Filter:</span>
                    {['All', 'Easy', 'Medium', 'Hard'].map((diff) => (
                      <button
                        key={diff}
                        onClick={() => setDifficultyFilter(diff)}
                        className={`px-4 py-2 rounded-lg font-semibold text-sm transition-all ${
                          difficultyFilter === diff
                            ? 'bg-gradient-to-r from-purple-600 to-pink-600 text-white'
                            : 'bg-slate-700/50 text-gray-300 hover:bg-slate-700 border border-slate-600'
                        }`}
                      >
                        {diff}
                      </button>
                    ))}
                  </div>

                  {/* MCQ Cards */}
                  <div className="space-y-4">
                    {mcqs
                      .filter(mcq => difficultyFilter === 'All' || mcq.difficulty === difficultyFilter)
                      .map((mcq, index) => (
                        <div
                          key={index}
                          onClick={() => setSelectedMCQ({ mcq, index })}
                          className="bg-slate-800/50 backdrop-blur-lg rounded-xl p-6 border border-slate-700 hover:border-purple-500/50 transition-all cursor-pointer group"
                        >
                          <div className="flex items-start gap-4">
                            {/* Question Number Circle */}
                            <div className="flex-shrink-0 w-12 h-12 rounded-full bg-purple-600 flex items-center justify-center text-white font-bold text-lg">
                              {index + 1}
                            </div>

                            {/* Question Content */}
                            <div className="flex-1">
                              <div className="flex items-center gap-3 mb-3">
                                <span className="text-2xl">{mcq.aiIcon}</span>
                                <span className={`px-3 py-1 rounded-full text-xs font-bold flex items-center gap-1 ${getDifficultyColor(mcq.difficulty)}`}>
                                  <span>⭐</span>
                                  <span>{mcq.difficulty}</span>
                                </span>
                              </div>
                              <h3 className="text-lg font-bold text-white group-hover:text-purple-300 transition-colors">
                                {mcq.question}
                              </h3>
                            </div>
                          </div>

                          {/* Options Preview */}
                          <div className="mt-4 ml-16 space-y-2">
                            {mcq.optionVariants.slice(0, 4).map((option, idx) => (
                              <div
                                key={idx}
                                className={`p-3 rounded-lg text-sm ${
                                  option.isCorrect
                                    ? 'bg-green-600/30 border border-green-500/50 text-white'
                                    : 'bg-slate-700/50 border border-slate-600 text-gray-400'
                                }`}
                              >
                                {option.text}
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}

                    {mcqs.filter(mcq => difficultyFilter === 'All' || mcq.difficulty === difficultyFilter).length === 0 && (
                      <div className="text-center py-12">
                        <p className="text-gray-400 text-lg">No MCQs found for this difficulty level</p>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
