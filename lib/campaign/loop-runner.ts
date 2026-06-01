import { prisma } from "@/lib/db/prisma";
import { writeAutomationLog } from "@/lib/logging/automation-log";
import { startJobApplication } from "@/lib/browser/jobstreet-apply-agent";

type LoopResult = {
  status: "completed" | "paused" | "stopped" | "target_reached" | "no_jobs" | "error";
  message: string;
  preparedCount: number;
  preparedApplicationId?: string;
};

/**
 * Prepare the next shortlisted job for review.
 * This does NOT submit — it only starts assisted apply to fill the form,
 * then creates an Application record in pending_review status.
 * Each submit must be explicitly approved by the user.
 */
export async function prepareNextApplication(campaignId: string): Promise<LoopResult> {
  // Load campaign
  const campaign = await prisma.campaign.findUnique({ where: { id: campaignId } });
  if (!campaign) {
    return { status: "error", message: "Kampanye tidak ditemukan.", preparedCount: 0 };
  }

  // Check campaign status
  if (campaign.status !== "running" && campaign.status !== "paused") {
    return {
      status: "stopped",
      message: `Kampanye tidak dalam status berjalan/dijeda. Status: ${campaign.status}`,
      preparedCount: 0,
    };
  }

  // Check if target already reached
  if (campaign.appliedCount >= campaign.targetApplyCount) {
    await writeAutomationLog({
      campaignId,
      event: "campaign.target_reached",
      message: `Target lamaran tercapai: ${campaign.appliedCount}/${campaign.targetApplyCount}.`,
    });
    return {
      status: "target_reached",
      message: `Target lamaran sudah tercapai (${campaign.appliedCount}/${campaign.targetApplyCount}).`,
      preparedCount: 0,
    };
  }

  // Find next shortlisted job without a submitted application
  const submittedJobIds = (
    await prisma.application.findMany({
      where: {
        campaignId,
        status: { in: ["submitted", "pending_review", "paused"] },
      },
      select: { jobListingId: true },
    })
  ).map((a) => a.jobListingId);

  const nextJob = await prisma.jobListing.findFirst({
    where: {
      campaignId,
      status: "shortlisted",
      id: { notIn: submittedJobIds },
    },
    orderBy: { matchScore: "desc" },
  });

  if (!nextJob) {
    await writeAutomationLog({
      campaignId,
      event: "campaign.loop_completed",
      message: "Tidak ada lagi lowongan shortlisted yang perlu diproses.",
    });
    return {
      status: "no_jobs",
      message: "Tidak ada lagi lowongan shortlisted yang tersedia untuk dilamar.",
      preparedCount: 0,
    };
  }

  // Load latest CandidateProfile
  const profile = await prisma.candidateProfile.findFirst({
    orderBy: { updatedAt: "desc" },
  });

  if (!profile) {
    return {
      status: "error",
      message: "Profil kandidat belum tersedia.",
      preparedCount: 0,
    };
  }

  // Log loop next job
  await writeAutomationLog({
    campaignId,
    jobListingId: nextJob.id,
    event: "campaign.loop_next_job",
    message: `Menyiapkan lamaran untuk "${nextJob.title}" di ${nextJob.company} (skor: ${nextJob.matchScore ?? "N/A"}).`,
    metadata: { jobId: nextJob.id, title: nextJob.title, company: nextJob.company },
  });

  // Start assisted apply (fills form, creates Application pending_review)
  const result = await startJobApplication({
    jobListing: {
      id: nextJob.id,
      campaignId: nextJob.campaignId,
      title: nextJob.title,
      company: nextJob.company,
      location: nextJob.location,
      salaryText: nextJob.salaryText,
      workType: nextJob.workType,
      url: nextJob.url,
      description: nextJob.description,
      matchScore: nextJob.matchScore,
      matchReason: nextJob.matchReason,
      status: nextJob.status,
    },
    campaign: {
      id: campaign.id,
      name: campaign.name,
      submitMode: campaign.submitMode,
      defaultCurrentSalary: campaign.defaultCurrentSalary,
      defaultExpectedSalary: campaign.defaultExpectedSalary,
      defaultNoticePeriod: campaign.defaultNoticePeriod,
      defaultAvailability: campaign.defaultAvailability,
      workModePreference: campaign.workModePreference,
    },
    profile: {
      fullName: profile.fullName ?? "",
      email: profile.email ?? "",
      phone: profile.phone ?? "",
      location: profile.location ?? "",
      summary: profile.summary ?? "",
      skillsJson: profile.skillsJson ?? "[]",
      experienceJson: profile.experienceJson ?? "[]",
      educationJson: profile.educationJson ?? "[]",
      projectsJson: profile.projectsJson ?? "[]",
      certificationsJson: profile.certificationsJson ?? "[]",
    },
  });

  if (result.status === "pending_review" || result.status === "paused") {
    return {
      status: "completed",
      message: result.message,
      preparedCount: 1,
      preparedApplicationId: result.applicationId,
    };
  }

  return {
    status: "error",
    message: result.message,
    preparedCount: 0,
  };
}
