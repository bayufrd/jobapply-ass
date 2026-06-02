import { PlaywrightMcpClient } from "./../mcp/playwright-mcp-client";
import { detectManualInterventionFromSignals } from "./../browser/page-detector";

export type AppliedJobsCountResult = {
  ok: boolean;
  count: number | null;
  url: string;
  rawTextPreview?: string;
  message: string;
};

export async function getJobstreetAppliedJobsCountWithMcp(): Promise<AppliedJobsCountResult> {
  const url = "https://id.jobstreet.com/id/my-activity/applied-jobs";
  const client = new PlaywrightMcpClient();

  try {
    // 1. Navigate to Applied Jobs page
    await client.navigate(url);
    
    // Wait a bit for content to load
    await new Promise((resolve) => setTimeout(resolve, 3000));

    // 2. Get snapshot
    const snapshot = await client.snapshot();
    const text = snapshot.accessibilityText || "";

    // 3. Check for manual intervention (login, captcha, etc.)
    const intervention = detectManualInterventionFromSignals(url, {
      visibleText: text,
      interactiveTexts: snapshot.elements.map(e => e.text || e.name || "").filter(Boolean),
      hasVisiblePasswordInput: snapshot.elements.some(e => e.role === "textbox" && e.name?.toLowerCase().includes("password")),
      hasVisibleOtpInput: snapshot.elements.some(e => e.name?.toLowerCase().includes("otp") || e.name?.toLowerCase().includes("verification")),
      hasVisibleCaptcha: text.toLowerCase().includes("captcha") || text.toLowerCase().includes("robot"),
      hasVisibleLoginButton: snapshot.elements.some(e => e.role === "button" && /(login|log in|sign in|masuk)/i.test(e.name || "")),
    });

    if (intervention.detected) {
      return {
        ok: false,
        count: null,
        url,
        rawTextPreview: text.substring(0, 500),
        message: `Butuh login/verifikasi Jobstreet untuk membaca total lamaran. (${intervention.type})`,
      };
    }

    // 4. Parse count
    // Pattern: "98 lowongan", "1 lowongan", etc.
    // We prioritize "lowongan" keyword as per requirement.
    const matches = [...text.matchAll(/(\d+)\s+lowongan/gi)];
    
    if (matches.length > 0) {
      // If multiple matches, we take the first one which is usually the main count
      // or the one closest to "Applied Jobs" context in accessibility tree.
      const count = parseInt(matches[0][1], 10);
      return {
        ok: true,
        count,
        url,
        rawTextPreview: text.substring(0, 500),
        message: "Total lamaran Jobstreet berhasil dibaca.",
      };
    }

    return {
      ok: false,
      count: null,
      url,
      rawTextPreview: text.substring(0, 500),
      message: "Tidak dapat menemukan angka total lamaran di halaman.",
    };
  } catch (error: unknown) {
    return {
      ok: false,
      count: null,
      url,
      message: `Gagal membaca total lamaran: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}
