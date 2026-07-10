import { useCurrentFrame, spring, useVideoConfig, interpolate } from "remotion";
import { Frame, Cursor } from "../components/Frame";
import { C, dm } from "../theme";

export const SceneEnfGerar: React.FC = () => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const click = f > 55;
  const btnScale = click ? 0.96 : 1;
  const toastSpring = spring({ frame: f - 70, fps, config: { damping: 14 } });
  const total = Math.floor(interpolate(f, [80, 110], [0, 320], { extrapolateRight: "clamp" }));
  const cx = interpolate(f, [0, 50, 60], [1200, 1180, 1180], { extrapolateRight: "clamp" });
  const cy = interpolate(f, [0, 50, 60], [700, 440, 440], { extrapolateRight: "clamp" });
  return (
    <Frame title="Disponibilidades" step="Passo 3 — Gerar agenda">
      <div style={{ fontSize: 24, color: C.sub, marginBottom: 20, fontFamily: dm }}>
        O sistema cria automaticamente as fichas "DISPONÍVEL" no período escolhido
      </div>
      <div style={{ background: "#fff", border: `1px solid ${C.primary}`, borderRadius: 16, padding: 28 }}>
        <div style={{ fontSize: 22, fontWeight: 600, fontFamily: dm, marginBottom: 18, display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ color: C.primary }}>▦</span> Gerar agenda — Enfermagem
        </div>
        <div style={{ display: "flex", gap: 14, flexWrap: "wrap", alignItems: "flex-end" }}>
          <Field label="Recurso" value="Curativo" w={200} />
          <Field label="De" value="01/06/2026" w={160} />
          <Field label="Até" value="30/06/2026" w={160} />
          <Field label="Nº de fichas" value="16" w={140} />
          <div style={{
            background: C.primary, color: "#fff", padding: "14px 22px", borderRadius: 12,
            fontSize: 20, fontWeight: 600, fontFamily: dm,
            transform: `scale(${btnScale})`, transition: "none",
            boxShadow: click ? "0 0 0 6px rgba(29,78,216,.25)" : "0 4px 12px rgba(29,78,216,.3)",
          }}>
            Gerar 320 slots
          </div>
        </div>
      </div>
      {f > 70 && (
        <div style={{
          marginTop: 28, background: "#10b981", color: "#fff", padding: "16px 22px",
          borderRadius: 12, fontSize: 22, fontWeight: 600, fontFamily: dm,
          opacity: toastSpring, transform: `translateY(${(1 - toastSpring) * 12}px)`,
          display: "inline-flex", alignItems: "center", gap: 12,
        }}>
          ✓ {total} horários criados na agenda
        </div>
      )}
      <Cursor x={cx} y={cy} />
    </Frame>
  );
};

const Field: React.FC<{ label: string; value: string; w: number }> = ({ label, value, w }) => (
  <div style={{ width: w }}>
    <div style={{ fontSize: 14, color: C.sub, marginBottom: 4 }}>{label}</div>
    <div style={{ background: "#F2F4F9", border: `1px solid ${C.line}`, borderRadius: 10, padding: "12px 14px", fontSize: 18, fontFamily: dm }}>{value}</div>
  </div>
);