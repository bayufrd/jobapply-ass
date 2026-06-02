import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";

export async function GET() {
  const campaigns = await prisma.campaign.findMany({
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ campaigns });
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      name?: string;
      keyword?: string;
      location?: string;
      targetApplyCount?: number;
      matchThreshold?: number;
      workModePreference?: string;
      defaultCurrentSalary?: number;
      defaultExpectedSalary?: number;
      defaultNoticePeriod?: string;
      defaultAvailability?: string;
      submitMode?: "assisted_auto_apply" | "manual_review_only";
      automationMode?: "review_each_application" | "auto_submit_safe_only";
      lowScoreMode?: "ask" | "auto_skip" | "auto_apply";
      autoSubmitSafeOnly?: boolean;
    };

    if (!body.name || !body.keyword) {
      return NextResponse.json({ error: "name and keyword are required." }, { status: 400 });
    }

    const campaign = await prisma.campaign.create({
      data: {
        name: body.name,
        keyword: body.keyword,
        location: body.location ?? null,
        targetApplyCount: body.targetApplyCount ?? 1,
        matchThreshold: body.matchThreshold ?? 70,
        workModePreference: body.workModePreference ?? null,
        defaultCurrentSalary: body.defaultCurrentSalary ?? Number(process.env.DEFAULT_CURRENT_SALARY ?? 6000000),
        defaultExpectedSalary: body.defaultExpectedSalary ?? Number(process.env.DEFAULT_EXPECTED_SALARY ?? 6000000),
        defaultNoticePeriod: body.defaultNoticePeriod ?? process.env.DEFAULT_NOTICE_PERIOD ?? "ASAP",
        defaultAvailability: body.defaultAvailability ?? process.env.DEFAULT_AVAILABILITY ?? "Immediate",
        submitMode:
          body.automationMode === "auto_submit_safe_only"
            ? "assisted_auto_apply"
            : (body.submitMode ?? "manual_review_only"),
        status: "ready",
        automationMode: body.automationMode ?? "review_each_application",
        lowScoreMode: body.lowScoreMode ?? "ask",
        autoSubmitSafeOnly: body.autoSubmitSafeOnly ?? body.automationMode === "auto_submit_safe_only",
      } as {
        name: string;
        keyword: string;
        location: string | null;
        targetApplyCount: number;
        matchThreshold: number;
        workModePreference: string | null;
        defaultCurrentSalary: number;
        defaultExpectedSalary: number;
        defaultNoticePeriod: string;
        defaultAvailability: string;
        submitMode: "assisted_auto_apply" | "manual_review_only";
        status: "ready";
        automationMode: string;
        lowScoreMode: string;
        autoSubmitSafeOnly: boolean;
      },
    });

    return NextResponse.json({ success: true, campaign }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Gagal membuat kampanye.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
