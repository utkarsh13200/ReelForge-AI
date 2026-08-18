import { cn } from "@/lib/utils";

export function ModuleHeader({
  step,
  title,
  description,
  className,
}: {
  step: string;
  title: string;
  description: string;
  className?: string;
}) {
  return (
    <div className={cn("space-y-2", className)}>
      <p className="kicker">{step}</p>
      <h1 className="font-display text-3xl font-semibold tracking-tight md:text-4xl">{title}</h1>
      <p className="max-w-2xl text-base leading-relaxed text-muted-foreground">{description}</p>
    </div>
  );
}
