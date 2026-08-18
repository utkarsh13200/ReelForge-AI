import { Flame } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";

export function BrandLogo({
  href = "/",
  size = "md",
  className,
}: {
  href?: string;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const sizes = {
    sm: { icon: "h-8 w-8", flame: "h-4 w-4", title: "text-base", sub: "text-[9px]" },
    md: { icon: "h-9 w-9", flame: "h-5 w-5", title: "text-xl", sub: "text-[10px]" },
    lg: { icon: "h-11 w-11", flame: "h-6 w-6", title: "text-2xl", sub: "text-xs" },
  }[size];

  return (
    <Link href={href} className={cn("group flex items-center gap-2.5", className)}>
      <div
        className={cn(
          "flex items-center justify-center rounded-xl bg-forge/15 ring-1 ring-forge/20 transition group-hover:bg-forge/20",
          sizes.icon
        )}
      >
        <Flame className={cn("text-forge", sizes.flame)} />
      </div>
      <div>
        <p className={cn("font-display font-semibold leading-tight tracking-tight", sizes.title)}>
          ReelForge AI
        </p>
        <p className={cn("uppercase tracking-[0.22em] text-muted-foreground", sizes.sub)}>Video studio</p>
      </div>
    </Link>
  );
}
