import type { RadarEmail } from "./email";

const entities: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
const escapeHtml = (value: string) => value.replace(/[&<>"']/g, char => entities[char]);

export function stockEmail(input: { to: string; title: string; description: string; label: string; url: string; origin: string }): RadarEmail {
  const { to, title, description, label, url, origin } = input;
  const manage = new URL("/alerts/manage", origin).href;
  const footer = "Independent service. Not affiliated with product manufacturers or retailers.";
  return {
    to, subject: title,
    text: [title, description, "", "View item: " + url, "", "Manage alerts: " + manage, footer].join("\n"),
    html: `<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;padding:28px"><p style="color:#66754e;font-weight:bold">RESTOCK RADAR</p><h1>${escapeHtml(title)}</h1><p>${escapeHtml(description)}</p><p><a href="${escapeHtml(url)}" style="display:inline-block;background:#c6ef8a;color:#17200c;padding:14px 22px;text-decoration:none;border-radius:8px">View item at ${escapeHtml(label)}</a></p><p><a href="${escapeHtml(manage)}">Manage or pause your alerts</a></p><p style="font-size:12px;color:#666">${footer}</p></div>`,
  };
}
