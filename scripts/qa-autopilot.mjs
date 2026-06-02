import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import net from "node:net";

const DEFAULTS = {
  campaignId: "cmpwsyc6l00009ktzojk8an1q",
  target: 1,
  maxMinutes: 15,
  mcpUrl: "http://localhost:8931/mcp",
  appUrl: "http://localhost:3000",
  pollIntervalMs: 3000,
  maxSameStatusRepeats: 5,
  maxNoProgressSeconds: 45,
  maxMcpRestartAttempts: 2,
};

const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
const rootDir = process.cwd();
const logsDir = path.join(rootDir, "storage", "logs");
const qaLogRelative = `storage/logs/qa-autopilot-${timestamp}.log`;
const qaLogPath = path.join(rootDir, qaLogRelative);
let mcpLogRelative = `storage/logs/mcp-run-${timestamp}.log`;
let devLogRelative = `storage/logs/dev-server-${timestamp}.log`;
let campaignLogRelative = "";
let lastKnownStatus = null;
let lastKnownApplication = null;
let lastKnownJob = null;

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
    if (rawKey === "mcpUrl" && value) parsed.mcpUrl = value;
    if (rawKey === "appUrl" && value) parsed.appUrl = value;
  }
  return parsed;
}

function appendLine(filePath, line) {
  fs.appendFileSync(filePath, `${line}\n`, "utf8");
}

function appendQaLog(event, data = {}) {
  appendLine(
    qaLogPath,
    JSON.stringify({
      ts: new Date().toISOString(),
      event,
      ...data,
    }),
  );
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

function fetchJson(url, options = {}) {
  return new Promise((resolve, reject) => {
    const request = http.request(
      url,
      {
        method: options.method || "GET",
        headers: options.headers || { "Content-Type": "application/json" },
      },
      (response) => {
        let raw = "";
        response.setEncoding("utf8");
        response.on("data", (chunk) => {
          raw += chunk;
        });
        response.on("end", () => {
          let body = null;
          try {
            body = raw ? JSON.parse(raw) : null;
          } catch {
            body = raw;
          }
          resolve({
            ok: response.statusCode >= 200 && response.statusCode < 300,
            status: response.statusCode || 0,
            body,
          });
        });
      },
    );

    request.on("error", reject);

    if (options.body) {
      request.write(typeof options.body === "string" ? options.body : JSON.stringify(options.body));
    }

    request.end();
  });
}

async function waitForHttp(url, timeoutMs) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const response = await fetchJson(url);
      if (response.status > 0 && response.status < 500) {
        return response;
      }
    } catch {}
    await sleep(1000);
  }
  throw new Error(`Timeout menunggu HTTP ready: ${url}`);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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

  child.stdout.on("data", (chunk) => {
    logStream.write(chunk);
  });
  child.stderr.on("data", (chunk) => {
    logStream.write(chunk);
  });
  child.on("exit", (code, signal) => {
    appendLine(logPath, JSON.stringify({ ts: new Date().toISOString(), event: "process_exit", name, code, signal }));
    logStream.end();
  });

  return child;
}

async function ensureChromiumInstalled(config) {
  try {
    const response = await fetchJson(`${config.appUrl}/api/debug/mcp`);
    if (response.ok && response.body?.browserDependencyOk !== false) {
      return;
    }

    if (response.body?.browserDependencyOk === true) {
      return;
    }
  } catch {}

  appendQaLog("mcp.chromium_install_check", {
    message: "Mencoba memasang Chromium Playwright bila belum tersedia.",
  });

  await new Promise((resolve, reject) => {
    const child = spawn("npx", ["playwright", "install", "chromium"], {
      cwd: rootDir,
      stdio: ["ignore", "pipe", "pipe"],
      shell: false,
      env: process.env,
    });
    const installLog = path.join(rootDir, mcpLogRelative);
    child.stdout.on("data", (chunk) => fs.appendFileSync(installLog, chunk));
    child.stderr.on("data", (chunk) => fs.appendFileSync(installLog, chunk));
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error("Browser Playwright belum siap. Jalankan npx playwright install chromium."));
    });
  });
}

async function waitForPort(port, timeoutMs) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (await isPortOpen(port)) {
      return true;
    }
    await sleep(1000);
  }
  return false;
}

async function killProcessOnPort(port) {
  appendQaLog("mcp.kill_port_started", { port });
  const lookup = await new Promise((resolve, reject) => {
    const child = spawn("lsof", ["-ti", `tcp:${port}`], {
      cwd: rootDir,
      stdio: ["ignore", "pipe", "pipe"],
      shell: false,
      env: process.env,
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("exit", (code) => {
      if (code === 0 || code === 1) {
        resolve({ stdout, stderr });
        return;
      }
      reject(new Error(stderr || `lsof gagal untuk port ${port}`));
    });
  });

  const pids = String(lookup.stdout || "")
    .split(/\s+/)
    .map((value) => value.trim())
    .filter(Boolean);

  if (pids.length === 0) {
    appendQaLog("mcp.kill_port_done", { port, pids: [], alreadyClosed: !(await isPortOpen(port)) });
    return;
  }

  for (const pid of pids) {
    try {
      process.kill(Number(pid), "SIGTERM");
    } catch {}
  }

  await sleep(1500);

  if (await isPortOpen(port)) {
    for (const pid of pids) {
      try {
        process.kill(Number(pid), "SIGKILL");
      } catch {}
    }
  }

  appendQaLog("mcp.kill_port_done", {
    port,
    pids,
    openAfterKill: await isPortOpen(port),
  });
}

async function ensureMcpReady(config) {
  const mcpPortOpen = await isPortOpen(8931);
  appendQaLog("mcp.port_check", { port: 8931, open: mcpPortOpen });
  if (!mcpPortOpen) {
    appendQaLog("mcp.restart_started", { reason: "port_closed" });
    spawnLoggedProcess("mcp", "npm", ["run", "mcp:playwright"], mcpLogRelative);
    appendQaLog("process_started", { name: "mcp", logFile: mcpLogRelative });
  }

  const ready = await waitForPort(8931, 90000);
  if (ready) {
    appendQaLog("mcp.restart_ready", { port: 8931 });
    appendQaLog("process_ready", { name: "mcp", port: 8931 });
    return;
  }

  appendQaLog("mcp.restart_failed", { port: 8931 });
  throw new Error("Playwright MCP gagal aktif pada port 8931.");
}

async function ensureAppReady(config) {
  const appPortOpen = await isPortOpen(3000);
  appendQaLog("app.port_check", { port: 3000, open: appPortOpen });
  if (!appPortOpen) {
    spawnLoggedProcess("dev-server", "npm", ["run", "dev"], devLogRelative);
    appendQaLog("process_started", { name: "dev-server", logFile: devLogRelative });
  }

  await waitForHttp(config.appUrl, 120000);
  appendQaLog("process_ready", { name: "dev-server", url: config.appUrl });
}

function validateMcpHealthPayload(body) {
  return Boolean(
    body
      && body.connectOk === true
      && body.navigateOk === true
      && body.snapshotOk === true
      && body.snapshotUsable === true
      && body.browserDependencyOk === true
      && body.expectedHealthMarkerFound === true,
  );
}

function shouldRestartMcpForHealth(body) {
  return Boolean(
    body?.staleBlankPage === true
      || String(body?.currentSnapshotUrl || "").includes("about:blank")
      || String(body?.snapshotTextPreview || "").includes("about:blank"),
  );
}

async function getMcpHealth(config, eventName = "mcp.health_started") {
  appendQaLog(eventName, { url: `${config.appUrl}/api/debug/mcp` });
  const response = await fetchJson(`${config.appUrl}/api/debug/mcp`);
  appendQaLog("mcp_health", {
    ok: response.ok,
    status: response.status,
    body: response.body,
  });
  return response;
}

async function restartMcp(config, reason, attempt) {
  appendQaLog("mcp.restart_requested", { reason, attempt, port: 8931 });
  await killProcessOnPort(8931);
  appendQaLog("mcp.restart_started", { attempt, port: 8931 });
  spawnLoggedProcess("mcp", "npm", ["run", "mcp:playwright"], mcpLogRelative);
  appendQaLog("process_started", { name: "mcp", logFile: mcpLogRelative, restartAttempt: attempt });

  const ready = await waitForPort(8931, 90000);
  if (!ready) {
    appendQaLog("mcp.restart_failed", { attempt, port: 8931 });
    throw new Error("Playwright MCP gagal aktif kembali pada port 8931.");
  }

  appendQaLog("mcp.restart_done", { attempt, port: 8931 });
  appendQaLog("mcp.restart_ready", { attempt, port: 8931 });
}

async function checkMcpHealth(config) {
  let response = await getMcpHealth(config);

  if (response.body?.staleBlankPage) {
    appendQaLog("mcp.health_stale_blank_page", response.body);
  }

  if (!response.ok || !validateMcpHealthPayload(response.body)) {
    appendQaLog("mcp.health_unusable", response.body || { status: response.status });

    if (shouldRestartMcpForHealth(response.body)) {
      for (let attempt = 1; attempt <= config.maxMcpRestartAttempts; attempt += 1) {
        await restartMcp(config, response.body?.message || "stale_blank_page", attempt);
        response = await getMcpHealth(config, "mcp.health_after_restart");

        if (validateMcpHealthPayload(response.body)) {
          appendQaLog("mcp.health_passed_after_restart", {
            attempt,
            snapshotUsable: response.body?.snapshotUsable === true,
            expectedHealthMarkerFound: response.body?.expectedHealthMarkerFound === true,
            currentSnapshotUrl: response.body?.currentSnapshotUrl || null,
          });
          return;
        }

        appendQaLog("mcp.health_unusable", {
          attempt,
          health: response.body || { status: response.status },
        });
      }
    }

    appendQaLog("qa.failed_mcp_unusable_after_restart", {
      reason: "MCP snapshot tetap tidak usable setelah restart.",
      health: response.body || { status: response.status },
    });
    throw new Error("QA FAIL: MCP snapshot tetap tidak usable setelah restart.");
  }
}

function buildLogFiles(config) {
  return [
    qaLogRelative,
    campaignLogRelative || `storage/logs/campaign-${config.campaignId}.log`,
    mcpLogRelative,
    devLogRelative,
  ];
}

async function captureFailureContext(config, eventName) {
  const statusResponse = await fetchJson(`${config.appUrl}/api/qa/campaigns/${config.campaignId}/status`);
  appendQaLog("campaign_status_after_start_failed", {
    trigger: eventName,
    status: statusResponse.status,
    body: statusResponse.body,
  });

  const localLogResponse = await fetchJson(`${config.appUrl}/api/campaigns/${config.campaignId}/local-log?tail=300`);
  appendQaLog("campaign_local_log_tail_captured", {
    trigger: eventName,
    status: localLogResponse.status,
    body: localLogResponse.body,
  });

  return {
    statusResponse,
    localLogResponse,
  };
}

async function startCampaign(config) {
  const response = await fetchJson(`${config.appUrl}/api/qa/campaigns/${config.campaignId}/run`, {
    method: "POST",
    body: {
      targetSubmissions: config.target,
      forceMcpAiFirst: true,
      forceAutoSubmitSafeOnly: true,
      forceApplyLowScore: true,
    },
  });

  appendQaLog("campaign_start", {
    status: response.status,
    body: response.body,
  });

  if (!response.ok) {
    appendQaLog("campaign_start_failed", {
      status: response.status,
      body: response.body,
    });
    const failureContext = await captureFailureContext(config, "campaign_start_failed");
    throw new Error(
      response.body?.error
        || response.body?.message
        || failureContext.statusResponse.body?.blocker?.message
        || "Gagal memulai campaign QA.",
    );
  }

  if (!response.body?.ok) {
    appendQaLog("campaign_start_failed", {
      status: response.status,
      body: response.body,
    });
    await captureFailureContext(config, "campaign_start_failed");
    throw new Error(response.body?.error || response.body?.message || "Gagal memulai campaign QA.");
  }
}

async function continueCampaign(config) {
  const response = await fetchJson(`${config.appUrl}/api/campaigns/${config.campaignId}/autopilot/continue`, {
    method: "POST",
    body: {},
  });

  appendQaLog("campaign_continue", {
    status: response.status,
    body: response.body,
  });

  return response.body;
}

async function fetchQaStatus(config) {
  const response = await fetchJson(`${config.appUrl}/api/qa/campaigns/${config.campaignId}/status`);
  appendQaLog("campaign_status", {
    status: response.status,
    body: response.body,
  });
  if (!response.ok || !response.body?.ok) {
    throw new Error(response.body?.error || "Gagal mengambil status QA campaign.");
  }
  return response.body;
}

async function autoResolveLowScore(config, status) {
  const response = await fetchJson(`${config.appUrl}/api/campaigns/${config.campaignId}/autopilot/decision`, {
    method: "POST",
    body: { action: "apply", reason: "QA force apply low score" },
  });
  appendQaLog("campaign_decision", { action: "apply", status: response.status, body: response.body, qaStatus: status.status });
}

function summarizeStatus(status) {
  return {
    status: status.status,
    currentStep: status.currentStep,
    verifiedSubmittedCount: status.verifiedSubmittedCount,
    appliedCount: status.appliedCount,
    blocker: status.blocker?.type || null,
    decisionType: status.decisionType || null,
    lastSuccessMarker: status.lastSuccessMarker || null,
  };
}

function sameStatusKey(status) {
  return JSON.stringify(summarizeStatus(status));
}

async function runLoop(config) {
  const deadline = Date.now() + config.maxMinutes * 60 * 1000;
  let sameStatusRepeats = 0;
  let lastProgressAt = Date.now();
  let lastSubmittedCount = -1;
  let previousStatusKey = "";

  while (Date.now() < deadline) {
    const status = await fetchQaStatus(config);
    campaignLogRelative = status.localLogPath || `storage/logs/campaign-${config.campaignId}.log`;
    lastKnownStatus = status.status;
    lastKnownApplication = status.latestApplication?.jobTitle || status.latestApplication?.id || null;
    lastKnownJob = status.currentJob?.title || null;

    appendQaLog("qa.status", summarizeStatus(status));

    if (status.verifiedSubmittedCount > lastSubmittedCount) {
      lastSubmittedCount = status.verifiedSubmittedCount;
      lastProgressAt = Date.now();
    }

    if (status.verifiedSubmittedCount >= config.target) {
      // TASK 5 — Setelah submit success marker, cek Applied Jobs lagi
      console.log("Success marker ditemukan. Memverifikasi total Applied Jobs...");
      await sleep(3000); // Tunggu singkat 3 detik
      const afterResponse = await fetchJson(`${config.appUrl}/api/debug/jobstreet/applied-jobs-count`);
      const appliedJobsAfter = afterResponse.body?.count;

      appendQaLog("qa.applied_jobs_after_submit", {
        appliedJobsBefore: config.appliedJobsBefore,
        appliedJobsAfter,
        message: `Total lamaran Jobstreet setelah submit: ${appliedJobsAfter ?? "null"} lowongan.`,
      });

      const internalVerified = status.verifiedSubmittedCount >= config.target;
      const externalVerified =
        config.appliedJobsBefore !== null &&
        appliedJobsAfter !== null &&
        appliedJobsAfter >= config.appliedJobsBefore + config.target;

      if (internalVerified && externalVerified) {
        appendQaLog("qa.applied_jobs_count_incremented", {
          appliedJobsBefore: config.appliedJobsBefore,
          appliedJobsAfter,
          message: `Total Applied Jobs bertambah dari ${config.appliedJobsBefore} ke ${appliedJobsAfter}. Submit diverifikasi.`,
        });

        appendQaLog("qa.passed", {
          verifiedSubmittedCount: status.verifiedSubmittedCount,
          appliedJobsBefore: config.appliedJobsBefore,
          appliedJobsAfter,
          expectedMinimum: config.appliedJobsBefore + config.target,
          verificationSource: "jobstreet_applied_jobs_count",
          successMarker: status.lastSuccessMarker || "has been sent",
          logFiles: buildLogFiles(config),
        });

        console.log("QA PASSED");
        console.log(`Verified submitted: ${status.verifiedSubmittedCount}`);
        console.log(`Applied Jobs before: ${config.appliedJobsBefore}`);
        console.log(`Applied Jobs after: ${appliedJobsAfter}`);
        console.log(`Success marker: ${status.lastSuccessMarker || "has been sent"}`);
        console.log(`Campaign log: ${campaignLogRelative}`);
        console.log(`QA log: ${qaLogRelative}`);
        console.log(`MCP log: ${mcpLogRelative}`);
        return 0;
      } else if (internalVerified && !externalVerified) {
        // TASK 6 — Jangan klaim submitted kalau success marker ada tapi count tidak naik
        const reason = "Success marker ditemukan, tetapi total Applied Jobs Jobstreet belum bertambah.";
        appendQaLog("qa.applied_jobs_count_not_incremented", {
          appliedJobsBefore: config.appliedJobsBefore,
          appliedJobsAfter,
          message: reason,
        });

        appendQaLog("qa.failed", {
          reason,
          appliedJobsBefore: config.appliedJobsBefore,
          appliedJobsAfter,
          expectedMinimum: config.appliedJobsBefore + config.target,
          blockerType: "submit_unverified_count_not_incremented",
          logFiles: buildLogFiles(config),
        });

        console.log("QA FAILED");
        console.log(`Reason: ${reason}`);
        console.log(`Applied Jobs before: ${config.appliedJobsBefore}`);
        console.log(`Applied Jobs after: ${appliedJobsAfter ?? "null"}`);
        console.log(`Expected minimum: ${config.appliedJobsBefore + config.target}`);
        console.log(`Campaign log: ${campaignLogRelative}`);
        console.log(`QA log: ${qaLogRelative}`);
        return 1;
      }
    }

    const terminalSteps = new Set([
      "no_jobs_remaining",
      "target_reached",
      "too_many_unusable_jobs",
    ]);

    if (terminalSteps.has(status.currentStep)) {
      const reason =
        status.currentStep === "no_jobs_remaining"
          ? "Tidak ada lowongan eligible yang bisa diproses. QA dihentikan, bukan continue ulang."
          : `Terminal step tercapai: ${status.currentStep}`;

      appendQaLog("qa.terminal_step_detected", {
        currentStep: status.currentStep,
        message: "QA berhenti karena tidak ada lowongan eligible.",
      });

      appendQaLog("qa.failed", {
        reason,
        latestCampaignStatus: status.status,
        currentStep: status.currentStep,
        verifiedSubmittedCount: status.verifiedSubmittedCount,
        appliedCount: status.appliedCount,
        latestJob: status.currentJob ?? null,
        latestApplication: status.latestApplication ?? null,
        logFiles: buildLogFiles(config),
      });

      console.log("QA FAILED");
      console.log(`Reason: ${reason}`);
      console.log(`Campaign log: ${campaignLogRelative}`);
      console.log(`QA log: ${qaLogRelative}`);
      console.log(`MCP log: ${mcpLogRelative}`);
      console.log(`Dev log: ${devLogRelative}`);
      console.log("Send these logs to ChatGPT for analysis.");
      return 1;
    }

    if (status.latestApplication?.status === "paused") {
      const notes = String(status.latestApplication?.notes || "").toLowerCase();
      const message = String(status.latestApplication?.message || "").toLowerCase();
      const combined = `${notes} ${message}`;
      const manualKeywords = ["login", "captcha", "otp", "verifikasi", "security", "keamanan manual"];
      const isManualIntervention = manualKeywords.some((kw) => combined.includes(kw));
      if (isManualIntervention) {
        const reason = "Butuh tindakan manual login/captcha/OTP/security di browser.";
        appendQaLog("qa.failed", {
          reason,
          blockerType: "manual_intervention",
          latestApplication: status.latestApplication,
          logFiles: buildLogFiles(config),
        });
        console.log("QA FAILED");
        console.log(`Reason: ${reason}`);
        console.log("Selesaikan login/verifikasi di browser visible, lalu jalankan ulang QA atau klik Lanjutkan Kampanye setelah resume flow siap.");
        console.log(`Campaign log: ${campaignLogRelative}`);
        console.log(`QA log: ${qaLogRelative}`);
        console.log(`MCP log: ${mcpLogRelative}`);
        console.log(`Dev log: ${devLogRelative}`);
        console.log("Send these logs to ChatGPT for analysis.");
        return 1;
      }
    }

    if (status.decisionType === "low_score") {
      await autoResolveLowScore(config, status);
      await sleep(config.pollIntervalMs);
      continue;
    }

    if (status.status === "paused" && status.decisionType === "question_required") {
      const payload = status.decisionPayload || {};
      appendQaLog("qa.failed", {
        reason: "Pertanyaan normal membutuhkan jawaban dari modal aplikasi.",
        latestCampaignStatus: status.status,
        latestJob: status.currentJob?.title || null,
        latestApplication: status.latestApplication?.id || null,
        blocker: status.blocker,
        decisionPayload: payload,
        logFiles: buildLogFiles(config),
      });
      console.log("QA FAILED");
      console.log("Reason: Pertanyaan normal membutuhkan jawaban dari modal aplikasi.");
      console.log(`Campaign log: ${campaignLogRelative}`);
      console.log(`QA log: ${qaLogRelative}`);
      console.log(`MCP log: ${mcpLogRelative}`);
      console.log(`Dev log: ${devLogRelative}`);
      console.log("Send these logs to ChatGPT for analysis.");
      return 1;
    }

    if (status.blocker) {
      appendQaLog("qa.failed", {
        reason: status.blocker.message,
        latestCampaignStatus: status.status,
        latestJob: status.currentJob?.title || null,
        latestApplication: status.latestApplication?.id || null,
        blocker: status.blocker,
        blockerType: status.blockerType || status.blocker?.type || null,
        blockerEvidence: status.blockerEvidence || status.blocker?.evidence || null,
        lastMcpSnapshotPreview: status.lastMcpSnapshotPreview || null,
        logFiles: buildLogFiles(config),
      });
      console.log("QA FAILED");
      if ((status.blockerType || status.blocker?.type) === "manual_intervention_required") {
        const evidence = status.blockerEvidence || status.blocker?.evidence || {};
        console.log("Reason: manual_intervention_required");
        console.log(`Type: ${evidence.type || "unknown"}`);
        console.log(`Evidence: ${JSON.stringify(evidence.evidence || [])}`);
        console.log(`Current URL: ${evidence.currentUrl || "-"}`);
        console.log(`Snapshot preview: ${evidence.snapshotPreview || "-"}`);
      } else if (!status.blockerEvidence) {
        console.log("Reason: state_mismatch_or_unknown_page");
        console.log(`Current URL: ${status.blocker?.evidence?.currentUrl || "-"}`);
        console.log(`Last snapshot preview: ${JSON.stringify(status.lastMcpSnapshotPreview || {})}`);
      } else {
        console.log(`Reason: ${status.blocker.message}`);
      }
      console.log(`Campaign log: ${campaignLogRelative}`);
      console.log(`QA log: ${qaLogRelative}`);
      console.log(`MCP log: ${mcpLogRelative}`);
      console.log(`Dev log: ${devLogRelative}`);
      console.log("Send these logs to ChatGPT for analysis.");
      return 1;
    }

    const currentStatusKey = sameStatusKey(status);
    if (currentStatusKey === previousStatusKey) {
      sameStatusRepeats += 1;
    } else {
      sameStatusRepeats = 0;
      previousStatusKey = currentStatusKey;
      lastProgressAt = Date.now();
    }

    if (sameStatusRepeats >= config.maxSameStatusRepeats) {
      appendQaLog("qa.failed", {
        reason: "Status kampanye berulang tanpa progres terlalu lama.",
        latestCampaignStatus: status.status,
        latestJob: status.currentJob?.title || null,
        latestApplication: status.latestApplication?.id || null,
        logFiles: buildLogFiles(config),
      });
      console.log("QA FAILED");
      console.log("Reason: Status kampanye berulang tanpa progres terlalu lama.");
      console.log(`Campaign log: ${campaignLogRelative}`);
      console.log(`QA log: ${qaLogRelative}`);
      console.log(`MCP log: ${mcpLogRelative}`);
      console.log(`Dev log: ${devLogRelative}`);
      console.log("Send these logs to ChatGPT for analysis.");
      return 1;
    }

    if ((Date.now() - lastProgressAt) / 1000 >= config.maxNoProgressSeconds) {
      appendQaLog("qa.failed", {
        reason: "Tidak ada progres dalam batas waktu QA.",
        latestCampaignStatus: status.status,
        latestJob: status.currentJob?.title || null,
        latestApplication: status.latestApplication?.id || null,
        logFiles: buildLogFiles(config),
      });
      console.log("QA FAILED");
      console.log("Reason: Tidak ada progres dalam batas waktu QA.");
      console.log(`Campaign log: ${campaignLogRelative}`);
      console.log(`QA log: ${qaLogRelative}`);
      console.log(`MCP log: ${mcpLogRelative}`);
      console.log(`Dev log: ${devLogRelative}`);
      console.log("Send these logs to ChatGPT for analysis.");
      return 1;
    }

    await continueCampaign(config);
    await sleep(config.pollIntervalMs);
  }

  appendQaLog("qa.failed", {
    reason: "Timeout QA tercapai.",
    latestCampaignStatus: lastKnownStatus,
    latestJob: lastKnownJob,
    latestApplication: lastKnownApplication,
    logFiles: buildLogFiles(config),
  });
  console.log("QA FAILED");
  console.log("Reason: Timeout QA tercapai.");
  console.log(`Campaign log: ${campaignLogRelative || `storage/logs/campaign-${config.campaignId}.log`}`);
  console.log(`QA log: ${qaLogRelative}`);
  console.log(`MCP log: ${mcpLogRelative}`);
  console.log(`Dev log: ${devLogRelative}`);
  console.log("Send these logs to ChatGPT for analysis.");
  return 1;
}

async function main() {
  ensureDir(logsDir);
  const config = {
    ...parseArgs(process.argv.slice(2)),
    maxSameStatusRepeats: DEFAULTS.maxSameStatusRepeats,
    maxNoProgressSeconds: DEFAULTS.maxNoProgressSeconds,
    pollIntervalMs: DEFAULTS.pollIntervalMs,
    maxMcpRestartAttempts: DEFAULTS.maxMcpRestartAttempts,
  };

  campaignLogRelative = `storage/logs/campaign-${config.campaignId}.log`;
  appendQaLog("process_started", { config, qaLog: qaLogRelative });

  try {
    await ensureChromiumInstalled(config);
    await ensureMcpReady(config);
    await ensureAppReady(config);
    await checkMcpHealth(config);

    // TASK 4 — QA runner harus membaca baseline sebelum apply
    console.log("Membaca baseline Applied Jobs Jobstreet...");
    const baselineResponse = await fetchJson(`${config.appUrl}/api/debug/jobstreet/applied-jobs-count`);
    if (!baselineResponse.ok || baselineResponse.body?.count === null) {
      const reason = baselineResponse.body?.message || "Tidak bisa membaca baseline Applied Jobs Jobstreet.";
      appendQaLog("qa.failed", {
        reason,
        event: "qa.applied_jobs_baseline_failed",
        message: "QA FAILED: Tidak bisa membaca baseline Applied Jobs Jobstreet. Pastikan sudah login di browser MCP.",
      });
      console.log("QA FAILED");
      console.log(`Reason: ${reason}`);
      process.exit(1);
    }

    const appliedJobsBefore = baselineResponse.body.count;
    appendQaLog("qa.applied_jobs_baseline", {
      appliedJobsBefore,
      message: `Total lamaran Jobstreet sebelum QA: ${appliedJobsBefore} lowongan.`,
    });
    console.log(`Total lamaran Jobstreet sebelum QA: ${appliedJobsBefore} lowongan.`);

    config.appliedJobsBefore = appliedJobsBefore;

    await startCampaign(config);
    const exitCode = await runLoop(config);
    process.exit(exitCode);
  } catch (error) {
    const reason = error instanceof Error ? error.message : "QA autopilot gagal dijalankan.";
    appendQaLog("qa.failed", {
      reason,
      latestCampaignStatus: lastKnownStatus,
      latestJob: lastKnownJob,
      latestApplication: lastKnownApplication,
      logFiles: buildLogFiles(config),
    });
    console.log("QA FAILED");
    console.log(`Reason: ${reason}`);
    console.log(`Campaign log: ${campaignLogRelative}`);
    console.log(`QA log: ${qaLogRelative}`);
    console.log(`MCP log: ${mcpLogRelative}`);
    console.log(`Dev log: ${devLogRelative}`);
    console.log("Send these logs to ChatGPT for analysis.");
    process.exit(1);
  }
}

main();
