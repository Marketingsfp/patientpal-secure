import { useCurrentFrame, spring, useVideoConfig, interpolate } from "remotion";
import { Frame, Cursor } from "../components/Frame";
import { C, dm } from "../theme";

const RECURSOS = [
  { n: "Curativo", d: "15 min" },
  { n: "Inalação", d: "20 min" },
  { n: "Aferição de PA", d: "10 min" },
  { n: "Aplicação de Injeção", d: "10 min" },
];

export const SceneEnfRecursos: React.FC = () => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const cx = interpolate(f, [0, 40], [1200, 360], { extrapolateRight: "clamp" });
  const cy = interpolate(f, [0, 40], [700, 320], { extrapolateRight: "clamp" });
  return (
    <Frame title="Enfermagem — Recursos" step="Passo 1 — Cadastrar recursos">
      <div style={{ fontSize: 24, color: C.sub, marginBottom: 20, fontFamily: dm }}>
        Cadastre os serviços de enfermagem (cada um vira uma "coluna" na agenda)
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18 }}>
        {RECURSOS.map((r, i) => {
          const s = spring({ frame: f - 20 - i * 8, fps, config: { damping: 18 } });
          const active = i === 0;
          return (
            <div key={i} style={{
              background: "#fff", border: `1px solid ${active ? C.primary : C.line}`,
              borderRadius: 16, padding: 22, opacity: s, transform: `translateY(${(1 - s) * 16}px)`,
              boxShadow: active ? "0 10px 30px rgba(29,78,216,.18)" : "none",
              display: "flex", alignItems: "center", gap: 16,
            }}>
              <div style={{
                width: 54, height: 54, borderRadius: 12,
                background: active ? C.primarySoft : "#EEF1F7",
                color: C.primary, display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 28,
              }}>+</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 26, fontWeight: 600, fontFamily: dm }}>{r.n}</div>
                <div style={{ fontSize: 18, color: C.sub, marginTop: 2 }}>Duração padrão: {r.d}</div>
              </div>
              <div style={{
                fontSize: 14, color: C.accent, fontWeight: 600, fontFamily: dm,
                padding: "6px 12px", border: `1px solid ${C.accent}`, borderRadius: 999,
              }}>ATIVO</div>
            </div>
          );
        })}
      </div>
      <Cursor x={cx} y={cy} />
    </Frame>
  );
};