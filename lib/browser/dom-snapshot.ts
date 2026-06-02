import type { Page } from "playwright";

export type DomSnapshotBoundingBox = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type DomSnapshotOption = {
  value: string;
  label: string;
  selected?: boolean;
  checked?: boolean;
};

export type DomSnapshotElement = {
  elementId: string;
  tag: string;
  role: string | null;
  type: string | null;
  text: string;
  label: string;
  placeholder: string;
  name: string;
  ariaLabel: string;
  valuePreview: string;
  required: boolean;
  disabled: boolean;
  checked: boolean;
  selected: boolean;
  options: DomSnapshotOption[];
  boundingBox: DomSnapshotBoundingBox | null;
  isVisible: boolean;
  isInViewport: boolean;
  nearbyText: string;
  formSectionText: string;
  locatorHint: string;
};

export type DomSnapshot = {
  currentUrl: string;
  pageTitle: string;
  visibleTextSummary: string;
  elements: DomSnapshotElement[];
};

type RawSnapshotElement = DomSnapshotElement & {
  sortY: number;
  sortX: number;
};

const MAX_TEXT_LENGTH = 220;
const MAX_SUMMARY_LENGTH = 4000;
const MAX_NEARBY_TEXT_LENGTH = 280;
const MAX_FORM_SECTION_TEXT_LENGTH = 500;
const MAX_OPTIONS = 12;

function normalizeWhitespace(value: string | null | undefined) {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

function truncate(value: string, maxLength: number) {
  return value.length <= maxLength ? value : `${value.slice(0, maxLength - 1)}…`;
}

export async function captureVisibleDomSnapshot(page: Page): Promise<DomSnapshot> {
  const result = await page.evaluate(
    ({
      maxTextLength,
      maxSummaryLength,
      maxNearbyTextLength,
      maxFormSectionTextLength,
      maxOptions,
    }) => {
      type BrowserSnapshotElement = RawSnapshotElement;

      const interactiveSelector = [
        "button",
        "a[role='button']",
        "input:not([type='hidden'])",
        "textarea",
        "select",
        "[contenteditable='true']",
        "label",
        "legend",
        "h1",
        "h2",
        "h3",
        "h4",
        "[role='heading']",
      ].join(", ");

      const blockedTextPatterns = [
        /captcha/i,
        /one-time password/i,
        /\botp\b/i,
        /security verification/i,
        /verification code/i,
        /browser extension/i,
        /notification permission/i,
        /allow notifications/i,
      ];

      function normalizeWhitespaceInner(value: string | null | undefined) {
        return (value ?? "").replace(/\s+/g, " ").trim();
      }

      function truncateInner(value: string, limit: number) {
        return value.length <= limit ? value : `${value.slice(0, limit - 1)}…`;
      }

      function isHTMLElement(node: Element | null): node is HTMLElement {
        return Boolean(node) && node instanceof HTMLElement;
      }

      function isVisible(el: HTMLElement) {
        const style = window.getComputedStyle(el);
        const rect = el.getBoundingClientRect();
        return !(
          style.display === "none"
          || style.visibility === "hidden"
          || style.opacity === "0"
          || rect.width <= 0
          || rect.height <= 0
          || el.hasAttribute("hidden")
          || el.getAttribute("aria-hidden") === "true"
        );
      }

      function isInViewport(el: HTMLElement) {
        const rect = el.getBoundingClientRect();
        return rect.bottom >= 0
          && rect.right >= 0
          && rect.top <= window.innerHeight
          && rect.left <= window.innerWidth;
      }

      function getAssociatedLabel(el: HTMLElement) {
        const htmlEl = el as HTMLElement & { labels?: NodeListOf<HTMLLabelElement> };
        const directLabels = htmlEl.labels ? Array.from(htmlEl.labels) : [];
        const directText = directLabels
          .map((label) => normalizeWhitespaceInner(label.textContent))
          .filter(Boolean)
          .join(" | ");
        if (directText) return directText;

        const id = el.getAttribute("id");
        if (id) {
          const label = document.querySelector(`label[for='${CSS.escape(id)}']`);
          if (isHTMLElement(label)) {
            const text = normalizeWhitespaceInner(label.textContent);
            if (text) return text;
          }
        }

        const wrappingLabel = el.closest("label");
        if (isHTMLElement(wrappingLabel)) {
          return normalizeWhitespaceInner(wrappingLabel.textContent);
        }

        return "";
      }

      function getNearbyText(el: HTMLElement) {
        const candidates = [
          el.previousElementSibling,
          el.nextElementSibling,
          el.parentElement,
          el.closest("label"),
          el.closest("fieldset"),
          el.closest("section"),
          el.closest("form"),
        ];

        const text = candidates
          .filter((candidate): candidate is HTMLElement => isHTMLElement(candidate))
          .map((candidate) => normalizeWhitespaceInner(candidate.textContent))
          .filter(Boolean)
          .join(" | ");

        return truncateInner(text, maxNearbyTextLength);
      }

      function getFormSectionText(el: HTMLElement) {
        const section = el.closest("fieldset, form, section, [role='group'], [data-testid], [class*='section' i]");
        if (!isHTMLElement(section)) return "";
        return truncateInner(normalizeWhitespaceInner(section.textContent), maxFormSectionTextLength);
      }

      function getRole(el: HTMLElement) {
        const explicitRole = el.getAttribute("role");
        if (explicitRole) return explicitRole;
        const tag = el.tagName.toLowerCase();
        if (tag === "button") return "button";
        if (tag === "select") return "combobox";
        if (tag === "textarea") return "textbox";
        if (tag === "a" && el.getAttribute("role") === "button") return "button";
        return null;
      }

      function getText(el: HTMLElement) {
        const input = el as HTMLInputElement;
        const text = normalizeWhitespaceInner(
          el.textContent
            || input.value
            || el.getAttribute("value")
            || el.getAttribute("aria-label")
            || el.getAttribute("placeholder"),
        );
        return truncateInner(text, maxTextLength);
      }

      function shouldSkip(el: HTMLElement) {
        const tag = el.tagName.toLowerCase();
        const type = (el.getAttribute("type") ?? "").toLowerCase();
        const text = normalizeWhitespaceInner(el.textContent);
        const ariaLabel = normalizeWhitespaceInner(el.getAttribute("aria-label"));
        const combined = `${text} ${ariaLabel}`.trim();

        if (tag === "input" && type === "hidden") return true;
        if (!isVisible(el)) return true;
        if (combined && blockedTextPatterns.some((pattern) => pattern.test(combined))) return true;
        return false;
      }

      function getLocatorHint(el: HTMLElement, index: number) {
        const tag = el.tagName.toLowerCase();
        const type = normalizeWhitespaceInner(el.getAttribute("type"));
        const name = normalizeWhitespaceInner(el.getAttribute("name"));
        const ariaLabel = normalizeWhitespaceInner(el.getAttribute("aria-label"));
        const placeholder = normalizeWhitespaceInner(el.getAttribute("placeholder"));
        const role = normalizeWhitespaceInner(el.getAttribute("role"));
        const text = normalizeWhitespaceInner(el.textContent || (el as HTMLInputElement).value).slice(0, 80);
        const dataAutomation = normalizeWhitespaceInner(el.getAttribute("data-automation"));
        const id = normalizeWhitespaceInner(el.getAttribute("id"));

        const parts = [
          `[data-ai-element-id='ai-${index + 1}']`,
          tag ? `tag=${tag}` : "",
          type ? `type=${type}` : "",
          name ? `name=${name}` : "",
          ariaLabel ? `aria=${ariaLabel}` : "",
          placeholder ? `placeholder=${placeholder}` : "",
          role ? `role=${role}` : "",
          dataAutomation ? `data-automation=${dataAutomation}` : "",
          id ? `id=${id}` : "",
          text ? `text=${text}` : "",
        ].filter(Boolean);

        return parts.join(" | ");
      }

      function getOptions(el: HTMLElement) {
        if (el instanceof HTMLSelectElement) {
          return Array.from(el.options)
            .slice(0, maxOptions)
            .map((option) => ({
              value: truncateInner(normalizeWhitespaceInner(option.value), 80),
              label: truncateInner(normalizeWhitespaceInner(option.textContent), 120),
              selected: option.selected,
            }));
        }

        const type = (el.getAttribute("type") ?? "").toLowerCase();
        if (type !== "radio") return [];

        const name = el.getAttribute("name");
        if (!name) return [];

        return Array.from(document.querySelectorAll(`input[type='radio'][name='${CSS.escape(name)}']`))
          .filter((node): node is HTMLInputElement => node instanceof HTMLInputElement)
          .slice(0, maxOptions)
          .map((radio) => ({
            value: truncateInner(normalizeWhitespaceInner(radio.value), 80),
            label: truncateInner(getAssociatedLabel(radio) || normalizeWhitespaceInner(radio.value), 120),
            checked: radio.checked,
          }));
      }

      const nodes = Array.from(document.querySelectorAll(interactiveSelector))
        .filter((node): node is HTMLElement => node instanceof HTMLElement)
        .filter((el) => !shouldSkip(el));

      const deduped = new Set<string>();
      const elements: BrowserSnapshotElement[] = [];

      nodes.forEach((el, index) => {
        el.setAttribute("data-ai-element-id", `ai-${index + 1}`);

        const tag = el.tagName.toLowerCase();
        const type = normalizeWhitespaceInner(el.getAttribute("type")) || null;
        const text = getText(el);
        const label = truncateInner(getAssociatedLabel(el), maxTextLength);
        const placeholder = truncateInner(normalizeWhitespaceInner(el.getAttribute("placeholder")), 120);
        const name = truncateInner(normalizeWhitespaceInner(el.getAttribute("name")), 120);
        const ariaLabel = truncateInner(normalizeWhitespaceInner(el.getAttribute("aria-label")), 120);
        const value = el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement
          ? normalizeWhitespaceInner(el.value)
          : normalizeWhitespaceInner(el.textContent);
        const valuePreview = type === "password"
          ? "[hidden]"
          : value
            ? truncateInner(maskValueForBrowser(type, value), 80)
            : "";
        const required = el.hasAttribute("required") || el.getAttribute("aria-required") === "true";
        const disabled = el.hasAttribute("disabled") || el.getAttribute("aria-disabled") === "true";
        const checked = el instanceof HTMLInputElement ? el.checked : false;
        const selected = el instanceof HTMLOptionElement ? el.selected : false;
        const rect = el.getBoundingClientRect();
        const isVisibleFlag = isVisible(el);
        const isInViewportFlag = isInViewport(el);
        const nearbyText = getNearbyText(el);
        const formSectionText = getFormSectionText(el);
        const locatorHint = getLocatorHint(el, index);
        const role = getRole(el);
        const options = getOptions(el);
        const dedupeKey = [tag, type ?? "", name, ariaLabel, placeholder, text, label].join("|");

        if (deduped.has(dedupeKey)) {
          return;
        }
        deduped.add(dedupeKey);

        elements.push({
          elementId: `ai-${index + 1}`,
          tag,
          role,
          type,
          text,
          label,
          placeholder,
          name,
          ariaLabel,
          valuePreview,
          required,
          disabled,
          checked,
          selected,
          options,
          boundingBox: {
            x: Number(rect.x.toFixed(1)),
            y: Number(rect.y.toFixed(1)),
            width: Number(rect.width.toFixed(1)),
            height: Number(rect.height.toFixed(1)),
          },
          isVisible: isVisibleFlag,
          isInViewport: isInViewportFlag,
          nearbyText,
          formSectionText,
          locatorHint,
          sortY: rect.y,
          sortX: rect.x,
        });
      });

      const visibleTextSummary = truncateInner(
        normalizeWhitespaceInner(document.body?.innerText || ""),
        maxSummaryLength,
      );

      return {
        currentUrl: window.location.href,
        pageTitle: document.title,
        visibleTextSummary,
        elements: elements
          .sort((a, b) => (a.sortY - b.sortY) || (a.sortX - b.sortX))
          .map((element) => {
            const { sortY, sortX, ...rest } = element;
            void sortY;
            void sortX;
            return rest;
          }),
      };

      function maskValueForBrowser(type: string | null, value: string) {
        const normalizedType = (type ?? "").toLowerCase();
        const trimmed = value.trim();

        if (!trimmed) return "";
        if (normalizedType === "password") return "[hidden]";
        if (normalizedType === "email") {
          const [namePart, domainPart] = trimmed.split("@");
          if (!domainPart) return "[masked-email]";
          return `${namePart.slice(0, 2)}***@${domainPart}`;
        }
        if (normalizedType === "tel") {
          return trimmed.length <= 4 ? "[masked-phone]" : `${trimmed.slice(0, 2)}***${trimmed.slice(-2)}`;
        }
        if (trimmed.length <= 2) return "**";
        return `${trimmed.slice(0, 1)}***${trimmed.slice(-1)}`;
      }
    },
    {
      maxTextLength: MAX_TEXT_LENGTH,
      maxSummaryLength: MAX_SUMMARY_LENGTH,
      maxNearbyTextLength: MAX_NEARBY_TEXT_LENGTH,
      maxFormSectionTextLength: MAX_FORM_SECTION_TEXT_LENGTH,
      maxOptions: MAX_OPTIONS,
    },
  );

  return {
    currentUrl: normalizeWhitespace(result.currentUrl),
    pageTitle: truncate(normalizeWhitespace(result.pageTitle), 200),
    visibleTextSummary: truncate(normalizeWhitespace(result.visibleTextSummary), MAX_SUMMARY_LENGTH),
    elements: result.elements.map((element) => ({
      ...element,
      text: truncate(normalizeWhitespace(element.text), MAX_TEXT_LENGTH),
      label: truncate(normalizeWhitespace(element.label), MAX_TEXT_LENGTH),
      placeholder: truncate(normalizeWhitespace(element.placeholder), 120),
      name: truncate(normalizeWhitespace(element.name), 120),
      ariaLabel: truncate(normalizeWhitespace(element.ariaLabel), 120),
      valuePreview: truncate(
        element.type === "password"
          ? "[hidden]"
          : normalizeWhitespace(element.valuePreview),
        80,
      ),
      nearbyText: truncate(normalizeWhitespace(element.nearbyText), MAX_NEARBY_TEXT_LENGTH),
      formSectionText: truncate(normalizeWhitespace(element.formSectionText), MAX_FORM_SECTION_TEXT_LENGTH),
      locatorHint: truncate(normalizeWhitespace(element.locatorHint), 500),
      options: element.options.map((option) => ({
        value: truncate(normalizeWhitespace(option.value), 80),
        label: truncate(normalizeWhitespace(option.label), 120),
        selected: option.selected,
        checked: option.checked,
      })),
    })),
  };
}
