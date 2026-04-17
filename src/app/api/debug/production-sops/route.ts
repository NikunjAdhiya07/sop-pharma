import { NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import SOP from '@/models/SOP';
import SOPVersionArtifacts from '@/models/SOPVersionArtifacts';
import { normalizeSopIdentifierKey, sopFamilyKeyFromIdentifier } from '@/lib/sopIdentifierNormalize';

function isStandardSopNumber(sopNo: string): boolean {
  return sopFamilyKeyFromIdentifier(sopNo) !== null;
}

// Family key = letters + doc number, no revision (PRGE11-3 and PRGE11-5 → same family PRGE:11)
function familyKey(key: string): string {
  const m = key.match(/^([A-Z]{2,6})(\d+)-/);
  if (!m) return key;
  return `${m[1]}:${parseInt(m[2], 10)}`;
}

const PREFIX_TO_DEPT: Record<string, string> = {
  PRAA: 'Production', PRCL: 'Production', PRED: 'Production',
  PREO: 'Production', PREP: 'Production', PRGE: 'Production',
  PRMA: 'Production', PRPA: 'Production',
};
function isProduction(key: string): boolean {
  const code = key.toUpperCase().match(/^([A-Z]{2,6})\d/)?.[1] ?? '';
  return PREFIX_TO_DEPT[code] === 'Production';
}

export async function GET() {
  await connectDB();

  const allSOPs = await SOP.find({ isObsolete: { $ne: true } })
    .select('identifier').lean() as any[];

  // All SOP family keys in the SOP collection
  const sopFamilies = new Set<string>();
  const sopNormalizedKeys = new Set<string>();
  for (const sop of allSOPs) {
    const key = normalizeSopIdentifierKey((sop.identifier || '').trim().toUpperCase());
    if (isStandardSopNumber(key)) {
      sopNormalizedKeys.add(key);
      sopFamilies.add(familyKey(key));
    }
  }

  // All artifact identifiers for Production
  const artifacts = await SOPVersionArtifacts.find({}).select('identifier').lean() as any[];
  const artifactProduction = new Map<string, string[]>(); // family → [keys]
  for (const va of artifacts) {
    const key = normalizeSopIdentifierKey((va.identifier || '').trim().toUpperCase());
    if (!isStandardSopNumber(key) || !isProduction(key)) continue;
    const fk = familyKey(key);
    if (!artifactProduction.has(fk)) artifactProduction.set(fk, []);
    artifactProduction.get(fk)!.push(key);
  }

  // Families in artifacts but NO version at all in SOP collection → truly missing SOPs
  const trulyMissing: string[] = [];
  const olderVersionOnly: string[] = [];

  for (const [fk, keys] of artifactProduction) {
    if (!sopFamilies.has(fk)) {
      trulyMissing.push(...[...new Set(keys)].sort());
    } else {
      // family exists in SOP collection but these specific revisions don't
      const notInSop = keys.filter(k => !sopNormalizedKeys.has(k));
      if (notInSop.length > 0) olderVersionOnly.push(...[...new Set(notInSop)].sort());
    }
  }

  return NextResponse.json({
    productionInSOP: [...sopNormalizedKeys].filter(isProduction).length,
    trulyMissingFromSOP: trulyMissing.sort(), // These SOPs don't exist in SOP collection at all
    trulyMissingCount: trulyMissing.length,
    olderVersionOnlyCount: olderVersionOnly.length, // These are just old revisions, SOP collection has newer
    note: 'trulyMissing = artifact families with zero match in SOP collection (not even a different revision)',
  });
}
