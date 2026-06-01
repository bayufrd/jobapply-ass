import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";

export async function GET() {
  const applications = await prisma.application.findMany({
    include: {
      campaign: true,
      jobListing: true,
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ applications });
}
