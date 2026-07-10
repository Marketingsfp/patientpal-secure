import React from "react";
import {
  AbsoluteFill,
  useCurrentFrame,
  useVideoConfig,
  interpolate,
  spring,
  Sequence,
} from "remotion";
import { loadFont as loadManrope } from "@remotion/google-fonts/Manrope";
import { loadFont as loadInter } from "@remotion/google-fonts/Inter";

export const manrope = loadManrope("normal", { weights: ["400", "700", "800"] });
export const inter = loadInter("normal", { weights: ["400", "500", "600"] });

import { theme } from "./theme";

export const Bg: React.FC = () => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  return (
    <AbsoluteFill
      style={{
        background: `radial-gradient(1200px 800px at 30% 20%, ${theme.bgSoft}, ${theme.bg})`,
      }}
    >
      {/* soft drifting blobs */}
      {[0, 1, 2, 3].map((i) => {
        const t = frame / 60 + i;
        const x = 200 + i * 380 + Math.sin(t) * 80;
        const y = 200 + ((i * 220) % (height - 300)) + Math.cos(t * 0.7) * 60;
        const size = 360 + i * 40;
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: x - size / 2,
              top: y - size / 2,
              width: size,
              height: size,
              borderRadius: "50%",
              background:
                i % 2
                  ? `radial-gradient(closest-side, ${theme.primaryGlow}22, transparent 70%)`
                  : `radial-gradient(closest-side, ${theme.accent}1a, transparent 70%)`,
              filter: "blur(8px)",
            }}
          />
        );
      })}
      {/* grain dots */}
      <svg width={width} height={height} style={{ position: "absolute", opacity: 0.05 }}>
        <defs>
          <pattern id="dots" width="28" height="28" patternUnits="userSpaceOnUse">
            <circle cx="2" cy="2" r="1" fill={theme.cream} />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#dots)" />
      </svg>
    </AbsoluteFill>
  );
};

export const TitleWord: React.FC<{
  text: string;
  delay?: number;
  size?: number;
  color?: string;
  weight?: number;
}> = ({ text, delay = 0, size = 140, color = theme.cream, weight = 800 }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return (
    <div style={{ display: "flex", gap: size * 0.04, flexWrap: "wrap" }}>
      {text.split("").map((ch, i) => {
        const s = spring({
          frame: frame - delay - i * 2,
          fps,
          config: { damping: 14, stiffness: 140 },
        });
        const y = interpolate(s, [0, 1], [60, 0]);
        const op = interpolate(s, [0, 1], [0, 1]);
        return (
          <span
            key={i}
            style={{
              fontFamily: manrope.fontFamily,
              fontWeight: weight,
              fontSize: size,
              lineHeight: 1,
              color,
              display: "inline-block",
              transform: `translateY(${y}px)`,
              opacity: op,
              letterSpacing: -2,
            }}
          >
            {ch === " " ? "\u00A0" : ch}
          </span>
        );
      })}
    </div>
  );
};

export const Chip: React.FC<{
  children: React.ReactNode;
  delay?: number;
  color?: string;
  bg?: string;
  icon?: React.ReactNode;
}> = ({ children, delay = 0, color = theme.ink, bg = theme.cream, icon }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame: frame - delay, fps, config: { damping: 12 } });
  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 12,
        padding: "16px 26px",
        borderRadius: 999,
        background: bg,
        color,
        fontFamily: inter.fontFamily,
        fontWeight: 600,
        fontSize: 30,
        transform: `scale(${interpolate(s, [0, 1], [0.7, 1])})`,
        opacity: s,
        boxShadow: "0 12px 40px rgba(0,0,0,0.25)",
      }}
    >
      {icon}
      {children}
    </div>
  );
};

export const FadeSlide: React.FC<{
  delay?: number;
  from?: "up" | "down" | "left" | "right";
  distance?: number;
  children: React.ReactNode;
}> = ({ delay = 0, from = "up", distance = 40, children }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame: frame - delay, fps, config: { damping: 18 } });
  const op = interpolate(s, [0, 1], [0, 1]);
  const off = interpolate(s, [0, 1], [distance, 0]);
  const tr =
    from === "up"
      ? `translateY(${off}px)`
      : from === "down"
        ? `translateY(${-off}px)`
        : from === "left"
          ? `translateX(${off}px)`
          : `translateX(${-off}px)`;
  return <div style={{ opacity: op, transform: tr }}>{children}</div>;
};

export { Sequence };
