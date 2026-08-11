import type { ComplianceIssue } from "./compliance";

/**
 * Deterministic first pass used before an optional LLM review. It intentionally
 * reports its evidence; it never changes creator content on its own.
 */
const rules: Array<{
  pattern: RegExp;
  label: string;
  severity: ComplianceIssue["severity"];
  suggestion: string;
}> = [
  {
    pattern: /guaranteed|risk[- ]free|sure return/i,
    label: "Financial claim needs context",
    severity: "Needs edit",
    suggestion: "Add a clear risk disclosure and avoid performance promises.",
  },
  {
    pattern: /cure|miracle|diagnose|treats? (?:all|any) disease/i,
    label: "Medical claim needs evidence",
    severity: "Needs edit",
    suggestion: "Use qualified language and point to credible, current sources.",
  },
  {
    pattern: /kill yourself|subhuman|exterminate/i,
    label: "Potential hateful or harmful language",
    severity: "Needs edit",
    suggestion: "Remove the language and reframe the point without attacking a person or group.",
  },
  {
    pattern: /\b(apple|nike|disney|marvel)\b/i,
    label: "Brand or character reference detected",
    severity: "Review",
    suggestion: "Confirm you have permission, or use a generic alternative in the prompt.",
  },
];

export function runAdvisoryCheck(content: string): ComplianceIssue[] {
  return rules.flatMap((rule, index) => {
    const match = content.match(rule.pattern);
    if (!match || match.index === undefined) return [];

    const line = content.slice(0, match.index).split("\n").length;
    return [{
      id: `advisory-${index}-${line}`,
      label: rule.label,
      reference: `Script line ${line}`,
      detail: `Matched “${match[0]}”. Review this context before publishing.`,
      suggestion: rule.suggestion,
      severity: rule.severity,
    }];
  });
}
