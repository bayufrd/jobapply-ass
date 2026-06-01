import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { writeAutomationLog } from "@/lib/logging/automation-log";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;

    const application = await prisma.application.findUnique({
      where: { id },
      include: { jobListing: true },
    });

    if (!application) {
      return NextResponse.json(
        { error: "Lamaran tidak ditemukan." },
        { status: 404 },
      );
    }

    if (application.status !== "pending_review" && application.status !== "paused") {
      return NextResponse.json(
        { error: `Lamaran tidak bisa dilewati. Status saat ini: ${application.status}` },
        { status: 400 },
      );
    }

    // Update application to skipped
    await prisma.application.update({
      where: { id },
      data: {
        status: "skipped",
        skippedReason: "User memilih untuk melewati lamaran ini dari halaman review.",
      },
    });

    // Revert job listing status back to shortlisted so it can be picked up again
    await prisma.jobListing.update({
      where: { id: application.jobListingId },
      data: { status: "shortlisted" },
    });

    await writeAutomationLog({
      campaignId: application.campaignId,
      jobListingId: application.jobListingId,
      event: "application.skipped",
      message: `User melewati lamaran untuk "${application.jobListing.title}" di ${application.jobListing.company}.`,
      metadata: { applicationId: id, reason: "user_skip_from_review" },
    });

    return NextResponse.json(
      { status: "skipped", message: "Lamaran berhasil dilewati." },
      { status: 200 },
    );
  } catch (error) {
    console.error("Error skipping application:", error);
    return NextResponse.json(
      { error: "Terjadi kesalahan saat melewati lamaran." },
      { status: 500 },
    );
  }
}
