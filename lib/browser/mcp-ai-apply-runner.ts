import type { ApplicationStatus } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { planMcpUiAction, type McpAiActionPlan } from "@/lib/ai/mcp-ui-action-planner";
import { detectJobstreetApplyStep } from "@/lib/browser/jobstreet-apply-step-detector";
import { writeAutomationLog } from "@/lib/logging/automation-log";
import { executeMcpActionPlan } from "@/lib/mcp/mcp-action-executor";
import { hasMcpSuccessMarker, normalizeMcpSnapshot, type NormalizedMcpPage } from "@/lib/mcp/mcp-snapshot-normalizer";
import { PlaywrightMcpClient, PlaywrightMcpError, type McpSnapshot } from "@/lib/mcp/playwright-mcp-client";

type SubmitModeStrategy = "review_each_application" | "auto_submit_safe_only";

type JobListingData = {
  id: string;
  campaignId: string | null;
  title: string;
  company: string;
  location: string | null;
  salaryText: string | null;
  workType: string | null;
  url: string;
  description: string | null;
  matchScore: number | null;
  matchReason: string | null;
  status: string;
};

type CampaignData = {
  id: string;
  name: string;
  submitMode: string;
  formAutomationMode?: string | null;
  defaultCurrentSalary: number;
  defaultExpectedSalary: number;
  defaultNoticePeriod: string;
  defaultAvailability: string;
  workModePreference: string | null;
};

type ProfileData = {
  fullName: string;
  email: string;
  phone: string;
  location: string;
  summary: string;
  skillsJson: string;
  experienceJson: string;
  educationJson: string;
  projectsJson: string;
  certificationsJson: string;
};

type McpApplyResult = {
  status:
    | "submitted"
    | "paused"
    | "failed"
    | "apply_unavailable"
    | "stuck_no_progress"
    | "submit_unverified"
    | "manual_intervention_required";
  message: string;
  applicationId?: string;
  error?: string;
  pageKind?: NormalizedMcpPage["pageKind"];
  latestPlanGoal?: McpAiActionPlan["goal"];
  latestAction?: McpAiActionPlan["actions"][number] | null;
};

type RunInput = {
  campaign: CampaignData;
  jobListing: JobListingData;
  candidateProfile: ProfileData;
  questionMemory: Array<Record<string, unknown>>;
  mode: SubmitModeStrategy;
};

const MAX_STEPS_PER_JOB = 30;
const MAX_SAME_SNAPSHOT_REPEATS = 2;
const MAX_NO_PROGRESS_ACTIONS = 2;
const MAX_JOB_DURATION_MS = 180000;
const MAX_AI_PLANNER_RETRIES = 2;

function parseJsonArray<T>(value: string | null | undefined): T[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}

function fingerprintSnapshot(snapshot: McpSnapshot) {
  return JSON.stringify({
    url: snapshot.url,
    title: snapshot.title,
    text: snapshot.accessibilityText.slice(0, 4000),
    elements: snapshot.elements.map((item) => [item.elementId, item.role, item.name, item.text, item.checked, item.selected, item.disabled]),
  });
}

function buildCandidateProfile(profile: ProfileData) {
  return {
    fullName: profile.fullName,
    email: profile.email,
    phone: profile.phone,
    location: profile.location,
    summary: profile.summary,
    skills: parseJsonArray<string>(profile.skillsJson),
    workExperience: parseJsonArray<Record<string, unknown>>(profile.experienceJson),
    education: parseJsonArray<Record<string, unknown>>(profile.educationJson),
    projects: parseJsonArray<Record<string, unknown>>(profile.projectsJson),
    certifications: parseJsonArray<string>(profile.certificationsJson),
    suggestedJobRoles: [],
  };
}

async function createApplicationRecord(
  campaign: CampaignData,
  jobListing: JobListingData,
  status: ApplicationStatus,
  notes: string,
) {
  return prisma.application.create({
    data: {
      campaignId: campaign.id,
      jobListingId: jobListing.id,
      status,
      submitMode: campaign.submitMode as "assisted_auto_apply" | "manual_review_only",
      notes,
    },
  });
}

async function verifySubmitted(campaign: CampaignData, jobListing: JobListingData, applicationId: string) {
  await prisma.application.update({
    where: { id: applicationId },
    data: {
      status: "submitted",
      submittedAt: new Date(),
      userApproved: true,
      notes: "Lamaran diverifikasi terkirim melalui snapshot MCP.",
    },
  });
  await prisma.jobListing.update({ where: { id: jobListing.id }, data: { status: "submitted" } });
  await prisma.campaign.update({ where: { id: campaign.id }, data: { appliedCount: { increment: 1 } } });
}

function buildMcpLogMetadata(input: {
  campaignId: string;
  jobListingId: string;
  applicationId?: string;
  stage: string;
  mcpUrl: string;
  toolName?: string;
  jobTitle: string;
  company: string;
  jobUrl: string;
  step?: number;
  pageKind?: string;
  error?: string | null;
  technical?: Record<string, unknown> | null;
}) {
  return {
    campaignId: input.campaignId,
    jobListingId: input.jobListingId,
    applicationId: input.applicationId ?? null,
    stage: input.stage,
    mcpUrl: input.mcpUrl,
    toolName: input.toolName ?? null,
    title: input.jobTitle,
    company: input.company,
    jobUrl: input.jobUrl,
    step: input.step ?? null,
    pageKind: input.pageKind ?? null,
    error: input.error ?? null,
    technical: input.technical ?? null,
  };
}

export async function runMcpAiApplyRunner({
  campaign,
  jobListing,
  candidateProfile,
  questionMemory,
  mode,
}: RunInput): Promise<McpApplyResult> {
  const enabled = (process.env.PLAYWRIGHT_MCP_ENABLED ?? "true") === "true";
  if (!enabled) {
    await writeAutomationLog({
      campaignId: campaign.id,
      jobListingId: jobListing.id,
      level: "warn",
      event: "mcp_ai.server_unavailable",
      message: "Playwright MCP belum aktif untuk mode MCP AI First.",
    });
    return {
      status: "paused",
      message: "Playwright MCP belum aktif. Jalankan npm run mcp:playwright lalu lanjutkan kampanye.",
    };
  }

  const client = new PlaywrightMcpClient(process.env.PLAYWRIGHT_MCP_URL);
  const application = await createApplicationRecord(campaign, jobListing, "paused", "Lamaran diproses oleh runner MCP AI First.");

  const mcpUrl = client.getMcpUrl();

  await writeAutomationLog({
    campaignId: campaign.id,
    jobListingId: jobListing.id,
    applicationId: application.id,
    event: "mcp_ai.runner_started",
    message: "Runner MCP AI First dimulai untuk lowongan ini.",
    metadata: {
      ...buildMcpLogMetadata({
        campaignId: campaign.id,
        jobListingId: jobListing.id,
        applicationId: application.id,
        stage: "runner_started",
        mcpUrl,
        jobTitle: jobListing.title,
        company: jobListing.company,
        jobUrl: jobListing.url,
      }),
      mode,
    },
  });

  try {
    await writeAutomationLog({
      campaignId: campaign.id,
      jobListingId: jobListing.id,
      applicationId: application.id,
      event: "mcp_ai.connect_started",
      message: `Memulai koneksi ke Playwright MCP di ${mcpUrl}.`,
      metadata: buildMcpLogMetadata({
        campaignId: campaign.id,
        jobListingId: jobListing.id,
        applicationId: application.id,
        stage: "mcp_connect",
        mcpUrl,
        toolName: "initialize",
        jobTitle: jobListing.title,
        company: jobListing.company,
        jobUrl: jobListing.url,
      }),
    });
    await client.connect();
    await writeAutomationLog({
      campaignId: campaign.id,
      jobListingId: jobListing.id,
      applicationId: application.id,
      event: "mcp_ai.connect_ok",
      message: "Koneksi Playwright MCP berhasil.",
      metadata: buildMcpLogMetadata({
        campaignId: campaign.id,
        jobListingId: jobListing.id,
        applicationId: application.id,
        stage: "mcp_connect",
        mcpUrl,
        toolName: "initialize",
        jobTitle: jobListing.title,
        company: jobListing.company,
        jobUrl: jobListing.url,
      }),
    });

    await writeAutomationLog({
      campaignId: campaign.id,
      jobListingId: jobListing.id,
      applicationId: application.id,
      event: "mcp_ai.navigate_started",
      message: "MCP mulai membuka halaman lowongan target.",
      metadata: buildMcpLogMetadata({
        campaignId: campaign.id,
        jobListingId: jobListing.id,
        applicationId: application.id,
        stage: "mcp_tool_call",
        mcpUrl,
        toolName: "browser_navigate",
        jobTitle: jobListing.title,
        company: jobListing.company,
        jobUrl: jobListing.url,
      }),
    });
    await client.navigate(jobListing.url);
    await writeAutomationLog({
      campaignId: campaign.id,
      jobListingId: jobListing.id,
      applicationId: application.id,
      event: "mcp_ai.navigate_ok",
      message: "MCP berhasil membuka halaman lowongan target.",
      metadata: buildMcpLogMetadata({
        campaignId: campaign.id,
        jobListingId: jobListing.id,
        applicationId: application.id,
        stage: "mcp_tool_call",
        mcpUrl,
        toolName: "browser_navigate",
        jobTitle: jobListing.title,
        company: jobListing.company,
        jobUrl: jobListing.url,
      }),
    });

    await writeAutomationLog({
      campaignId: campaign.id,
      jobListingId: jobListing.id,
      applicationId: application.id,
      event: "mcp_ai.snapshot_started",
      message: "MCP mulai mengambil snapshot halaman.",
      metadata: buildMcpLogMetadata({
        campaignId: campaign.id,
        jobListingId: jobListing.id,
        applicationId: application.id,
        stage: "mcp_tool_call",
        mcpUrl,
        toolName: "browser_snapshot",
        jobTitle: jobListing.title,
        company: jobListing.company,
        jobUrl: jobListing.url,
      }),
    });
    let snapshot = await client.snapshot();
    await writeAutomationLog({
      campaignId: campaign.id,
      jobListingId: jobListing.id,
      applicationId: application.id,
      event: "mcp_ai.snapshot_ok",
      message: "Snapshot awal MCP berhasil diambil.",
      metadata: buildMcpLogMetadata({
        campaignId: campaign.id,
        jobListingId: jobListing.id,
        applicationId: application.id,
        stage: "mcp_tool_call",
        mcpUrl,
        toolName: "browser_snapshot",
        jobTitle: jobListing.title,
        company: jobListing.company,
        jobUrl: jobListing.url,
      }),
    });
    let normalized = normalizeMcpSnapshot(snapshot);
    let previousFingerprint = fingerprintSnapshot(snapshot);
    let sameSnapshotRepeats = 0;
    let noProgressActions = 0;
    let plannerRetries = 0;
    const startedAt = Date.now();
    const previousActions: Array<Record<string, unknown>> = [];

    for (let step = 1; step <= MAX_STEPS_PER_JOB; step += 1) {
      if (Date.now() - startedAt > MAX_JOB_DURATION_MS) {
        await prisma.application.update({ where: { id: application.id }, data: { status: "failed", notes: "Batas durasi pekerjaan MCP terlampaui." } });
        return { status: "failed", message: "Batas durasi otomatisasi terlampaui.", applicationId: application.id, pageKind: normalized.pageKind };
      }

      await writeAutomationLog({
        campaignId: campaign.id,
        jobListingId: jobListing.id,
        applicationId: application.id,
        event: "mcp_ai.snapshot_captured",
        message: "Snapshot MCP berhasil diambil.",
        metadata: {
          ...buildMcpLogMetadata({
            campaignId: campaign.id,
            jobListingId: jobListing.id,
            applicationId: application.id,
            stage: "mcp_tool_call",
            mcpUrl,
            toolName: "browser_snapshot",
            jobTitle: jobListing.title,
            company: jobListing.company,
            jobUrl: jobListing.url,
            step,
            pageKind: normalized.pageKind,
          }),
          url: snapshot.url,
          title: snapshot.title,
        },
      });

      const detectedStep = detectJobstreetApplyStep(snapshot.url, snapshot.accessibilityText);

      await writeAutomationLog({
        campaignId: campaign.id,
        jobListingId: jobListing.id,
        event: "jobstreet_apply.step_detected",
        message: `Langkah Jobstreet terdeteksi: ${detectedStep}.`,
        metadata: {
          applicationId: application.id,
          step,
          stepName: detectedStep,
          url: snapshot.url,
        },
      });

      await writeAutomationLog({
        campaignId: campaign.id,
        jobListingId: jobListing.id,
        event: "mcp_ai.page_kind_detected",
        message: `Jenis halaman MCP terdeteksi: ${normalized.pageKind}.`,
        metadata: {
          applicationId: application.id,
          step,
          pageKind: normalized.pageKind,
          detectedStep,
          submitCandidates: normalized.submitCandidates,
          questions: normalized.questions,
          buttons: normalized.buttons.slice(0, 12),
        },
      });

      if (detectedStep === "choose_documents") {
        await writeAutomationLog({
          campaignId: campaign.id,
          jobListingId: jobListing.id,
          event: "jobstreet_apply.choose_documents_continue",
          message: "Langkah memilih dokumen terdeteksi. Sistem mencoba klik Continue.",
          metadata: { applicationId: application.id, step, url: snapshot.url },
        });
      }

      if (detectedStep === "employer_questions") {
        await writeAutomationLog({
          campaignId: campaign.id,
          jobListingId: jobListing.id,
          event: "jobstreet_apply.employer_questions_started",
          message: "Langkah pertanyaan employer terdeteksi. AI mulai membaca field yang terlihat.",
          metadata: { applicationId: application.id, step, url: snapshot.url, questions: normalized.questions },
        });
      }

      if (detectedStep === "update_profile") {
        await writeAutomationLog({
          campaignId: campaign.id,
          jobListingId: jobListing.id,
          event: "jobstreet_apply.update_profile_started",
          message: "Langkah Update Jobstreet Profile terdeteksi. Sistem mulai memeriksa field wajib yang kosong.",
          metadata: { applicationId: application.id, step, url: snapshot.url },
        });
      }

      if (detectedStep === "review_submit") {
        await writeAutomationLog({
          campaignId: campaign.id,
          jobListingId: jobListing.id,
          event: "jobstreet_apply.review_submit_detected",
          message: "Langkah review dan submit Jobstreet terdeteksi.",
          metadata: { applicationId: application.id, step, url: snapshot.url, submitCandidates: normalized.submitCandidates },
        });
      }

      if (normalized.pageKind === "login_or_security") {
        await prisma.application.update({ where: { id: application.id }, data: { status: "paused", notes: "Perlu login/captcha/OTP/verifikasi keamanan manual." } });
        return {
          status: "manual_intervention_required",
          message: "Perlu intervensi manual untuk login, captcha, OTP, atau verifikasi keamanan.",
          applicationId: application.id,
          pageKind: normalized.pageKind,
        };
      }

      if (detectedStep === "success" || hasMcpSuccessMarker(normalized)) {
        await verifySubmitted(campaign, jobListing, application.id);
        await writeAutomationLog({
          campaignId: campaign.id,
          jobListingId: jobListing.id,
          event: "jobstreet_apply.success_detected",
          message: "Halaman success Jobstreet terdeteksi. Lamaran ditandai terkirim.",
          metadata: { applicationId: application.id, step, url: snapshot.url },
        });
        await writeAutomationLog({
          campaignId: campaign.id,
          jobListingId: jobListing.id,
          event: "mcp_ai.submit_verified",
          message: "Lamaran terverifikasi terkirim dari snapshot MCP.",
          metadata: { applicationId: application.id, step },
        });
        return {
          status: "submitted",
          message: "Lamaran berhasil diverifikasi terkirim.",
          applicationId: application.id,
          pageKind: normalized.pageKind,
        };
      }

      await writeAutomationLog({
        campaignId: campaign.id,
        jobListingId: jobListing.id,
        event: "mcp_ai.plan_requested",
        message: "Meminta rencana aksi berikutnya ke AI planner MCP.",
        metadata: { applicationId: application.id, step, pageKind: normalized.pageKind },
      });

      const plan = await planMcpUiAction({
        page: normalized,
        candidateProfile: buildCandidateProfile(candidateProfile),
        campaignDefaults: {
          currentSalary: campaign.defaultCurrentSalary,
          expectedSalary: campaign.defaultExpectedSalary,
          noticePeriod: campaign.defaultNoticePeriod,
          availability: campaign.defaultAvailability,
          workModePreference: campaign.workModePreference,
        },
        jobListing,
        questionMemory,
        previousActions,
        mode,
      });

      await writeAutomationLog({
        campaignId: campaign.id,
        jobListingId: jobListing.id,
        event: "mcp_ai.plan_received",
        message: `AI planner MCP mengembalikan goal ${plan.goal}.`,
        metadata: { applicationId: application.id, step, plan },
      });

      if (plan.goal === "manual_intervention") {
        await prisma.application.update({ where: { id: application.id }, data: { status: "paused", notes: plan.userFacingReason } });
        return {
          status: "manual_intervention_required",
          message: plan.userFacingReason,
          applicationId: application.id,
          pageKind: normalized.pageKind,
          latestPlanGoal: plan.goal,
        };
      }

      if (plan.goal === "ask_user") {
        await prisma.application.update({ where: { id: application.id }, data: { status: "paused", notes: plan.userQuestion ?? plan.userFacingReason } });
        await writeAutomationLog({
          campaignId: campaign.id,
          jobListingId: jobListing.id,
          event: "mcp_ai.ask_user_required",
          message: plan.userFacingReason,
          metadata: { applicationId: application.id, step, plan },
        });
        return {
          status: "paused",
          message: plan.userQuestion ?? plan.userFacingReason,
          applicationId: application.id,
          pageKind: normalized.pageKind,
          latestPlanGoal: plan.goal,
        };
      }

      if (plan.goal === "skip_job") {
        await prisma.application.update({ where: { id: application.id }, data: { status: "skipped", notes: plan.userFacingReason } });
        await prisma.jobListing.update({ where: { id: jobListing.id }, data: { status: "apply_unavailable" } });
        return {
          status: "apply_unavailable",
          message: plan.userFacingReason,
          applicationId: application.id,
          pageKind: normalized.pageKind,
          latestPlanGoal: plan.goal,
        };
      }

      if (plan.goal === "final_submit") {
        await writeAutomationLog({
          campaignId: campaign.id,
          jobListingId: jobListing.id,
          event: "mcp_ai.final_submit_detected",
          message: "Snapshot MCP mendeteksi kandidat submit akhir yang aman.",
          metadata: { applicationId: application.id, step, submitCandidates: normalized.submitCandidates },
        });
      }

      const execution = await executeMcpActionPlan({
        client,
        plan,
        page: normalized,
        previousSnapshot: snapshot,
      });

      if (!execution.executed) {
        plannerRetries += 1;
        if (plannerRetries > MAX_AI_PLANNER_RETRIES) {
          await prisma.application.update({ where: { id: application.id }, data: { status: "paused", notes: execution.blockedReason ?? "Runner MCP tidak bisa melanjutkan aksi aman." } });
          return {
            status: plan.goal === "final_submit" ? "submit_unverified" : "stuck_no_progress",
            message: execution.blockedReason ?? "Runner MCP tidak bisa melanjutkan aksi aman.",
            applicationId: application.id,
            pageKind: normalized.pageKind,
            latestPlanGoal: plan.goal,
          };
        }
      } else {
        plannerRetries = 0;
      }

      previousActions.push({ step, goal: plan.goal, action: execution.lastAction ?? null, reason: plan.userFacingReason });

      await writeAutomationLog({
        campaignId: campaign.id,
        jobListingId: jobListing.id,
        event: plan.goal === "final_submit" ? "mcp_ai.final_submit_clicked" : "mcp_ai.action_executed",
        message: plan.goal === "final_submit" ? "Aksi submit akhir dijalankan melalui MCP." : "Aksi MCP berhasil dijalankan.",
        metadata: { applicationId: application.id, step, action: execution.lastAction, goal: plan.goal },
      });

      snapshot = execution.snapshot;
      normalized = normalizeMcpSnapshot(snapshot);
      const nextFingerprint = fingerprintSnapshot(snapshot);

      if (execution.noProgress || nextFingerprint === previousFingerprint) {
        noProgressActions += 1;
        sameSnapshotRepeats += 1;
        await writeAutomationLog({
          campaignId: campaign.id,
          jobListingId: jobListing.id,
          level: "warn",
          event: "mcp_ai.no_progress_detected",
          message: "Snapshot MCP tidak menunjukkan progres setelah aksi terakhir.",
          metadata: { applicationId: application.id, step, noProgressActions, sameSnapshotRepeats },
        });
      } else {
        noProgressActions = 0;
        sameSnapshotRepeats = 0;
      }

      previousFingerprint = nextFingerprint;

      if (plan.goal === "final_submit") {
        if (hasMcpSuccessMarker(normalized)) {
          await verifySubmitted(campaign, jobListing, application.id);
          await writeAutomationLog({
            campaignId: campaign.id,
            jobListingId: jobListing.id,
            event: "mcp_ai.submit_verified",
            message: "Lamaran berhasil diverifikasi setelah submit akhir MCP.",
            metadata: { applicationId: application.id, step },
          });
          return {
            status: "submitted",
            message: "Lamaran berhasil diverifikasi terkirim.",
            applicationId: application.id,
            pageKind: normalized.pageKind,
            latestPlanGoal: plan.goal,
            latestAction: execution.lastAction ?? null,
          };
        }

        await prisma.application.update({ where: { id: application.id }, data: { status: "paused", notes: "Submit sudah diklik, tetapi marker sukses MCP belum muncul." } });
        await writeAutomationLog({
          campaignId: campaign.id,
          jobListingId: jobListing.id,
          level: "warn",
          event: "mcp_ai.submit_unverified",
          message: "Submit sudah diklik tetapi marker sukses MCP belum muncul.",
          metadata: { applicationId: application.id, step },
        });
        return {
          status: "submit_unverified",
          message: "Submit sudah diklik tetapi marker sukses MCP belum muncul.",
          applicationId: application.id,
          pageKind: normalized.pageKind,
          latestPlanGoal: plan.goal,
          latestAction: execution.lastAction ?? null,
        };
      }

      if (sameSnapshotRepeats > MAX_SAME_SNAPSHOT_REPEATS || noProgressActions > MAX_NO_PROGRESS_ACTIONS) {
        await prisma.application.update({ where: { id: application.id }, data: { status: "paused", notes: "Runner MCP berhenti karena snapshot berulang atau tidak ada progres." } });
        await prisma.jobListing.update({ where: { id: jobListing.id }, data: { status: "failed" } });
        return {
          status: "stuck_no_progress",
          message: "Runner MCP berhenti karena tidak ada progres yang terlihat pada snapshot.",
          applicationId: application.id,
          pageKind: normalized.pageKind,
          latestPlanGoal: plan.goal,
          latestAction: execution.lastAction ?? null,
        };
      }
    }

    await prisma.application.update({ where: { id: application.id }, data: { status: "paused", notes: "Runner MCP mencapai batas langkah maksimum." } });
    return {
      status: "stuck_no_progress",
      message: "Runner MCP mencapai batas langkah maksimum untuk lowongan ini.",
      applicationId: application.id,
      pageKind: normalized.pageKind,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const mcpError = error instanceof PlaywrightMcpError ? error : null;
    const stage = mcpError?.stage ?? "runner_unknown";
    const toolName = mcpError?.toolName;
    const failedMcpUrl = mcpError?.mcpUrl ?? mcpUrl;
    const causeMessage = mcpError?.causeMessage ?? errorMessage;
    const technicalMetadata = mcpError?.metadata ?? null;

    await prisma.application.update({ where: { id: application.id }, data: { status: "failed", notes: `Runner MCP gagal: ${errorMessage}` } });

    if (stage === "mcp_connect") {
      await writeAutomationLog({
        campaignId: campaign.id,
        jobListingId: jobListing.id,
        applicationId: application.id,
        level: "error",
        event: "mcp_ai.connect_failed",
        message: errorMessage,
        metadata: buildMcpLogMetadata({
          campaignId: campaign.id,
          jobListingId: jobListing.id,
          applicationId: application.id,
          stage,
          mcpUrl: failedMcpUrl,
          toolName: toolName ?? "initialize",
          jobTitle: jobListing.title,
          company: jobListing.company,
          jobUrl: jobListing.url,
          error: causeMessage,
          technical: technicalMetadata,
        }),
      });
    }

    if (toolName === "browser_snapshot") {
      await writeAutomationLog({
        campaignId: campaign.id,
        jobListingId: jobListing.id,
        applicationId: application.id,
        level: "error",
        event: "mcp_ai.snapshot_failed",
        message: errorMessage,
        metadata: buildMcpLogMetadata({
          campaignId: campaign.id,
          jobListingId: jobListing.id,
          applicationId: application.id,
          stage,
          mcpUrl: failedMcpUrl,
          toolName,
          jobTitle: jobListing.title,
          company: jobListing.company,
          jobUrl: jobListing.url,
          error: causeMessage,
          technical: technicalMetadata,
        }),
      });
    }

    if (mcpError) {
      await writeAutomationLog({
        campaignId: campaign.id,
        jobListingId: jobListing.id,
        applicationId: application.id,
        level: "error",
        event: "mcp_ai.tool_call_failed",
        message: errorMessage,
        metadata: buildMcpLogMetadata({
          campaignId: campaign.id,
          jobListingId: jobListing.id,
          applicationId: application.id,
          stage,
          mcpUrl: failedMcpUrl,
          toolName,
          jobTitle: jobListing.title,
          company: jobListing.company,
          jobUrl: jobListing.url,
          error: causeMessage,
          technical: technicalMetadata,
        }),
      });
    }

    await writeAutomationLog({
      campaignId: campaign.id,
      jobListingId: jobListing.id,
      applicationId: application.id,
      level: "error",
      event: "mcp_ai.runner_failed",
      message: errorMessage,
      metadata: buildMcpLogMetadata({
        campaignId: campaign.id,
        jobListingId: jobListing.id,
        applicationId: application.id,
        stage,
        mcpUrl: failedMcpUrl,
        toolName,
        jobTitle: jobListing.title,
        company: jobListing.company,
        jobUrl: jobListing.url,
        error: causeMessage,
        technical: technicalMetadata,
      }),
    });
    return {
      status: "failed",
      message: mcpError ? errorMessage : "Runner MCP gagal dijalankan.",
      applicationId: application.id,
      error: errorMessage,
    };
  }
}
