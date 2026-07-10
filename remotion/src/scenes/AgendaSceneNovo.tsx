import { useCurrentFrame, useVideoConfig, spring, interpolate } from "remotion";
import { Frame, Cursor } from "../components/Frame";
import { C, dm } from "../theme";

const NAME = "Maria Souza";

export const AgendaSceneNovo: React.FC = () => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const dialog = spring({ frame: f - 12, fps, config: { damping: 18 } });
  const typedChars = Math.max(
    0,
    Math.min(NAME.length, Math.floor(interpolate(f, [30, 65], [0, NAME.length + 1]))),
  );
  const typed = NAME.slice(0, typedChars);
  const showResults = f > 60;
  const procSel = f > 95;
  const confirmed = f > 125;
  const toast = spring({ frame: f - 125, fps, config: { damping: 14 } });

  const cx = interpolate(
    f,
    [0, 12, 32, 70, 100, 130, 145],
    [1500, 1300, 700, 700, 1000, 1280, 1280],
    { extrapolateRight: "clamp" },
  );
  const cy = interpolate(f, [0, 12, 32, 70, 100, 130, 145], [800, 230, 360, 360, 520, 720, 720], {
    extrapolateRight: "clamp",
  });

  return (
    <Frame title="Agendas" step="Novo agendamento de paciente">
      {/* botão Novo destacado */}
      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <div
          style={{
            background: C.primary,
            color: "#fff",
            padding: "12px 20px",
            borderRadius: 12,
            fontSize: 20,
            fontWeight: 600,
            fontFamily: dm,
            display: "flex",
            alignItems: "center",
            gap: 8,
            boxShadow: f < 14 ? "0 0 0 6px rgba(29,78,216,.25)" : "0 8px 20px rgba(29,78,216,.25)",
          }}
        >
          <span style={{ fontSize: 22 }}>+</span> Novo agendamento
        </div>
      </div>

      {/* Dialog */}
      <div
        style={{
          position: "absolute",
          left: "50%",
          top: 140,
          transform: `translateX(-50%) scale(${0.95 + dialog * 0.05})`,
          opacity: dialog,
          width: 880,
          background: "#fff",
          borderRadius: 20,
          padding: 32,
          border: `1px solid ${C.line}`,
          boxShadow: "0 30px 80px rgba(0,0,0,.18)",
          zIndex: 10,
        }}
      >
        <div style={{ fontSize: 26, fontWeight: 700, fontFamily: dm, marginBottom: 18 }}>
          Agendar paciente
        </div>

        <div style={{ fontSize: 16, color: C.sub, marginBottom: 6, fontFamily: dm }}>Paciente</div>
        <div
          style={{
            background: "#fff",
            border: `1px solid ${typedChars > 0 ? C.primary : C.line}`,
            borderRadius: 12,
            padding: "14px 18px",
            fontSize: 22,
            color: C.ink,
            fontFamily: dm,
          }}
        >
          {typed}
          <span style={{ opacity: (f / 6) % 2 < 1 ? 1 : 0 }}>|</span>
        </div>

        {showResults && (
          <div
            style={{
              marginTop: 8,
              background: "#fff",
              border: `1px solid ${C.line}`,
              borderRadius: 12,
              padding: 8,
              boxShadow: "0 12px 30px rgba(0,0,0,.08)",
            }}
          >
            <div
              style={{
                padding: 12,
                borderRadius: 8,
                background: C.primarySoft,
                fontSize: 20,
                fontWeight: 600,
                color: C.primary,
              }}
            >
              Maria Souza · CPF 123.456.789-00 · 34 anos
            </div>
            <div style={{ padding: 12, fontSize: 19, color: C.sub }}>
              Mariana Silva · CPF 987.654.321-00
            </div>
          </div>
        )}

        <div style={{ fontSize: 16, color: C.sub, marginTop: 22, marginBottom: 6, fontFamily: dm }}>
          Procedimento
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          {[
            { n: "Consulta Cardiológica", v: "R$ 250,00", on: procSel },
            { n: "Ecocardiograma", v: "R$ 380,00" },
          ].map((p, i) => (
            <div
              key={i}
              style={{
                padding: 16,
                borderRadius: 12,
                background: p.on ? C.primarySoft : "#F6F8FC",
                border: `2px solid ${p.on ? C.primary : C.line}`,
              }}
            >
              <div style={{ fontSize: 20, fontWeight: 600, color: p.on ? C.primary : C.ink }}>
                {p.n}
              </div>
              <div style={{ fontSize: 17, color: C.sub, marginTop: 4 }}>{p.v}</div>
            </div>
          ))}
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 22 }}>
          <div
            style={{
              padding: "12px 20px",
              borderRadius: 10,
              border: `1px solid ${C.line}`,
              fontSize: 18,
            }}
          >
            Cancelar
          </div>
          <div
            style={{
              padding: "12px 22px",
              borderRadius: 10,
              background: confirmed ? C.accent : C.primary,
              color: "#fff",
              fontSize: 18,
              fontWeight: 600,
              fontFamily: dm,
              boxShadow: "0 10px 24px rgba(29,78,216,.3)",
            }}
          >
            Confirmar agendamento
          </div>
        </div>
      </div>

      {confirmed && (
        <div
          style={{
            position: "absolute",
            right: 100,
            bottom: 80,
            background: C.accent,
            color: "#fff",
            padding: "16px 24px",
            borderRadius: 14,
            display: "flex",
            alignItems: "center",
            gap: 12,
            fontFamily: dm,
            fontWeight: 700,
            fontSize: 22,
            transform: `scale(${0.6 + toast * 0.4})`,
            opacity: toast,
            boxShadow: "0 20px 60px rgba(16,185,129,.4)",
          }}
        >
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3">
            <path d="M5 12l5 5L20 7" />
          </svg>
          Maria Souza agendada às 09:00
        </div>
      )}

      <Cursor x={cx} y={cy} />
    </Frame>
  );
};
