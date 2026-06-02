import type { Locator, Page } from "playwright";
import type { UiActionPlan } from "@/lib/ai/ui-action-planner";
import type { DomSnapshot, DomSnapshotElement } from "@/lib/browser/dom-snapshot";

const BLOCKED_PATTERNS = [
  "captcha",
  "otp",
  "one-time password",
  "verification code",
  "security verification",
  "password",
  "login",
  "sign in",
  "browser extension",
  "payment",
  "credit card",
  "allow notifications",
  "permission",
];

function normalize(value: string | null | undefined) {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

function buildBlockedText(element: DomSnapshotElement) {
  return normalize(
    [
      element.text,
      element.label,
      element.placeholder,
      element.ariaLabel,
      element.nearbyText,
      element.formSectionText,
      element.locatorHint,
    ].join(" "),
  ).toLowerCase();
}

function isBlockedElement(element: DomSnapshotElement) {
  const combined = buildBlockedText(element);
  return BLOCKED_PATTERNS.some((pattern) => combined.includes(pattern));
}

function getElementById(snapshot: DomSnapshot, elementId: string) {
  return snapshot.elements.find((element) => element.elementId === elementId) ?? null;
}

async function waitForVisibleInteractiveElements(page: Page) {
  await page
    .waitForFunction(() => {
      const selectors = [
        "button",
        "a[role='button']",
        "input:not([type='hidden'])",
        "textarea",
        "select",
        "[contenteditable='true']",
      ].join(", ");

      return Array.from(document.querySelectorAll(selectors)).some((node) => {
        if (!(node instanceof HTMLElement)) return false;
        const style = window.getComputedStyle(node);
        const rect = node.getBoundingClientRect();
        return style.display !== "none"
          && style.visibility !== "hidden"
          && style.opacity !== "0"
          && rect.width > 0
          && rect.height > 0;
      });
    }, undefined, { timeout: 1_200 })
    .catch(() => undefined);
}

async function waitForDomMutation(page: Page) {
  await page
    .evaluate(() => {
      return new Promise<void>((resolve) => {
        let settled = false;
        const done = () => {
          if (settled) return;
          settled = true;
          observer.disconnect();
          resolve();
        };

        const observer = new MutationObserver(() => {
          window.setTimeout(done, 150);
        });

        observer.observe(document.body, {
          childList: true,
          subtree: true,
          attributes: true,
          characterData: true,
        });

        window.setTimeout(done, 700);
      });
    })
    .catch(() => undefined);
}

async function waitForElementStable(locator: Locator) {
  const box1 = await locator.boundingBox().catch(() => null);
  await locator.page().waitForTimeout(180);
  const box2 = await locator.boundingBox().catch(() => null);

  if (!box1 || !box2) return;

  const changed = Math.abs(box1.x - box2.x) > 1
    || Math.abs(box1.y - box2.y) > 1
    || Math.abs(box1.width - box2.width) > 1
    || Math.abs(box1.height - box2.height) > 1;

  if (changed) {
    await locator.page().waitForTimeout(220);
  }
}

function fingerprintSnapshot(snapshot: DomSnapshot) {
  return JSON.stringify({
    currentUrl: snapshot.currentUrl,
    title: snapshot.pageTitle,
    count: snapshot.elements.length,
    first: snapshot.elements.slice(0, 10).map((element) => ({
      id: element.elementId,
      text: element.text,
      label: element.label,
      valuePreview: element.valuePreview,
      checked: element.checked,
      selected: element.selected,
    })),
  });
}

async function waitForUrlOrFormChange(page: Page, previousSnapshot: DomSnapshot) {
  const previousFingerprint = fingerprintSnapshot(previousSnapshot);

  await page
    .waitForFunction(
      ({ previousUrl, previousTitle, previousFingerprintValue }) => {
        const currentUrl = window.location.href;
        const currentTitle = document.title;
        const selectors = [
          "button",
          "a[role='button']",
          "input:not([type='hidden'])",
          "textarea",
          "select",
          "[contenteditable='true']",
        ].join(", ");

        const currentFingerprintValue = JSON.stringify({
          currentUrl,
          title: currentTitle,
          count: document.querySelectorAll(selectors).length,
          first: Array.from(document.querySelectorAll(selectors))
            .slice(0, 10)
            .map((node) => {
              if (!(node instanceof HTMLElement)) return {};
              return {
                id: node.getAttribute("data-ai-element-id"),
                text: (node.textContent || (node as HTMLInputElement).value || "").trim().slice(0, 80),
                label: node.getAttribute("aria-label") || "",
                valuePreview: ((node as HTMLInputElement).value || "").trim().slice(0, 30),
                checked: node instanceof HTMLInputElement ? node.checked : false,
                selected: node instanceof HTMLOptionElement ? node.selected : false,
              };
            }),
        });

        return currentUrl !== previousUrl
          || currentTitle !== previousTitle
          || currentFingerprintValue !== previousFingerprintValue;
      },
      {
        previousUrl: previousSnapshot.currentUrl,
        previousTitle: previousSnapshot.pageTitle,
        previousFingerprintValue: previousFingerprint,
      },
      { timeout: 1_200 },
    )
    .catch(() => undefined);
}

export async function waitForUiSettled(page: Page, previousSnapshot: DomSnapshot) {
  await Promise.race([
    waitForDomMutation(page),
    waitForUrlOrFormChange(page, previousSnapshot),
    page.waitForTimeout(500),
  ]).catch(() => undefined);

  await waitForVisibleInteractiveElements(page);
  await page.waitForTimeout(180);
}

async function resolveLocator(page: Page, element: DomSnapshotElement) {
  const attrLocator = page.locator(`[data-ai-element-id='${element.elementId}']`).first();
  if (await attrLocator.count().catch(() => 0)) {
    return attrLocator;
  }

  const candidates: string[] = [];
  if (element.name) candidates.push(`${element.tag}[name='${element.name}']`);
  if (element.ariaLabel) candidates.push(`${element.tag}[aria-label='${element.ariaLabel}']`);
  if (element.placeholder) candidates.push(`${element.tag}[placeholder='${element.placeholder}']`);
  if (element.type) candidates.push(`${element.tag}[type='${element.type}']`);
  candidates.push(element.tag);

  for (const selector of candidates) {
    const locator = page.locator(selector).filter({ hasText: element.text || undefined }).first();
    if (await locator.count().catch(() => 0)) {
      return locator;
    }
  }

  return page.locator(element.tag).first();
}

async function verifyFill(locator: Locator, expectedValue: string) {
  const value = await locator.inputValue().catch(async () => locator.textContent().catch(() => ""));
  return normalize(value).includes(normalize(expectedValue).slice(0, 20));
}

export async function executeUiActionPlan(page: Page, plan: UiActionPlan, snapshot: DomSnapshot) {
  if (!plan.safeToExecute) {
    throw new Error("Rencana AI tidak aman untuk dieksekusi.");
  }

  for (const action of plan.actions) {
    const element = getElementById(snapshot, action.elementId);
    if (!element) {
      throw new Error(`Elemen ${action.elementId} tidak ada pada snapshot.`);
    }

    if (isBlockedElement(element)) {
      throw new Error(`Elemen ${action.elementId} diblokir oleh guardrail keamanan.`);
    }

    if (plan.goal === "final_submit" && !plan.safeToSubmit) {
      throw new Error("Submit final diblokir karena safeToSubmit=false.");
    }

    const locator = await resolveLocator(page, element);
    await locator.waitFor({ state: "visible", timeout: 1_200 });
    await waitForElementStable(locator);

    switch (action.type) {
      case "click": {
        await locator.click({ timeout: 1_200 });
        break;
      }
      case "fill": {
        await locator.fill("");
        await locator.fill(action.value, { timeout: 1_200 });
        const ok = await verifyFill(locator, action.value);
        if (!ok) {
          throw new Error(`Nilai untuk ${action.elementId} gagal diverifikasi.`);
        }
        break;
      }
      case "select": {
        await locator.selectOption({ label: action.value }).catch(async () => {
          await locator.selectOption({ value: action.value });
        });
        break;
      }
      case "check": {
        const current = await locator.isChecked().catch(() => false);
        if (action.checked !== current) {
          if (action.checked) {
            await locator.check({ timeout: 1_200 });
          } else {
            await locator.uncheck({ timeout: 1_200 });
          }
        }
        break;
      }
    }
  }

  await waitForUiSettled(page, snapshot);
}
