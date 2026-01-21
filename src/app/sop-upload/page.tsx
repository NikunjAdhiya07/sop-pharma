'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Upload, FileText, AlertCircle, CheckCircle2, Loader2, Library, FolderOpen } from 'lucide-react';

interface UploadResponse {
  success: boolean;
  message: string;
  sop: {
    id: string;
    name: string;
    identifier: string;
    status: string;
    wordCount: number;
  };
}

export default function SOPUploadPage() {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [sopName, setSopName] = useState('');
  const [sopIdentifier, setSopIdentifier] = useState('');
  const [department, setDepartment] = useState('Quality Assurance');
  const [uploading, setUploading] = useState(false);

  const departments = [
    'Quality Assurance (QA)',
    'Quality Control (QC)',
    'Production',
    'Maintenance / Engineering',
    'Research & Development (R&D)',
    'Human Resources (HR)',
    'Information Technology (IT)',
    'Warehouse / Logistics',
    'Regulatory Affairs',
    'EHS',
    'General'
  ];
  const [generating, setGenerating] = useState(false);
  const [uploadedSOP, setUploadedSOP] = useState<UploadResponse['sop'] | null>(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      const extension = selectedFile.name.split('.').pop()?.toLowerCase();
      if (extension === 'pdf' || extension === 'docx') {
        setFile(selectedFile);
        setError('');
        
        // Auto-populate SOP name and identifier from filename
        const nameWithoutExt = selectedFile.name.replace(/\.(pdf|docx)$/i, '');
        
        if (!sopName) {
          setSopName(nameWithoutExt);
        }
        
        if (!sopIdentifier) {
          // Generate identifier from filename
          // Extract any existing code (e.g., QCMI01-00, SOP-001, etc.)
          const codeMatch = nameWithoutExt.match(/([A-Z]{2,}[-_]?\d+[-_]?\d*)/i);
          if (codeMatch) {
            // Use the extracted code
            setSopIdentifier(codeMatch[1].toUpperCase());
          } else {
            // Generate a simple identifier from the first few words
            const words = nameWithoutExt.split(/[\s_-]+/).filter(w => w.length > 0);
            const identifier = words.slice(0, 3).join('-').toUpperCase();
            setSopIdentifier(identifier || `SOP-${Date.now()}`);
          }
        }
      } else {
        setError('Please select a PDF or DOCX file');
        setFile(null);
      }
    }
  };

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!file || !sopName || !sopIdentifier) {
      setError('Please fill in all fields');
      return;
    }

    setUploading(true);
    setError('');
    setSuccess('');

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('sopName', sopName);
      formData.append('sopIdentifier', sopIdentifier);
      formData.append('department', department);

      const response = await fetch('/api/sop/upload', {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Upload failed');
      }

      setUploadedSOP(data.sop);
      setSuccess('SOP uploaded successfully! You can now generate MCQs.');
      
      // Reset form
      setFile(null);
      setSopName('');
      setSopIdentifier('');
      
    } catch (err) {
      // Extract detailed error message from API response
      let errorMessage = 'Upload failed';
      
      if (err instanceof Error) {
        errorMessage = err.message;
      }
      
      // Add helpful context for common errors
      if (errorMessage.includes('scanned images') || errorMessage.includes('selectable text')) {
        errorMessage += '\n\n💡 Solution: Use a PDF with selectable text, or convert your scanned PDF using an OCR tool.';
      } else if (errorMessage.includes('password')) {
        errorMessage += '\n\n💡 Solution: Remove the password protection from your PDF and try again.';
      } else if (errorMessage.includes('word(s)')) {
        errorMessage += '\n\n💡 Solution: Ensure your PDF contains readable text content (minimum 10 words).';
      }
      
      setError(errorMessage);
    } finally {
      setUploading(false);
    }
  };

  const handleGenerateMCQs = async () => {
    if (!uploadedSOP) return;

    setGenerating(true);
    setError('');
    setSuccess('');

    try {
      const response = await fetch('/api/sop/generate-mcqs', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ sopId: uploadedSOP.id }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'MCQ generation failed');
      }

      setSuccess(`MCQ Bank generated successfully! ${data.mcqBank.totalQuestions} questions created.`);
      setUploadedSOP(null);
      
    } catch (err) {
      setError(err instanceof Error ? err.message : 'MCQ generation failed');
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 p-8">
      <div className="max-w-4xl mx-auto">
        {/* Header with Navigation Button */}
        <div className="mb-12">
          <div className="flex items-start justify-between mb-4">
            <div className="flex-1 text-center">
              <h1 className="text-5xl font-bold text-white mb-4 bg-clip-text text-transparent bg-gradient-to-r from-purple-400 to-pink-600">
                SOP → MCQ Bank Generator
              </h1>
              <p className="text-gray-300 text-lg">
                Upload your SOP document and generate comprehensive MCQ banks powered by Gemini 3 Pro Preview
              </p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => router.push('/bulk-process')}
                className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-yellow-600 to-orange-600 text-white font-semibold rounded-xl hover:from-yellow-700 hover:to-orange-700 transition-all duration-300 transform hover:scale-105 active:scale-95 shadow-lg whitespace-nowrap"
              >
                <FolderOpen className="h-5 w-5" />
                Bulk Process
              </button>
              <button
                onClick={() => router.push('/files-manager')}
                className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-semibold rounded-xl hover:from-blue-700 hover:to-indigo-700 transition-all duration-300 transform hover:scale-105 active:scale-95 shadow-lg whitespace-nowrap"
              >
                <FolderOpen className="h-5 w-5" />
                Files Manager
              </button>
              <button
                onClick={() => router.push('/mcq-bank')}
                className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-emerald-600 to-teal-600 text-white font-semibold rounded-xl hover:from-emerald-700 hover:to-teal-700 transition-all duration-300 transform hover:scale-105 active:scale-95 shadow-lg whitespace-nowrap"
              >
                <Library className="h-5 w-5" />
                MCQ Bank
              </button>
            </div>
          </div>
        </div>



        {/* Upload Form */}
        <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-8 shadow-2xl border border-white/20 mb-8">
          <form onSubmit={handleUpload} className="space-y-6">
            {/* File Upload */}
            <div>
              <label className="block text-white font-semibold mb-3 text-lg">
                Upload SOP Document
              </label>
              <div className="relative">
                <input
                  type="file"
                  accept=".pdf,.docx"
                  onChange={handleFileChange}
                  className="hidden"
                  id="file-upload"
                  disabled={uploading}
                />
                <label
                  htmlFor="file-upload"
                  className="flex items-center justify-center w-full px-6 py-8 border-2 border-dashed border-purple-400 rounded-xl cursor-pointer hover:border-purple-300 hover:bg-white/5 transition-all duration-300"
                >
                  <div className="text-center">
                    <Upload className="mx-auto h-12 w-12 text-purple-400 mb-3" />
                    <p className="text-white font-medium mb-1">
                      {file ? file.name : 'Click to upload PDF or DOCX'}
                    </p>
                    <p className="text-gray-400 text-sm">
                      Maximum file size: 10MB
                    </p>
                  </div>
                </label>
              </div>
            </div>

            {/* SOP Name */}
            <div>
              <label htmlFor="sopName" className="block text-white font-semibold mb-3 text-lg">
                SOP Name
              </label>
              <input
                type="text"
                id="sopName"
                value={sopName}
                onChange={(e) => setSopName(e.target.value)}
                placeholder="e.g., Quality Control Procedures"
                className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all"
                disabled={uploading}
              />
            </div>

            {/* SOP Identifier */}
            <div>
              <label htmlFor="sopIdentifier" className="block text-white font-semibold mb-3 text-lg">
                SOP Identifier <span className="text-gray-400 text-sm font-normal">(Auto-generated from filename)</span>
              </label>
              <input
                type="text"
                id="sopIdentifier"
                value={sopIdentifier}
                onChange={(e) => setSopIdentifier(e.target.value)}
                placeholder="Auto-detected or enter manually (e.g., SOP-QC-001)"
                className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all"
                disabled={uploading}
              />
              <p className="text-gray-400 text-sm mt-2">
                💡 Identifier is automatically extracted from your filename. You can edit if needed.
              </p>
            </div>

            {/* Department */}
            <div>
              <label htmlFor="department" className="block text-white font-semibold mb-3 text-lg">
                Department
              </label>
              <select
                id="department"
                value={department}
                onChange={(e) => setDepartment(e.target.value)}
                className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all overflow-hidden"
                disabled={uploading}
              >
                {departments.map((dept) => (
                  <option key={dept} value={dept} className="bg-slate-800 text-white">
                    {dept}
                  </option>
                ))}
              </select>
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={uploading || !file || !sopName || !sopIdentifier}
              className="w-full py-4 px-6 bg-gradient-to-r from-purple-600 to-pink-600 text-white font-bold rounded-xl hover:from-purple-700 hover:to-pink-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-300 transform hover:scale-[1.02] active:scale-[0.98] shadow-lg"
            >
              {uploading ? (
                <span className="flex items-center justify-center">
                  <Loader2 className="animate-spin mr-2 h-5 w-5" />
                  Uploading...
                </span>
              ) : (
                'Upload SOP'
              )}
            </button>
          </form>
        </div>

        {/* Alerts */}
        {error && (
          <div className="bg-red-500/20 border border-red-500 rounded-xl p-4 mb-6 flex items-start">
            <AlertCircle className="h-5 w-5 text-red-400 mr-3 mt-0.5 flex-shrink-0" />
            <p className="text-red-200 whitespace-pre-line">{error}</p>
          </div>
        )}

        {success && (
          <div className="bg-green-500/20 border border-green-500 rounded-xl p-4 mb-6 flex items-start">
            <CheckCircle2 className="h-5 w-5 text-green-400 mr-3 mt-0.5 flex-shrink-0" />
            <p className="text-green-200">{success}</p>
          </div>
        )}

        {/* Uploaded SOP Card */}
        {uploadedSOP && (
          <div className="bg-gradient-to-br from-green-500/20 to-emerald-500/20 backdrop-blur-lg rounded-2xl p-8 shadow-2xl border border-green-500/30">
            <div className="flex items-start justify-between mb-6">
              <div className="flex items-start">
                <FileText className="h-8 w-8 text-green-400 mr-4 mt-1" />
                <div>
                  <h3 className="text-2xl font-bold text-white mb-2">
                    {uploadedSOP.name}
                  </h3>
                  <p className="text-gray-300 mb-1">
                    Identifier: <span className="font-mono text-green-300">{uploadedSOP.identifier}</span>
                  </p>
                  <p className="text-gray-300">
                    Word Count: <span className="font-semibold text-green-300">{uploadedSOP.wordCount.toLocaleString()}</span>
                  </p>
                </div>
              </div>
            </div>

            <button
              onClick={handleGenerateMCQs}
              disabled={generating}
              className="w-full py-4 px-6 bg-gradient-to-r from-green-600 to-emerald-600 text-white font-bold rounded-xl hover:from-green-700 hover:to-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-300 transform hover:scale-[1.02] active:scale-[0.98] shadow-lg"
            >
              {generating ? (
                <span className="flex items-center justify-center">
                  <Loader2 className="animate-spin mr-2 h-5 w-5" />
                  Generating MEGA-EXHAUSTIVE Bank (Up to 500 MCQs)...
                </span>
              ) : (
                'Generate MCQ Bank'
              )}
            </button>
          </div>
        )}

        {/* Info Section */}
        <div className="mt-12 bg-white/5 backdrop-blur-lg rounded-2xl p-8 border border-white/10">
          <h2 className="text-2xl font-bold text-white mb-6">How It Works</h2>
          <div className="space-y-4">
            <div className="flex items-start">
              <div className="flex-shrink-0 w-8 h-8 bg-purple-600 rounded-full flex items-center justify-center text-white font-bold mr-4">
                1
              </div>
              <div>
                <h3 className="text-white font-semibold mb-1">Upload SOP</h3>
                <p className="text-gray-300">Upload your SOP document in PDF or DOCX format</p>
              </div>
            </div>
            <div className="flex items-start">
              <div className="flex-shrink-0 w-8 h-8 bg-purple-600 rounded-full flex items-center justify-center text-white font-bold mr-4">
                2
              </div>
              <div>
                <h3 className="text-white font-semibold mb-1">AI Processing</h3>
                <p className="text-gray-300">Gemini 3 Pro Preview analyzes your SOP content</p>
              </div>
            </div>
            <div className="flex items-start">
              <div className="flex-shrink-0 w-8 h-8 bg-purple-600 rounded-full flex items-center justify-center text-white font-bold mr-4">
                3
              </div>
              <div>
                <h3 className="text-white font-semibold mb-1">MCQ Generation</h3>
                <p className="text-gray-300">MEGA-EXHAUSTIVE MCQ banks (up to 500 questions) are generated with Easy, Medium, and Hard difficulty levels</p>
              </div>
            </div>
            <div className="flex items-start">
              <div className="flex-shrink-0 w-8 h-8 bg-purple-600 rounded-full flex items-center justify-center text-white font-bold mr-4">
                4
              </div>
              <div>
                <h3 className="text-white font-semibold mb-1">Permanent Storage</h3>
                <p className="text-gray-300">MCQs are stored in the database and can be reused for tests</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
