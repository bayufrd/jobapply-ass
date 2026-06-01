import type { Page } from "playwright";

type CandidateProfileInput = {
  fullName?: string;
  email?: string;
  phone?: string;
  location?: string;
  summary?: string;
};

type CampaignDefaultsInput = {
  currentSalary?: number | null;
  expectedSalary?: number | null;
  noticePeriod?: string | null;
  availability?: string | null;
};

export type FilledField = {
  selector: string;
  label: string;
  value: string;
  filled: boolean;
};

/**
 * Fill known application fields using defensive selector strategy.
 * Returns list of fields attempted and whether they were filled.
 */
export async function fillKnownApplicationFields(
  page: Page,
  profile: CandidateProfileInput,
  defaults: CampaignDefaultsInput,
): Promise<FilledField[]> {
  const fieldsToFill: Array<{
    selectors: string[];
    label: string;
    value: string;
  }> = [
    // Full name
    {
      selectors: [
        "input[name*='name' i]",
        "input[name*='fullname' i]",
        "input[name*='full_name' i]",
        "input[placeholder*='nama' i]",
        "input[placeholder*='name' i]",
        "input[aria-label*='name' i]",
        "input[data-automation*='name' i]",
      ],
      label: "Nama lengkap",
      value: profile.fullName ?? "",
    },
    // Email
    {
      selectors: [
        "input[type='email']",
        "input[name*='email' i]",
        "input[placeholder*='email' i]",
        "input[aria-label*='email' i]",
        "input[data-automation*='email' i]",
      ],
      label: "Email",
      value: profile.email ?? "",
    },
    // Phone
    {
      selectors: [
        "input[type='tel']",
        "input[name*='phone' i]",
        "input[name*='mobile' i]",
        "input[name*='telepon' i]",
        "input[placeholder*='phone' i]",
        "input[placeholder*='telepon' i]",
        "input[aria-label*='phone' i]",
        "input[data-automation*='phone' i]",
      ],
      label: "Telepon",
      value: profile.phone ?? "",
    },
    // Location
    {
      selectors: [
        "input[name*='location' i]",
        "input[name*='address' i]",
        "input[name*='kota' i]",
        "input[name*='city' i]",
        "input[placeholder*='location' i]",
        "input[placeholder*='lokasi' i]",
        "input[placeholder*='alamat' i]",
        "input[aria-label*='location' i]",
        "input[data-automation*='location' i]",
      ],
      label: "Lokasi",
      value: profile.location ?? "",
    },
    // Current salary
    {
      selectors: [
        "input[name*='current' i][name*='salary' i]",
        "input[name*='gaji' i][name*='sekarang' i]",
        "input[name*='current' i][name*='pay' i]",
        "input[name*='current' i][name*='compensation' i]",
        "input[placeholder*='current salary' i]",
        "input[placeholder*='gaji saat ini' i]",
        "input[aria-label*='current salary' i]",
        "input[data-automation*='current' i][data-automation*='salary' i]",
      ],
      label: "Gaji saat ini",
      value: defaults.currentSalary ? String(defaults.currentSalary) : "",
    },
    // Expected salary
    {
      selectors: [
        "input[name*='expected' i][name*='salary' i]",
        "input[name*='expected' i][name*='pay' i]",
        "input[name*='expected' i][name*='compensation' i]",
        "input[name*='gaji' i][name*='harap' i]",
        "input[name*='salary' i][name*='expect' i]",
        "input[placeholder*='expected salary' i]",
        "input[placeholder*='gaji harapan' i]",
        "input[aria-label*='expected salary' i]",
        "input[data-automation*='expected' i][data-automation*='salary' i]",
      ],
      label: "Gaji harapan",
      value: defaults.expectedSalary ? String(defaults.expectedSalary) : "",
    },
    // Notice period
    {
      selectors: [
        "input[name*='notice' i]",
        "input[name*='periode' i]",
        "select[name*='notice' i]",
        "input[placeholder*='notice period' i]",
        "input[aria-label*='notice period' i]",
      ],
      label: "Masa kerja pemberitahuan",
      value: defaults.noticePeriod ?? "",
    },
    // Availability
    {
      selectors: [
        "input[name*='availability' i]",
        "input[name*='available' i]",
        "input[name*='mulai' i]",
        "select[name*='availability' i]",
        "input[placeholder*='availability' i]",
        "input[placeholder*='ketersediaan' i]",
        "input[aria-label*='availability' i]",
      ],
      label: "Ketersediaan",
      value: defaults.availability ?? "",
    },
    // Summary / Cover letter
    {
      selectors: [
        "textarea[name*='summary' i]",
        "textarea[name*='cover' i]",
        "textarea[name*='letter' i]",
        "textarea[name*='motivation' i]",
        "textarea[name*='about' i]",
        "textarea[name*='tentang' i]",
        "textarea[placeholder*='cover letter' i]",
        "textarea[placeholder*='surat lamaran' i]",
        "textarea[aria-label*='cover letter' i]",
        "textarea[data-automation*='cover' i]",
      ],
      label: "Ringkasan / Surat lamaran",
      value: profile.summary ?? "",
    },
  ];

  const results: FilledField[] = [];

  for (const field of fieldsToFill) {
    if (!field.value) {
      results.push({
        selector: field.selectors[0],
        label: field.label,
        value: "",
        filled: false,
      });
      continue;
    }

    let filled = false;
    for (const selector of field.selectors) {
      try {
        const el = page.locator(selector).first();
        if ((await el.count()) > 0 && (await el.isVisible())) {
          await el.fill(field.value);
          filled = true;
          break;
        }
      } catch {
        // Try next selector
      }
    }

    results.push({
      selector: field.selectors[0],
      label: field.label,
      value: field.value,
      filled,
    });
  }

  return results;
}

/**
 * Detect and extract visible form questions/labels from the page.
 * Returns normalized question texts found on the page.
 */
export async function detectFormQuestions(page: Page): Promise<string[]> {
  const questions: string[] = [];

  // Strategy 1: Look for labels associated with inputs/selects/textareas
  const labels = page.locator("label");
  const labelCount = await labels.count();
  for (let i = 0; i < labelCount; i++) {
    try {
      const label = labels.nth(i);
      if (await label.isVisible()) {
        const text = (await label.textContent())?.trim();
        if (text && text.length > 2 && text.length < 500) {
          questions.push(text);
        }
      }
    } catch {
      // Skip
    }
  }

  // Strategy 2: Look for legend elements (fieldset questions)
  const legends = page.locator("legend");
  const legendCount = await legends.count();
  for (let i = 0; i < legendCount; i++) {
    try {
      const legend = legends.nth(i);
      if (await legend.isVisible()) {
        const text = (await legend.textContent())?.trim();
        if (text && text.length > 2 && text.length < 500) {
          questions.push(text);
        }
      }
    } catch {
      // Skip
    }
  }

  // Strategy 3: Look for question-like headings in form context
  const formHeadings = page.locator("form h2, form h3, form h4, [class*='form'] h2, [class*='form'] h3, [class*='form'] h4, [class*='question'] h2, [class*='question'] h3, [class*='question'] h4");
  const headingCount = await formHeadings.count();
  for (let i = 0; i < headingCount; i++) {
    try {
      const heading = formHeadings.nth(i);
      if (await heading.isVisible()) {
        const text = (await heading.textContent())?.trim();
        if (text && text.length > 2 && text.length < 500) {
          questions.push(text);
        }
      }
    } catch {
      // Skip
    }
  }

  // Strategy 4: Look for data-automation question attributes
  const automationQuestions = page.locator("[data-automation*='question' i], [data-automation*='field' i]");
  const autoCount = await automationQuestions.count();
  for (let i = 0; i < autoCount; i++) {
    try {
      const el = automationQuestions.nth(i);
      if (await el.isVisible()) {
        const text = (await el.textContent())?.trim();
        if (text && text.length > 2 && text.length < 500) {
          questions.push(text);
        }
      }
    } catch {
      // Skip
    }
  }

  // Deduplicate
  const unique = [...new Set(questions.map((q) => q.replace(/\s+/g, " ").trim()))];
  return unique.filter((q) => q.length > 2);
}

/**
 * Check if the current page has a submit button.
 * Returns selector if found, null otherwise.
 */
export async function detectSubmitButton(page: Page): Promise<string | null> {
  const submitSelectors = [
    "button[type='submit']",
    "input[type='submit']",
    "button:has-text('Submit')",
    "button:has-text('Kirim')",
    "button:has-text('Send')",
    "button:has-text('Ajukan')",
    "button:has-text('Apply')",
    "button:has-text('Lamar')",
    "button[data-automation*='submit' i]",
  ];

  for (const selector of submitSelectors) {
    try {
      const el = page.locator(selector).first();
      if ((await el.count()) > 0 && (await el.isVisible())) {
        return selector;
      }
    } catch {
      // Try next
    }
  }

  return null;
}
