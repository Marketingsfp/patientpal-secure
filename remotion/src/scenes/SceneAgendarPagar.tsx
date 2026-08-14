import { useCurrentFrame, useVideoConfig, spring, interpolate } from "remotion";
import { Frame, Cursor } from "../components/Frame";
import { C, dm } from "../theme";

export const SceneAgendarPagar: React.FC = () => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame: f - 8, fps, config: { damping: 18 } });

  // Timeline
  const slotIdx = f > 55 ? 1 : -1;
  const confirmed = f > 95;
  const confSpring = spring({ frame: f - 95, fps, config: { damping: 12, stiffness: 140 } });
  const showPay = f > 145;
  const payIn = spring({ frame: f - 145, fps, config: { damping: 18 } });
  const pixSelected = f > 200;
  const processing = f > 235 && f < 285;
  const done = f > 285;
  const doneS = spring({ frame: f - 285, fps, config: { damping: 12 } });
  const barW = interpolate(f, [235, 285], [0, 100], { extrapolateRight: "clamp" });

  // Cursor path: slot -> confirm -> (badge fades) -> PIX -> done
  const cx = interpolate(
    f,
    [0, 30, 55, 85, 105, 160, 200, 240, 290],
    [1500, 880, 880, 1380, 1380, 1380, 1080, 1080, 1500],
    { extrapolateRight: "clamp" },
  );
  const cy = interpolate(
    f,
    [0, 30, 55, 85, 105, 160, 200, 240, 290],
    [800, 380, 380, 720, 720, 720, 520, 520, 820],
    { extrapolateRight: "clamp" },
  );

  const slots = ["08:00", "08:30", "09:00", "09:30", "10:00", "10:30"];

  return (
    <Frame title="Consulta rápida" step="Etapa 2 — Agendar e pagar (mesma tela)">
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1.4fr",
          gap: 24,
          opacity: s,
          transform: `translateY(${(1 - s) * 12}px)`,
        }}
      >
        {/* Left: summary */}
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

          {confirmed && (
            <div
              style={{
                marginTop: 22,
                padding: "14px 16px",
                borderRadius: 12,
                background: "rgba(16,185,129,.12)",
                border: `1px solid ${C.accent}`,
                display: "flex",
                alignItems: "center",
                gap: 12,
                opacity: Math.min(1, confSpring),
              }}
            >
              <svg
                width="22"
                height="22"
                viewBox="0 0 24 24"
                fill="none"
                stroke={C.accent}
                strokeWidth="3"
              >
                <path d="M5 12l5 5L20 7" />
              </svg>
              <div>
                <div style={{ fontSize: 18, fontWeight: 700, color: C.accent, fontFamily: dm }}>
                  Agendamento confirmado
                </div>
                <div style={{ fontSize: 15, color: C.sub }}>Senha Nº 002 · ref. 08:30</div>
              </div>
            </div>
          )}
        </div>

        {/* Right: morphs from slots -> payment */}
        <div
          style={{
            background: "#fff",
            borderRadius: 16,
            padding: 24,
            border: `1px solid ${C.line}`,
            position: "relative",
            minHeight: 520,
          }}
        >
          {!showPay && (
            <>
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
                        style={{
                          fontSize: 26,
                          fontWeight: 800,
                          fontFamily: dm,
                          letterSpacing: 0.5,
                        }}
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
                    background: confirmed ? C.accent : C.accent,
                    color: "#fff",
                    fontSize: 20,
                    fontWeight: 600,
                    fontFamily: dm,
                    boxShadow: "0 10px 24px rgba(16,185,129,.35)",
                  }}
                >
                  {confirmed ? "Confirmado ✓" : "Confirmar e pagar"}
                </div>
              </div>
            </>
          )}

          {showPay && (
            <div style={{ opacity: payIn, transform: `translateY(${(1 - payIn) * 14}px)` }}>
              <div style={{ fontSize: 20, color: C.sub, fontFamily: dm, marginBottom: 14 }}>
                Pagamento · sem trocar de tela
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <Pay label="PIX" sub="R$ 250,00" on={pixSelected} />
                <Pay label="Cartão Crédito" sub="R$ 275,00" />
                <Pay label="Dinheiro" sub="R$ 250,00" />
                <Pay label="Cartão Débito" sub="R$ 250,00" />
              </div>
              <div style={{ marginTop: 22 }}>
                <div
                  style={{ height: 10, background: C.line, borderRadius: 999, overflow: "hidden" }}
                >
                  <div
                    style={{
                      width: `${barW}%`,
                      height: "100%",
                      background: `linear-gradient(90deg, ${C.primary}, ${C.accent})`,
                    }}
                  />
                </div>
                <div
                  style={{
                    marginTop: 12,
                    color: processing ? C.primary : done ? C.accent : C.sub,
                    fontSize: 18,
                    fontWeight: 600,
                    fontFamily: dm,
                  }}
                >
                  {processing
                    ? "Processando pagamento…"
                    : done
                      ? "Pagamento aprovado · R$ 250,00 via PIX"
                      : "Selecione a forma de pagamento"}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {confirmed && !showPay && (
        <div
          style={{
            position: "absolute",
            left: "50%",
            top: "50%",
            transform: `translate(-50%, -50%) scale(${0.6 + confSpring * 0.4})`,
            opacity: Math.max(0, 1 - Math.max(0, f - 140) / 10) * confSpring,
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
          Agendamento criado — pague agora
        </div>
      )}

      {done && (
        <div
          style={{
            position: "absolute",
            right: 60,
            bottom: 60,
            background: C.accent,
            color: "#fff",
            padding: "18px 28px",
            borderRadius: 16,
            display: "flex",
            alignItems: "center",
            gap: 12,
            fontFamily: dm,
            fontWeight: 700,
            fontSize: 24,
            transform: `scale(${0.6 + doneS * 0.4})`,
            opacity: doneS,
            boxShadow: "0 20px 60px rgba(16,185,129,.4)",
          }}
        >
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3">
            <path d="M5 12l5 5L20 7" />
          </svg>
          R$ 250,00 recebidos via PIX
        </div>
      )}

      <Cursor x={cx} y={cy} />
    </Frame>
  );
};

const Pay: React.FC<{ label: string; sub: string; on?: boolean }> = ({ label, sub, on }) => (
  <div
    style={{
      padding: 18,
      borderRadius: 12,
      background: on ? C.primarySoft : "#fff",
      border: `2px solid ${on ? C.primary : C.line}`,
      boxShadow: on ? "0 10px 30px rgba(29,78,216,.18)" : "none",
    }}
  >
    <div style={{ fontSize: 22, fontWeight: 700, fontFamily: dm, color: on ? C.primary : C.ink }}>
      {label}
    </div>
    <div style={{ fontSize: 18, color: C.sub, marginTop: 4 }}>{sub}</div>
  </div>
);
