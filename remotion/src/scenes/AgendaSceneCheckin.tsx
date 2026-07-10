import { useCurrentFrame, useVideoConfig, spring, interpolate } from "remotion";
import { Frame, Cursor } from "../components/Frame";
import { C, dm } from "../theme";

export const AgendaSceneCheckin: React.FC = () => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame: f, fps, config: { damping: 18 } });
  const openMenu = f > 20 && f < 50;
  const checkedIn = f > 55;
  const pulse = spring({ frame: f - 55, fps, config: { damping: 10, stiffness: 140 } });

  const cx = interpolate(f, [0, 22, 50, 80], [1500, 1420, 1280, 1280], {
    extrapolateRight: "clamp",
  });
  const cy = interpolate(f, [0, 22, 50, 80], [800, 380, 460, 460], { extrapolateRight: "clamp" });

  return (
    <Frame title="Agendas" step="Check-in do paciente">
      <div
        style={{
          background: "#fff",
          border: `1px solid ${C.line}`,
          borderRadius: 16,
          padding: 22,
          opacity: s,
        }}
      >
        {[
          { h: "08:30", n: "Lucas Andrade", st: "Confirmado" },
          { h: "09:00", n: "Maria Souza", st: checkedIn ? "Check-in feito" : "Agendado", hl: true },
          { h: "09:30", n: "Pedro Costa", st: "Agendado" },
        ].map((r, i) => (
          <div
            key={i}
            style={{
              position: "relative",
              display: "grid",
              gridTemplateColumns: "100px 1fr 200px 80px",
              padding: "18px 12px",
              borderTop: i === 0 ? "none" : `1px solid ${C.line}`,
              alignItems: "center",
              borderRadius: 10,
              background:
                r.hl && checkedIn
                  ? "rgba(16,185,129,.08)"
                  : r.hl
                    ? "rgba(29,78,216,.06)"
                    : "transparent",
            }}
          >
            <div style={{ fontSize: 22, fontWeight: 700, fontFamily: dm, color: C.primary }}>
              {r.h}
            </div>
            <div style={{ fontSize: 21, color: C.ink, fontWeight: r.hl ? 600 : 400 }}>{r.n}</div>
            <div>
              <span
                style={{
                  fontSize: 16,
                  fontWeight: 700,
                  fontFamily: dm,
                  padding: "6px 14px",
                  borderRadius: 999,
                  background:
                    r.st === "Check-in feito"
                      ? "rgba(16,185,129,.18)"
                      : r.st === "Confirmado"
                        ? "rgba(29,78,216,.15)"
                        : "#EEF1F7",
                  color:
                    r.st === "Check-in feito"
                      ? C.accent
                      : r.st === "Confirmado"
                        ? C.primary
                        : C.sub,
                  boxShadow:
                    r.hl && checkedIn ? `0 0 0 ${4 + pulse * 6}px rgba(16,185,129,.18)` : "none",
                }}
              >
                {r.st}
              </span>
            </div>
            <div style={{ textAlign: "right", color: C.sub, fontSize: 24, fontWeight: 700 }}>⋯</div>

            {r.hl && openMenu && (
              <div
                style={{
                  position: "absolute",
                  top: 56,
                  right: 60,
                  background: "#fff",
                  borderRadius: 12,
                  border: `1px solid ${C.line}`,
                  boxShadow: "0 18px 40px rgba(0,0,0,.14)",
                  padding: 8,
                  width: 220,
                  zIndex: 20,
                }}
              >
                {["Editar", "Reagendar", "Check-in", "Cancelar"].map((o) => (
                  <div
                    key={o}
                    style={{
                      padding: "10px 14px",
                      borderRadius: 8,
                      fontSize: 18,
                      background: o === "Check-in" ? C.primarySoft : "transparent",
                      color: o === "Check-in" ? C.primary : C.ink,
                      fontWeight: o === "Check-in" ? 600 : 400,
                    }}
                  >
                    {o}
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      {checkedIn && (
        <div
          style={{
            position: "absolute",
            right: 100,
            bottom: 80,
            background: C.accent,
            color: "#fff",
            padding: "14px 22px",
            borderRadius: 12,
            fontFamily: dm,
            fontWeight: 700,
            fontSize: 20,
            transform: `scale(${0.7 + Math.min(1, pulse) * 0.3})`,
            opacity: Math.min(1, pulse),
            boxShadow: "0 20px 50px rgba(16,185,129,.4)",
            display: "flex",
            alignItems: "center",
            gap: 10,
          }}
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3">
            <path d="M5 12l5 5L20 7" />
          </svg>
          Maria Souza · presença confirmada
        </div>
      )}

      <Cursor x={cx} y={cy} />
    </Frame>
  );
};
