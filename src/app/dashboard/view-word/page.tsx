'use client';

import { useSearchParams } from 'next/navigation';
import { useEffect, useState, useRef, Suspense } from 'react';
import Link from 'next/link';
import { ArrowLeft, FileText, AlertCircle, ExternalLink, Maximize2, Minimize2, RefreshCw } from 'lucide-react';

function ViewWordContent() {
  const searchParams = useSearchParams();
  const identifier = searchParams.get('identifier');
  const language = searchParams.get('language');
  const pathParam = searchParams.get('path');
  const viewerParam = searchParams.get('viewer'); // 'office' | 'google'

  const [officeUrl, setOfficeUrl] = useState<string | null>(null);
  const [googleUrl, setGoogleUrl] = useState<string | null>(null);
  const [currentViewer, setCurrentViewer] = useState<'office' | 'google'>(viewerParam === 'google' ? 'google' : 'office');
  const [iframeLoading, setIframeLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [isPublic, setIsPublic] = useState(true);
  const [canUseOfficeViewer, setCanUseOfficeViewer] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!identifier && !pathParam) {
      setError('Provide identifier or path (e.g. ?identifier=BSGE01-05&language=English).');
      setLoading(false);
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const params = new URLSearchParams();
        if (identifier) params.set('identifier', identifier);
        if (language) params.set('language', language || 'English');
        if (pathParam) params.set('path', pathParam);
        const res = await fetch(`/api/files/viewer-url?${params.toString()}`);
        const data = await res.json();
        if (cancelled) return;
        if (data.success) {
          setOfficeUrl(data.officeUrl);
          setGoogleUrl(data.googleUrl);
          setIsPublic(!!data.isPublic);
          setCanUseOfficeViewer(!!data.canUseOfficeViewer);
          if (data.message) setMessage(data.message);
          setCurrentViewer(viewerParam === 'google' ? 'google' : 'office');
        } else {
          setError(data.error || 'Failed to get viewer URL.');
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [identifier, language, pathParam, viewerParam]);

  const iframeSrc = currentViewer === 'google' ? googleUrl : officeUrl;

  const toggleFullscreen = () => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen?.();
    } else {
      document.exitFullscreen?.();
    }
  };

  useEffect(() => {
    const onFullscreenChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', onFullscreenChange);
  }, []);

  const openInAppPreview = () => {
    const params = new URLSearchParams();
    if (identifier) params.set('identifier', identifier);
    if (language) params.set('language', language || 'English');
    if (pathParam) params.set('path', pathParam);
    window.location.href = `/dashboard/view-doc?${params.toString()}`;
  };

  const openInNewTab = () => {
    const params = new URLSearchParams();
    if (identifier) params.set('identifier', identifier);
    if (language) params.set('language', language || 'English');
    if (pathParam) params.set('path', pathParam);
    if (currentViewer === 'google') params.set('viewer', 'google');
    window.open(`/api/files/open-in-viewer?${params.toString()}`, '_blank', 'noopener');
  };

  if (loading) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-gray-100">
        <div className="flex flex-col items-center gap-3">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-purple-600 border-t-transparent" />
          <p className="text-sm font-medium text-gray-600">Preparing document viewer…</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-100 p-4">
        <div className="max-w-md rounded-xl border border-red-200 bg-white p-6 shadow-sm">
          <div className="flex items-center gap-3 text-red-600">
            <AlertCircle className="h-8 w-8 shrink-0" />
            <p className="font-semibold">Cannot open document</p>
          </div>
          <p className="mt-2 text-sm text-gray-600">{error}</p>
          <div className="mt-4">
            <Link
              href="/dashboard"
              className="inline-flex items-center gap-2 text-sm font-semibold text-purple-600 hover:underline"
            >
              <ArrowLeft className="h-4 w-4" /> Back to Dashboard
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // When the document URL is not reachable by Office/Google (localhost serve-docx URL), offer in-app preview
  if (!canUseOfficeViewer) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-gray-100 p-4">
        <div className="max-w-lg rounded-xl border border-amber-200 bg-white p-6 shadow-sm">
          <div className="flex items-center gap-3 text-amber-800">
            <FileText className="h-8 w-8 shrink-0" />
            <p className="font-semibold">Office Online cannot access this document</p>
          </div>
          <p className="mt-2 text-sm text-gray-600">
            {message || 'The file is not publicly reachable (local path or CDN file not found). Use in-app preview below.'}
          </p>
          <p className="mt-2 text-sm text-gray-600">
            In-app preview renders the document directly in the browser with accurate formatting.
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={openInAppPreview}
              className="inline-flex items-center gap-2 rounded-lg bg-purple-600 px-4 py-2 text-sm font-semibold text-white hover:bg-purple-700"
            >
              <RefreshCw className="h-4 w-4" /> Open in-app preview
            </button>
            <Link
              href="/dashboard"
              className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
            >
              <ArrowLeft className="h-4 w-4" /> Back to Dashboard
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col bg-gray-100" ref={containerRef}>
      <div className="sticky top-0 z-10 flex shrink-0 items-center justify-between border-b border-gray-200 bg-white px-4 py-2 shadow-sm">
        <div className="flex items-center gap-3">
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-2 text-sm font-semibold text-purple-600 hover:underline"
          >
            <ArrowLeft className="h-4 w-4" /> Back to Dashboard
          </Link>
          <span className="flex items-center gap-2 text-xs text-gray-500">
            <FileText className="h-4 w-4" /> Document view
          </span>
        </div>
        <div className="flex items-center gap-2">
          {officeUrl && googleUrl && (
            <button
              type="button"
              onClick={() => {
                setCurrentViewer(currentViewer === 'office' ? 'google' : 'office');
                setIframeLoading(true);
              }}
              className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
              title={currentViewer === 'office' ? 'If the document did not load, try Google Docs Viewer' : 'Switch back to Office Viewer'}
            >
            <RefreshCw className="h-3.5 w-3.5" />
              {currentViewer === 'office' ? 'Try Google Viewer' : 'Use Office Viewer'}
            </button>
          )}
          <button
            type="button"
            onClick={toggleFullscreen}
            className="inline-flex items-center gap-1.5 rounded-lg border border-purple-200 bg-purple-50 px-3 py-1.5 text-xs font-medium text-purple-700 hover:bg-purple-100"
            title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
          >
            {isFullscreen ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
            {isFullscreen ? 'Exit' : 'Fullscreen'}
          </button>
          <button
            type="button"
            onClick={openInNewTab}
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
          >
            <ExternalLink className="h-3.5 w-3.5" /> New tab
          </button>
        </div>
      </div>
      <div className="relative min-h-0 flex-1 bg-white">
        {iframeLoading && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-gray-50">
            <div className="h-10 w-10 animate-spin rounded-full border-4 border-purple-600 border-t-transparent" />
            <p className="mt-3 text-sm text-gray-600">Loading document…</p>
          </div>
        )}
        {iframeSrc ? (
          <iframe
            title="Document viewer"
            src={iframeSrc}
            className="h-full w-full border-0 bg-white"
            allow="fullscreen"
            sandbox="allow-same-origin allow-scripts allow-popups"
            onLoad={() => setIframeLoading(false)}
          />
        ) : (
          <div className="flex h-full items-center justify-center text-gray-500">
            No viewer URL available.
          </div>
        )}
        {!iframeLoading && (
          <div className="absolute bottom-3 right-3 z-10">
            <button
              type="button"
              onClick={openInAppPreview}
              className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white/90 px-2.5 py-1.5 text-xs font-medium text-gray-600 shadow-sm hover:bg-gray-50 backdrop-blur-sm"
              title="If the document is not displaying, switch to in-browser preview"
            >
              <RefreshCw className="h-3 w-3" /> Not loading? Use in-browser preview
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default function ViewWordPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-gray-100">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-purple-600 border-t-transparent" />
        </div>
      }
    >
      <ViewWordContent />
    </Suspense>
  );
}
