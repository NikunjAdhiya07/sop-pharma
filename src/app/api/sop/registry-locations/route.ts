import { NextRequest, NextResponse } from 'next/server';
import * as XLSX from 'xlsx';
import connectDB from '@/lib/mongodb';
import SOP from '@/models/SOP';
import SOPLibrary from '@/models/SOPLibrary';
import { expandSopIdentifierVariants, normalizeSopIdentifierKey } from '@/lib/sopIdentifierNormalize';
import {
  aggregateLocationsBySop,
  parseLocationExcelSheet,
} from '@/lib/parseLocationExcelSheet';

function cellToString(v: unknown): string {
  if (v == null) return '';
  if (typeof v === 'string') return v.trim();
  if (typeof v === 'number' && Number.isFinite(v)) return String(v).trim();
  return String(v).trim();
}

function normHeader(h: string): string {
  return String(h || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function findSopColumnKey(row: Record<string, unknown>): string | null {
  for (const k of Object.keys(row)) {
    const kk = normHeader(k);
    if (/^sop\s*no\.?$/.test(kk)) return k;
    if (/^sop\s*number$/.test(kk)) return k;
    if (kk === 'sopno') return k;
    if (/^identifier$/.test(kk)) return k;
    if (/^sop\s*code$/.test(kk)) return k;
    if (kk === 'code' && !/location|site/.test(kk)) return k;
  }
  for (const k of Object.keys(row)) {
    const kk = normHeader(k);
    if (/sop/.test(kk) && /no|num|id|code/.test(kk) && !/location|name/.test(kk)) return k;
  }
  return null;
}

function findLocationColumnKey(row: Record<string, unknown>): string | null {
  for (const k of Object.keys(row)) {
    const kk = normHeader(k);
    if (kk === 'location') return k;
    if (/^physical\s*location$/.test(kk)) return k;
    if (/^storage\s*location$/.test(kk)) return k;
    if (kk === 'site') return k;
    if (kk === 'area' && !/sop/.test(kk)) return k;
    if (kk === 'room') return k;
  }
  return null;
}

type Pair = { sopId: string; location: string };

function pairsFromObjectRows(rows: Record<string, unknown>[]): Pair[] {
  const out: Pair[] = [];
  for (const raw of rows) {
    const sopKey = findSopColumnKey(raw);
    const locKey = findLocationColumnKey(raw);
    if (!sopKey || !locKey) continue;
    const idRaw = cellToString(raw[sopKey]);
    const loc = cellToString(raw[locKey]);
    if (!idRaw || !loc) continue;
    out.push({ sopId: idRaw, location: loc });
  }
  return out;
}

function pairsFromSimpleTwoColumn(ws: XLSX.WorkSheet): Pair[] {
  const rawRows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' }) as unknown[][];
  if (rawRows.length < 2) return [];
  const h0 = rawRows[0].map((c) => normHeader(String(c)));
  let sopIdx = h0.findIndex(
    (c) =>
      (/sop|identifier|code/.test(c) && !/location|site|physical/.test(c)) ||
      /^sop\s*no/.test(c) ||
      c === 'sopno',
  );
  let locIdx = h0.findIndex((c) => /location|site|physical|storage/.test(c) && !/^sop/.test(c));
  if (sopIdx < 0 && locIdx < 0 && rawRows[0].length >= 2) {
    sopIdx = 0;
    locIdx = 1;
  }
  if (sopIdx < 0 || locIdx < 0) return [];
  const out: Pair[] = [];
  for (let r = 1; r < rawRows.length; r++) {
    const row = rawRows[r];
    const idRaw = cellToString(row[sopIdx]);
    const loc = cellToString(row[locIdx]);
    if (!idRaw || !loc) continue;
    out.push({ sopId: idRaw, location: loc });
  }
  return out;
}

/**
 * POST multipart `file`: Excel with either
 * (A) Site map: Sr / **DP No.** / **SOP No.** (merged DP rows forward-filled), optional facility row above headers, or
 * (B) Simple two columns: SOP NO + LOCATION.
 */
export async function POST(request: NextRequest) {
  try {
    await connectDB();
    const form = await request.formData();
    const file = form.get('file');
    if (!file || !(file instanceof Blob)) {
      return NextResponse.json({ success: false, error: 'Missing file' }, { status: 400 });
    }

    const buf = Buffer.from(await file.arrayBuffer());
    const wb = XLSX.read(buf, { type: 'buffer' });
    const sheetName = wb.SheetNames[0];
    if (!sheetName) {
      return NextResponse.json({ success: false, error: 'Workbook has no sheets' }, { status: 400 });
    }
    let sopToLocation = new Map<string, string>();
    let mode: 'site-map' | 'simple' = 'site-map';

    const sitePairs: { sopRaw: string; location: string }[] = [];
    let siteParseNote = '';
    for (const name of wb.SheetNames) {
      const w = wb.Sheets[name];
      if (!w) continue;
      const part = parseLocationExcelSheet(w);
      if (part.parseNote) siteParseNote = part.parseNote;
      sitePairs.push(...part.pairs);
    }

    let rowsRead = 0;
    if (sitePairs.length > 0) {
      sopToLocation = aggregateLocationsBySop(sitePairs);
      rowsRead = sitePairs.length;
    } else {
      const ws = wb.Sheets[sheetName];
      mode = 'simple';
      if (!ws) {
        return NextResponse.json({ success: false, error: 'Invalid sheet' }, { status: 400 });
      }
      const objectRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '' });
      let pairs = pairsFromObjectRows(objectRows);
      if (pairs.length === 0) pairs = pairsFromSimpleTwoColumn(ws);
      if (pairs.length === 0) {
        return NextResponse.json(
          {
            success: false,
            error:
              siteParseNote ||
              'Could not read this workbook. Use **DP No.** + **SOP No.** (merged DP cells OK), or **SOP NO** + **LOCATION**.',
          },
          { status: 400 },
        );
      }
      rowsRead = pairs.length;
      sopToLocation = aggregateLocationsBySop(
        pairs.map((p) => ({ sopRaw: p.sopId, location: p.location })),
      );
    }

    let updatedSOP = 0;
    let updatedLibrary = 0;

    for (const [norm, loc] of sopToLocation) {
      const variantSet = new Set<string>();
      variantSet.add(norm);
      for (const v of expandSopIdentifierVariants(norm)) variantSet.add(v);
      const variants = Array.from(variantSet);

      const sopRes = await SOP.updateMany({ identifier: { $in: variants } }, { $set: { location: loc } });
      updatedSOP += sopRes.modifiedCount ?? 0;

      const libRes = await SOPLibrary.updateMany({ sopIdentifier: { $in: variants } }, { $set: { location: loc } });
      updatedLibrary += libRes.modifiedCount ?? 0;
    }

    const nSops = sopToLocation.size;

    return NextResponse.json({
      success: true,
      updatedSOP,
      updatedLibrary,
      uniqueSopCodes: nSops,
      rowsRead,
      parseMode: mode,
      message: `Imported ${rowsRead} row(s) → ${nSops} SOP code(s) (${mode === 'site-map' ? 'DP No. + SOP map' : 'two-column'}). Updated ${updatedSOP} SOP document(s), ${updatedLibrary} library row(s). Refresh the dashboard.`,
    });
  } catch (e) {
    console.error('registry-locations', e);
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : 'Import failed' },
      { status: 500 },
    );
  }
}
