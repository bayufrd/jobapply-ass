import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import net from "node:net";
import nextEnv from "@next/env";

const DEFAULTS = {
  campaignId: "cmpy6ituy006c9k35xtreuri7",
  target: 1,
  maxMinutes: 20,
  appUrl: "http://localhost:3000",
  pollIntervalMs: 3000,
  maxNoProgressSeconds: 90,
};

const SUCCESS_MARKERS = [
  "/apply/success",
  "Your application has been sent",
  "Application has been sent",
  "has been sent",
  "Nice work",
  "Keep it up",
  "Lamaran terkirim",
  "Lamaran berhasil dikirim",
];

const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd());

const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
const rootDir = process.cwd();
const logsDir = path.join(rootDir, "storage", "logs");
const qaLogRelative = `storage/logs/qa-agent-browser-${timestamp}.log`;
const qaLogPath = path.join(rootDir, qaLogRelative);
const agentBrowserLogRelative = `storage/logs/agent-browser-run-${timestamp}.log`;
const agentBrowserLogPath = path.join(rootDir, agentBrowserLogRelative);
let devLogRelative = `storage/logs/dev-server-${timestamp}.log`;
let campaignLogRelative = "";
let devServerChild = null;
let browserSessionOpen = false;
let lastQaStatus = null;

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function parseArgs(argv) {
  const parsed = { ...DEFAULTS };

  for (const arg of argv) {
    if (!arg.startsWith("--")) continue;
    const [rawKey, ...rest] = arg.slice(2).split("=");
    const value = rest.join("=");

    if (rawKey === "campaign" && value) parsed.campaignId = value;
    if (rawKey === "target" && value) parsed.target = Number.parseInt(value, 10) || DEFAULTS.target;
    if (rawKey === "maxMinutes" && value) parsed.maxMinutes = Number.parseInt(value, 10) || DEFAULTS.maxMinutes;
    if (rawKey === "appUrl" && value) parsed.appUrl = value;
  }

  return parsed;
}

function appendLine(filePath, line) {
  fs.appendFileSync(filePath, `${line}\n`, "utf8");
}

function appendLog(event, data = {}, options = {}) {
  const targetPath = options.filePath || qaLogPath;
  appendLine(
    targetPath,
    JSON.stringify({
      ts: new Date().toISOString(),
      event,
      ...data,
    }),
  );
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function tryPortOpen(port, host) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let settled = false;

    const finish = (value) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(value);
    };

    socket.setTimeout(1000);
    socket.once("connect", () => finish(true));
    socket.once("timeout", () => finish(false));
    socket.once("error", () => finish(false));
    socket.connect(port, host);
  });
}

async function isPortOpen(port) {
  for (const host of ["127.0.0.1", "::1", "localhost"]) {
    if (await tryPortOpen(port, host)) {
      return true;
    }
  }
  return false;
}

function extractPort(urlString) {
  try {
    const url = new URL(urlString);
    if (url.port) return Number.parseInt(url.port, 10);
    return url.protocol === "https:" ? 443 : 80;
  } catch {
    return 3000;
  }
}

function fetchJsonSafely(url, options = {}) {
  return new Promise((resolve) => {
    const method = options.method || "GET";
    const headers = options.headers || { "Content-Type": "application/json" };
    const request = http.request(
      url,
      {
        method,
        headers,
      },
      (response) => {
        let raw = "";
        response.setEncoding("utf8");
        response.on("data", (chunk) => {
          raw += chunk;
        });
        response.on("end", () => {
          const text = raw || "";
          const trimmed = text.trim();
          const statusCode = response.statusCode || 0;
          const statusText = response.statusMessage || "";
          const contentType = response.headers["content-type"] || null;

          if (!trimmed) {
            resolve({
              ok: false,
              status: statusCode,
              body: {
                ok: false,
                error: "empty_response_body",
                statusCode,
                statusText,
                contentType,
                url,
                method,
              },
            });
            return;
          }

          try {
            resolve({
              ok: statusCode >= 200 && statusCode < 300,
              status: statusCode,
              body: JSON.parse(trimmed),
            });
          } catch {
            resolve({
              ok: false,
              status: statusCode,
              body: {
                ok: false,
                error: "invalid_json_response",
                statusCode,
                statusText,
                contentType,
                url,
                method,
                rawPreview: trimmed.slice(0, 2000),
              },
            });
          }
        });
      },
    );

    request.on("error", (error) => {
      resolve({
        ok: false,
        status: 0,
        body: {
          ok: false,
          error: "request_failed",
          url,
          method,
          message: error instanceof Error ? error.message : String(error),
        },
      });
    });

    if (options.body) {
      request.write(typeof options.body === "string" ? options.body : JSON.stringify(options.body));
    }

    request.end();
  });
}

async function waitForHttp(url, timeoutMs = 60000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const result = await fetchJsonSafely(url);
    if (result.status > 0 && result.status < 500) {
      return result;
    }
    await sleep(1000);
  }
  throw new Error(`Timeout menunggu HTTP ready: ${url}`);
}

function run(command, args = [], options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd || rootDir,
      env: process.env,
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    const filePath = options.logFilePath || agentBrowserLogPath;

    child.stdout.on("data", (chunk) => {
      const text = chunk.toString();
      stdout += text;
      appendLine(filePath, JSON.stringify({ ts: new Date().toISOString(), stream: "stdout", text }));
    });

    child.stderr.on("data", (chunk) => {
      const text = chunk.toString();
      stderr += text;
      appendLine(filePath, JSON.stringify({ ts: new Date().toISOString(), stream: "stderr", text }));
    });

    child.on("error", reject);
    child.on("exit", (code, signal) => {
      resolve({ code: code ?? 0, signal: signal ?? null, stdout, stderr });
    });
  });
}

async function isCommandAvailable(commandName) {
  const result = await run("sh", ["-lc", `command -v ${commandName}`], { logFilePath: qaLogPath });
  return result.code === 0 && result.stdout.trim().length > 0;
}

function spawnLoggedProcess(name, command, args, logRelativePath) {
  const logPath = path.join(rootDir, logRelativePath);
  const logStream = fs.createWriteStream(logPath, { flags: "a" });
  appendLine(logPath, JSON.stringify({ ts: new Date().toISOString(), event: "process_started", name, command, args }));

  const child = spawn(command, args, {
    cwd: rootDir,
    stdio: ["ignore", "pipe", "pipe"],
    shell: false,
    env: process.env,
  });

  child.stdout.on("data", (chunk) => logStream.write(chunk));
  child.stderr.on("data", (chunk) => logStream.write(chunk));
  child.on("exit", (code, signal) => {
    appendLine(logPath, JSON.stringify({ ts: new Date().toISOString(), event: "process_exit", name, code, signal }));
    logStream.end();
  });

  return child;
}

async function ensureAppRunning(config) {
  const port = extractPort(config.appUrl);
  if (await isPortOpen(port)) {
    appendLog("qa.app_already_running", { appUrl: config.appUrl, port });
    await waitForHttp(`${config.appUrl}/api/qa/campaigns/${config.campaignId}/status`, 30000);
    return false;
  }

  appendLog("qa.starting_dev_server", {
    appUrl: config.appUrl,
    command: "npm run dev",
    logFile: devLogRelative,
  });
  devServerChild = spawnLoggedProcess("next-dev", "npm", ["run", "dev"], devLogRelative);
  await waitForHttp(`${config.appUrl}/api/qa/campaigns/${config.campaignId}/status`, 90000);
  return true;
}

async function ensureAgentBrowserInstalled() {
  const available = await isCommandAvailable("agent-browser");
  if (!available) {
    const message = "agent-browser belum tersedia. Jalankan: npm install -g agent-browser && agent-browser install";
    appendLog("qa.agent_browser_missing", { message });
    throw new Error(message);
  }

  const diagnostics = [];
  for (const command of [
    ["sh", ["-lc", "command -v agent-browser"]],
    ["agent-browser", ["--version"]],
    ["agent-browser", ["--help"]],
    ["agent-browser", ["skills", "get", "core"]],
  ]) {
    const [bin, args] = command;
    const result = await run(bin, args, { logFilePath: agentBrowserLogPath });
    diagnostics.push({ command: [bin, ...args].join(" "), code: result.code });
    if (result.code !== 0) {
      throw new Error(`Perintah agent-browser gagal: ${[bin, ...args].join(" ")}`);
    }
  }

  const installResult = await run("agent-browser", ["install"], { logFilePath: agentBrowserLogPath });
  appendLog("qa.agent_browser_diagnostics", { diagnostics, installCode: installResult.code });
  if (installResult.code !== 0) {
    throw new Error("agent-browser install gagal. Lihat log agent-browser untuk detail error.");
  }
}

async function getCampaignStatus(config) {
  const result = await fetchJsonSafely(`${config.appUrl}/api/qa/campaigns/${config.campaignId}/status`);
  appendLog("qa.campaign_status_polled", {
    statusCode: result.status,
    campaignStatus: result.body?.campaignStatus ?? null,
    currentStep: result.body?.currentStep ?? null,
    blockerType: result.body?.blockerType ?? null,
  });
  return result;
}

async function continueAutopilot(config, reason) {
  const result = await fetchJsonSafely(`${config.appUrl}/api/campaigns/${config.campaignId}/autopilot/continue`, {
    method: "POST",
  });
  appendLog("qa.autopilot_continue_requested", {
    reason,
    statusCode: result.status,
    responseStatus: result.body?.status ?? null,
    currentStep: result.body?.currentStep ?? null,
    canContinue: result.body?.canContinue ?? null,
    nextAction: result.body?.nextAction ?? null,
  });
  return result;
}

async function getRuntimeState(config) {
  const result = await fetchJsonSafely(`${config.appUrl}/api/debug/campaigns/${config.campaignId}/runtime-state`);
  appendLog("qa.runtime_state_polled", {
    statusCode: result.status,
    currentStep: result.body?.campaign?.currentStep ?? null,
    latestApplicationStatus: result.body?.latestApplication?.status ?? null,
    lastPageKind: result.body?.mcp?.lastPageKind ?? null,
  });
  return result;
}

async function agentBrowserOpen(url) {
  const result = await run("agent-browser", ["open", url], { logFilePath: agentBrowserLogPath });
  browserSessionOpen = result.code === 0;
  if (result.code !== 0) {
    throw new Error(`Gagal membuka browser agent-browser ke ${url}`);
  }
}

async function agentBrowserSnapshot(label) {
  const snapshot = await run("agent-browser", ["snapshot"], { logFilePath: agentBrowserLogPath });
  const screenshotPath = path.join(logsDir, `agent-browser-${timestamp}-${label}.png`);
  const screenshot = await run("agent-browser", ["screenshot", screenshotPath], { logFilePath: agentBrowserLogPath });
  appendLog("qa.agent_browser_snapshot", {
    label,
    snapshotCode: snapshot.code,
    screenshotCode: screenshot.code,
    screenshotPath: path.relative(rootDir, screenshotPath),
    snapshotPreview: snapshot.stdout.slice(0, 4000),
  });
  return {
    snapshotText: snapshot.stdout,
    screenshotPath: path.relative(rootDir, screenshotPath),
  };
}

async function agentBrowserClickAutopilot() {
  const clickAttempts = [
    ["find", "role", "button", "click", "--name", "Jalankan Kampanye Autopilot"],
    ["find", "text", "Jalankan Kampanye Autopilot", "click"],
  ];

  for (const args of clickAttempts) {
    const result = await run("agent-browser", args, { logFilePath: agentBrowserLogPath });
    appendLog("qa.agent_browser_click_attempt", { args, code: result.code });
    if (result.code === 0) {
      return;
    }
  }

  throw new Error("Tombol 'Jalankan Kampanye Autopilot' tidak berhasil diklik oleh agent-browser.");
}

function detectSuccessMarker(statusBody) {
  const candidates = [
    statusBody?.lastSuccessMarker,
    statusBody?.latestApplication?.notes,
    statusBody?.latestApplication?.url,
    statusBody?.currentJob?.url,
    JSON.stringify(statusBody ?? {}),
  ]
    .filter(Boolean)
    .map((value) => String(value));

  for (const marker of SUCCESS_MARKERS) {
    if (candidates.some((value) => value.includes(marker))) {
      return marker;
    }
  }

  return null;
}

function hasApplyProgress(statusBody) {
  const events = Array.isArray(statusBody?.latestLogs) ? statusBody.latestLogs.map((log) => log.event) : [];
  const messages = Array.isArray(statusBody?.latestLogs) ? statusBody.latestLogs.map((log) => log.message) : [];
  const textPool = `${events.join("\n")}\n${messages.join("\n")}`;

  return {
    eligibleJobSelected:
      events.includes("campaign.phase_apply_job_selected") || textPool.includes("eligible untuk diproses"),
    applyPageOpened:
      events.includes("application.started") || events.includes("campaign.apply_runner_dispatch"),
    quickApplyClicked:
      events.includes("application.apply_button_clicked") || textPool.includes("Lamar cepat") || textPool.includes("/apply"),
    progressedThroughJobstreet:
      events.some((event) => event.startsWith("mcp_ai.")) || textPool.includes("Jobstreet") || textPool.includes("/apply/"),
  };
}

async function closeAgentBrowser() {
  if (!browserSessionOpen) return;
  await run("agent-browser", ["close"], { logFilePath: agentBrowserLogPath });
}

function stopDevServerIfStarted() {
  if (!devServerChild) return;
  try {
    devServerChild.kill("SIGTERM");
  } catch {}
}

async function main() {
  ensureDir(logsDir);
  const config = parseArgs(process.argv.slice(2));
  campaignLogRelative = `storage/logs/campaign-${config.campaignId}.log`;

  appendLog("qa.started", {
    config,
    qaLogFile: qaLogRelative,
    agentBrowserLogFile: agentBrowserLogRelative,
    campaignLogFile: campaignLogRelative,
  });

  await ensureAgentBrowserInstalled();
  await ensureAppRunning(config);

  const campaignPageUrl = `${config.appUrl}/campaigns/${config.campaignId}`;
  await agentBrowserOpen(campaignPageUrl);
  await agentBrowserSnapshot("campaign-page-initial");

  const initialStatus = await getCampaignStatus(config);
  appendLog("qa.initial_status", {
    campaignStatus: initialStatus.body?.campaignStatus ?? null,
    currentStep: initialStatus.body?.currentStep ?? null,
  });

  if (!["running", "paused"].includes(initialStatus.body?.campaignStatus)) {
    await agentBrowserClickAutopilot();
    await sleep(2500);
    await agentBrowserSnapshot("campaign-page-after-start");
  }

  const startedAt = Date.now();
  let lastProgressAt = Date.now();
  let lastObservedSignature = "";

  let lastContinueKey = "";

  while (Date.now() - startedAt < config.maxMinutes * 60 * 1000) {
    const [statusResult, runtimeResult] = await Promise.all([
      getCampaignStatus(config),
      getRuntimeState(config),
    ]);

    const statusBody = statusResult.body ?? {};
    const progress = hasApplyProgress(statusBody);
    const successMarker = detectSuccessMarker(statusBody);
    const signature = JSON.stringify({
      campaignStatus: statusBody.campaignStatus ?? null,
      currentStep: statusBody.currentStep ?? null,
      latestApplicationStatus: statusBody.latestApplication?.status ?? null,
      blockerType: statusBody.blockerType ?? null,
      lastSuccessMarker: statusBody.lastSuccessMarker ?? null,
      progress,
    });

    if (signature !== lastObservedSignature) {
      lastObservedSignature = signature;
      lastProgressAt = Date.now();
    }

    lastQaStatus = {
      campaignStatus: statusBody.campaignStatus ?? null,
      currentStep: statusBody.currentStep ?? null,
      latestJob: statusBody.currentJob ?? null,
      latestApplication: statusBody.latestApplication ?? null,
      blocker: statusBody.blocker ?? null,
      progress,
      successMarker,
      runtime: runtimeResult.body ?? null,
    };

    appendLog("qa.poll_summary", lastQaStatus);

    const continueKey = JSON.stringify({
      campaignStatus: statusBody.campaignStatus ?? null,
      currentStep: statusBody.currentStep ?? null,
      latestApplicationId: statusBody.latestApplication?.id ?? null,
      latestLogId: Array.isArray(statusBody.latestLogs) && statusBody.latestLogs[0]?.id
        ? statusBody.latestLogs[0].id
        : null,
      verifiedSubmittedCount: statusBody.verifiedSubmittedCount ?? null,
    });
    const shouldRequestContinue =
      statusBody.campaignStatus === "running"
      && ["searching_jobs", "search_completed", "next_job", "opening_job"].includes(String(statusBody.currentStep ?? ""));

    if (shouldRequestContinue && continueKey !== lastContinueKey) {
      lastContinueKey = continueKey;
      await continueAutopilot(config, `auto:${statusBody.currentStep ?? "unknown"}`);
      await sleep(1500);
      continue;
    }

    if (
      Number(statusBody.verifiedSubmittedCount ?? 0) >= config.target
      && successMarker
    ) {
      await agentBrowserSnapshot("success-marker");
      appendLog("qa.agent_browser_passed", {
        verifiedSubmittedCount: statusBody.verifiedSubmittedCount,
        successMarker,
      });
      console.log("QA AGENT-BROWSER PASSED");
      console.log(`Verified submitted: ${statusBody.verifiedSubmittedCount}`);
      console.log(`Success marker: ${successMarker}`);
      console.log(`Campaign log: ${campaignLogRelative}`);
      console.log(`QA log: ${qaLogRelative}`);
      console.log(`Agent Browser log: ${agentBrowserLogRelative}`);
      return;
    }

    const blockerType = statusBody.blockerType ?? statusBody.blocker?.type ?? null;
    if (["captcha", "otp", "security_check", "manual_login_required"].includes(String(blockerType))) {
      await agentBrowserSnapshot("manual-intervention-required");
      appendLog("manual_intervention_required", {
        blockerType,
        blocker: statusBody.blocker ?? null,
      });
      throw new Error(`Manual intervention required: ${blockerType}`);
    }

    if (String(blockerType) === "question_required") {
      await agentBrowserSnapshot("question-required");
      appendLog("question_required", {
        blocker: statusBody.blocker ?? null,
      });
      throw new Error("Pertanyaan tambahan membutuhkan jawaban user atau modal QA belum cukup otomatis.");
    }

    if (statusBody.campaignStatus === "error") {
      throw new Error(statusBody.blocker?.message || "Kampanye masuk status error.");
    }

    if (Date.now() - lastProgressAt > config.maxNoProgressSeconds * 1000) {
      await agentBrowserSnapshot("no-progress-timeout");
      throw new Error(`Tidak ada progres terdeteksi selama ${config.maxNoProgressSeconds} detik.`);
    }

    await sleep(config.pollIntervalMs);
  }

  await agentBrowserSnapshot("overall-timeout");
  throw new Error(`Timeout QA agent-browser setelah ${config.maxMinutes} menit.`);
}

main()
  .catch(async (error) => {
    appendLog("qa.agent_browser_failed", {
      reason: error instanceof Error ? error.message : String(error),
      latestStatus: lastQaStatus,
      campaignLog: campaignLogRelative,
      qaLog: qaLogRelative,
      agentBrowserLog: agentBrowserLogRelative,
    });

    console.log("QA AGENT-BROWSER FAILED");
    console.log(`Reason: ${error instanceof Error ? error.message : String(error)}`);
    console.log(`Latest campaign status: ${lastQaStatus?.campaignStatus ?? "unknown"}`);
    console.log(`Latest job: ${lastQaStatus?.latestJob?.title ?? "none"}`);
    console.log(`Latest application: ${lastQaStatus?.latestApplication?.id ?? "none"}`);
    console.log(`Log files: ${campaignLogRelative}, ${qaLogRelative}, ${agentBrowserLogRelative}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeAgentBrowser();
    stopDevServerIfStarted();
  });