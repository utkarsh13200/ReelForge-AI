export type ComplianceIssue = {
  id: string;
  label: string;
  reference: string;
  detail: string;
  suggestion: string;
  severity: "Review" | "Needs edit";
};

export const initialComplianceIssues: ComplianceIssue[] = [
  {
    id: "financial",
    label: "Financial claim needs context",
    reference: "Scene 03 · 01:14",
    detail: "“Guaranteed return” could be interpreted as a promise of investment performance.",
    suggestion: "Replace with: “Results vary; make decisions based on your own research.”",
    severity: "Needs edit",
  },
  {
    id: "brand",
    label: "Brand reference detected",
    reference: "Scene 04 · Visual prompt",
    detail: "The visual prompt references a protected product mark.",
    suggestion: "Use a generic “premium smartphone” description instead.",
    severity: "Review",
  },
];
