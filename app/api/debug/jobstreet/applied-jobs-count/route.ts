import { NextResponse } from "next/server";
import { getJobstreetAppliedJobsCountWithMcp } from "@/lib/jobstreet/applied-jobs-count";

export async function GET() {
  const result = await getJobstreetAppliedJobsCountWithMcp();
  return NextResponse.json(result);
}
