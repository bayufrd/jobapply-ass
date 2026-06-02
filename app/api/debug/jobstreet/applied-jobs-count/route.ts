import { NextResponse } from "next/server";
import { getJobstreetAppliedJobsCountWithMcp } from "@/lib/jobstreet/applied-jobs-count";

export async function GET() {
  try {
    const result = await getJobstreetAppliedJobsCountWithMcp();
    
    return NextResponse.json({
      ok: result.ok,
      count: result.count,
      url: result.url,
      message: result.message,
      // rawTextPreview: result.rawTextPreview, // Optional: for debugging if needed
    });
  } catch (error: unknown) {
    return NextResponse.json(
      {
        ok: false,
        count: null,
        message: `Error internal: ${error instanceof Error ? error.message : String(error)}`,
      },
      { status: 500 }
    );
  }
}
