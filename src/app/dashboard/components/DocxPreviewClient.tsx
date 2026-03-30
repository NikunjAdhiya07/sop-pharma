'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import Link from 'next/link';
import { ArrowLeft, AlertCircle, FileText, ExternalLink, Download } from 'lucide-react';
import { buildDocxDownloadHref } from '@/lib/viewDocLinks';

export { buildDocxDownloadHref } from '@/lib/viewDocLinks';

type PreviewMode = 'loading' | 'docx-preview' | 'view-docx-html' | 'pdf-inline' | 'error';

export type DocxViewerPreference = 'office' | 'google';

/** Server can block on remote CDN fetches; abort so the UI does not spin forever */
const PREVIEW_API_TIMEOUT_MS = 130_000;
const DOCX_RENDER_TIMEOUT_MS = 180_000;

async function fetchWithTimeout(input: string, init?: RequestInit): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), PREVIEW_API_TIMEOUT_MS);
  try {
    return await fetch(input, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
}

function parseFilenameFromContentDisposition(cd: string | null): string | null {
  if (!cd) return null;
  const star = cd.match(/filename\*=UTF-8''([^;\s]+)/i);
  if (star) {
    try { return decodeURIComponent(star[1]); } catch { return star[1]; }
  }
  const quoted = cd.match(/filename="([^"]+)"/i);
  if (quoted) return quoted[1];
  const plain = cd.match(/filename=([^;\s]+)/i);
  return plain ? plain[1].replace(/^["']|["']$/g, '') : null;
}

export async function downloadWordFileFromApi(
  url: string,
  fallbackFileName: string,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const res = await fetch(url, { credentials: 'same-origin' });
  const ct = (res.headers.get('content-type') || '').toLowerCase();
  if (!res.ok || ct.includes('application/json')) {
    let message = `Could not download the file (${res.status}).`;
    try {
      const j = (await res.json()) as { error?: string; hint?: string };
      if (j.error) message = j.error;
      else if (j.hint) message = j.hint;
    } catch { /* body not JSON */ }
    return { ok: false, message };
  }
  const blob = await res.blob();
  const fromHeader =
    parseFilenameFromContentDisposition(res.headers.get('content-disposition')) || fallbackFileName;
  const safeName = /\.(docx|doc)$/i.test(fromHeader)
    ? fromHeader
    : `${fallbackFileName.replace(/\.[^.]+$/, '')}.docx`;
  const obj = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = obj;
  a.download = safeName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(obj);
  return { ok: true };
}

type Props = {
  pathParam: string | null;
  identifierParam: string | null;
  languageParam: string | null;
  backHref?: string;
  backLabel?: string;
  layout?: 'full' | 'embedded';
  viewerPreference?: DocxViewerPreference;
};

export default function DocxPreviewClient({
  pathParam,
  identifierParam,
  languageParam,
  backHref = '/dashboard',
  backLabel = 'Back to Dashboard',
  layout = 'full',
}: Props) {
  const [mode, setMode] = useState<PreviewMode>('loading');
  const [error, setError] = useState<string | null>(null);
  const [pdfInlineSrc, setPdfInlineSrc] = useState<string | null>(null);
  const [viewDocxHtml, setViewDocxHtml] = useState<string | null>(null);
  /** Office Online full-tab URL — shown as button when available */
  const [wordOnlineUrl, setWordOnlineUrl] = useState<string | null>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const styleRef = useRef<HTMLDivElement>(null);
  const isGujarati = (languageParam || '').toLowerCase() === 'gujarati';
  const [downloadBusy, setDownloadBusy] = useState(false);
  const [downloadHint, setDownloadHint] = useState<string | null>(null);

  useEffect(() => {
    if (isGujarati) {
      const id = 'noto-sans-gujarati-docx-preview';
      if (!document.getElementById(id)) {
        const link = document.createElement('link');
        link.id = id;
        link.rel = 'stylesheet';
        link.href = 'https://fonts.googleapis.com/css2?family=Noto+Sans+Gujarati:wght@400;500;600&display=swap';
        document.head.appendChild(link);
      }
    }
  }, [isGujarati]);

  useEffect(() => {
    if (!pathParam && !identifierParam) {
      setError('No document path or identifier provided.');
      setMode('error');
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        // Step 1: get viewer-url to obtain the Office Online URL (as a button option only)
        const viewerParams = new URLSearchParams();
        if (identifierParam) viewerParams.set('identifier', identifierParam);
        if (languageParam) viewerParams.set('language', languageParam || 'English');
        if (pathParam) viewerParams.set('path', pathParam);
        const viewerRes = await fetchWithTimeout(
          `/api/files/viewer-url?${viewerParams.toString()}`,
        );
        const viewerJson = await viewerRes.json();
        if (cancelled) return;
        // Store Office Online URL as button option (NOT as iframe default)
        if (viewerJson.success && viewerJson.canUseOfficeViewer && viewerJson.officeViewerUrl) {
          setWordOnlineUrl(viewerJson.officeViewerUrl as string);
        }

        // Step 2: get docx-view-token for in-browser rendering
        const tokenParams = new URLSearchParams();
        if (identifierParam) tokenParams.set('identifier', identifierParam);
        if (languageParam) tokenParams.set('language', languageParam || 'English');
        if (pathParam) tokenParams.set('path', pathParam);

        const tokenRes = await fetchWithTimeout(
          `/api/files/docx-view-token?${tokenParams.toString()}`,
        );
        const tokenData = await tokenRes.json();
        if (cancelled) return;

        if (!tokenData.success || !tokenData.token) {
          // No DOCX token — try PDF via download API
          if (await tryPdfFallback()) return;
          if (cancelled) return;
          setError('Could not open the document. The file may not be available on this server.');
          setMode('error');
          return;
        }

        // Step 3: fetch the DOCX blob from serve-docx
        const blobRes = await fetchWithTimeout(
          `/api/files/serve-docx?t=${encodeURIComponent(tokenData.token)}`,
        );
        if (cancelled) return;

        if (!blobRes.ok) {
          // serve-docx failed — try PDF fallback
          if (await tryPdfFallback()) return;
          if (cancelled) return;
          setError('The document file could not be loaded. Try downloading it or contact an administrator.');
          setMode('error');
          return;
        }

        const ct = (blobRes.headers.get('content-type') || '').toLowerCase();

        // If serve-docx returned a PDF, show it inline
        if (ct.includes('application/pdf')) {
          const dlParams = new URLSearchParams();
          if (identifierParam) dlParams.set('identifier', identifierParam);
          if (languageParam) dlParams.set('language', languageParam || 'English');
          if (pathParam) dlParams.set('path', pathParam);
          dlParams.set('open', '1');
          setPdfInlineSrc(`/api/files/download?${dlParams.toString()}`);
          setMode('pdf-inline');
          return;
        }

        // Step 4a: Gujarati — browser fetches DOCX from CDN directly, POSTs bytes to docx-to-html
        if (isGujarati && pathParam) {
          try {
            // Fetch the DOCX directly from the CDN (browser can reach it even if server cannot)
            const cdnRes = await fetchWithTimeout(pathParam);
            if (!cancelled && cdnRes.ok) {
              const docxBytes = await cdnRes.arrayBuffer();
              if (!cancelled && docxBytes.byteLength > 0) {
                const postParams = new URLSearchParams();
                if (identifierParam) postParams.set('identifier', identifierParam);
                if (languageParam) postParams.set('language', languageParam);
                const htmlRes = await fetchWithTimeout(
                  `/api/files/docx-to-html?${postParams.toString()}`,
                  { method: 'POST', body: docxBytes, headers: { 'Content-Type': 'application/octet-stream' } },
                );
                if (!cancelled && htmlRes.ok) {
                  const htmlData = await htmlRes.json();
                  if (!cancelled && htmlData.success && htmlData.html) {
                    setViewDocxHtml(htmlData.html as string);
                    setMode('view-docx-html');
                    return;
                  }
                }
              }
            }
          } catch { /* fall through to docx-preview */ }
        }

        const blob = await blobRes.blob();

        // Step 4b: render with docx-preview (English and Gujarati fallback)
        try {
          const { renderAsync } = await import('docx-preview');
          if (cancelled || !bodyRef.current) return;
          bodyRef.current.innerHTML = '';
          if (styleRef.current) styleRef.current.innerHTML = '';
          const renderPromise = renderAsync(
            blob,
            bodyRef.current,
            styleRef.current || undefined,
            {
              className: 'docx-preview-wrapper',
              breakPages: true,
              inWrapper: true,
              renderHeaders: true,
              renderFooters: true,
              renderFootnotes: true,
              renderEndnotes: true,
              renderAltChunks: true,
              ignoreWidth: false,
              ignoreHeight: false,
              ignoreFonts: false,
              experimental: true,
              useBase64URL: true,
            },
          );
          await Promise.race([
            renderPromise,
            new Promise<never>((_, reject) =>
              setTimeout(
                () => reject(new Error('Document render timed out')),
                DOCX_RENDER_TIMEOUT_MS,
              ),
            ),
          ]);
          if (cancelled) return;
          setMode('docx-preview');
        } catch {
          if (!cancelled && await tryPdfFallback()) return;
          if (cancelled) return;
          setError('Failed to render the document. The file may be corrupted or in an unsupported format.');
          setMode('error');
        }
      } catch (e: unknown) {
        if (cancelled) return;
        const aborted =
          e instanceof Error &&
          (e.name === 'AbortError' || e.message.includes('aborted'));
        setError(
          aborted
            ? 'Loading timed out. The file host may be slow or unreachable. Try “Download original file” or “Open in Word Online” below.'
            : 'Failed to load the document preview.',
        );
        setMode('error');
      }
    })();

    async function tryPdfFallback(): Promise<boolean> {
      try {
        const dlParams = new URLSearchParams();
        if (identifierParam) dlParams.set('identifier', identifierParam);
        if (languageParam) dlParams.set('language', languageParam || 'English');
        if (pathParam) dlParams.set('path', pathParam);
        dlParams.set('open', '1');
        const dlRes = await fetchWithTimeout(
          `/api/files/download?${dlParams.toString()}`,
          { credentials: 'same-origin' },
        );
        if (!dlRes.ok) return false;
        const ct = (dlRes.headers.get('content-type') || '').toLowerCase();
        if (ct.includes('application/pdf')) {
          setPdfInlineSrc(`/api/files/download?${dlParams.toString()}`);
          setMode('pdf-inline');
          return true;
        }
        return false;
      } catch {
        return false;
      }
    }

    return () => { cancelled = true; };
  }, [pathParam, identifierParam, languageParam, isGujarati]);

  const docxDownloadHref = buildDocxDownloadHref(pathParam, identifierParam, languageParam);

  const handleDownloadDocx = useCallback(async () => {
    if (!docxDownloadHref) return;
    setDownloadBusy(true);
    setDownloadHint(null);
    const stem =
      identifierParam?.trim() ||
      (pathParam
        ? decodeURIComponent(pathParam.split(/[/\\]/).pop() || '').replace(/\.(pdf|docx|doc)$/i, '')
        : '') ||
      'document';
    const safeStem = stem.replace(/[/\\?%*:|"<>]/g, '_').slice(0, 180);
    const fallback = /\.(docx|doc)$/i.test(safeStem) ? safeStem : `${safeStem}.docx`;
    const result = await downloadWordFileFromApi(docxDownloadHref, fallback);
    setDownloadBusy(false);
    if (!result.ok) setDownloadHint(result.message);
  }, [docxDownloadHref, identifierParam, pathParam]);

  // ── Loading spinner ──────────────────────────────────────────────────────
  const loadingOverlay = mode === 'loading' && (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-gray-100">
      <div className="flex flex-col items-center gap-3">
        <div className={`h-10 w-10 animate-spin rounded-full border-4 border-t-transparent ${layout === 'embedded' ? 'border-green-500' : 'border-purple-600'}`} />
        <p className={`text-sm font-medium ${layout === 'embedded' ? 'text-gray-400' : 'text-gray-600'}`}>Loading document…</p>
      </div>
    </div>
  );

  // ── Error state ──────────────────────────────────────────────────────────
  if (mode === 'error') {
    return (
      <div className={layout === 'embedded'
        ? 'rounded-xl border border-red-500/30 bg-red-950/20 p-6'
        : 'flex min-h-screen items-center justify-center bg-gray-100 p-4'
      }>
        <div className="max-w-md rounded-xl border border-red-200 bg-white p-6 shadow-sm">
          <div className="flex items-center gap-3 text-red-600">
            <AlertCircle className="h-8 w-8 shrink-0" />
            <p className="font-semibold">Cannot open document</p>
          </div>
          <p className="mt-2 text-sm text-gray-600">{error}</p>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <Link href={backHref} className="inline-flex items-center gap-2 text-sm font-semibold text-purple-600 hover:underline">
              <ArrowLeft className="h-4 w-4" /> {backLabel}
            </Link>
            {docxDownloadHref && (
              <div className="flex flex-col gap-2">
                <button
                  type="button"
                  disabled={downloadBusy}
                  onClick={() => void handleDownloadDocx()}
                  className="inline-flex w-fit items-center gap-2 text-sm font-semibold text-blue-600 underline decoration-blue-400/60 hover:text-blue-800 disabled:opacity-50"
                >
                  <Download className="h-4 w-4 shrink-0" aria-hidden />
                  {downloadBusy ? 'Preparing download…' : 'Download original file'}
                </button>
                {downloadHint && <p className="text-xs text-red-600">{downloadHint}</p>}
              </div>
            )}
            {wordOnlineUrl && (
              <a
                href={wordOnlineUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 text-sm font-semibold text-purple-600 hover:underline"
              >
                <ExternalLink className="h-4 w-4" /> Open in Word Online
              </a>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ── PDF inline ───────────────────────────────────────────────────────────
  if (mode === 'pdf-inline' && pdfInlineSrc) {
    return (
      <div className={`relative flex flex-col bg-[#e5e7eb] ${layout === 'embedded' ? 'min-h-[600px]' : 'h-screen'}`}>
        <div className="sticky top-0 z-10 flex shrink-0 items-center justify-between border-b border-gray-200 bg-white px-4 py-2 shadow-sm">
          <div className="flex flex-wrap items-center gap-3">
            <BackButton backHref={backHref} backLabel={backLabel} />
            {docxDownloadHref && (
              <button
                type="button"
                disabled={downloadBusy}
                onClick={() => void handleDownloadDocx()}
                className="inline-flex items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 text-sm font-semibold text-blue-700 hover:bg-blue-100 disabled:opacity-50"
              >
                <Download className="h-4 w-4" aria-hidden />
                {downloadBusy ? 'Preparing…' : 'Download original'}
              </button>
            )}
          </div>
          <span className="flex items-center gap-2 text-xs text-gray-500">
            <FileText className="h-4 w-4" /> PDF preview
            {isGujarati && <span className="font-semibold text-indigo-600">Gujarati</span>}
          </span>
        </div>
        <div className="min-h-0 flex-1 p-2 sm:p-3">
          <iframe
            src={pdfInlineSrc}
            title="SOP document — PDF preview"
            className={`w-full max-w-[1200px] mx-auto rounded-lg border border-gray-200 bg-white shadow-md ${layout === 'embedded' ? 'min-h-[560px]' : 'h-[calc(100vh-3.25rem)]'}`}
          />
        </div>
        {downloadHint && <p className="px-4 pb-2 text-xs text-red-600">{downloadHint}</p>}
      </div>
    );
  }

  // ── Server-rendered HTML preview (Gujarati via view-docx) ───────────────
  if (mode === 'view-docx-html' && viewDocxHtml) {
    return (
      <div className={`relative flex flex-col bg-[#e5e7eb] ${layout === 'embedded' ? 'min-h-[600px]' : 'min-h-screen'}`}>
        <div className="sticky top-0 z-10 flex shrink-0 items-center justify-between border-b border-gray-200 bg-white px-4 py-2 shadow-sm">
          <div className="flex flex-wrap items-center gap-3">
            {layout === 'full' && <BackButton backHref={backHref} backLabel={backLabel} />}
            {docxDownloadHref && (
              <button type="button" disabled={downloadBusy} onClick={() => void handleDownloadDocx()}
                className="inline-flex items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 text-sm font-semibold text-blue-700 hover:bg-blue-100 disabled:opacity-50"
              >
                <Download className="h-4 w-4" aria-hidden />
                {downloadBusy ? 'Preparing…' : 'Download original'}
              </button>
            )}
            {wordOnlineUrl && (
              <a href={wordOnlineUrl} target="_blank" rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-lg border border-purple-200 bg-purple-50 px-3 py-1.5 text-sm font-semibold text-purple-700 hover:bg-purple-100"
              >
                <ExternalLink className="h-4 w-4" aria-hidden /> Open in Word Online
              </a>
            )}
          </div>
          <span className="flex items-center gap-2 text-xs text-gray-500">
            <FileText className="h-4 w-4" /> In-browser preview
            <span className="font-semibold text-indigo-600">Gujarati</span>
          </span>
        </div>
        {downloadHint && <p className="px-4 pt-1 text-xs text-red-600">{downloadHint}</p>}
        <div className="p-2 sm:p-4">
          <div
            className="view-docx-surface mx-auto w-full max-w-[210mm] rounded border border-gray-300 bg-white p-6 shadow-sm"
            dangerouslySetInnerHTML={{ __html: viewDocxHtml }}
          />
          <p className="mx-auto max-w-[210mm] px-2 pb-8 pt-3 text-center text-[11px] leading-snug text-gray-500">
            In-browser preview — <strong>Download original</strong> opens the exact file in Microsoft Word.
          </p>
        </div>
      </div>
    );
  }

  // ── In-browser DOCX preview ──────────────────────────────────────────────
  const headerContent = (
    <div className="sticky top-0 z-10 flex shrink-0 flex-col gap-1 border-b border-gray-200 bg-white px-4 py-2 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-3">
          {layout === 'full' && <BackButton backHref={backHref} backLabel={backLabel} />}
          {docxDownloadHref && (
            <button
              type="button"
              disabled={downloadBusy}
              onClick={() => void handleDownloadDocx()}
              className="inline-flex items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 text-sm font-semibold text-blue-700 hover:bg-blue-100 disabled:opacity-50"
            >
              <Download className="h-4 w-4" aria-hidden />
              {downloadBusy ? 'Preparing…' : 'Download original'}
            </button>
          )}
          {wordOnlineUrl && (
            <a
              href={wordOnlineUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-lg border border-purple-200 bg-purple-50 px-3 py-1.5 text-sm font-semibold text-purple-700 hover:bg-purple-100"
            >
              <ExternalLink className="h-4 w-4" aria-hidden />
              Open in Word Online
            </a>
          )}
        </div>
        <span className="flex items-center gap-2 text-xs text-gray-500">
          <FileText className="h-4 w-4" /> In-browser preview
          {isGujarati && <span className="font-semibold text-indigo-600">Gujarati</span>}
        </span>
      </div>
      {downloadHint && <p className="text-xs text-red-600" role="alert">{downloadHint}</p>}
    </div>
  );

  const previewBody = (
    <div className="p-2 sm:p-4">
      <div className="mx-auto w-full max-w-[210mm]">
        <div ref={styleRef} className="docx-preview-styles" aria-hidden="true" />
        <div
          ref={bodyRef}
          className={
            mode === 'docx-preview'
              ? `docx-preview-surface rounded border border-gray-300 bg-white shadow-sm ${layout === 'embedded' ? 'min-h-[480px] p-4' : 'min-h-[200px] p-6'}`
              : 'hidden'
          }
        />
      </div>
      {mode === 'docx-preview' && (
        <p className="mx-auto max-w-[210mm] shrink-0 px-2 pb-8 pt-3 text-center text-[11px] leading-snug text-gray-500">
          In-browser preview — fonts and some images may differ slightly from the original.{' '}
          <strong>Download original</strong> opens the exact file in Microsoft Word.
        </p>
      )}
    </div>
  );

  if (layout === 'embedded') {
    return (
      <div className="relative flex min-h-[320px] flex-col gap-2">
        {loadingOverlay}
        {docxDownloadHref && mode === 'docx-preview' && (
          <div className="flex shrink-0 flex-col items-end gap-1 px-1">
            <div className="flex items-center gap-2">
              {wordOnlineUrl && (
                <a
                  href={wordOnlineUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-md border border-purple-200 bg-purple-50 px-2.5 py-1 text-xs font-semibold text-purple-700 hover:bg-purple-100"
                >
                  <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                  Word Online
                </a>
              )}
              <button
                type="button"
                disabled={downloadBusy}
                onClick={() => void handleDownloadDocx()}
                className="inline-flex items-center gap-1.5 rounded-md border border-blue-200 bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700 hover:bg-blue-100 disabled:opacity-50"
              >
                <Download className="h-3.5 w-3.5" aria-hidden />
                {downloadBusy ? 'Preparing…' : 'Download original'}
              </button>
            </div>
            {downloadHint && <p className="max-w-xs text-right text-[10px] text-red-600">{downloadHint}</p>}
          </div>
        )}
        {previewBody}
      </div>
    );
  }

  return (
    <div className="relative flex min-h-screen flex-col bg-[#e5e7eb]">
      {loadingOverlay}
      {headerContent}
      {previewBody}
    </div>
  );
}

function BackButton({ backHref, backLabel }: { backHref: string; backLabel: string }) {
  return (
    <button
      type="button"
      onClick={() => {
        window.close();
        setTimeout(() => {
          if (!window.closed) {
            if (window.history.length > 1) window.history.back();
            else window.location.href = backHref;
          }
        }, 150);
      }}
      className="inline-flex items-center gap-2 text-sm font-semibold text-purple-600 hover:underline cursor-pointer bg-transparent border-0 p-0"
    >
      <ArrowLeft className="h-4 w-4" /> {backLabel}
    </button>
  );
}
