import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";

export async function GET() {
  const session = await prisma.browserSession.findUnique({
    where: { provider: "jobstreet" },
  });

  return NextResponse.json({
    session,
    configuredPath: process.env.PLAYWRIGHT_SESSION_PATH ?? "./storage/jobstreet.auth.json",
    visibleMode: (process.env.PLAYWRIGHT_HEADLESS ?? "false") !== "true",
    message: session
      ? "Metadata sesi browser ditemukan. Validasi sesi masih dasar dan perlu pengujian manual."
      : "Belum ada metadata sesi browser tersimpan.",
  });
}
