import { NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import SOP from '@/models/SOP';
import SOPVersionArtifacts from '@/models/SOPVersionArtifacts';
import { normalizeSopIdentifierKey, sopFamilyKeyFromIdentifier } from '@/lib/sopIdentifierNormalize';
import { getDepartmentForSubcategory, extractSubcategoryFromIdentifier } from '@/lib/mcqTreeBuilder';
import { isStandardRegistrySopNumber } from '@/lib/registryPrimaryRows';

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

export async function GET(request: Request) {
  await connectDB();

  const { searchParams } = new URL(request.url);
  const dept = searchParams.get('dept') || 'Engineering and Maintenance';

  // Get all primary SOP identifiers from SOP collection
  const allSOPs = await SOP.find({ isObsolete: { $ne: true } })
    .select('identifier language department').lean() as any[];

  // Dedup by normalized identifier key
  const seenKeys = new Set<string>();
  const sopFamilies: string[] = [];
  for (const sop of allSOPs) {
    const idNorm = normalizeSopIdentifierKey((sop.identifier || '').trim().toUpperCase());
    if (!isStandardRegistrySopNumber({ sopNo: idNorm })) continue;
    const fk = sopFamilyKeyFromIdentifier(idNorm);
    if (!fk) continue;
    const code = extractSubcategoryFromIdentifier(idNorm);
    const sopDept = normalizeDeptForDisplay(getDepartmentForSubcategory(code));
    if (sopDept !== dept) continue;
    if (seenKeys.has(fk)) continue;
    seenKeys.add(fk);
    sopFamilies.push(idNorm);
  }

  // Get artifact-only families
  const artifacts = await SOPVersionArtifacts.find({}).select('identifier department').lean() as any[];
  const primaryFamilies = new Set(sopFamilies.map(s => sopFamilyKeyFromIdentifier(s)).filter(Boolean) as string[]);
  const artifactFamilies: string[] = [];
  const seenArtFamilies = new Set<string>();
  for (const va of artifacts) {
    const idNorm = normalizeSopIdentifierKey((va.identifier || '').trim().toUpperCase());
    if (!isStandardRegistrySopNumber({ sopNo: idNorm })) continue;
    const fk = sopFamilyKeyFromIdentifier(idNorm);
    if (!fk) continue;
    if (primaryFamilies.has(fk)) continue;
    if (seenArtFamilies.has(fk)) continue;
    const code = extractSubcategoryFromIdentifier(idNorm);
    const artDept = normalizeDeptForDisplay(getDepartmentForSubcategory(code));
    if (artDept !== dept) continue;
    seenArtFamilies.add(fk);
    artifactFamilies.push(idNorm);
  }

  return NextResponse.json({
    dept,
    primaryCount: sopFamilies.length,
    artifactOnlyCount: artifactFamilies.length,
    total: sopFamilies.length + artifactFamilies.length,
    primarySOPs: sopFamilies.sort(),
    artifactOnlySOPs: artifactFamilies.sort(),
  });
}
