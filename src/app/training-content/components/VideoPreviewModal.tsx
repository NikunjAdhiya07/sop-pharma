'use client';

import React, { useEffect, useRef, useState } from 'react';
import { X, Maximize2, Play, Pause, Gauge } from 'lucide-react';

interface VideoRow {
  _id: string;
  title: string;
  department: string;
  sopNo?: string;
  version?: string;
  description?: string;
  bunnyCdnUrl: string;
  fileType: string;
  createdAt?: string;
  designation?: string;
}

interface Props {
  video: VideoRow | null;
  onClose: () => void;
}

const PLAYBACK_RATES = [0.5, 0.75, 1, 1.25, 1.5, 2];

export default function VideoPreviewModal({ video, onClose }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);
  const [rate, setRate] = useState(1);

  useEffect(() => {
    if (!video) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [video, onClose]);

  if (!video) return null;

  const togglePlay = () => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) v.play(); else v.pause();
  };

  const fullscreen = () => {
    const v = videoRef.current;
    if (!v) return;
    if (v.requestFullscreen) v.requestFullscreen();
  };

  const changeRate = (r: number) => {
    setRate(r);
    if (videoRef.current) videoRef.current.playbackRate = r;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div className="w-full max-w-5xl rounded-xl bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between border-b px-5 py-3">
          <div className="min-w-0">
            <h2 className="truncate text-lg font-semibold text-gray-800">{video.title}</h2>
            <p className="mt-0.5 text-xs text-gray-500">
              {video.department}
              {video.sopNo ? ` • ${video.sopNo}` : ''}
              {video.version ? ` • v${video.version}` : ''}
              {video.designation ? ` • ${video.designation}` : ''}
            </p>
          </div>
          <button onClick={onClose} className="rounded p-1 hover:bg-gray-100"><X className="h-5 w-5" /></button>
        </div>

        <div className="bg-black">
          <video
            ref={videoRef}
            src={video.bunnyCdnUrl}
            controls
            preload="metadata"
            playsInline
            controlsList="nodownload"
            onContextMenu={(e) => e.preventDefault()}
            onPlay={() => setPlaying(true)}
            onPause={() => setPlaying(false)}
            className="mx-auto max-h-[70vh] w-full"
          />
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t px-5 py-2 text-sm">
          <div className="flex items-center gap-2">
            <button onClick={togglePlay} className="flex items-center gap-1 rounded border border-gray-300 px-2 py-1 hover:bg-gray-50">
              {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
              {playing ? 'Pause' : 'Play'}
            </button>
            <button onClick={fullscreen} className="flex items-center gap-1 rounded border border-gray-300 px-2 py-1 hover:bg-gray-50">
              <Maximize2 className="h-4 w-4" /> Fullscreen
            </button>
            <div className="flex items-center gap-1">
              <Gauge className="h-4 w-4 text-gray-500" />
              <select value={rate} onChange={(e) => changeRate(parseFloat(e.target.value))}
                className="rounded border border-gray-300 px-1 py-0.5 text-xs">
                {PLAYBACK_RATES.map((r) => <option key={r} value={r}>{r}x</option>)}
              </select>
            </div>
          </div>
          {video.description && (
            <p className="line-clamp-2 max-w-md text-xs text-gray-600">{video.description}</p>
          )}
        </div>
      </div>
    </div>
  );
}
