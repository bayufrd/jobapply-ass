import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { writeAutomationLog } from "@/lib/logging/automation-log";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const body = (await request.json()) as {
      status?: "discovered" | "skipped" | "shortlisted" | "applying" | "submitted" | "failed";
      reason?: string;
    };

    if (!body.status) {
      return NextResponse.json({ error: "Status lowongan wajib diisi." }, { status: 400 });
    }

    const job = await prisma.jobListing.findUnique({
      where: { id },
      include: { campaign: true },
    });

    if (!job) {
      return NextResponse.json({ error: "Lowongan tidak ditemukan." }, { status: 404 });
    }

    const updatedJob = await prisma.jobListing.update({
      where: { id },
      data: { status: body.status },
    });

    if (job.campaignId) {
      await writeAutomationLog({
        campaignId: job.campaignId,
        jobListingId: job.id,
        event: "job.status_updated",
        message:
          body.status === "skipped"
            ? body.reason ?? "Lowongan dilewati oleh user dari halaman lowongan."
            : `Status lowongan diperbarui menjadi ${body.status}.`,
        metadata: {
          previousStatus: job.status,
          nextStatus: body.status,
        },
      });
    }

    return NextResponse.json({
      message: "Status lowongan berhasil diperbarui.",
      job: updatedJob,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: "Gagal memperbarui status lowongan.",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}
