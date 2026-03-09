'use client';

import { useState, useEffect } from 'react';
import { X, Award, Download, Loader2, AlertTriangle, CheckCircle2 } from 'lucide-react';

interface Props {
  matrixId: string;
  onClose: () => void;
}

export default function TrainingCertificateModal({ matrixId, onClose }: Props) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [cert, setCert] = useState<any>(null);
  const [attempts, setAttempts] = useState<any[]>([]);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const res = await fetch(`/api/training/exam/history?matrixId=${matrixId}`);
        const data = await res.json();
        if (data.success) {
          setCert(data.certificate);
          setAttempts(data.attempts || []);
        } else {
          setError(data.error || 'Failed to load data');
        }
      } catch (e: any) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [matrixId]);

  const handleDownload = () => {
    if (!cert) return;
    // Generate a simple printable certificate as HTML
    const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8"/>
  <title>Training Certificate — ${cert.sopIdentifier}</title>
  <style>
    body { margin: 0; font-family: 'Georgia', serif; background: #fff; }
    .cert { width: 800px; margin: 40px auto; padding: 60px; border: 8px double #1e3a8a; text-align: center; }
    .title { font-size: 36px; font-weight: bold; color: #1e3a8a; margin-bottom: 8px; }
    .subtitle { font-size: 14px; color: #64748b; letter-spacing: 4px; text-transform: uppercase; margin-bottom: 40px; }
    .presented { font-size: 14px; color: #64748b; margin-bottom: 8px; }
    .name { font-size: 48px; color: #0f172a; border-bottom: 2px solid #1e3a8a; display: inline-block; padding-bottom: 8px; margin-bottom: 20px; }
    .sop { font-size: 18px; color: #1e40af; font-weight: bold; margin: 10px 0 30px; }
    .details { display: flex; justify-content: space-around; margin-top: 40px; border-top: 1px solid #e2e8f0; padding-top: 20px; }
    .det-item { text-align: center; }
    .det-label { font-size: 11px; color: #94a3b8; text-transform: uppercase; letter-spacing: 2px; }
    .det-value { font-size: 14px; font-weight: bold; color: #0f172a; margin-top: 4px; }
    .cert-no { font-size: 11px; color: #94a3b8; margin-top: 30px; }
  </style>
</head>
<body>
  <div class="cert">
    <div class="title">Certificate of Completion</div>
    <div class="subtitle">SOP Training & Certification Program</div>
    <div class="presented">This is to certify that</div>
    <div class="name">${cert.employeeName}</div>
    <div class="presented">has successfully completed the SOP examination for</div>
    <div class="sop">${cert.sopIdentifier}${cert.sopName ? ` — ${cert.sopName}` : ''}</div>
    <div class="presented">with a score of <strong>${cert.score}%</strong> on Attempt #${cert.attemptNumber}</div>
    <div class="details">
      <div class="det-item">
        <div class="det-label">Department</div>
        <div class="det-value">${cert.department}</div>
      </div>
      <div class="det-item">
        <div class="det-label">Completion Date</div>
        <div class="det-value">${new Date(cert.completedAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' })}</div>
      </div>
      <div class="det-item">
        <div class="det-label">Score</div>
        <div class="det-value">${cert.score}%</div>
      </div>
    </div>
    <div class="cert-no">Certificate No: ${cert.certificateNumber}</div>
  </div>
</body>
</html>`;
    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `certificate-${cert.certificateNumber}.html`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
      <div className="bg-[#0c0a1e] border border-amber-500/20 rounded-3xl w-full max-w-lg shadow-2xl shadow-amber-500/10 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/5">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-amber-500/10 rounded-xl">
              <Award className="h-5 w-5 text-amber-400" />
            </div>
            <div>
              <p className="text-[9px] font-black text-amber-400 uppercase tracking-[0.2em]">Training Record</p>
              <h2 className="font-black text-white text-base">Certificate & Attempts</h2>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-xl transition-colors">
            <X className="h-5 w-5 text-slate-400" />
          </button>
        </div>

        <div className="p-6 space-y-5">
          {loading && (
            <div className="flex justify-center py-12">
              <Loader2 className="h-8 w-8 text-indigo-400 animate-spin" />
            </div>
          )}

          {error && (
            <div className="flex items-center gap-3 p-4 bg-rose-500/10 border border-rose-500/20 rounded-2xl">
              <AlertTriangle className="h-5 w-5 text-rose-400 shrink-0" />
              <p className="text-rose-400 text-sm font-bold">{error}</p>
            </div>
          )}

          {/* Certificate card */}
          {cert && (
            <div className="bg-gradient-to-br from-amber-500/10 to-yellow-500/5 border border-amber-500/20 rounded-2xl p-5 space-y-3">
              <div className="flex items-center gap-3">
                <CheckCircle2 className="h-6 w-6 text-emerald-400 shrink-0" />
                <div>
                  <p className="font-black text-white">{cert.employeeName}</p>
                  <p className="text-[11px] text-amber-400 font-bold">{cert.sopIdentifier}{cert.sopName ? ` — ${cert.sopName}` : ''}</p>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2 text-center">
                {[
                  { label: 'Score', value: `${cert.score}%`, color: 'text-emerald-400' },
                  { label: 'Attempt', value: `#${cert.attemptNumber}`, color: 'text-indigo-300' },
                  { label: 'Date', value: new Date(cert.completedAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }), color: 'text-white' },
                ].map(({ label, value, color }) => (
                  <div key={label} className="bg-white/5 rounded-xl py-2">
                    <p className={`font-black text-sm ${color}`}>{value}</p>
                    <p className="text-[9px] text-slate-600 uppercase tracking-wide">{label}</p>
                  </div>
                ))}
              </div>
              <p className="text-[10px] text-slate-600 font-mono text-center">{cert.certificateNumber}</p>
              <button
                onClick={handleDownload}
                className="w-full flex items-center justify-center gap-2 py-3 bg-gradient-to-r from-amber-600 to-yellow-600 hover:from-amber-500 hover:to-yellow-500 rounded-xl text-xs font-black text-white uppercase tracking-widest transition-all shadow-lg shadow-amber-500/20"
              >
                <Download className="h-4 w-4" /> Download Certificate
              </button>
            </div>
          )}

          {!cert && !loading && !error && (
            <div className="text-center py-8 text-slate-600">
              <Award className="h-10 w-10 mx-auto mb-3 opacity-50" />
              <p className="font-bold">No certificate yet.</p>
              <p className="text-xs mt-1">Complete the exam with 100% score to earn your certificate.</p>
            </div>
          )}

          {/* Attempts history */}
          {attempts.length > 0 && (
            <div>
              <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-3">Attempt History</p>
              <div className="space-y-2">
                {attempts.map((a: any) => (
                  <div key={a._id} className="flex items-center gap-3 p-3 bg-white/[0.03] border border-white/5 rounded-xl">
                    <div className={`h-8 w-8 rounded-lg flex items-center justify-center font-black text-xs ${
                      a.status === 'passed' ? 'bg-emerald-500/20 text-emerald-400' :
                      a.status === 'maxed_out' ? 'bg-rose-500/20 text-rose-400' :
                      a.status === 'in_progress' ? 'bg-amber-500/20 text-amber-400' :
                      'bg-white/5 text-slate-500'
                    }`}>
                      #{a.attemptNumber}
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className={`text-xs font-black ${
                          a.status === 'passed' ? 'text-emerald-400' :
                          a.status === 'in_progress' ? 'text-amber-400' :
                          'text-rose-400'
                        }`}>
                          {a.status === 'passed' ? 'Passed' : a.status === 'in_progress' ? 'In Progress' : a.status === 'maxed_out' ? 'Maxed Out' : 'Failed'}
                        </span>
                        {a.score !== undefined && a.score > 0 && (
                          <span className="text-[10px] text-slate-500">· {a.score}% · {a.correctCount}/{a.totalQuestions} correct</span>
                        )}
                      </div>
                      {a.completedAt && (
                        <p className="text-[10px] text-slate-700 mt-0.5">
                          {new Date(a.completedAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
