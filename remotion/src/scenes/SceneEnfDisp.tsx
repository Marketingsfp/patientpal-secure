import { useCurrentFrame, spring, useVideoConfig, interpolate } from "remotion";
import { Frame, Cursor } from "../components/Frame";
import { C, dm } from "../theme";

const DIAS = ["Seg", "Ter", "Qua", "Qui", "Sex"];

export const SceneEnfDisp: React.FC = () => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const cx = interpolate(f, [0, 35, 80], [1200, 720, 1100], { extrapolateRight: "clamp" });
  const cy = interpolate(f, [0, 35, 80], [700, 360, 520], { extrapolateRight: "clamp" });
  return (
    <Frame title="Disponibilidades" step="Passo 2 — Definir horários">
      <div style={{ fontSize: 24, color: C.sub, marginBottom: 20, fontFamily: dm }}>
        Defina os dias e horários em que o recurso "Curativo" atende
      </div>
      <div
        style={{ background: "#fff", borderRadius: 16, padding: 24, border: `1px solid ${C.line}` }}
      >
        <div
          style={{
            display: "flex",
            gap: 12,
            alignItems: "center",
            marginBottom: 16,
            flexWrap: "wrap",
          }}
        >
          <span style={{ fontSize: 20, color: C.sub }}>Recurso:</span>
          <span
            style={{
              background: C.primarySoft,
              color: C.primary,
              fontWeight: 600,
              padding: "8px 14px",
              borderRadius: 10,
              fontSize: 20,
            }}
          >
            Curativo
          </span>
        </div>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 20, fontFamily: dm }}>
          <thead>
            <tr style={{ color: C.sub, textAlign: "left" }}>
              <th style={{ padding: "10px 12px" }}>Dia</th>
              <th style={{ padding: "10px 12px" }}>Início</th>
              <th style={{ padding: "10px 12px" }}>Fim</th>
              <th style={{ padding: "10px 12px" }}>Pacientes/dia</th>
              <th style={{ padding: "10px 12px" }}>Intervalo</th>
            </tr>
          </thead>
          <tbody>
            {DIAS.map((d, i) => {
              const s = spring({ frame: f - 30 - i * 6, fps, config: { damping: 18 } });
              return (
                <tr
                  key={d}
                  style={{
                    borderTop: `1px solid ${C.line}`,
                    opacity: s,
                    transform: `translateY(${(1 - s) * 8}px)`,
                  }}
                >
                  <td style={{ padding: "12px", fontWeight: 600 }}>{d}</td>
                  <td style={{ padding: "12px" }}>08:00</td>
                  <td style={{ padding: "12px" }}>12:00</td>
                  <td style={{ padding: "12px" }}>16</td>
                  <td style={{ padding: "12px" }}>15 min</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <Cursor x={cx} y={cy} />
    </Frame>
  );
};
