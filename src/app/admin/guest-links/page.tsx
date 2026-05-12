'use client';

import { useAuthGuard } from '@/hooks/useAuthGuard';

import { useState, useEffect } from 'react';
import { Share2, Calendar, Clipboard, User, Check, AlertCircle, Loader2 } from 'lucide-react';
import PageHeader from '@/components/PageHeader';

export default function GuestLinksPage() {
  useAuthGuard({ allowedRoles: ['admin', 'qa-head'] });
  const [loading, setLoading] = useState(false);
  const [generatedLink, setGeneratedLink] = useState('');
  const [token, setToken] = useState('');
  const [copied, setCopied] = useState(false);
  
  const [formData, setFormData] = useState({
    targetName: '',
    targetDob: '',
    testName: '',
    questionCount: 20,
    difficulty: 'Medium',
    expiresInMinutes: 60,
    sopIds: [] as string[] // You might want a multi-select for SOPs here
  });

  const [availableSOPs, setAvailableSOPs] = useState<any[]>([]);

  useEffect(() => {
    // Fetch SOPs for selection
    const fetchSOPs = async () => {
        try {
            const res = await fetch('/api/sop-library'); // Assessing this endpoint exists based on file structure
            const data = await res.json();
            if (data.success) {
                setAvailableSOPs(data.sops || []); 
            }
        } catch (e) {
            console.error("Failed to fetch SOPs", e);
        }
    };
    fetchSOPs();
  }, []);

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setGeneratedLink('');
    setCopied(false);

    try {
      const res = await fetch('/api/admin/guest/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });
      const data = await res.json();

      if (data.success) {
        setGeneratedLink(data.link);
        setToken(data.token);
      } else {
        alert(data.message || 'Failed to generate link');
      }
    } catch (error) {
      console.error(error);
      alert('An error occurred');
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(generatedLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="p-8 space-y-8">
      <PageHeader 
        title="Guest Access Management" 
        subtitle="Generate secure, time-limited exam links for external users." 
        icon={Share2}
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Generation Form */}
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100">
          <h2 className="text-xl font-bold text-slate-800 mb-6 flex items-center gap-2">
            <User className="w-5 h-5 text-purple-600" />
            Create Guest Session
          </h2>
          
          <form onSubmit={handleGenerate} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-700">Guest Name (Full)</label>
                    <input 
                        required
                        type="text" 
                        placeholder="John Doe"
                        className="w-full px-4 py-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-purple-500"
                        value={formData.targetName}
                        onChange={e => setFormData({...formData, targetName: e.target.value})}
                    />
                </div>
                <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-700">Date of Birth</label>
                    <div className="relative">
                        <Calendar className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
                        <input 
                            required
                            type="date" 
                            className="w-full pl-10 px-4 py-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-purple-500"
                            value={formData.targetDob}
                            onChange={e => setFormData({...formData, targetDob: e.target.value})}
                        />
                    </div>
                </div>
            </div>

            <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700">Test Configuration</label>
                <input 
                    required
                    type="text" 
                    placeholder="Test Name (e.g. Annual Audit Exam)"
                    className="w-full px-4 py-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-purple-500 mb-2"
                    value={formData.testName}
                    onChange={e => setFormData({...formData, testName: e.target.value})}
                />
                
                {/* Simple SOP Selection - For now just taking first available or ID input if complex */}
                <select 
                    multiple
                    className="w-full px-4 py-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-purple-500 h-32"
                    value={formData.sopIds}
                    onChange={(e) => {
                        const options = Array.from(e.target.selectedOptions, option => option.value);
                        setFormData({...formData, sopIds: options});
                    }}
                >
                    {availableSOPs.map((sop: any) => (
                        <option key={sop._id} value={sop._id}>
                            {sop.sopIdentifier || sop.title}
                        </option>
                    ))}
                </select>
                <p className="text-xs text-slate-500">Hold Ctrl/Cmd to select multiple SOPs</p>
            </div>

            <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-700">Questions</label>
                    <input 
                        type="number" 
                        min="5" max="100"
                        className="w-full px-4 py-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-purple-500"
                        value={formData.questionCount}
                        onChange={e => setFormData({...formData, questionCount: parseInt(e.target.value)})}
                    />
                </div>
                 <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-700">Expiry (Minutes)</label>
                     <input 
                        type="number" 
                        min="5" 
                        className="w-full px-4 py-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-purple-500"
                        value={formData.expiresInMinutes}
                        onChange={e => setFormData({...formData, expiresInMinutes: parseInt(e.target.value)})}
                    />
                </div>
            </div>

            <button 
                type="submit" 
                disabled={loading}
                className="w-full py-3 bg-purple-600 text-white rounded-xl font-bold hover:bg-purple-700 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
            >
                {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Share2 className="w-5 h-5" />}
                Generate Secure Link
            </button>
          </form>
        </div>

        {/* Result Card */}
        <div className="space-y-6">
            {generatedLink && (
                <div className="bg-emerald-50 border border-emerald-100 rounded-2xl p-6 animate-in slide-in-from-right-4">
                    <div className="flex items-center gap-3 mb-4">
                        <div className="w-10 h-10 bg-emerald-100 rounded-full flex items-center justify-center">
                            <Check className="w-5 h-5 text-emerald-600" />
                        </div>
                        <div>
                            <h3 className="font-bold text-emerald-900">Link Generated Successfully</h3>
                            <p className="text-emerald-700 text-sm">Valid for {formData.expiresInMinutes} minutes</p>
                        </div>
                    </div>

                    <div className="bg-white p-4 rounded-xl border border-emerald-200 flex items-center gap-3 mb-4">
                        <code className="flex-1 text-sm text-slate-600 truncate">{generatedLink}</code>
                        <button 
                            onClick={copyToClipboard}
                            className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
                            title="Copy to clipboard"
                        >
                            {copied ? <Check className="w-4 h-4 text-emerald-500" /> : <Clipboard className="w-4 h-4 text-slate-400" />}
                        </button>
                    </div>

                    <div className="bg-emerald-100/50 rounded-lg p-4">
                        <h4 className="font-bold text-emerald-800 text-sm mb-2 flex items-center gap-2">
                            <AlertCircle className="w-4 h-4" />
                            Security Instructions
                        </h4>
                        <ul className="text-sm text-emerald-700 space-y-1 list-disc list-inside">
                            <li>Share this link securely with <strong>{formData.targetName}</strong>.</li>
                            <li>They must verify with DOB: <strong>{new Date(formData.targetDob).toLocaleDateString()}</strong>.</li>
                            <li>The link is one-time use only.</li>
                            <li>Access is strictly read-only for the exam.</li>
                        </ul>
                    </div>
                </div>
            )}

            <div className="bg-slate-50 rounded-2xl p-6 border border-slate-200">
                <h3 className="font-bold text-slate-700 mb-2">How it works</h3>
                <p className="text-slate-500 text-sm leading-relaxed mb-4">
                    Guest access allows external auditors or temporary trainees to take assessments without full system access.
                </p>
                <div className="space-y-3">
                    <div className="flex items-center gap-3 text-sm text-slate-600">
                        <div className="w-6 h-6 rounded-full bg-slate-200 flex items-center justify-center text-xs font-bold">1</div>
                        <span>Admin generates a unique, time-limited link</span>
                    </div>
                    <div className="flex items-center gap-3 text-sm text-slate-600">
                        <div className="w-6 h-6 rounded-full bg-slate-200 flex items-center justify-center text-xs font-bold">2</div>
                        <span>Guest verifies identity using Name & DOB</span>
                    </div>
                    <div className="flex items-center gap-3 text-sm text-slate-600">
                        <div className="w-6 h-6 rounded-full bg-slate-200 flex items-center justify-center text-xs font-bold">3</div>
                        <span>Restricted exam interface launches immediately</span>
                    </div>
                </div>
            </div>
        </div>
      </div>
    </div>
  );
}
