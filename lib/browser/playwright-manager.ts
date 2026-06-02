import { mkdir } from "node:fs/promises";
import path from "node:path";
import { chromium, type BrowserContext, type Page } from "playwright";
import { prisma } from "@/lib/db/prisma";
import { SAFE_AUTOMATION_NOTICES } from "@/lib/security/safe-automation";

export type ManagedBrowserSession = {
  context: BrowserContext;
  page: Page;
  sessionPath: string;
};

let activeSessionPromise: Promise<ManagedBrowserSession> | null = null;
let activeSession: ManagedBrowserSession | null = null;

function getSessionPath() {
  return process.env.PLAYWRIGHT_SESSION_PATH?.trim() || "./storage/jobstreet.auth.json";
}

async function ensureSessionDir(sessionPath: string) {
  const absolutePath = path.join(process.cwd(), sessionPath.replace(/^\.\//, ""));
  await mkdir(path.dirname(absolutePath), { recursive: true });
  return absolutePath;
}

export async function launchManagedBrowser() {
  const configuredHeadless = process.env.PLAYWRIGHT_HEADLESS?.toLowerCase() === "true";

  if (configuredHeadless) {
    throw new Error(SAFE_AUTOMATION_NOTICES.visibleBrowserOnly);
  }

  if (activeSession && activeSession.context.browser()?.isConnected() && !activeSession.context.pages().every((page) => page.isClosed())) {
    const page = activeSession.context.pages().find((existingPage) => !existingPage.isClosed()) ?? (await activeSession.context.newPage());
    activeSession = { ...activeSession, page };
    return activeSession;
  }

  if (activeSessionPromise) {
    return activeSessionPromise;
  }

  activeSessionPromise = (async () => {
    const sessionPath = getSessionPath();
    const absoluteSessionPath = await ensureSessionDir(sessionPath);

    const context = await chromium.launchPersistentContext(path.dirname(absoluteSessionPath), {
      headless: false,
      channel: "chromium",
      viewport: { width: 1440, height: 960 },
    });

    const page = context.pages()[0] ?? (await context.newPage());

    const managedSession = {
      context,
      page,
      sessionPath,
    } satisfies ManagedBrowserSession;

    activeSession = managedSession;

    context.on("close", () => {
      if (activeSession?.context === context) {
        activeSession = null;
      }
      activeSessionPromise = null;
    });

    await prisma.browserSession.upsert({
      where: { provider: "jobstreet" },
      update: {
        sessionPath,
        isValid: true,
        lastCheckedAt: new Date(),
      },
      create: {
        provider: "jobstreet",
        sessionPath,
        isValid: true,
        lastCheckedAt: new Date(),
      },
    });

    return managedSession;
  })();

  try {
    return await activeSessionPromise;
  } catch (error) {
    activeSessionPromise = null;
    activeSession = null;
    throw error;
  }
}

export async function closeManagedBrowser(session: ManagedBrowserSession) {
  if (activeSession?.context === session.context) {
    activeSession = null;
    activeSessionPromise = null;
  }
  await session.context.close();
}
