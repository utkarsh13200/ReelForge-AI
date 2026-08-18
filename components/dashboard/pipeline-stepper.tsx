import { cn } from "@/lib/utils";
import { Check } from "lucide-react";
import Link from "next/link";
import { useModuleNav } from "@/components/dashboard/module-nav";
import {
  PIPELINE_STEPS,
  stepCompletion,
  type PipelineStatus,
} from "@/lib/project/pipeline-status";

export function PipelineStepper({ pipeline }: { pipeline: PipelineStatus | null }) {
  const { activeHref, onNavClick } = useModuleNav();

  return (
    <ol className="hidden items-center gap-0.5 overflow-x-auto lg:flex">
      {PIPELINE_STEPS.map((step, index) => {
        const done = pipeline ? stepCompletion(pipeline, step.key) : false;
        const active = activeHref.startsWith(step.href);
        return (
          <li key={step.key} className="flex items-center">
            <Link
              href={step.href}
              prefetch
              scroll={false}
              onClick={(event) => onNavClick(step.href, event)}
              className={cn(
                "flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-xs font-medium transition-all",
                active && "bg-forge/15 text-forge shadow-inner shadow-forge/10",
                !active && done && "text-emerald-400 hover:text-emerald-300",
                !active && !done && "text-muted-foreground hover:bg-white/5 hover:text-foreground"
              )}
            >
              <span
                className={cn(
                  "flex h-4 w-4 items-center justify-center rounded-full border text-[10px]",
                  done && "border-emerald-500/50 bg-emerald-500/15",
                  !done && active && "border-forge/50",
                  !done && !active && "border-white/15"
                )}
              >
                {done ? <Check className="h-2.5 w-2.5" /> : index + 1}
              </span>
              {step.label}
            </Link>
            {index < PIPELINE_STEPS.length - 1 ? (
              <span className="mx-1 text-muted-foreground/40">·</span>
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}
