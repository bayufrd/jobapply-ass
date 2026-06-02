import { mkdir } from "node:fs/promises";
import path from "node:path";
import type { CandidateProfileResult } from "@/lib/ai/schemas";
import { scoreJobFit } from "@/lib/ai/job-scorer";
import type { Page } from "playwright";
import { closeManagedBrowser, launchManagedBrowser } from "@/lib/browser/playwright-manager";
import { detectManualIntervention } from "@/lib/browser/page-detector";
import { prisma } from "@/lib/db/prisma";
import { writeAutomationLog } from "@/lib/logging/automation-log";
import { buildInterventionMessage, requiresManualIntervention } from "@/lib/security/safe-automation";

// ── Types ──────────────────────────────────────────────────────────────

type StartCampaignInput = {
  campaignId: string;
  keyword: string;
  location?: string | null;
  targetApplyCount: number;
  matchThreshold: number;
  profile: {
    fullName?: string;
    email?: string;
    phone?: string;
    location?: string;
  };
  defaults: {
    currentSalary?: number | null;
    expectedSalary?: number | null;
    noticePeriod?: string | null;
    availability?: string | null;
  };
};

type JobCard = {
  title: string;
  company: string;
  location: string;
  salaryText: string;
  url: string;
  snippet: string;
};

type JobDetail = {
  title: string;
  company: string;
  location: string;
  salaryText: string;
  workType: string;
  description: string;
  url: string;
};

type CampaignRunResult = {
  paused: boolean;
  reason?: string;
  message: string;
  status: "completed" | "manual_intervention" | "search_failed";
  jobsFound: number;
  jobsSaved: number;
  screenshotPath?: string;
};

// ── Constants ──────────────────────────────────────────────────────────

const JOBSTREET_BASE = "https://id.jobstreet.com";
const MAX_JOBS_HARD_LIMIT = 20;
const DEFAULT_MAX_JOBS = 10;
const PAGE_LOAD_TIMEOUT = 30_000;
const JOB_DETAIL_TIMEOUT = 20_000;
const SEARCH_SETTLE_DELAY_MS = 1200;
const DETAIL_SETTLE_DELAY_MS = 700;
const BETWEEN_JOBS_DELAY_MS = 250;

// ── Helpers ────────────────────────────────────────────────────────────

function getSafeMaxJobs(targetApplyCount: number): number {
  const limit = Math.max(targetApplyCount, DEFAULT_MAX_JOBS);
  return Math.min(limit, MAX_JOBS_HARD_LIMIT);
}

async function ensureScreenshotDir() {
  const dir = path.join(process.cwd(), "storage", "screenshots");
  await mkdir(dir, { recursive: true });
  return dir;
}

async function saveErrorScreenshot(
  campaignId: string,
  page: Page,
) {
  const dir = await ensureScreenshotDir();
  const filePath = path.join(dir, `${Date.now()}-${campaignId}-error.png`);
  await page.screenshot({ path: filePath, fullPage: true });
  return `./storage/screenshots/${path.basename(filePath)}`;
}

async function checkIntervention(
  page: Page,
  campaignId: string,
  stage: string,
): Promise<CampaignRunResult | null> {
  const detection = await detectManualIntervention(page);
  if (detection.detected && detection.reason) {
    const message = buildInterventionMessage(detection.reason);
    await writeAutomationLog({
      campaignId,
      level: "warn",
      event: "jobstreet.search_manual_intervention",
      message: `Intervensi manual terdeteksi pada tahap ${stage}: ${message}`,
      metadata: { stage, details: detection.details ?? null },
    });
    const manualState = requiresManualIntervention(detection.reason);
    return {
      paused: manualState.paused,
      reason: manualState.reason,
      message:
        "Jobstreet meminta login atau verifikasi manual. Selesaikan di browser yang terbuka, lalu klik Lanjutkan Kampanye.",
      status: "manual_intervention",
      jobsFound: 0,
      jobsSaved: 0,
    };
  }
  return null;
}

function parseJsonArray<T>(value: string | null | undefined): T[] {
  if (!value) {
    return [];
  }

  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}

async function getLatestCandidateProfileResult(): Promise<CandidateProfileResult | null> {
  const latestProfile = await prisma.candidateProfile.findFirst({
    orderBy: { updatedAt: "desc" },
  });

  if (!latestProfile) {
    return null;
  }

  return {
    fullName: latestProfile.fullName ?? "",
    email: latestProfile.email ?? "",
    phone: latestProfile.phone ?? "",
    location: latestProfile.location ?? "",
    summary: latestProfile.summary ?? "",
    skills: parseJsonArray<string>(latestProfile.skillsJson),
    workExperience: parseJsonArray<Record<string, unknown>>(latestProfile.experienceJson),
    education: parseJsonArray<Record<string, unknown>>(latestProfile.educationJson),
    projects: parseJsonArray<Record<string, unknown>>(latestProfile.projectsJson),
    certifications: parseJsonArray<string>(latestProfile.certificationsJson),
    suggestedJobRoles: [],
  };
}

async function scoreAndUpdateJobListing(
  jobListingId: string,
  job: JobDetail,
  input: StartCampaignInput,
) {
  await writeAutomationLog({
    campaignId: input.campaignId,
    jobListingId,
    event: "jobstreet.job_scoring_started",
    message: `Memulai AI scoring untuk lowongan "${job.title || "Tanpa judul"}".`,
    metadata: {
      url: job.url,
      keyword: input.keyword,
      location: input.location ?? null,
      matchThreshold: input.matchThreshold,
    },
  });

  try {
    const candidateProfile = await getLatestCandidateProfileResult();

    if (!candidateProfile) {
      throw new Error("Profil kandidat terbaru tidak ditemukan untuk scoring.");
    }

    const score = await scoreJobFit(
      candidateProfile,
      {
        keyword: input.keyword,
        location: input.location ?? null,
        expectedSalary: input.defaults.expectedSalary ?? null,
        workModePreference: null,
        matchThreshold: input.matchThreshold,
      },
      {
        title: job.title || "Tanpa judul",
        company: job.company || "Tidak diketahui",
        location: job.location || null,
        salaryText: job.salaryText || null,
        workType: job.workType || null,
        description: job.description || null,
        url: job.url,
      },
    );

    const nextStatus = score.overallScore >= input.matchThreshold ? "shortlisted" : "skipped";

    await prisma.jobListing.update({
      where: { id: jobListingId },
      data: {
        matchScore: score.overallScore,
        matchReason: score.reasoning,
        status: nextStatus,
      },
    });

    await writeAutomationLog({
      campaignId: input.campaignId,
      jobListingId,
      event: "jobstreet.job_scored",
      message: `AI scoring selesai untuk lowongan "${job.title || "Tanpa judul"}" dengan skor ${score.overallScore}.`,
      metadata: {
        overallScore: score.overallScore,
        reasoning: score.reasoning,
        threshold: input.matchThreshold,
      },
    });

    await writeAutomationLog({
      campaignId: input.campaignId,
      jobListingId,
      event:
        nextStatus === "shortlisted"
          ? "jobstreet.job_shortlisted"
          : "jobstreet.job_skipped_score",
      message:
        nextStatus === "shortlisted"
          ? `Lowongan "${job.title || "Tanpa judul"}" masuk shortlist.`
          : `Lowongan "${job.title || "Tanpa judul"}" dilewati karena skor di bawah ambang batas.`,
      metadata: {
        overallScore: score.overallScore,
        threshold: input.matchThreshold,
        reasoning: score.reasoning,
      },
    });
  } catch (error) {
    await writeAutomationLog({
      campaignId: input.campaignId,
      jobListingId,
      level: "error",
      event: "jobstreet.job_scoring_failed",
      message: `AI scoring gagal untuk lowongan "${job.title || "Tanpa judul"}". Lowongan tetap disimpan sebagai ditemukan.`,
      metadata: {
        error: error instanceof Error ? error.message : String(error),
        url: job.url,
      },
    });
  }
}

// ── Search URL Builder ─────────────────────────────────────────────────

function buildSearchUrl(keyword: string, location?: string | null): string {
  const params = new URLSearchParams();
  params.set("keywords", keyword);
  if (location && location.trim()) {
    params.set("where", location.trim());
  }
  return `${JOBSTREET_BASE}/jobs?${params.toString()}`;
}

// ── Job Card Extraction ────────────────────────────────────────────────

async function extractJobCards(page: Page): Promise<JobCard[]> {
  return page.evaluate(() => {
    const cards: JobCard[] = [];
    const seen = new Set<string>();

    // Strategy 1: Look for article elements with job data attributes
    const articles = document.querySelectorAll('article[data-automation="normalJob"]');
    if (articles.length > 0) {
      for (const article of articles) {
        try {
          const titleEl = article.querySelector('a[data-automation="jobTitle"]') ??
                          article.querySelector('a[data-automation="job-list-item-link"]') ??
                          article.querySelector("h3 a, h2 a, a[href*='/job/']") ??
                          article.querySelector("a");
          const companyEl = article.querySelector('[data-automation="jobCompany"]') ??
                            article.querySelector('[data-automation="job-list-item-company"]') ??
                            article.querySelector("span[class*='company'], div[class*='company']");
          const locationEl = article.querySelector('[data-automation="jobLocation"]') ??
                             article.querySelector('[data-automation="job-list-item-location"]') ??
                             article.querySelector("span[class*='location'], div[class*='location']");
          const salaryEl = article.querySelector('[data-automation="jobSalary"]') ??
                           article.querySelector("span[class*='salary'], div[class*='salary']");
          const snippetEl = article.querySelector('[data-automation="jobShortDescription"]') ??
                            article.querySelector("span[class*='snippet'], div[class*='snippet']");

          const title = titleEl?.textContent?.trim() ?? "";
          const href = (titleEl as HTMLAnchorElement)?.href ?? "";
          const url = href.startsWith("http") ? href : href ? `${window.location.origin}${href}` : "";

          if (!title || !url || seen.has(url)) continue;
          seen.add(url);

          cards.push({
            title,
            company: companyEl?.textContent?.trim() ?? "",
            location: locationEl?.textContent?.trim() ?? "",
            salaryText: salaryEl?.textContent?.trim() ?? "",
            url,
            snippet: snippetEl?.textContent?.trim() ?? "",
          });
        } catch {
          // skip broken card
        }
      }
      if (cards.length > 0) return cards;
    }

    // Strategy 2: Generic job card detection via links with /job/ in href
    const jobLinks = document.querySelectorAll('a[href*="/job/"]');
    for (const link of jobLinks) {
      try {
        const container = link.closest("article") ?? link.closest("div[data-automation]") ?? link.closest("li") ?? link.parentElement?.parentElement;
        if (!container) continue;

        const title = link.textContent?.trim() ?? "";
        const href = (link as HTMLAnchorElement).href ?? "";
        const url = href.startsWith("http") ? href : href ? `${window.location.origin}${href}` : "";

        if (!title || !url || title.length < 3 || seen.has(url)) continue;
        seen.add(url);

        const textContent = container.textContent ?? "";
        const allSpans = container.querySelectorAll("span, div, p");
        let company = "";
        let location = "";
        let salary = "";
        let snippet = "";

        for (const el of allSpans) {
          const text = el.textContent?.trim() ?? "";
          if (!text || text === title) continue;
          if (!company && text.length < 100 && !text.includes("Rp") && !text.includes("$")) {
            company = text;
          } else if (!location && (text.includes(",") || text.toLowerCase().includes("jakarta") || text.toLowerCase().includes("remote"))) {
            location = text;
          } else if (!salary && (text.includes("Rp") || text.includes("$"))) {
            salary = text;
          }
        }

        if (textContent.length > title.length) {
          const remaining = textContent.replace(title, "").replace(company, "").replace(location, "").replace(salary, "").trim();
          snippet = remaining.substring(0, 200);
        }

        cards.push({ title, company, location, salaryText: salary, url, snippet });
      } catch {
        // skip broken card
      }
    }

    return cards;
  });
}

// ── Job Detail Extraction ──────────────────────────────────────────────

async function extractJobDetail(page: Page, url: string): Promise<JobDetail> {
  return page.evaluate((pageUrl) => {
    const getText = (selectors: string[]): string => {
      for (const sel of selectors) {
        const el = document.querySelector(sel);
        if (el?.textContent?.trim()) return el.textContent.trim();
      }
      return "";
    };

    // Title
    const title = getText([
      'h1[data-automation="jobDetailTitle"]',
      'h1[data-automation="job-title"]',
      "h1",
      '[data-automation="job-detail-title"]',
    ]);

    // Company
    const company = getText([
      '[data-automation="advertiser-name"]',
      '[data-automation="job-detail-company-name"]',
      'a[data-automation="jobCompany"]',
      '[class*="company-name"]',
      '[class*="advertiser"]',
    ]);

    // Location
    const location = getText([
      '[data-automation="job-detail-location"]',
      '[data-automation="jobLocation"]',
      '[class*="location"]',
    ]);

    // Salary
    const salaryText = getText([
      '[data-automation="job-detail-salary"]',
      '[data-automation="jobSalary"]',
      '[class*="salary"]',
    ]);

    // Work type
    const workType = getText([
      '[data-automation="job-detail-work-type"]',
      '[data-automation="jobWorkType"]',
      '[class*="work-type"]',
      '[class*="job-type"]',
    ]);

    // Description - get the main content area
    let description = "";
    const descSelectors = [
      '[data-automation="jobAdDetails"]',
      '[data-automation="job-detail-description"]',
      '[class*="job-description"]',
      '[class*="adContent"]',
      'div[class*="description"]',
    ];
    for (const sel of descSelectors) {
      const el = document.querySelector(sel);
      if (el) {
        description = el.textContent?.trim() ?? "";
        if (description.length > 50) break;
      }
    }
    if (!description || description.length < 50) {
      // Fallback: get the largest text block
      const allDivs = document.querySelectorAll("div, section, article");
      let maxLen = 0;
      for (const div of allDivs) {
        const text = div.textContent?.trim() ?? "";
        if (text.length > maxLen && text.length > 100 && text.length < 10000) {
          maxLen = text.length;
          description = text;
        }
      }
    }

    return {
      title: title || "",
      company: company || "",
      location: location || "",
      salaryText: salaryText || "",
      workType: workType || "",
      description: (description || "").substring(0, 5000),
      url: pageUrl,
    };
  }, url);
}

// ── Save Job to DB ─────────────────────────────────────────────────────

async function saveJobListing(
  job: JobDetail,
  campaignId: string,
  snippet?: string,
): Promise<{ id: string; isDuplicate: boolean }> {
  const existing = await prisma.jobListing.findUnique({
    where: { url: job.url },
  });

  if (existing) {
    await prisma.jobListing.update({
      where: { id: existing.id },
      data: {
        title: job.title || existing.title,
        company: job.company || existing.company,
        location: job.location || existing.location,
        salaryText: job.salaryText || existing.salaryText,
        workType: job.workType || existing.workType,
        description: job.description || existing.description,
        snippet: snippet || existing.snippet,
        campaignId: campaignId,
      },
    });
    return { id: existing.id, isDuplicate: true };
  }

  const created = await prisma.jobListing.create({
    data: {
      campaignId,
      source: "jobstreet",
      title: job.title || "Tanpa judul",
      company: job.company || "Tidak diketahui",
      location: job.location || null,
      salaryText: job.salaryText || null,
      workType: job.workType || null,
      url: job.url,
      description: job.description || null,
      snippet: snippet || null,
      status: "discovered",
    },
  });
  return { id: created.id, isDuplicate: false };
}

// ── Main Campaign Runner ───────────────────────────────────────────────

export async function runJobstreetCampaign(
  input: StartCampaignInput,
): Promise<CampaignRunResult> {
  const session = await launchManagedBrowser();
  const { page, context } = session;
  const maxJobs = getSafeMaxJobs(input.targetApplyCount);
  let jobsFound = 0;
  let jobsSaved = 0;

  try {
    // 1. Log browser launch
    await writeAutomationLog({
      campaignId: input.campaignId,
      event: "jobstreet.search_started",
      message: `Memulai pencarian Jobstreet dengan kata kunci "${input.keyword}"${input.location ? ` di ${input.location}` : ""}. Maksimal ${maxJobs} lowongan akan diperiksa.`,
      metadata: {
        keyword: input.keyword,
        location: input.location ?? null,
        maxJobs,
        targetApplyCount: input.targetApplyCount,
        matchThreshold: input.matchThreshold,
      },
    });

    // 2. Navigate to Jobstreet homepage first to check session
    await page.goto(JOBSTREET_BASE, {
      waitUntil: "domcontentloaded",
      timeout: PAGE_LOAD_TIMEOUT,
    });
    await page.waitForTimeout(SEARCH_SETTLE_DELAY_MS);

    // 3. Check for manual intervention on homepage
    const homeIntervention = await checkIntervention(
      page,
      input.campaignId,
      "homepage",
    );
    if (homeIntervention) return homeIntervention;

    // 4. Build search URL and navigate
    const searchUrl = buildSearchUrl(input.keyword, input.location);
    await writeAutomationLog({
      campaignId: input.campaignId,
      event: "jobstreet.search_page_loaded",
      message: `Navigasi ke halaman pencarian: ${searchUrl}`,
      metadata: { searchUrl },
    });

    await page.goto(searchUrl, {
      waitUntil: "domcontentloaded",
      timeout: PAGE_LOAD_TIMEOUT,
    });
    await page.waitForTimeout(SEARCH_SETTLE_DELAY_MS);

    // 5. Check for manual intervention on search page
    const searchIntervention = await checkIntervention(
      page,
      input.campaignId,
      "search_page",
    );
    if (searchIntervention) return searchIntervention;

    // 6. Extract job cards from search results
    const jobCards = await extractJobCards(page);
    jobsFound = jobCards.length;

    await writeAutomationLog({
      campaignId: input.campaignId,
      event: "jobstreet.search_completed",
      message: `Pencarian selesai. ${jobsFound} lowongan ditemukan di halaman hasil.`,
      metadata: {
        jobsFound,
        maxJobs,
        url: page.url(),
      },
    });

    if (jobCards.length === 0) {
      return {
        paused: false,
        message: `Pencarian selesai tetapi tidak ditemukan lowongan untuk kata kunci "${input.keyword}"${input.location ? ` di ${input.location}` : ""}. Coba kata kunci atau lokasi yang berbeda.`,
        status: "completed",
        jobsFound: 0,
        jobsSaved: 0,
      };
    }

    // 7. Process each job card (up to maxJobs)
    const cardsToProcess = jobCards.slice(0, maxJobs);
    const detailPage = await context.newPage();

    for (let i = 0; i < cardsToProcess.length; i++) {
      const card = cardsToProcess[i];

      await writeAutomationLog({
        campaignId: input.campaignId,
        event: "jobstreet.job_card_found",
        message: `[${i + 1}/${cardsToProcess.length}] Lowongan ditemukan: ${card.title} di ${card.company || "perusahaan tidak diketahui"}`,
        metadata: {
          title: card.title,
          company: card.company,
          location: card.location,
          salaryText: card.salaryText,
          url: card.url,
          index: i + 1,
          total: cardsToProcess.length,
        },
      });

      try {
        // Open job detail page in a reused tab for faster traversal
        await detailPage.goto(card.url, {
          waitUntil: "domcontentloaded",
          timeout: JOB_DETAIL_TIMEOUT,
        });
        await detailPage.waitForLoadState("networkidle", { timeout: 4_000 }).catch(() => undefined);
        await detailPage.waitForTimeout(DETAIL_SETTLE_DELAY_MS);

        // Check for intervention on detail page
        const detailIntervention = await detectManualIntervention(detailPage);
        if (detailIntervention.detected) {
          await writeAutomationLog({
            campaignId: input.campaignId,
            level: "warn",
            event: "jobstreet.search_manual_intervention",
            message: `Intervensi manual terdeteksi saat membuka detail lowongan "${card.title}". Lowongan ini dilewati.`,
            metadata: {
              url: card.url,
              reason: detailIntervention.reason,
              details: detailIntervention.details,
            },
          });
          continue;
        }

        // Extract job detail
        const detail = await extractJobDetail(detailPage, card.url);
        await writeAutomationLog({
          campaignId: input.campaignId,
          event: "jobstreet.job_detail_opened",
          message: `Detail lowongan berhasil diambil: ${detail.title || card.title}`,
          metadata: {
            title: detail.title || card.title,
            company: detail.company || card.company,
            url: card.url,
            hasDescription: (detail.description?.length ?? 0) > 0,
          },
        });

        // Save to database
        const { id: jobListingId, isDuplicate } = await saveJobListing(
          detail,
          input.campaignId,
          card.snippet,
        );

        if (isDuplicate) {
          await writeAutomationLog({
            campaignId: input.campaignId,
            jobListingId,
            event: "jobstreet.job_skipped_duplicate",
            message: `Lowongan "${detail.title || card.title}" sudah ada di database. Data diperbarui.`,
            metadata: { url: card.url },
          });
        } else {
          jobsSaved++;
          await writeAutomationLog({
            campaignId: input.campaignId,
            jobListingId,
            event: "jobstreet.job_saved",
            message: `Lowongan "${detail.title || card.title}" berhasil disimpan ke database.`,
            metadata: {
              title: detail.title,
              company: detail.company,
              location: detail.location,
              salaryText: detail.salaryText,
              url: card.url,
            },
          });
        }

        await scoreAndUpdateJobListing(jobListingId, detail, input);

        // Small delay between jobs to be respectful, but keep search responsive
        await page.waitForTimeout(BETWEEN_JOBS_DELAY_MS);
      } catch (jobError) {
        await writeAutomationLog({
          campaignId: input.campaignId,
          level: "error",
          event: "jobstreet.job_detail_opened",
          message: `Gagal mengambil detail lowongan "${card.title}": ${jobError instanceof Error ? jobError.message : "Error tidak diketahui"}`,
          metadata: { url: card.url, error: String(jobError) },
        });
      }
    }

    await detailPage.close().catch(() => undefined);

    // 8. Final result
    const resultMessage = `Pencarian selesai. ${jobsSaved} lowongan berhasil disimpan dari ${jobsFound} yang ditemukan.`;
    await writeAutomationLog({
      campaignId: input.campaignId,
      event: "jobstreet.search_completed",
      message: resultMessage,
      metadata: {
        jobsFound,
        jobsSaved,
        maxJobs,
        keyword: input.keyword,
        location: input.location ?? null,
      },
    });

    return {
      paused: false,
      message: resultMessage,
      status: "completed",
      jobsFound,
      jobsSaved,
    };
  } catch (error) {
    let screenshotPath: string | undefined;
    try {
      screenshotPath = await saveErrorScreenshot(input.campaignId, page);
    } catch {
      screenshotPath = undefined;
    }

    const errorMessage =
      error instanceof Error ? error.message : "Terjadi kesalahan tidak diketahui.";

    await writeAutomationLog({
      campaignId: input.campaignId,
      level: "error",
      event: "jobstreet.search_failed",
      message: `Pencarian Jobstreet gagal: ${errorMessage}`,
      metadata: {
        error: errorMessage,
        screenshotPath: screenshotPath ?? null,
        jobsFound,
        jobsSaved,
      },
    });

    return {
      paused: false,
      reason: "search_error",
      message: `Pencarian gagal: ${errorMessage}`,
      status: "search_failed",
      jobsFound,
      jobsSaved,
      screenshotPath,
    };
  } finally {
    if (page.isClosed()) {
      await closeManagedBrowser(session);
    }
  }
}
