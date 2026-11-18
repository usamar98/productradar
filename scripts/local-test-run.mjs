import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { createRequire } from "node:module";
import { parse } from "dotenv";
import { tsImport } from "tsx/esm/api";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const envPath = resolve(root, ".env.local-test");
const args = process.argv.slice(2);
if (args.some(arg => !["--worker", "--web"].includes(arg)) || (args.includes("--worker") && args.includes("--web"))) throw new Error("Use no option for web + worker, --web for web only, or --worker for worker only.");
let lab;
try { lab = parse(await readFile(envPath)); }
catch { throw new Error("Create .env.local-test before starting the isolated lab."); }
// Empty documented app variables prevent Next's normal .env fallback from borrowing credentials.
const example = parse(await readFile(resolve(root, ".env.example")));
const env = { ...process.env };
for (const key of new Set([...Object.keys(example), ...Object.keys(env).filter(key => /^(RADAR_|STRIPE_|RESEND_|EMAIL_|VAPID_|NEXT_PUBLIC_)/.test(key))])) env[key] = "";
Object.assign(env, lab, { NEXT_DIST_DIR: ".next-local-test", DOTENV_CONFIG_PATH: envPath, DOTENV_CONFIG_OVERRIDE: "true", DOTENV_CONFIG_QUIET: "true" });
Object.assign(process.env, env);
const { isLocalTestMode } = await tsImport("../src/lib/radar/local-test.ts", import.meta.url);
if (!isLocalTestMode()) throw new Error("Refusing to start: .env.local-test must select development mode, a loopback APP_URL and a separate _local_test database.");
const app = new URL(env.APP_URL);
if (app.protocol !== "http:" || !["localhost", "127.0.0.1"].includes(app.hostname) || app.port !== "3001" || app.pathname !== "/" || app.search || app.hash) throw new Error("The local lab APP_URL must be http://127.0.0.1:3001 or http://localhost:3001.");
if (env.RADAR_LOCAL_MAILBOX !== "true") throw new Error("The local lab requires RADAR_LOCAL_MAILBOX=true so synthetic stock notifications stay in the local mailbox.");

const require = createRequire(import.meta.url);
const children = [];
let stopping = false;
let finish;
const finished = new Promise(resolveFinished => { finish = resolveFinished; });

async function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  await Promise.all(children.map(child => new Promise(resolveStopped => {
    if (child.exitCode !== null || !child.pid) { resolveStopped(); return; }
    if (process.platform === "win32") {
      // Terminate only the exact process tree this runner created, including Next's dev child.
      const killer = spawn("taskkill.exe", ["/PID", String(child.pid), "/T", "/F"], { windowsHide: true, stdio: "ignore" });
      killer.once("error", () => { child.kill(); resolveStopped(); });
      killer.once("exit", () => resolveStopped());
    } else {
      child.once("exit", () => resolveStopped());
      child.kill("SIGTERM");
      const timeout = setTimeout(() => { child.kill("SIGKILL"); resolveStopped(); }, 5000);
      timeout.unref();
    }
  })));
  process.exitCode = code;
  finish();
}

function start(name, commandArgs) {
  const child = spawn(process.execPath, commandArgs, { cwd: root, env, windowsHide: true, stdio: "inherit" });
  children.push(child);
  child.once("error", () => { console.error(`${name} could not start.`); void stop(1); });
  child.once("exit", code => { if (!stopping) { console.log(`${name} stopped.`); void stop(code || 0); } });
}

process.once("SIGINT", () => { void stop(); });
process.once("SIGTERM", () => { void stop(); });
if (!args.includes("--worker")) start("Local lab web", [require.resolve("next/dist/bin/next"), "dev", "--webpack", "--hostname", "127.0.0.1", "--port", "3001"]);
if (!args.includes("--web")) start("Local lab worker", ["--import", "tsx", resolve(root, "worker/index.ts")]);
console.log(`LOCAL TEST lab: ${args.includes("--worker") ? "worker only" : app.origin}. Synthetic stock and captured local mail; Stripe remains in test mode.`);
await finished;
