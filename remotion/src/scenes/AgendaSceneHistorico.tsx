import { useCurrentFrame, useVideoConfig, spring, interpolate } from "remotion";
import { Frame, Cursor } from "../components/Frame";
import { C, dm } from "../theme";

const ITEMS = [
  { d: "12/05/2025", p: "Consulta Cardiológica", m: "Dr. Roberto", v: "R$ 250,00", st: "Realizado" },
  { d: "28/03/2025", p: "Eletrocardiograma",     m: "Dr. Roberto", v: "R$ 180,00", st: "Realizado" },
  { d: "14/02/2025", p: "Ecocardiograma",        m: "Dra. Ana",    v: "R$ 380,00", st: "Realizado" },
  { d: "10/01/2025", p: "Consulta Cardiológica", m: "Dr. Roberto", v: "R$ 250,00", st: "Faltou"    },
];

export const AgendaSceneHistorico: React.FC = () => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame: f, fps, config: { damping: 18 } });
  const openPanel = f > 18;
  const panelS = spring({ frame: f - 18, fps, config: { damping: 16 } });

  const cx = interpolate(f, [0, 22, 50], [1500, 700, 700], { extrapolateRight: "clamp" });
  const cy = interpolate(f, [0, 22, 50], [800, 360, 360], { extrapolateRight: "clamp" });

  return (
    <Frame title="Agendas" step="Histórico do paciente">
      <div style={{ background: "#fff", border: `1px solid ${C.line}`, borderRadius: 16, padding: 20, opacity: s }}>
        <div style={{ display: "grid", gridTemplateColumns: "100px 1fr 200px", padding: "14px 12px", alignItems: "center", borderRadius: 10, background: "rgba(29,78,216,.07)" }}>
          <div style={{ fontSize: 22, fontWeight: 700, fontFamily: dm, color: C.primary }}>09:00</div>
          <div style={{ fontSize: 21, color: C.ink, fontWeight: 600, textDecoration: "underline", textDecorationColor: C.primary }}>Maria Souza</div>
          <div style={{ fontSize: 16, color: C.accent, fontWeight: 700, fontFamily: dm }}>Pago</div>
        </div>
      </div>

      {openPanel && (
        <div style={{
          position: "absolute", right: 80, top: 220,
          transform: `translateX(${(1 - panelS) * 40}px)`,
          opacity: panelS,
          width: 760, background: "#fff", borderRadius: 20, padding: 28,
          border: `1px solid ${C.line}`, boxShadow: "0 30px 80px rgba(0,0,0,.18)", zIndex: 10,
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
            <div style={{ fontSize: 26, fontWeight: 800, fontFamily: dm }}>Maria Souza</div>
            <div style={{ fontSize: 15, color: C.sub }}>34 anos · CPF 123.456.789-00</div>
          </div>
          <div style={{ fontSize: 18, color: C.sub, marginBottom: 18, fontFamily: dm }}>Histórico de atendimentos</div>

          <div style={{ position: "relative", paddingLeft: 24 }}>
            <div style={{ position: "absolute", left: 8, top: 6, bottom: 6, width: 2, background: C.line }} />
            {ITEMS.map((it, i) => {
              const itemS = spring({ frame: f - (30 + i * 10), fps, config: { damping: 18 } });
              return (
                <div key={i} style={{ position: "relative", marginBottom: 14, opacity: itemS, transform: `translateY(${(1 - itemS) * 8}px)` }}>
                  <div style={{ position: "absolute", left: -22, top: 14, width: 14, height: 14, borderRadius: 999, background: it.st === "Faltou" ? "#ef4444" : C.accent, border: "3px solid #fff", boxShadow: `0 0 0 2px ${it.st === "Faltou" ? "#ef4444" : C.accent}` }} />
                  <div style={{ background: C.cream, borderRadius: 12, padding: "12px 16px", display: "grid", gridTemplateColumns: "110px 1fr 160px 100px", alignItems: "center", gap: 10 }}>
                    <div style={{ fontSize: 16, color: C.sub, fontFamily: dm, fontWeight: 600 }}>{it.d}</div>
                    <div>
                      <div style={{ fontSize: 18, color: C.ink, fontWeight: 600 }}>{it.p}</div>
                      <div style={{ fontSize: 14, color: C.sub }}>{it.m}</div>
                    </div>
                    <div style={{ fontSize: 17, fontFamily: dm, fontWeight: 700, color: C.ink }}>{it.v}</div>
                    <div style={{
                      fontSize: 13, fontWeight: 700, fontFamily: dm, textAlign: "center",
                      padding: "5px 10px", borderRadius: 999,
                      background: it.st === "Faltou" ? "rgba(239,68,68,.15)" : "rgba(16,185,129,.18)",
                      color: it.st === "Faltou" ? "#dc2626" : C.accent,
                    }}>{it.st}</div>
                  </div>
                </div>
              );
            })}
          </div>

          <div style={{ marginTop: 6, display: "flex", justifyContent: "space-between", padding: "12px 4px", borderTop: `1px solid ${C.line}`, fontSize: 18, fontFamily: dm }}>
            <span style={{ color: C.sub }}>Total pago em 2025</span>
            <span style={{ fontWeight: 800, color: C.primary }}>R$ 810,00</span>
          </div>
        </div>
      )}

      <Cursor x={cx} y={cy} />
    </Frame>
  );
};