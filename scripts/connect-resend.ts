import "dotenv/config";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { createServer } from "node:http";
import { once } from "node:events";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { connectLocalSender, localSenderConnected, localSenderEnabled } from "../src/lib/radar/resend-local";

const includeTest = process.argv.includes("--test");
async function ownerTest() {
  const { stdout } = await promisify(execFile)(process.execPath, ["--import", "tsx", join(process.cwd(), "scripts", "test-resend.ts")], { windowsHide: true, timeout: 60_000 });
  console.log(stdout.trim());
}
if (!localSenderEnabled()) throw new Error("Use the main loopback app with RADAR_RESEND_LOCAL_OAUTH=true, RADAR_LOCAL_MAILBOX=false and a secure RADAR_AUTH_SECRET.");
if (process.env.RESEND_API_KEY || (localSenderConnected() && !process.argv.includes("--reconnect"))) {
  if (includeTest) await ownerTest();
  else console.log("A Resend sender is already configured. Run npm run email:test for the owner delivery test.");
  process.exit(0);
}
const directory = join(process.cwd(), ".local");
const clientFile = join(directory, "resend-client.json");
const registered = z.object({ client_id: z.uuid() });
async function clientId() {
  try { return registered.parse(JSON.parse(await readFile(clientFile, "utf8"))).client_id; }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw new Error("The saved Resend client registration could not be read."); }
  const response = await fetch("https://api.resend.com/oauth/register", {
    method: "POST", headers: { "Content-Type": "application/json" }, redirect: "error", signal: AbortSignal.timeout(15_000),
    body: JSON.stringify({ client_name: "Restock Radar local email", redirect_uris: ["http://127.0.0.1/oauth/callback"],
      token_endpoint_auth_method: "none", grant_types: ["authorization_code", "refresh_token"], response_types: ["code"], scope: "emails:send" }),
  });
  if (!response.ok) throw new Error("Resend client registration returned HTTP " + response.status);
  const client = registered.parse(await response.json());
  await mkdir(directory, { recursive: true, mode: 0o700 });
  try { await writeFile(clientFile, JSON.stringify(client), { mode: 0o600, flag: "wx" }); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    return registered.parse(JSON.parse(await readFile(clientFile, "utf8"))).client_id;
  }
  return client.client_id;
}

const id = await clientId();
let handshake: { state: string; verifier: string; expiresAt: number } | undefined;
let settled = false;
const server = createServer();
server.listen(includeTest ? 3424 : 0, "127.0.0.1");
await once(server, "listening");
const address = server.address();
if (!address || typeof address === "string") throw new Error("Could not bind a loopback callback.");
const host = "127.0.0.1:" + address.port, origin = "http://" + host;
const redirect = origin + "/oauth/callback";
const timeout = includeTest ? null : setTimeout(() => {
  console.error("Resend authorization expired. Run npm run email:connect to open a new session.");
  process.exitCode = 1; server.close();
}, 30 * 60_000);

server.on("request", async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'");
  if (req.method !== "GET" || req.headers.host !== host || req.socket.remoteAddress !== "127.0.0.1") { res.writeHead(404).end(); return; }
  const location = new URL(req.url || "/", origin);
  if (location.pathname === "/connect" && !settled) {
    if (!handshake || Date.now() >= handshake.expiresAt) handshake = { state: randomBytes(32).toString("base64url"),
      verifier: randomBytes(48).toString("base64url"), expiresAt: Date.now() + 30 * 60_000 };
    const authorize = new URL("https://api.resend.com/oauth/authorize");
    authorize.search = new URLSearchParams({ client_id: id, response_type: "code", redirect_uri: redirect, scope: "emails:send",
      state: handshake.state, code_challenge: createHash("sha256").update(handshake.verifier).digest("base64url"), code_challenge_method: "S256" }).toString();
    res.writeHead(302, { Location: authorize.href }).end(); return;
  }
  if (location.pathname !== "/oauth/callback" || settled) { res.writeHead(404).end(); return; }
  const returned = Buffer.from(location.searchParams.get("state") || "");
  if (!handshake || Date.now() >= handshake.expiresAt || returned.length !== handshake.state.length || !timingSafeEqual(returned, Buffer.from(handshake.state))) {
    res.writeHead(400).end("Authorization expired or could not be matched. Reopen the local /connect link."); return;
  }
  const code = location.searchParams.get("code");
  if (!code || location.searchParams.has("error")) { res.writeHead(400).end("Authorization was declined. You can return to the local connection link to try again."); return; }
  settled = true;
  try {
    await connectLocalSender(id, code, handshake.verifier, redirect);
    console.log("Resend connected with emails:send permission.");
    if (includeTest) {
      try { await ownerTest(); }
      catch { console.error("Connected to Resend, but the email test failed.");
        res.writeHead(502).end("Resend is connected. The delivery test failed. Run npm run email:test for the provider result."); process.exitCode = 1; return; }
    }
    res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" }).end(includeTest ? "Resend accepted your delivery test. Check the inbox for your Resend account email." : "Resend is connected to Restock Radar. You may close this tab.");
  } catch (error) {
    console.error(error instanceof Error && error.message.startsWith("Resend ") ? error.message : "The local app could not save the send-only grant.");
    res.writeHead(502).end("Connection failed. Return to Restock Radar for the next step."); process.exitCode = 1;
  } finally { if (timeout) clearTimeout(timeout); server.close(); }
});
console.log("Open " + origin + "/connect in the browser where you use Resend.");
await once(server, "close");
const { prisma } = await import("../src/lib/db");
await prisma.$disconnect();
