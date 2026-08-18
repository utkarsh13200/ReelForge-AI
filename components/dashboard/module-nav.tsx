"use client";

import {
  createContext,
  startTransition,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ComponentProps,
  type MouseEvent,
} from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { PIPELINE_STEPS } from "@/lib/project/pipeline-status";

type ModuleNavValue = {
  activeHref: string;
  goTo: (href: string) => void;
  onNavClick: (href: string, event: MouseEvent<HTMLAnchorElement>) => void;
};

const ModuleNavContext = createContext<ModuleNavValue | null>(null);

function isModifiedClick(event: MouseEvent<HTMLAnchorElement>) {
  return event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0;
}

export function ModuleNavProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [pendingHref, setPendingHref] = useState<string | null>(null);

  useEffect(() => {
    setPendingHref(null);
  }, [pathname]);

  useEffect(() => {
    for (const step of PIPELINE_STEPS) {
      router.prefetch(step.href);
    }
  }, [router]);

  const goTo = useCallback(
    (href: string) => {
      if (href === pathname) {
        setPendingHref(null);
        return;
      }
      setPendingHref(href);
      startTransition(() => {
        router.push(href);
      });
    },
    [pathname, router]
  );

  const onNavClick = useCallback(
    (href: string, event: MouseEvent<HTMLAnchorElement>) => {
      if (isModifiedClick(event)) return;
      event.preventDefault();
      goTo(href);
    },
    [goTo]
  );

  const value = useMemo(
    () => ({
      activeHref: pendingHref || pathname,
      goTo,
      onNavClick,
    }),
    [pendingHref, pathname, goTo, onNavClick]
  );

  return <ModuleNavContext.Provider value={value}>{children}</ModuleNavContext.Provider>;
}

export function useModuleNav() {
  const context = useContext(ModuleNavContext);
  if (!context) {
    throw new Error("useModuleNav must be used within ModuleNavProvider");
  }
  return context;
}

export function ModuleLink({ href, onClick, ...props }: ComponentProps<typeof Link>) {
  const context = useContext(ModuleNavContext);
  const target = typeof href === "string" ? href : "";

  return (
    <Link
      prefetch
      scroll={false}
      {...props}
      href={href}
      onClick={(event) => {
        onClick?.(event);
        if (event.defaultPrevented || !context || !target.startsWith("/dashboard/")) return;
        context.onNavClick(target, event);
      }}
    />
  );
}
