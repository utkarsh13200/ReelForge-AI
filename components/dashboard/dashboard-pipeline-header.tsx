"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api/client";
import { PipelineStepper } from "@/components/dashboard/pipeline-stepper";
import { useProject } from "@/components/dashboard/project-provider";
import type { PipelineStatus } from "@/lib/project/pipeline-status";

export function DashboardPipelineHeader() {
  const { activeProjectId } = useProject();
  const [pipeline, setPipeline] = useState<PipelineStatus | null>(null);

  const loadPipeline = useCallback(async () => {
    if (!activeProjectId) {
      setPipeline(null);
      return;
    }

    const data = await apiFetch<{ pipeline: PipelineStatus }>(`/api/projects/${activeProjectId}/pipeline`);
    setPipeline(data.pipeline ?? null);
  }, [activeProjectId]);

  useEffect(() => {
    loadPipeline().catch(() => setPipeline(null));
    const timer = window.setInterval(() => {
      loadPipeline().catch(() => undefined);
    }, 15000);
    return () => window.clearInterval(timer);
  }, [loadPipeline]);

  return <PipelineStepper pipeline={pipeline} />;
}
