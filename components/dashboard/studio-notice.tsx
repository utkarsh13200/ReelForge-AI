import { cn } from "@/lib/utils";

export function StudioNotice({
  message,
  tone = "info",
}: {
  message: string;
  tone?: "info" | "success" | "error";
}) {
  return (
    <div
      className={cn(
        "rounded-lg border px-4 py-3 text-sm",
        tone === "success" && "border-emerald-500/30 bg-emerald-500/10 text-emerald-100",
        tone === "error" && "border-red-500/30 bg-red-500/10 text-red-100",
        tone === "info" && "border-white/10 bg-white/5 text-foreground"
      )}
      role="status"
    >
      {message}
    </div>
  );
}
