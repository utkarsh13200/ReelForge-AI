export type PipelineStatus = {
  projectId: string;
  hasScript: boolean;
  hasVisuals: boolean;
  hasVoice: boolean;
  hasThumbnail: boolean;
  hasTimeline: boolean;
  readyForExport: boolean;
  hasExport: boolean;
};

export const PIPELINE_STEPS = [
  { key: "script", label: "Script", href: "/dashboard/script" },
  { key: "visuals", label: "Visuals", href: "/dashboard/visuals" },
  { key: "voice", label: "Voice", href: "/dashboard/voice" },
  { key: "thumbnail", label: "Thumb", href: "/dashboard/thumbnail" },
  { key: "edit", label: "Edit", href: "/dashboard/edit" },
  { key: "export", label: "Export", href: "/dashboard/export" },
] as const;

export type PipelineStepKey = (typeof PIPELINE_STEPS)[number]["key"];

export function stepCompletion(status: PipelineStatus, key: PipelineStepKey): boolean {
  switch (key) {
    case "script":
      return status.hasScript;
    case "visuals":
      return status.hasVisuals;
    case "voice":
      return status.hasVoice;
    case "thumbnail":
      return status.hasThumbnail;
    case "edit":
      return status.hasTimeline;
    case "export":
      return status.hasExport;
    default:
      return false;
  }
}
