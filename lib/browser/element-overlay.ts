import type { Page } from "playwright";
import type { DomSnapshot } from "@/lib/browser/dom-snapshot";

type CaptureOverlayOptions = {
  screenshotPath?: string;
  visibleOnly?: boolean;
};

type OverlayCaptureResult = {
  screenshotPath: string | null;
  labeledCount: number;
};

const OVERLAY_ATTRIBUTE = "data-ai-overlay-label";

export async function captureElementOverlayScreenshot(
  page: Page,
  snapshot: DomSnapshot,
  options: CaptureOverlayOptions = {},
): Promise<OverlayCaptureResult> {
  const visibleElements = snapshot.elements.filter((element) =>
    options.visibleOnly === false ? true : element.isVisible && element.isInViewport,
  );

  const labeledCount = await page.evaluate(
    ({ overlayAttribute, elements }) => {
      function removeExisting() {
        document.querySelectorAll(`[${overlayAttribute}]`).forEach((node) => node.remove());
      }

      removeExisting();

      const root = document.createElement("div");
      root.setAttribute(overlayAttribute, "root");
      root.style.position = "fixed";
      root.style.inset = "0";
      root.style.pointerEvents = "none";
      root.style.zIndex = "2147483647";
      document.body.appendChild(root);

      let count = 0;

      for (const element of elements as Array<{
        elementId: string;
        boundingBox: { x: number; y: number; width: number; height: number } | null;
      }>) {
        if (!element.boundingBox) continue;

        const badge = document.createElement("div");
        badge.setAttribute(overlayAttribute, element.elementId);
        badge.textContent = element.elementId.replace(/^ai-/, "#");
        badge.style.position = "fixed";
        badge.style.left = `${Math.max(0, element.boundingBox.x)}px`;
        badge.style.top = `${Math.max(0, element.boundingBox.y)}px`;
        badge.style.transform = "translateY(-100%)";
        badge.style.background = "rgba(6, 182, 212, 0.95)";
        badge.style.color = "#082f49";
        badge.style.font = "600 11px/1.2 -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
        badge.style.padding = "2px 6px";
        badge.style.borderRadius = "999px";
        badge.style.border = "1px solid rgba(8, 47, 73, 0.45)";
        badge.style.boxShadow = "0 1px 3px rgba(0, 0, 0, 0.3)";
        root.appendChild(badge);

        const outline = document.createElement("div");
        outline.setAttribute(overlayAttribute, `${element.elementId}-outline`);
        outline.style.position = "fixed";
        outline.style.left = `${Math.max(0, element.boundingBox.x)}px`;
        outline.style.top = `${Math.max(0, element.boundingBox.y)}px`;
        outline.style.width = `${Math.max(0, element.boundingBox.width)}px`;
        outline.style.height = `${Math.max(0, element.boundingBox.height)}px`;
        outline.style.border = "2px solid rgba(6, 182, 212, 0.75)";
        outline.style.borderRadius = "6px";
        outline.style.background = "rgba(6, 182, 212, 0.06)";
        root.appendChild(outline);
        count += 1;
      }

      return count;
    },
    {
      overlayAttribute: OVERLAY_ATTRIBUTE,
      elements: visibleElements,
    },
  );

  let screenshotPath: string | null = null;

  try {
    if (options.screenshotPath) {
      await page.screenshot({ path: options.screenshotPath, fullPage: true });
      screenshotPath = options.screenshotPath;
    }
  } finally {
    await removeElementOverlay(page);
  }

  return {
    screenshotPath,
    labeledCount,
  };
}

export async function removeElementOverlay(page: Page) {
  await page.evaluate((overlayAttribute) => {
    document.querySelectorAll(`[${overlayAttribute}]`).forEach((node) => node.remove());
  }, OVERLAY_ATTRIBUTE).catch(() => undefined);
}
