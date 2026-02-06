'use client';

import { useState, useEffect } from 'react';
import { Eye, ShieldAlert, FileText } from 'lucide-react';

interface SecureSOPViewerProps {
  title: string;
  content: string; // HTML content or Text
  sopId: string;
  userIdentifier: string; // Name or ID for watermark
}

export default function SecureSOPViewer({ 
  title, 
  content, 
  sopId, 
  userIdentifier 
}: SecureSOPViewerProps) {
  const [startTime] = useState(Date.now());

  useEffect(() => {
    // Basic anti-copy measures
    const preventDefault = (e: any) => e.preventDefault();
    
    document.addEventListener('contextmenu', preventDefault);
    document.addEventListener('copy', preventDefault);
    document.addEventListener('cut', preventDefault);
    document.addEventListener('selectstart', preventDefault); // IE/Chrome
    document.addEventListener('keydown', (e) => {
        if ((e.ctrlKey || e.metaKey) && (e.key === 'p' || e.key === 'P' || e.key === 'c' || e.key === 'C')) {
            e.preventDefault();
        }
    });

    // Logging on mount/unmount
    const logView = async (action: 'viewed' | 'completed', duration: number = 0) => {
        try {
            await fetch('/api/training/log', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    resourceType: 'sop',
                    resourceId: sopId,
                    action,
                    durationSeconds: duration
                })
            });
        } catch (e) { console.error(e); }
    };
    
    // Initial Log
    logView('viewed');

    // Interval logging (every 30s)
    const interval = setInterval(() => {
        logView('viewed', 30);
    }, 30000);

    return () => {
        document.removeEventListener('contextmenu', preventDefault);
        document.removeEventListener('copy', preventDefault);
        document.removeEventListener('cut', preventDefault);
        document.removeEventListener('selectstart', preventDefault);
        
        clearInterval(interval);
        
        // Final log could be unreliable on unmount/close, but we try
        const totalDuration = (Date.now() - startTime) / 1000;
        logView('completed', totalDuration); // 'completed' logic might need scroll tracking, keeping simple
    };
  }, [sopId]);

  return (
    <div className="relative bg-white rounded-3xl shadow-xl overflow-hidden border border-slate-200 select-none print:hidden">
        {/* Header */}
        <div className="bg-slate-900 px-6 py-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
                <div className="p-2 bg-white/10 rounded-lg">
                    <FileText className="w-5 h-5 text-white" />
                </div>
                <h3 className="text-white font-bold">{title}</h3>
            </div>
            <div className="flex items-center gap-2 px-3 py-1 bg-rose-500/20 rounded-full border border-rose-500/30">
                <ShieldAlert className="w-3 h-3 text-rose-400" />
                <span className="text-[10px] uppercase font-bold text-rose-200">Protected Mode</span>
            </div>
        </div>

        {/* Content Area with Watermark */}
        <div className="relative min-h-[600px] p-8 md:p-12 overflow-y-auto">
            {/* Watermark Pattern */}
            <div className="absolute inset-0 pointer-events-none opacity-[0.03] z-50 overflow-hidden flex flex-wrap content-start items-start gap-12 p-8 select-none">
                {Array.from({ length: 40 }).map((_, i) => (
                    <div key={i} className="transform -rotate-12 whitespace-nowrap text-lg font-black text-slate-900">
                        {userIdentifier} • {new Date().toLocaleDateString()} • CONFIDENTIAL
                    </div>
                ))}
            </div>

            {/* Actual Content */}
            <div 
                className="prose prose-slate max-w-none relative z-10"
                dangerouslySetInnerHTML={{ __html: content }}
                onCopy={(e) => e.preventDefault()}
            />
        </div>

        {/* Footer Warning */}
        <div className="bg-slate-50 p-4 text-center border-t border-slate-100">
            <p className="text-xs text-slate-400">
                This document is tracked. Screenshots and unauthorized distribution are prohibited.
            </p>
        </div>
    </div>
  );
}
