import { useCurrentFrame, useVideoConfig, spring, interpolate } from "remotion";
import { Frame, Cursor } from "../components/Frame";
import { C, dm } from "../theme";

const MEDICOS = ["Todos os profissionais", "Dr. Roberto Lima", "Dra. Ana Paula", "Dr. Carlos Mendes"];

export const AgendaSceneFiltro: React.FC = () => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame: f, fps, config: { damping: 18 } });

  const openMedico = f > 18 && f < 55;
  const selectedMedico = f > 50 ? 1 : 0;
  const openCal = f > 65 && f < 100;
  const selectedDay = f > 95 ? 22 : 17;

  const cx = interpolate(f, [0, 18, 50, 70, 96, 115], [1500, 360, 360, 880, 1020, 1020], { extrapolateRight: "clamp" });
  const cy = interpolate(f, [0, 18, 50, 70, 96, 115], [800, 250, 250, 250, 460, 460], { extrapolateRight: "clamp" });

  return (
    <Frame title="Agendas" step="Filtros — profissional e data">
      <div style={{ display: "flex", gap: 16, opacity: s, transform: `translateY(${(1 - s) * 10}px)` }}>
        {/* Filtro profissional */}
        <div style={{ position: "relative" }}>
          <div style={{ background: "#fff", border: `1px solid ${C.line}`, borderRadius: 12, padding: "14px 22px", minWidth: 360, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, boxShadow: openMedico ? "0 10px 24px rgba(29,78,216,.18)" : "0 2px 8px rgba(0,0,0,.04)" }}>
            <span style={{ fontSize: 22, fontWeight: 600, color: C.ink, fontFamily: dm }}>{MEDICOS[selectedMedico]}</span>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={C.sub} strokeWidth="2"><path d="m6 9 6 6 6-6"/></svg>
          </div>
          {openMedico && (
            <div style={{ position: "absolute", top: 64, left: 0, right: 0, background: "#fff", borderRadius: 12, border: `1px solid ${C.line}`, boxShadow: "0 20px 50px rgba(0,0,0,.12)", padding: 8, zIndex: 20 }}>
              {MEDICOS.map((m, i) => (
                <div key={m} style={{ padding: "12px 14px", borderRadius: 8, fontSize: 20, color: C.ink, background: i === selectedMedico ? C.primarySoft : "transparent", fontWeight: i === selectedMedico ? 600 : 400 }}>
                  {m}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Filtro data */}
        <div style={{ position: "relative" }}>
          <div style={{ background: "#fff", border: `1px solid ${C.line}`, borderRadius: 12, padding: "14px 22px", minWidth: 260, display: "flex", alignItems: "center", gap: 14, boxShadow: openCal ? "0 10px 24px rgba(29,78,216,.18)" : "0 2px 8px rgba(0,0,0,.04)" }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={C.primary} strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>
            <span style={{ fontSize: 22, fontWeight: 600, color: C.ink, fontFamily: dm }}>{String(selectedDay).padStart(2, "0")} de maio · 2025</span>
          </div>
          {openCal && (
            <div style={{ position: "absolute", top: 64, left: 0, background: "#fff", borderRadius: 12, border: `1px solid ${C.line}`, boxShadow: "0 20px 50px rgba(0,0,0,.12)", padding: 18, zIndex: 20, width: 320 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12, fontFamily: dm, fontWeight: 600, color: C.ink }}>maio · 2025</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 4, fontSize: 16 }}>
                {["D","S","T","Q","Q","S","S"].map(d => <div key={d} style={{ textAlign: "center", color: C.sub, padding: 4 }}>{d}</div>)}
                {Array.from({ length: 31 }, (_, i) => i + 1).map(d => (
                  <div key={d} style={{
                    textAlign: "center", padding: "8px 0", borderRadius: 6,
                    background: d === selectedDay ? C.primary : "transparent",
                    color: d === selectedDay ? "#fff" : C.ink,
                    fontWeight: d === selectedDay ? 700 : 400,
                    border: d === 17 && d !== selectedDay ? `1px solid ${C.primary}` : "1px solid transparent",
                  }}>{d}</div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Grade da agenda */}
      <div style={{ marginTop: 32, background: "#fff", border: `1px solid ${C.line}`, borderRadius: 16, padding: 22, opacity: s }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <div style={{ fontSize: 24, fontWeight: 700, fontFamily: dm }}>{MEDICOS[selectedMedico]} · {String(selectedDay).padStart(2, "0")}/05</div>
          <div style={{ fontSize: 18, color: C.sub }}>6 horários</div>
        </div>
        {["08:00","08:30","09:00","09:30","10:00","10:30"].map((h, i) => (
          <div key={h} style={{ display: "grid", gridTemplateColumns: "100px 1fr 140px", padding: "14px 0", borderTop: i === 0 ? "none" : `1px solid ${C.line}`, alignItems: "center" }}>
            <div style={{ fontSize: 20, fontWeight: 700, fontFamily: dm, color: C.primary }}>{h}</div>
            <div style={{ fontSize: 19, color: C.ink }}>
              {selectedDay === 22 && i < 3 ? ["Pedro Costa","João Ribeiro","Helena Vargas"][i] : selectedDay === 17 && i === 0 ? "Lucas Andrade" : "—"}
            </div>
            <div style={{ fontSize: 16, color: C.sub, textAlign: "right" }}>
              {selectedDay === 22 && i < 3 ? "Agendado" : selectedDay === 17 && i === 0 ? "Confirmado" : "Livre"}
            </div>
          </div>
        ))}
      </div>

      <Cursor x={cx} y={cy} />
    </Frame>
  );
};