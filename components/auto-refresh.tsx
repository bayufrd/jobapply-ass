"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

type Props = {
  enabled?: boolean;
  intervalMs?: number;
};

export function AutoRefresh({ enabled = true, intervalMs = 2000 }: Props) {
  const router = useRouter();

  useEffect(() => {
    if (!enabled || intervalMs <= 0) return;

    const refresh = () => {
      router.refresh();
    };
    const id = window.setInterval(refresh, intervalMs);
    const onFocus = () => refresh();
    const onVisibility = () => {
      if (document.visibilityState === "visible") refresh();
    };

    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      window.clearInterval(id);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [enabled, intervalMs, router]);

  return null;
}
