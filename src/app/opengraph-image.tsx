import { ImageResponse } from "next/og";

export const alt = "Restock Radar — stock checks and alerts for Apple, PlayStation, and NVIDIA";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", width: "100%", height: "100%", background: "#fff", color: "#171717", fontFamily: "sans-serif" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 13, position: "absolute", top: 42, left: 56, fontSize: 28, fontWeight: 700 }}>
        <svg width="36" height="36" viewBox="0 0 48 48">
          <rect width="48" height="48" rx="12" fill="#171717" />
          <g fill="none" stroke="#fff" strokeWidth="2.5">
            <circle cx="24" cy="24" r="14" /><circle cx="24" cy="24" r="8" /><path d="M24 24L35 13" />
          </g>
        </svg>
        Restock Radar
      </div>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", fontSize: 86, fontWeight: 700, lineHeight: 1.04, letterSpacing: -5 }}>
        <span>Find your next upgrade</span>
        <span>while it’s in stock.</span>
      </div>
      <div style={{ display: "flex", marginTop: 34, color: "#555", fontSize: 29 }}>Stock checks and restock alerts for Apple, PlayStation, and NVIDIA.</div>
    </div>,
    size,
  );
}
