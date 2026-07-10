import { AbsoluteFill, useCurrentFrame, useVideoConfig, spring, interpolate } from "remotion";
import { C, dm, inter } from "../theme";

export const SceneFinal: React.FC = () => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame: f, fps, config: { damping: 14 } });
  const s2 = spring({ frame: f - 18, fps, config: { damping: 18 } });
  const ring = interpolate(f, [0, 50], [0, 1], { extrapolateRight: "clamp" });

  return (
    <AbsoluteFill style={{ display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 26 }}>
      <div style={{ position: "relative", width: 180, height: 180, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <svg width="180" height="180" viewBox="0 0 100 100" style={{ transform: "rotate(-90deg)", position: "absolute" }}>
          <circle cx="50" cy="50" r="46" stroke="rgba(255,255,255,.1)" strokeWidth="4" fill="none" />
          <circle cx="50" cy="50" r="46" stroke={C.accent} strokeWidth="4" fill="none" strokeDasharray={`${ring * 289} 289`} strokeLinecap="round" />
        </svg>
        <div style={{ width: 120 * s, height: 120 * s, borderRadius: 999, background: C.accent, display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 20px 60px rgba(16,185,129,.5)" }}>
          <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3"><path d="M5 12l5 5L20 7"/></svg>
        </div>
      </div>
      <div style={{ textAlign: "center", opacity: s2, transform: `translateY(${(1 - s2) * 16}px)` }}>
        <div style={{ color: "#fff", fontSize: 64, fontWeight: 700, fontFamily: dm, letterSpacing: -1 }}>Atendimento concluído</div>
        <div style={{ color: "rgba(255,255,255,.7)", fontSize: 28, marginTop: 12, fontFamily: inter }}>
          Do agendamento ao pagamento em poucos cliques
        </div>
      </div>
      <div style={{ marginTop: 18, color: C.accent, fontSize: 26, fontWeight: 700, fontFamily: dm, opacity: s2 }}>
        ClinicaOS
      </div>
    </AbsoluteFill>
  );
};