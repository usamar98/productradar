import { HttpError } from "@/lib/security";

function localOrigin(): URL | null {
  try {
    if (!process.env.APP_URL) return null;
    const url = new URL(process.env.APP_URL);
    return ["http:", "https:"].includes(url.protocol) && !url.username && !url.password && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) ? url : null;
  } catch { return null; }
}

export function isLocalMailboxEnabled(): boolean {
  return process.env.NODE_ENV === "development" && process.env.RADAR_LOCAL_MAILBOX === "true" && localOrigin() !== null;
}

/** Host is deliberately not read from proxy headers: this is a loopback tool. */
export function assertLocalRequest(request: Pick<Request, "headers">): void {
  const origin = localOrigin();
  if (!isLocalMailboxEnabled() || !origin || request.headers.get("host") !== origin.host ||
    (request.headers.has("origin") && request.headers.get("origin") !== origin.origin)) {
    throw new HttpError(404, "Not found.");
  }
}
