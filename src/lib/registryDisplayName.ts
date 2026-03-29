/**
 * Detect strings that are folder trees, inventory paths, or numbered department layouts — not human SOP titles.
 * Used so the registry prefers library / master / artifact titles over raw file names.
 */

export function looksLikePathOrFolderStructure(s: string): boolean {
  if (!s || typeof s !== 'string') return false;
  const n = s.trim();
  if (n.length === 0) return false;
  if (/[\\/]/.test(n)) return true;
  if (/Word files only/i.test(n)) return true;
  if ((n.match(/[\\/]/g) || []).length >= 1 && n.length > 40) return true;
  // Long "1. QA … 2. QAGE …" style paths without slashes
  if (/^\d+\.\s+/.test(n) && n.length > 55 && (n.split(/\d+\.\s+/).length >= 3 || /[/\\]| → |->/.test(n))) return true;
  if (/^\d+\.\s+[A-Za-z].{30,}/.test(n) && n.length > 90) return true;
  return false;
}
