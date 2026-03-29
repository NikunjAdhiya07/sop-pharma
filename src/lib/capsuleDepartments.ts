/** Canonical department list for capsules, charts, and department-scoped metrics. */
export const CAPSULE_DEPARTMENTS = [
  'QA',
  'QC',
  'Microbiology',
  'Production',
  'Store',
  'Engineering and Maintenance',
  'Personnel',
] as const;

export type CapsuleDepartment = (typeof CAPSULE_DEPARTMENTS)[number];
