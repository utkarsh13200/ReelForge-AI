import { Progress } from "@/components/ui/progress";
import { Card, CardContent } from "@/components/ui/card";

type JobProgressCardProps = {
  message: string;
  progress: number;
  secondsRemaining?: number | null;
  estimatedTotalSeconds?: number | null;
};

export function JobProgressCard({
  message,
  progress,
  secondsRemaining,
  estimatedTotalSeconds,
}: JobProgressCardProps) {
  const showCountdown =
    secondsRemaining != null && secondsRemaining > 0 && estimatedTotalSeconds != null;

  return (
    <Card className="border-forge/20 bg-forge/5">
      <CardContent className="space-y-3 pt-6">
        <div className="flex items-center justify-between gap-3 text-sm">
          <span className="text-muted-foreground">{message}</span>
          <span className="shrink-0 font-semibold text-forge">{progress}%</span>
        </div>
        {showCountdown ? (
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>
              Estimated time left:{" "}
              <span className="font-semibold tabular-nums text-foreground">
                {formatTime(secondsRemaining)}
              </span>
            </span>
            <span className="tabular-nums">~{formatTime(estimatedTotalSeconds)} total</span>
          </div>
        ) : null}
        <Progress value={progress} />
      </CardContent>
    </Card>
  );
}

function formatTime(seconds: number) {
  const total = Math.max(0, Math.round(seconds));
  const minutes = Math.floor(total / 60);
  const remainder = total % 60;
  if (minutes <= 0) return `${remainder}s`;
  return `${minutes}:${remainder.toString().padStart(2, "0")}`;
}
