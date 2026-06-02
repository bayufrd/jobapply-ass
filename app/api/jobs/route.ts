import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";

export async function GET() {
  const jobs = await prisma.jobListing.findMany({
    include: {
      campaign: {
        select: { id: true, name: true },
      },
      calibrations: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: {
          id: true,
          status: true,
          flowType: true,
          createdAt: true,
        },
      },
      logs: {
        orderBy: { createdAt: "desc" },
        take: 1,
      },
    },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  return NextResponse.json({ jobs });
}
