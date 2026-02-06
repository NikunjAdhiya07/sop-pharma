'use client';

import { useState, useRef, useEffect } from 'react';
import { Loader2, AlertTriangle, Eye } from 'lucide-react';

interface SecureVideoPlayerProps {
  src: string;
  title: string;
  resourceId: string;
  onComplete?: () => void;
  className?: string;
}

export default function SecureVideoPlayer({ 
  src, 
  title, 
  resourceId, 
  onComplete,
  className = ''
}: SecureVideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [progress, setProgress] = useState(0);
  const [completed, setCompleted] = useState(false);
  
  // Tracking state
  const lastLogTime = useRef<number>(Date.now());
  const accumulatedWatchTime = useRef<number>(0);

  useEffect(() => {
    // Disable right click (Context Menu)
    const handleContextMenu = (e: MouseEvent) => e.preventDefault();
    if (videoRef.current) {
        videoRef.current.addEventListener('contextmenu', handleContextMenu);
    }
    return () => {
        if (videoRef.current) {
            videoRef.current.removeEventListener('contextmenu', handleContextMenu);
        }
    };
  }, []);

  // Heartbeat Logger
  useEffect(() => {
    const loggerInterval = setInterval(async () => {
        if (!videoRef.current || videoRef.current.paused) return;

        const now = Date.now();
        const delta = (now - lastLogTime.current) / 1000;
        lastLogTime.current = now;

        accumulatedWatchTime.current += delta;

        // Log to backend every 10 seconds or if meaningful progress
        if (accumulatedWatchTime.current > 5) {
             const currentDuration = accumulatedWatchTime.current;
             accumulatedWatchTime.current = 0; // Reset accumulator

             try {
                 await fetch('/api/training/log', {
                     method: 'POST',
                     headers: { 'Content-Type': 'application/json' },
                     body: JSON.stringify({
                         resourceType: 'video',
                         resourceId,
                         durationSeconds: currentDuration,
                         progressPercent: (videoRef.current.currentTime / videoRef.current.duration) * 100
                     })
                 });
             } catch (e) {
                 // Silent fail for stats logging
             }
        }
    }, 5000); // Check every 5s

    return () => clearInterval(loggerInterval);
  }, [resourceId]);


  const handleTimeUpdate = () => {
    if (videoRef.current) {
      const current = videoRef.current.currentTime;
      const total = videoRef.current.duration;
      const pct = (current / total) * 100;
      setProgress(pct);

      if (pct >= 95 && !completed) {
        setCompleted(true);
        if (onComplete) onComplete();
        
        // Log completion immediately
        fetch('/api/training/log', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                resourceType: 'video',
                resourceId,
                action: 'completed',
                durationSeconds: 0,
                progressPercent: 100
            })
        });
      }
    }
  };

  return (
    <div className={`relative bg-black rounded-2xl overflow-hidden shadow-2xl ${className}`}>
        {loading && (
            <div className="absolute inset-0 flex items-center justify-center z-10 bg-black/50 backdrop-blur-sm transition-all duration-500"
                style={{ opacity: loading ? 1 : 0, pointerEvents: 'none' }}>
                <Loader2 className="w-12 h-12 text-white animate-spin" />
            </div>
        )}
        
        <video
            ref={videoRef}
            src={src}
            className="w-full h-full object-cover"
            controls={true}
            controlsList="nodownload" // Chrome attribute to hide download button
            onLoadedData={() => setLoading(false)}
            onError={() => { setLoading(false); setError(true); }}
            onTimeUpdate={handleTimeUpdate}
            disablePictureInPicture // Prevent PiP to keep focus
        />

        {error && (
            <div className="absolute inset-0 flex flex-col items-center justify-center z-20 bg-black">
                <AlertTriangle className="w-12 h-12 text-amber-500 mb-4" />
                <p className="text-white font-bold">Video Unavailable</p>
                <p className="text-gray-400 text-sm">Please contact support.</p>
            </div>
        )}

        {/* Overlay for "Induction Mode" Watermark/Status */}
        <div className="absolute top-4 right-4 bg-black/60 backdrop-blur-md px-3 py-1 rounded-full border border-white/10 flex items-center gap-2 pointer-events-none">
            <Eye className="w-3 h-3 text-emerald-400" />
            <span className="text-[10px] text-white font-mono uppercase tracking-widest">
                Secure Playback
            </span>
        </div>
    </div>
  );
}
