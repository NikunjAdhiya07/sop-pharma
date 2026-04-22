import { NextRequest, NextResponse } from 'next/server';

export const maxDuration = 60; // seconds

interface BunnyFile {
  Guid: string;
  StorageZoneName: string;
  Path: string;
  ObjectName: string;
  Length: number;
  LastChanged: string;
  ServerId: number;
  ArrayNumber: number;
  IsDirectory: boolean;
  UserId: string;
  ContentType: string;
  DateCreated: string;
  StorageZoneId: number;
  Checksum: string;
  ReplicatedZones: string;
}

function getConfig() {
  const storageZone = process.env.BUNNY_STORAGE_ZONE || process.env.BUNNY_STORAGE_ZONE_NAME || '';
  const apiKey = process.env.BUNNY_STORAGE_PASSWORD || process.env.BUNNY_API_KEY || '';
  const rawCdn = process.env.BUNNY_PULL_ZONE_URL || process.env.BUNNY_CDN_HOSTNAME || '';
  const cdnHostname = rawCdn.replace(/^https?:\/\//, '').replace(/\/$/, '');
  const storageHostname = process.env.BUNNY_STORAGE_HOSTNAME || 'storage.bunnycdn.com';
  return { storageZone, apiKey, cdnHostname, storageHostname };
}

async function listDirectory(storageHostname: string, storageZone: string, apiKey: string, path: string): Promise<BunnyFile[]> {
  const cleanPath = path.replace(/^\/+|\/+$/g, '');
  const url = cleanPath
    ? `https://${storageHostname}/${storageZone}/${cleanPath}/`
    : `https://${storageHostname}/${storageZone}/`;

  const res = await fetch(url, {
    headers: { AccessKey: apiKey },
    signal: AbortSignal.timeout(30_000),
  });

  if (!res.ok) {
    if (res.status === 404) return [];
    throw new Error(`Bunny list failed: ${res.status}`);
  }

  return res.json();
}

type FileResult = { name: string; path: string; size: number; lastModified: string; cdnUrl: string; type: 'docx' | 'pdf' };

async function collectFiles(
  storageHostname: string,
  storageZone: string,
  apiKey: string,
  path: string,
  cdnHostname: string,
  depth = 0,
): Promise<FileResult[]> {
  if (depth > 6) return [];

  let entries: BunnyFile[];
  try {
    entries = await listDirectory(storageHostname, storageZone, apiKey, path);
  } catch {
    return [];
  }

  const files: FileResult[] = [];
  const subdirPromises: Promise<FileResult[]>[] = [];

  for (const entry of entries) {
    const entryPath = path ? `${path.replace(/\/$/, '')}/${entry.ObjectName}` : entry.ObjectName;

    if (entry.IsDirectory) {
      // Kick off all subdirectory crawls in parallel
      subdirPromises.push(collectFiles(storageHostname, storageZone, apiKey, entryPath, cdnHostname, depth + 1));
    } else {
      const ext = entry.ObjectName.split('.').pop()?.toLowerCase() ?? '';
      const type = ext === 'docx' || ext === 'doc' ? 'docx' : ext === 'pdf' ? 'pdf' : null;
      if (!type) continue;
      files.push({
        name: entry.ObjectName,
        path: entryPath,
        size: entry.Length,
        lastModified: entry.LastChanged,
        cdnUrl: `https://${cdnHostname}/${entryPath}`,
        type,
      });
    }
  }

  // Wait for all subdirectory crawls to complete in parallel
  const subdirResults = await Promise.all(subdirPromises);
  for (const children of subdirResults) files.push(...children);

  return files;
}

export async function GET(request: NextRequest) {
  const { storageZone, apiKey, cdnHostname, storageHostname } = getConfig();

  if (!storageZone || !apiKey || !cdnHostname) {
    return NextResponse.json({ error: 'Bunny CDN not configured' }, { status: 500 });
  }

  const { searchParams } = new URL(request.url);
  const folder = searchParams.get('folder') ?? '';

  try {
    const files = await collectFiles(storageHostname, storageZone, apiKey, folder, cdnHostname);
    files.sort((a, b) => new Date(b.lastModified).getTime() - new Date(a.lastModified).getTime());
    return NextResponse.json({ files, total: files.length });
  } catch (err) {
    console.error('[bunny/browse]', err);
    return NextResponse.json({ error: 'Failed to list Bunny storage' }, { status: 500 });
  }
}
