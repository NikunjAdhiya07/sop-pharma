import { NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import SOP from '@/models/SOP';
import SOPVersionArtifacts from '@/models/SOPVersionArtifacts';
import { normalizeSopIdentifierKey, sopFamilyKeyFromIdentifier } from '@/lib/sopIdentifierNormalize';
import { getDepartmentForSubcategory, extractSubcategoryFromIdentifier } from '@/lib/mcqTreeBuilder';
import { isArtifactOnlyRegistryRow, isStandardRegistrySopNumber } from '@/lib/registryPrimaryRows';

function normalizeDeptForDisplay(d: string): string {
  if (!d) return 'Other';
  const lower = d.toLowerCase();
  if (lower.includes('micro')) return 'Microbiology';
  if (lower.includes('engineer')) return 'Engineering and Maintenance';
  if (lower.includes('person') || lower.includes('hr')) return 'Personnel';
  if (lower.includes('store')) return 'Store';
  if (lower.includes('prod')) return 'Production';
  if (lower === 'qa' || lower.includes('quality assurance')) return 'QA';
  if (lower === 'qc' || lower.includes('quality control')) return 'QC';
  return d;
}

export async function GET() {
  await connectDB();

  // Simulate exactly what the dashboard sops API returns for each row
  // Primary rows: SOP collection merged
  const allSOPs = await SOP.find({ isObsolete: { $ne: true } })
    .select('identifier language createdAt department').lean() as any[];

  // Dedup per lang then merge (same as dashboard)
  const byKey = new Map<string, any>();
  for (const sop of allSOPs) {
    const idNorm = normalizeSopIdentifierKey((sop.identifier || '').trim().toUpperCase());
    const lang = sop.language || 'English';
    const key = `${idNorm}::${lang}`;
    if (!byKey.has(key)) byKey.set(key, { ...sop, _idNorm: idNorm });
  }
  const mergedMap = new Map<string, any>();
  for (const sop of byKey.values()) {
    const mk = sop._idNorm;
    if (!mergedMap.has(mk)) mergedMap.set(mk, sop);
  }

  // Build primary rows (non-artifact, standard SOP number)
  const primaryRows: any[] = [];
  for (const [mk, sop] of mergedMap) {
    if (!isStandardRegistrySopNumber({ sopNo: mk })) continue;
    const code = extractSubcategoryFromIdentifier(mk);
    const dept = normalizeDeptForDisplay(getDepartmentForSubcategory(code));
    primaryRows.push({ sopNo: mk, department: dept, registryRowKind: 'primary' });
  }

  // Build primary family keys
  const primaryFamilies = new Set<string>();
  for (const row of primaryRows) {
    const fk = sopFamilyKeyFromIdentifier(row.sopNo);
    if (fk) primaryFamilies.add(fk);
  }

  // Artifact-only rows (truly missing from SOP collection)
  const artifacts = await SOPVersionArtifacts.find({}).select('identifier department').lean() as any[];
  const artifactRows: any[] = [];
  const seenArtifactFamilies = new Set<string>();
  for (const va of artifacts) {
    const mk = normalizeSopIdentifierKey((va.identifier || '').trim().toUpperCase());
    if (!isStandardRegistrySopNumber({ sopNo: mk })) continue;
    const fk = sopFamilyKeyFromIdentifier(mk);
    if (!fk) continue;
    // Skip if primary row exists for this family
    if (primaryFamilies.has(fk)) continue;
    // Skip if we already counted this family from artifacts
    if (seenArtifactFamilies.has(fk)) continue;
    seenArtifactFamilies.add(fk);
    const code = extractSubcategoryFromIdentifier(mk);
    const dept = normalizeDeptForDisplay(getDepartmentForSubcategory(code));
    artifactRows.push({ sopNo: mk, department: dept, registryRowKind: 'artifactsOnly' });
  }

  const allRows = [...primaryRows, ...artifactRows];

  const byDept: Record<string, number> = {};
  for (const row of allRows) {
    byDept[row.department] = (byDept[row.department] || 0) + 1;
  }

  return NextResponse.json({
    primaryCount: primaryRows.length,
    artifactOnlyCount: artifactRows.length,
    totalExpected: allRows.length,
    byDept,
  });
}
