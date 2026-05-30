import { useCurrentFrame, spring, useVideoConfig, interpolate } from "remotion";
import { Frame, Cursor } from "../components/Frame";
import { C, dm } from "../theme";

const HORARIOS = ["08:00", "08:15", "08:30", "08:45", "09:00", "09:15"];

export const SceneEnfAgendar: React.FC = () => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const click = f > 50;
  const swap = f > 75;
  const dialogSpring = spring({ frame: f - 55, fps, config: { damping: 18 } });
  const cx = interpolate(f, [0, 45, 70, 110], [1200, 720, 720, 720], { extrapolateRight: "clamp" });
  const cy = interpolate(f, [0, 45, 70, 110], [700, 380, 380, 380], { extrapolateRight: "clamp" });
  return (
    <Frame title="Agenda" step="Passo 4 — Marcar o paciente">
      <div style={{ fontSize: 24, color: C.sub, marginBottom: 20, fontFamily: dm }}>
        Na agenda, clique num slot "DISPONÍVEL" e troque pelo paciente
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
        {/* Coluna recurso Curativo */}
        <div style={{ background: "#fff", border: `1px solid ${C.line}`, borderRadius: 16, padding: 18 }}>
          <div style={{ fontSize: 20, fontWeight: 600, fontFamily: dm, marginBottom: 12, color: C.primary }}>
            Curativo · 02/06
          </div>
          {HORARIOS.map((h, i) => {
            const highlighted = i === 2;
            const isSwapped = highlighted && swap;
            return (
              <div key={h} style={{
                display: "flex", alignItems: "center", gap: 12,
                padding: "10px 12px", borderRadius: 10, marginBottom: 6,
                background: highlighted ? (isSwapped ? "#dcfce7" : (click ? C.primarySoft : "#F2F4F9")) : "#F8FAFC",
                border: highlighted && click ? `2px solid ${C.primary}` : "2px solid transparent",
                transition: "none",
              }}>
                <span style={{ fontSize: 18, color: C.sub, fontFamily: dm, width: 60 }}>{h}</span>
                <span style={{
                  fontSize: 18, fontWeight: 600, fontFamily: dm,
                  color: isSwapped ? "#065f46" : C.sub,
                }}>
                  {isSwapped ? "Maria Souza" : "DISPONÍVEL"}
                </span>
                {isSwapped && (
                  <span style={{ marginLeft: "auto", fontSize: 14, color: "#065f46", fontWeight: 600 }}>✓ AGENDADO</span>
                )}
              </div>
            );
          })}
        </div>

        {/* Dialog de troca */}
        {f > 55 && (
          <div style={{
            background: "#fff", border: `1px solid ${C.line}`, borderRadius: 16, padding: 24,
            opacity: dialogSpring, transform: `translateY(${(1 - dialogSpring) * 16}px)`,
            boxShadow: "0 20px 50px rgba(0,0,0,.12)", height: "fit-content",
          }}>
            <div style={{ fontSize: 20, fontWeight: 600, fontFamily: dm, marginBottom: 4 }}>
              Slot 08:30 — Curativo
            </div>
            <div style={{ fontSize: 16, color: C.sub, marginBottom: 18 }}>
              Selecione o paciente para esta ficha
            </div>
            <div style={{
              background: "#F2F4F9", border: `1px solid ${C.line}`, borderRadius: 10,
              padding: "12px 14px", fontSize: 18, fontFamily: dm, marginBottom: 14,
              display: "flex", alignItems: "center", gap: 10,
            }}>
              <span style={{ color: C.sub }}>🔍</span>
              <span>Maria Souza</span>
            </div>
            <div style={{
              background: swap ? "#10b981" : C.primary, color: "#fff",
              padding: "12px 18px", borderRadius: 10, fontSize: 18, fontWeight: 600,
              fontFamily: dm, textAlign: "center", transition: "none",
            }}>
              {swap ? "✓ Agendado" : "Confirmar agendamento"}
            </div>
          </div>
        )}
      </div>
      <Cursor x={cx} y={cy} />
    </Frame>
  );
};