import type { Page } from "playwright";
import type { CandidateProfileResult } from "@/lib/ai/schemas";
import type { McpSnapshot } from "@/lib/mcp/playwright-mcp-client";
import { detectJobstreetApplyStep, type JobstreetApplyStep } from "@/lib/browser/jobstreet-apply-step-detector";

export type JobstreetStepRunnerMode = "review_each_application" | "auto_submit_safe_only";

export type JobstreetStepRunnerResult = {
  status:
    | "advanced"
    | "question_required"
    | "manual_intervention"
    | "submitted"
    | "stuck_no_progress"
    | "submit_not_found_timeout"
    | "apply_unavailable"
    | "unknown";
  step: JobstreetApplyStep;
  nextStep?: JobstreetApplyStep;
  message: string;
  questionSummary?: {
    detected: number;
    answered: number;
    needsUser: number;
  };
  uiStatus?: {
    stepLabel: string;
    detail: string;
  };
};

type CampaignData = {
  id: string;
  name: string;
  defaultCurrentSalary: number;
  defaultExpectedSalary: number;
  defaultNoticePeriod: string;
  defaultAvailability: string;
  workModePreference: string | null;
};

type JobListingData = {
  id: string;
  title: string;
  company: string;
  description: string | null;
  url: string;
};

type QuestionMemoryItem = {
  question?: string;
  answer?: string;
  confidence?: number;
  source?: string;
};

type RunInput = {
  page: Page;
  mcpSnapshot?: McpSnapshot | null;
  campaign: CampaignData;
  jobListing: JobListingData;
  candidateProfile: CandidateProfileResult;
  questionMemory: QuestionMemoryItem[];
  mode: JobstreetStepRunnerMode;
};

const CONTINUE_LABELS = ["continue", "lanjut"];
const SUBMIT_LABELS = ["submit application", "kirim lamaran", "submit", "send application"];
const BLOCKED_SUBMIT_LABELS = ["continue", "next", "lanjut", "review", "back", "cancel", "save", "view job description", "explore site"];
const SUCCESS_MARKERS = [
  "nice work",
  "your application has been sent",
  "application sent",
  "lamaran berhasil dikirim",
  "lamaran terkirim",
  "terima kasih telah melamar",
];

function normalizeText(value: string | null | undefined) {
  return (value ?? "").toLowerCase().replace(/\s+/g, " ").trim();
}

async function getPageText(page: Page) {
  return (await page.textContent("body").catch(() => "")) ?? "";
}

function inferAnswerFromDefaults(label: string, input: RunInput): string | null {
  const normalized = normalizeText(label);

  if (/current salary|gaji sekarang|gaji saat ini/.test(normalized)) {
    return String(input.campaign.defaultCurrentSalary);
  }

  if (/expected salary|gaji harapan|salary expectation/.test(normalized)) {
    return String(input.campaign.defaultExpectedSalary);
  }

  if (/notice period|masa notice|waktu resign/.test(normalized)) {
    return input.campaign.defaultNoticePeriod;
  }

  if (/availability|ketersediaan|available to start/.test(normalized)) {
    return input.campaign.defaultAvailability;
  }

  if (/work mode|cara kerja|remote|hybrid|onsite/.test(normalized)) {
    return input.campaign.workModePreference;
  }

  if (/name|nama lengkap/.test(normalized)) {
    return input.candidateProfile.fullName || null;
  }

  if (/email/.test(normalized)) {
    return input.candidateProfile.email || null;
  }

  if (/phone|telepon|whatsapp|mobile/.test(normalized)) {
    return input.candidateProfile.phone || null;
  }

  if (/location|lokasi|alamat kota/.test(normalized)) {
    return input.candidateProfile.location || null;
  }

  const memoryHit = input.questionMemory.find((item) => normalizeText(item.question).includes(normalized) && item.answer);
  return memoryHit?.answer ?? null;
}

async function clickByLabels(page: Page, labels: string[]) {
  for (const label of labels) {
    const button = page.getByRole("button", { name: new RegExp(`^${label}$`, "i") }).first();
    if (await button.count().catch(() => 0)) {
      await button.click({ timeout: 3000 }).catch(() => undefined);
      return true;
    }
  }

  const locator = page.locator("button, input[type='submit'], input[type='button'], a[role='button']");
  const count = await locator.count().catch(() => 0);
  for (let i = 0; i < count; i += 1) {
    const item = locator.nth(i);
    const raw = normalizeText((await item.textContent().catch(() => "")) || (await item.getAttribute("value").catch(() => "")));
    if (!raw) continue;
    if (labels.includes(raw)) {
      await item.click({ timeout: 3000 }).catch(() => undefined);
      return true;
    }
  }

  return false;
}

async function waitForStepChange(page: Page, expected: JobstreetApplyStep, timeoutMs: number) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    await page.waitForTimeout(500);
    const pageText = await getPageText(page);
    const detected = detectJobstreetApplyStep(page.url(), pageText);
    if (detected === expected) {
      return true;
    }
  }
  return false;
}

async function handleChooseDocuments(input: RunInput): Promise<JobstreetStepRunnerResult> {
  const pageText = await getPageText(input.page);
  const hasResumeVisible = /resume|cv|dokumen|attached|terlampir|selected|dipilih/i.test(pageText);

  if (!hasResumeVisible) {
    return {
      status: "question_required",
      step: "choose_documents",
      message: "CV belum terpilih. Pilih dokumen mana yang ingin digunakan?",
      uiStatus: {
        stepLabel: "Memilih dokumen",
        detail: "CV belum terlihat terpilih.",
      },
    };
  }

  const clicked = await clickByLabels(input.page, CONTINUE_LABELS);
  if (!clicked) {
    return {
      status: "stuck_no_progress",
      step: "choose_documents",
      message: "Tombol Continue tidak ditemukan pada langkah memilih dokumen.",
      uiStatus: {
        stepLabel: "Memilih dokumen",
        detail: "Tombol Continue tidak ditemukan.",
      },
    };
  }

  const advanced = await waitForStepChange(input.page, "employer_questions", 8000);
  if (!advanced) {
    const retried = await clickByLabels(input.page, CONTINUE_LABELS);
    if (!retried || !(await waitForStepChange(input.page, "employer_questions", 8000))) {
      return {
        status: "stuck_no_progress",
        step: "choose_documents",
        message: "Tidak ada progres setelah klik Continue pada langkah memilih dokumen.",
        uiStatus: {
          stepLabel: "Memilih dokumen",
          detail: "Klik Continue tidak memindahkan ke pertanyaan employer.",
        },
      };
    }
  }

  return {
    status: "advanced",
    step: "choose_documents",
    nextStep: "employer_questions",
    message: "Berhasil lanjut dari memilih dokumen.",
    uiStatus: {
      stepLabel: "Memilih dokumen",
      detail: "Dokumen terdeteksi dan berhasil lanjut.",
    },
  };
}

async function handleEmployerQuestions(input: RunInput): Promise<JobstreetStepRunnerResult> {
  const fields = await input.page.locator("input, textarea, select").evaluateAll((elements) =>
    elements.map((element, index) => {
      const node = element as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
      const type = (node.getAttribute("type") || node.tagName || "").toLowerCase();
      const required = node.required || node.getAttribute("aria-required") === "true";
      const disabled = node.hasAttribute("disabled");
      const hidden = (node as HTMLElement).offsetParent === null;
      const value = (node.value || "").trim();
      const label = node.getAttribute("aria-label")
        || node.getAttribute("placeholder")
        || node.getAttribute("name")
        || node.id
        || `${node.tagName.toLowerCase()}-${index + 1}`;
      return { type, required, disabled, hidden, value, label };
    }),
  ).catch(() => [] as Array<{ type: string; required: boolean; disabled: boolean; hidden: boolean; value: string; label: string }>);

  let answered = 0;
  let needsUser = 0;
  const actionable = fields.filter((field) => !field.hidden && !field.disabled && (field.required || !field.value));

  for (const field of actionable) {
    if (field.value) {
      answered += 1;
      continue;
    }

    const answer = inferAnswerFromDefaults(field.label, input);
    if (!answer) {
      needsUser += 1;
      continue;
    }

    const selector = `input[name="${field.label}"], textarea[name="${field.label}"], select[name="${field.label}"], #${field.label}`;
    const locator = input.page.locator(selector).first();
    if (await locator.count().catch(() => 0)) {
      if (field.type === "select") {
        await locator.selectOption({ label: answer }).catch(async () => {
          await locator.selectOption(answer).catch(() => undefined);
        });
      } else {
        await locator.fill(answer).catch(() => undefined);
      }
      answered += 1;
    } else {
      needsUser += 1;
    }
  }

  if (needsUser > 0) {
    return {
      status: "question_required",
      step: "employer_questions",
      message: "Masih ada pertanyaan employer yang butuh jawaban user.",
      questionSummary: {
        detected: actionable.length,
        answered,
        needsUser,
      },
      uiStatus: {
        stepLabel: "Menjawab pertanyaan employer",
        detail: `Terdeteksi ${actionable.length} pertanyaan, ${answered} terjawab, ${needsUser} butuh user.`,
      },
    };
  }

  const clicked = await clickByLabels(input.page, CONTINUE_LABELS);
  if (!clicked) {
    return {
      status: "stuck_no_progress",
      step: "employer_questions",
      message: "Tombol Continue tidak ditemukan setelah menjawab pertanyaan employer.",
      questionSummary: {
        detected: actionable.length,
        answered,
        needsUser,
      },
      uiStatus: {
        stepLabel: "Menjawab pertanyaan employer",
        detail: "Tombol Continue tidak ditemukan.",
      },
    };
  }

  if (!(await waitForStepChange(input.page, "update_profile", 8000))) {
    return {
      status: "stuck_no_progress",
      step: "employer_questions",
      message: "Tidak ada progres setelah menjawab pertanyaan employer.",
      questionSummary: {
        detected: actionable.length,
        answered,
        needsUser,
      },
      uiStatus: {
        stepLabel: "Menjawab pertanyaan employer",
        detail: "Klik Continue tidak memindahkan ke update profile.",
      },
    };
  }

  return {
    status: "advanced",
    step: "employer_questions",
    nextStep: "update_profile",
    message: "Pertanyaan employer berhasil dijawab dan dilanjutkan.",
    questionSummary: {
      detected: actionable.length,
      answered,
      needsUser,
    },
    uiStatus: {
      stepLabel: "Menjawab pertanyaan employer",
      detail: `Terdeteksi ${actionable.length} pertanyaan, ${answered} terjawab, ${needsUser} butuh user.`,
    },
  };
}

async function handleUpdateProfile(input: RunInput): Promise<JobstreetStepRunnerResult> {
  const requiredVisibleFields = await input.page.locator("input, textarea, select").evaluateAll((elements) =>
    elements
      .map((element, index) => {
        const node = element as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
        const hidden = (node as HTMLElement).offsetParent === null;
        const disabled = node.hasAttribute("disabled");
        const required = node.required || node.getAttribute("aria-required") === "true";
        const value = (node.value || "").trim();
        const label = node.getAttribute("aria-label")
          || node.getAttribute("placeholder")
          || node.getAttribute("name")
          || node.id
          || `${node.tagName.toLowerCase()}-${index + 1}`;
        return { hidden, disabled, required, value, label };
      })
      .filter((field) => !field.hidden && !field.disabled && field.required),
  ).catch(() => [] as Array<{ hidden: boolean; disabled: boolean; required: boolean; value: string; label: string }>);

  const emptyRequiredFields = requiredVisibleFields.filter((field) => !field.value);
  let filledRequired = 0;

  for (const field of emptyRequiredFields) {
    const answer = inferAnswerFromDefaults(field.label, input);
    if (!answer) continue;

    const selector = `input[name="${field.label}"], textarea[name="${field.label}"], select[name="${field.label}"], #${field.label}`;
    const locator = input.page.locator(selector).first();
    if (!(await locator.count().catch(() => 0))) {
      continue;
    }

    await locator.fill(answer).catch(() => undefined);
    filledRequired += 1;
  }

  const unresolvedRequired = Math.max(emptyRequiredFields.length - filledRequired, 0);

  if (emptyRequiredFields.length === 0) {
    console.info("jobstreet_apply.update_profile_no_required_fields");
  }

  const clicked = await clickByLabels(input.page, CONTINUE_LABELS);
  if (!clicked) {
    return {
      status: "stuck_no_progress",
      step: "update_profile",
      message: "Step Update Jobstreet Profile belum berpindah ke Review. Sistem akan mencoba klik Continue lagi atau meminta keputusan Anda.",
      uiStatus: {
        stepLabel: "Memperbarui profil Jobstreet",
        detail: "Tombol Continue tidak ditemukan.",
      },
      questionSummary: {
        detected: requiredVisibleFields.length,
        answered: filledRequired,
        needsUser: unresolvedRequired,
      },
    };
  }

  console.info("jobstreet_apply.update_profile_continue_clicked");

  if (!(await waitForStepChange(input.page, "review_submit", 8000))) {
    const retried = await clickByLabels(input.page, CONTINUE_LABELS);
    if (!retried || !(await waitForStepChange(input.page, "review_submit", 8000))) {
      return {
        status: "stuck_no_progress",
        step: "update_profile",
        message: "Step Update Jobstreet Profile belum berpindah ke Review. Sistem akan mencoba klik Continue lagi atau meminta keputusan Anda.",
        uiStatus: {
          stepLabel: "Memperbarui profil Jobstreet",
          detail: "Coba Lagi / Lewati Lowongan / Buka Browser.",
        },
        questionSummary: {
          detected: requiredVisibleFields.length,
          answered: filledRequired,
          needsUser: unresolvedRequired,
        },
      };
    }
  }

  console.info("jobstreet_apply.update_profile_to_review_success");

  return {
    status: "advanced",
    step: "update_profile",
    nextStep: "review_submit",
    message: "Berhasil lanjut dari update profile.",
    uiStatus: {
      stepLabel: "Memperbarui profil Jobstreet",
      detail: "Berhasil lanjut ke review dan submit.",
    },
    questionSummary: {
      detected: requiredVisibleFields.length,
      answered: filledRequired,
      needsUser: unresolvedRequired,
    },
  };
}

async function handleReviewSubmit(input: RunInput): Promise<JobstreetStepRunnerResult> {
  const locator = input.page.locator("button, input[type='submit'], input[type='button'], a[role='button']");
  const count = await locator.count().catch(() => 0);
  let foundSubmit = false;

  for (let i = 0; i < count; i += 1) {
    const item = locator.nth(i);
    const label = normalizeText((await item.textContent().catch(() => "")) || (await item.getAttribute("value").catch(() => "")));
    if (!label || BLOCKED_SUBMIT_LABELS.some((blocked) => label === blocked || label.includes(blocked))) {
      continue;
    }
    if (SUBMIT_LABELS.some((allowed) => label === allowed || label.includes(allowed))) {
      foundSubmit = true;
      if (input.mode === "auto_submit_safe_only") {
        await item.click({ timeout: 3000 }).catch(() => undefined);
        if (await waitForStepChange(input.page, "success", 10000)) {
          return {
            status: "submitted",
            step: "review_submit",
            nextStep: "success",
            message: "Lamaran berhasil dikirim.",
            uiStatus: {
              stepLabel: "Review dan submit",
              detail: "Menemukan tombol Submit application, mengirim lamaran, dan menunggu halaman success.",
            },
          };
        }
        return {
          status: "submit_not_found_timeout",
          step: "review_submit",
          message: "Submit sudah diklik tetapi halaman success belum terverifikasi.",
          uiStatus: {
            stepLabel: "Review dan submit",
            detail: "Menemukan tombol Submit application tetapi success belum muncul.",
          },
        };
      }

      return {
        status: "manual_intervention",
        step: "review_submit",
        message: "Tombol Submit application ditemukan dan menunggu mode submit aman.",
        uiStatus: {
          stepLabel: "Review dan submit",
          detail: "Menemukan tombol Submit application.",
        },
      };
    }
  }

  if (!foundSubmit) {
    return {
      status: "submit_not_found_timeout",
      step: "review_submit",
      message: "Tombol Submit application tidak ditemukan pada halaman review.",
      uiStatus: {
        stepLabel: "Review dan submit",
        detail: "Submit application tidak ditemukan.",
      },
    };
  }

  return {
    status: "unknown",
    step: "review_submit",
    message: "Halaman review tidak bisa diproses.",
    uiStatus: {
      stepLabel: "Review dan submit",
      detail: "Status review tidak dikenali.",
    },
  };
}

async function handleSuccess(input: RunInput): Promise<JobstreetStepRunnerResult> {
  const pageText = normalizeText(await getPageText(input.page));
  const successDetected = SUCCESS_MARKERS.some((marker) => pageText.includes(marker));

  return {
    status: successDetected ? "submitted" : "unknown",
    step: "success",
    message: successDetected ? "Lamaran berhasil diverifikasi terkirim." : "URL success terdeteksi tetapi marker teks belum lengkap.",
    uiStatus: {
      stepLabel: "Lamaran berhasil dikirim",
      detail: successDetected ? "URL success dan marker sukses terdeteksi." : "URL success terdeteksi.",
    },
  };
}

export async function runJobstreetApplyStep(input: RunInput): Promise<JobstreetStepRunnerResult> {
  const pageText = await getPageText(input.page);
  const step = detectJobstreetApplyStep(input.page.url(), pageText);

  switch (step) {
    case "choose_documents":
      return handleChooseDocuments(input);
    case "employer_questions":
      return handleEmployerQuestions(input);
    case "update_profile":
      return handleUpdateProfile(input);
    case "review_submit":
      return handleReviewSubmit(input);
    case "success":
      return handleSuccess(input);
    case "external_redirect":
      return {
        status: "manual_intervention",
        step,
        message: "Jobstreet membuka halaman eksternal dan butuh intervensi manual.",
        uiStatus: {
          stepLabel: "Halaman eksternal",
          detail: "Autopilot berhenti karena redirect eksternal.",
        },
      };
    default:
      return {
        status: "unknown",
        step,
        message: "Langkah Jobstreet tidak dikenali dari URL saat ini.",
        uiStatus: {
          stepLabel: "Status tidak dikenali",
          detail: "URL tidak cocok dengan langkah apply Jobstreet yang didukung.",
        },
      };
  }
}
