import React from "react";
import { AbsoluteFill, useCurrentFrame, spring, useVideoConfig } from "remotion";
import { C, dm } from "../theme";

export const Frame: React.FC<{ title: string; step: string; children: React.ReactNode }> = ({ title, step, children }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame: f, fps, config: { damping: 200 } });
  return (
    <AbsoluteFill style={{ padding: 80, opacity: s }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 36 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div style={{ width: 44, height: 44, borderRadius: 12, background: C.accent, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 700, fontFamily: dm }}>+</div>
          <div style={{ color: "#fff", fontSize: 28, fontWeight: 600, fontFamily: dm }}>ClinicaOS</div>
          <div style={{ color: "rgba(255,255,255,.5)", fontSize: 20, marginLeft: 12 }}>/ {title}</div>
        </div>
        <div style={{ color: "rgba(255,255,255,.7)", fontSize: 22, fontWeight: 500, padding: "10px 18px", border: "1px solid rgba(255,255,255,.15)", borderRadius: 999 }}>
          {step}
        </div>
      </div>
      <div style={{ background: C.cream, borderRadius: 28, padding: 48, flex: 1, boxShadow: "0 30px 80px rgba(0,0,0,.35)", color: C.ink, position: "relative", overflow: "hidden" }}>
        {children}
      </div>
    </AbsoluteFill>
  );
};

export const Cursor: React.FC<{ x: number; y: number; opacity?: number }> = ({ x, y, opacity = 1 }) => (
  <div style={{ position: "absolute", left: x, top: y, opacity, transition: "none", pointerEvents: "none", zIndex: 50 }}>
    <svg width="36" height="36" viewBox="0 0 24 24" fill="none">
      <path d="M3 2l7 18 2.5-7.5L20 10z" fill="#0B1220" stroke="#fff" strokeWidth="1.5" />
    </svg>
  </div>
);