import { useCurrentFrame, useVideoConfig, spring, interpolate } from "remotion";
import { Frame, Cursor } from "../components/Frame";
import { C, dm } from "../theme";

export const SceneAgendar: React.FC = () => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame: f - 8, fps, config: { damping: 18 } });
  const slotIdx = f > 55 ? 1 : -1;
  const confirmed = f > 95;
  const confSpring = spring({ frame: f - 95, fps, config: { damping: 12, stiffness: 140 } });
  const cx = interpolate(f, [0, 30, 55, 85, 105], [1500, 880, 880, 1380, 1380], {
    extrapolateRight: "clamp",
  });
  const cy = interpolate(f, [0, 30, 55, 85, 105], [800, 380, 380, 720, 720], {
    extrapolateRight: "clamp",
  });

  const slots = ["08:00", "08:30", "09:00", "09:30", "10:00", "10:30"];
  return (
    <Frame title="Consulta rápida" step="Etapa 2 — Por senha (horário como referência)">
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1.4fr",
          gap: 24,
          opacity: s,
          transform: `translateY(${(1 - s) * 12}px)`,
        }}
      >
        <div
          style={{
            background: "#fff",
            borderRadius: 16,
            padding: 24,
            border: `1px solid ${C.line}`,
          }}
        >
          <div style={{ fontSize: 20, color: C.sub, fontFamily: dm }}>Paciente</div>
          <div style={{ fontSize: 26, fontWeight: 700, marginTop: 4, fontFamily: dm }}>
            Maria Souza
          </div>
          <div style={{ height: 1, background: C.line, margin: "20px 0" }} />
          <div style={{ fontSize: 20, color: C.sub, fontFamily: dm }}>Médico</div>
          <div style={{ fontSize: 22, fontWeight: 600, marginTop: 4 }}>Dr. Roberto Lima</div>
          <div style={{ fontSize: 18, color: C.sub }}>Cardiologia · CRM/PE 12345</div>
          <div style={{ height: 1, background: C.line, margin: "20px 0" }} />
          <div style={{ fontSize: 20, color: C.sub, fontFamily: dm }}>Procedimento</div>
          <div style={{ fontSize: 22, fontWeight: 600, marginTop: 4 }}>Consulta Cardiológica</div>
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8 }}>
            <span style={{ color: C.sub, fontSize: 18 }}>Duração 30 min</span>
            <span style={{ color: C.primary, fontSize: 22, fontWeight: 700, fontFamily: dm }}>
              R$ 250,00
            </span>
          </div>
        </div>

        <div
          style={{
            background: "#fff",
            borderRadius: 16,
            padding: 24,
            border: `1px solid ${C.line}`,
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 16,
            }}
          >
            <div style={{ fontSize: 22, fontWeight: 600, fontFamily: dm }}>
              Hoje · 17 de maio · por ordem de chegada
            </div>
            <div style={{ fontSize: 18, color: C.sub }}>{slots.length} senhas</div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
            {slots.map((t, i) => {
              const selected = i === slotIdx;
              const taken = i === 0 || i === 3;
              const senha = `Nº ${String(i + 1).padStart(3, "0")}`;
              return (
                <div
                  key={t}
                  style={{
                    padding: "14px 0 12px",
                    textAlign: "center",
                    borderRadius: 12,
                    background: selected ? C.primary : taken ? "#F2F4F9" : "#fff",
                    color: selected ? "#fff" : taken ? C.sub : C.ink,
                    border: `1px solid ${selected ? C.primary : C.line}`,
                    textDecoration: taken ? "line-through" : "none",
                    boxShadow: selected ? "0 10px 24px rgba(29,78,216,.3)" : "none",
                  }}
                >
                  <div
                    style={{ fontSize: 26, fontWeight: 800, fontFamily: dm, letterSpacing: 0.5 }}
                  >
                    {senha}
                  </div>
                  <div
                    style={{
                      fontSize: 14,
                      marginTop: 2,
                      opacity: selected ? 0.85 : 0.6,
                      fontFamily: dm,
                    }}
                  >
                    ref. {t}
                  </div>
                </div>
              );
            })}
          </div>
          <div style={{ marginTop: 24, display: "flex", justifyContent: "flex-end", gap: 12 }}>
            <div
              style={{
                padding: "14px 22px",
                borderRadius: 12,
                border: `1px solid ${C.line}`,
                fontSize: 20,
              }}
            >
              Cancelar
            </div>
            <div
              style={{
                padding: "14px 22px",
                borderRadius: 12,
                background: C.accent,
                color: "#fff",
                fontSize: 20,
                fontWeight: 600,
                fontFamily: dm,
                boxShadow: "0 10px 24px rgba(16,185,129,.35)",
              }}
            >
              Confirmar agendamento
            </div>
          </div>
        </div>
      </div>

      {confirmed && (
        <div
          style={{
            position: "absolute",
            left: "50%",
            top: "50%",
            transform: `translate(-50%, -50%) scale(${0.6 + confSpring * 0.4})`,
            opacity: confSpring,
            background: C.accent,
            color: "#fff",
            padding: "22px 36px",
            borderRadius: 999,
            fontSize: 28,
            fontWeight: 700,
            fontFamily: dm,
            display: "flex",
            alignItems: "center",
            gap: 14,
            boxShadow: "0 30px 80px rgba(16,185,129,.5)",
          }}
        >
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3">
            <path d="M5 12l5 5L20 7" />
          </svg>
          Agendamento criado · abrindo pagamento…
        </div>
      )}

      <Cursor x={cx} y={cy} />
    </Frame>
  );
};
