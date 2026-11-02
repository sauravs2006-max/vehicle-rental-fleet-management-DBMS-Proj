// MongoDB inspections use a 4-level scale; the SQL damage_reports table keeps the
// older None / Minor / Major scale (it has a CHECK constraint). These helpers convert between them.
export const INSPECTION_SEVERITIES = ["Low", "Medium", "High", "Critical"] as const;
export type InspectionSeverity = (typeof INSPECTION_SEVERITIES)[number];
export type DamageSeverity = "None" | "Minor" | "Major";

export const toInspectionSeverity = (s: DamageSeverity): InspectionSeverity =>
  ({ None: "Low", Minor: "Medium", Major: "High" } as const)[s];

export const toDamageSeverity = (s: InspectionSeverity): DamageSeverity =>
  ({ Low: "None", Medium: "Minor", High: "Major", Critical: "Major" } as const)[s];
