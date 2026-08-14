import { useCurrentFrame, useVideoConfig, spring, interpolate } from "remotion";
import { Frame } from "../components/Frame";
import { C, dm } from "../theme";

const cols = [
  { id: "rec", l: "Recepção", c: "#fee2e2", t: "#9f1239" },
  { id: "cax", l: "Caixa (pago)", c: "#fef3c7", t: "#92400e" },
  { id: "tri", l: "Triagem", c: "#d1fae5", t: "#065f46" },
  { id: "ate", l: "Atendimento", c: "#dbeafe", t: "#1e3a8a" },
];

export const SceneFluxo: React.FC = () => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const intro = spring({ frame: f, fps, config: { damping: 18 } });

  // ticket position: 0..3 → cols 0..3, animated (passa por todas até Atendimento)
  const pos = interpolate(f, [15, 35, 55, 75, 95, 115], [0, 1, 1.5, 2, 2.5, 3], {
    extrapolateRight: "clamp",
  });
  const colX = (i: number) => 60 + i * 360;
  const x = colX(0) + (pos % 1) * 360 + Math.floor(pos) * 360 - colX(0);
  const ticketX = colX(0) + pos * 360;
  const lift = Math.sin(pos * Math.PI) * 20;

  return (
    <Frame title="Fluxo do paciente" step="Etapa 4 — Após o pagamento: Triagem → Atendimento">
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, 1fr)",
          gap: 20,
          opacity: intro,
          transform: `translateY(${(1 - intro) * 12}px)`,
        }}
      >
        {cols.map((c) => (
          <div
            key={c.id}
            style={{
              background: "#fff",
              border: `1px solid ${C.line}`,
              borderRadius: 16,
              padding: 18,
              minHeight: 480,
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div
                style={{
                  background: c.c,
                  color: c.t,
                  padding: "8px 14px",
                  borderRadius: 999,
                  fontSize: 18,
                  fontWeight: 600,
                  fontFamily: dm,
                }}
              >
                {c.l}
              </div>
              <div style={{ color: C.sub, fontSize: 16 }}>1</div>
            </div>
            <div style={{ marginTop: 16, opacity: 0.35 }}>
              <div
                style={{
                  border: `2px dashed ${C.line}`,
                  borderRadius: 12,
                  padding: 22,
                  textAlign: "center",
                  color: C.sub,
                  fontSize: 16,
                }}
              >
                vazio
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* moving ticket card */}
      <div
        style={{
          position: "absolute",
          left: ticketX + 18,
          top: 90 - lift,
          width: 300,
          background: "#fff",
          borderRadius: 14,
          padding: 14,
          boxShadow: "0 20px 40px rgba(0,0,0,.18)",
          border: `2px solid ${C.primary}`,
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <div style={{ fontWeight: 700, fontFamily: dm, fontSize: 20 }}>Maria Souza</div>
          <div style={{ color: C.sub, fontSize: 16, fontFamily: dm }}>Nº 002 · ref. 09:30</div>
        </div>
        <div style={{ color: C.sub, fontSize: 16, marginTop: 4 }}>
          Consulta Cardio · Dr. Roberto
        </div>
        <div style={{ marginTop: 10, display: "flex", justifyContent: "flex-end" }}>
          <div
            style={{
              background: C.primary,
              color: "#fff",
              fontSize: 14,
              padding: "6px 12px",
              borderRadius: 8,
              fontWeight: 600,
            }}
          >
            {pos < 1 ? "Recepção" : pos < 2 ? "Caixa ✓ pago" : pos < 3 ? "Triagem" : "Atendimento"}
          </div>
        </div>
      </div>
    </Frame>
  );
};
