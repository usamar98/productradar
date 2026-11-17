import { ImageResponse } from "next/og";

export const alt = "Restock Radar — Free stock checks, retailer history and restock alerts";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    <div style={{ display: "flex", width: "100%", height: "100%", background: "#f7f3fb", color: "#302439", padding: "66px 72px", position: "relative", overflow: "hidden", fontFamily: "sans-serif" }}>
      <div style={{ display: "flex", flexDirection: "column", width: 765 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14, fontSize: 27, fontWeight: 700, color: "#806091", letterSpacing: 2 }}>
          <div style={{ display: "flex", width: 24, height: 24, borderRadius: 24, background: "#a97cba", border: "6px solid #e8d7ef" }} />
          RESTOCK RADAR
        </div>
        <div style={{ display: "flex", flexDirection: "column", marginTop: 72, fontSize: 80, fontWeight: 700, lineHeight: 1.08, letterSpacing: -3 }}>
          <span>Good things.</span>
          <span style={{ color: "#9871ab" }}>Back on your radar.</span>
        </div>
        <div style={{ display: "flex", marginTop: 38, fontSize: 27, color: "#75657e" }}>Free stock checks. Retailer history. Alerts.</div>
      </div>
      <div style={{ display: "flex", position: "absolute", right: -125, top: 103, width: 460, height: 460, borderRadius: 460, border: "2px solid #d9c5e4", alignItems: "center", justifyContent: "center" }}>
        <div style={{ display: "flex", width: 335, height: 335, borderRadius: 335, border: "2px solid #d9c5e4", alignItems: "center", justifyContent: "center" }}>
          <div style={{ display: "flex", width: 205, height: 205, borderRadius: 205, border: "2px solid #d9c5e4", alignItems: "center", justifyContent: "center" }}>
            <div style={{ display: "flex", width: 30, height: 30, borderRadius: 30, background: "#a97cba" }} />
          </div>
        </div>
        <div style={{ display: "flex", width: 21, height: 21, borderRadius: 21, background: "#a97cba", position: "absolute", left: 82, top: 98 }} />
      </div>
      <div style={{ display: "flex", position: "absolute", bottom: 42, left: 72, fontSize: 18, color: "#8d7d96" }}>Your next great find starts here.</div>
    </div>,
    { ...size },
  );
}
