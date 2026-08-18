import { AlertCircle, CheckCircle2, Info } from "lucide-react";
import { cn } from "@/lib/utils";

export function WorkspaceNotice({
  message,
  variant = "info",
}: {
  message: string;
  variant?: "info" | "success" | "error";
}) {
  const styles = {
    info: "border-border bg-secondary/50 text-muted-foreground",
    success: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
    error: "border-destructive/30 bg-destructive/10 text-red-300",
  }[variant];

  const Icon = variant === "error" ? AlertCircle : variant === "success" ? CheckCircle2 : Info;

  return (
    <div className={cn("flex items-start gap-2.5 rounded-lg border px-4 py-3 text-sm", styles)}>
      <Icon className="mt-0.5 h-4 w-4 shrink-0" />
      <p>{message}</p>
    </div>
  );
}
