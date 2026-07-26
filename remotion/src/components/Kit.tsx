import React from "react";
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { C } from "../theme";

export const useIn = (delay = 0, damping = 22) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return spring({ frame: frame - delay, fps, config: { damping, stiffness: 160 } });
};

export const Rise: React.FC<{ delay?: number; y?: number; children: React.ReactNode; style?: React.CSSProperties }> = ({
  delay = 0, y = 44, children, style,
}) => {
  const s = useIn(delay);
  return (
    <div style={{ opacity: s, transform: `translateY(${interpolate(s, [0, 1], [y, 0])}px)`, ...style }}>{children}</div>
  );
};

export const Backdrop: React.FC<{ tone?: number }> = ({ tone = 0 }) => {
  const frame = useCurrentFrame();
  const drift = Math.sin(frame / 90) * 26;
  return (
    <AbsoluteFill style={{ background: `radial-gradient(120% 90% at ${18 + tone * 12}% 8%, #17342C 0%, ${C.bg} 45%, ${C.bgDeep} 100%)` }}>
      <div style={{
        position: "absolute", width: 900, height: 900, borderRadius: "50%",
        left: -260 + drift, top: -280 - drift * 0.6,
        background: `radial-gradient(circle, ${C.greenSoft}22 0%, transparent 62%)`,
      }} />
      <div style={{
        position: "absolute", width: 720, height: 720, borderRadius: "50%",
        right: -200 - drift, bottom: -260 + drift,
        background: `radial-gradient(circle, ${C.clay}1f 0%, transparent 62%)`,
      }} />
      <AbsoluteFill style={{ opacity: 0.05, backgroundImage:
        "linear-gradient(to right, #ffffff 1px, transparent 1px), linear-gradient(to bottom, #ffffff 1px, transparent 1px)",
        backgroundSize: "88px 88px" }} />
    </AbsoluteFill>
  );
};

export const StepTag: React.FC<{ n: string; label: string; delay?: number; font: string }> = ({ n, label, delay = 0, font }) => (
  <Rise delay={delay} y={26}>
    <div style={{ display: "flex", alignItems: "center", gap: 16, fontFamily: font }}>
      <div style={{
        width: 52, height: 52, borderRadius: 16, background: C.clay, color: C.cream,
        display: "flex", alignItems: "center", justifyContent: "center", fontSize: 26, fontWeight: 700,
      }}>{n}</div>
      <div style={{ color: C.creamDim, fontSize: 24, letterSpacing: 4, textTransform: "uppercase" }}>{label}</div>
    </div>
  </Rise>
);

export const Panel: React.FC<{ delay?: number; children: React.ReactNode; style?: React.CSSProperties }> = ({ delay = 0, children, style }) => {
  const s = useIn(delay, 26);
  return (
    <div style={{
      opacity: s,
      transform: `translateY(${interpolate(s, [0, 1], [50, 0])}px) scale(${interpolate(s, [0, 1], [0.96, 1])})`,
      background: "#0B1A16EE", border: `1px solid ${C.greenSoft}44`, borderRadius: 26,
      boxShadow: "0 40px 90px rgba(0,0,0,0.45)", padding: 34, ...style,
    }}>{children}</div>
  );
};

export const Cursor: React.FC<{ from: [number, number]; to: [number, number]; start: number; click?: number }> = ({ from, to, start, click }) => {
  const frame = useCurrentFrame();
  const t = interpolate(frame, [start, start + 26], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
  const x = interpolate(e, [0, 1], [from[0], to[0]]);
  const y = interpolate(e, [0, 1], [from[1], to[1]]);
  const c = click ?? start + 30;
  const pulse = interpolate(frame, [c, c + 18], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <div style={{ position: "absolute", left: x, top: y, opacity: interpolate(frame, [start - 8, start], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }) }}>
      {frame >= c && (
        <div style={{
          position: "absolute", left: -34, top: -34, width: 68, height: 68, borderRadius: "50%",
          border: `3px solid ${C.clay}`, opacity: 1 - pulse, transform: `scale(${0.4 + pulse * 1.3})`,
        }} />
      )}
      <svg width="34" height="34" viewBox="0 0 24 24" style={{ filter: "drop-shadow(0 6px 12px rgba(0,0,0,.6))" }}>
        <path d="M4 2 L4 20 L9 15.5 L12.5 22 L15.5 20.5 L12 14.5 L19 14 Z" fill={C.cream} stroke={C.ink} strokeWidth="1.2" />
      </svg>
    </div>
  );
};
