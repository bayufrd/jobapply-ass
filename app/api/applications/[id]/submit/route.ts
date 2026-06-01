import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { submitApplication } from "@/lib/browser/jobstreet-apply-agent";
import { writeAutomationLog } from "@/lib/logging/automation-log";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const body = await request.json();

    // Verify explicit user approval
    if (body.approved !== true) {
      return NextResponse.json(
        { error: "Lamaran belum disetujui user." },
        { status: 400 },
      );
    }

    // Load Application with relations
    const application = await prisma.application.findUnique({
      where: { id },
      include: {
        campaign: true,
        jobListing: true,
      },
    });

    if (!application) {
      return NextResponse.json(
        { error: "Lamaran tidak ditemukan." },
        { status: 404 },
      );
    }

    // Verify status is pending_review
    if (application.status !== "pending_review") {
      return NextResponse.json(
        {
          error: `Lamaran tidak dalam status pending_review. Status saat ini: ${application.status}`,
        },
        { status: 400 },
      );
    }

    // Load latest CandidateProfile
    const profile = await prisma.candidateProfile.findFirst({
      orderBy: { updatedAt: "desc" },
    });

    if (!profile) {
      return NextResponse.json(
        { error: "Profil kandidat belum tersedia. Analisis CV terlebih dahulu." },
        { status: 400 },
      );
    }

    // Parse answersJson
    let answersJson;
    try {
      answersJson = JSON.parse(application.answersJson ?? "{}");
    } catch {
      answersJson = { fieldsFilled: [], questionAnswers: [], pendingQuestions: [] };
    }

    // Log submit requested
    await writeAutomationLog({
      campaignId: application.campaignId,
      jobListingId: application.jobListingId,
      event: "application.submit_requested",
      message: `User menyetujui submit lamaran untuk "${application.jobListing.title}" di ${application.jobListing.company}.`,
      metadata: { applicationId: id, approved: true },
    });

    // Run submit flow
    const result = await submitApplication({
      applicationId: id,
      jobListingUrl: application.jobListing.url,
      campaignId: application.campaignId,
      jobListingId: application.jobListingId,
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
      campaign: application.campaign,
      answersJson,
    });

    // Update Application based on result
    if (result.status === "submitted") {
      await prisma.application.update({
        where: { id },
        data: {
          status: "submitted",
          submittedAt: new Date(),
          userApproved: true,
          screenshotPath: result.screenshotPath ?? null,
        },
      });

      // Update JobListing status
      await prisma.jobListing.update({
        where: { id: application.jobListingId },
        data: { status: "submitted" },
      });

      // Increment campaign appliedCount
      await prisma.campaign.update({
        where: { id: application.campaignId },
        data: { appliedCount: { increment: 1 } },
      });

      await writeAutomationLog({
        campaignId: application.campaignId,
        jobListingId: application.jobListingId,
        event: "campaign.applied_count_incremented",
        message: `Jumlah lamaran terkirim kampanye bertambah.`,
        metadata: { applicationId: id },
      });
    } else if (result.status === "failed") {
      await prisma.application.update({
        where: { id },
        data: {
          status: "failed",
          screenshotPath: result.screenshotPath ?? null,
          notes: `Submit gagal: ${result.message}`,
        },
      });

      await prisma.jobListing.update({
        where: { id: application.jobListingId },
        data: { status: "failed" },
      });
    } else if (result.status === "paused") {
      await prisma.application.update({
        where: { id },
        data: {
          status: "paused",
          screenshotPath: result.screenshotPath ?? null,
          notes: result.message,
        },
      });
    }

    return NextResponse.json(
      {
        status: result.status,
        message: result.message,
        screenshotPath: result.screenshotPath,
      },
      { status: 200 },
    );
  } catch (error) {
    console.error("Error submitting application:", error);
    return NextResponse.json(
      {
        error: "Terjadi kesalahan saat submit lamaran.",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}
