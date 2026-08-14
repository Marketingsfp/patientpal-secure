import { useCurrentFrame, useVideoConfig, spring, interpolate } from "remotion";
import { Frame, Cursor } from "../components/Frame";
import { C, dm } from "../theme";

export const AgendaSceneReagendar: React.FC = () => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame: f, fps, config: { damping: 18 } });
  const openDialog = f > 18;
  const dialogS = spring({ frame: f - 18, fps, config: { damping: 18 } });
  const newDay = f > 55 ? 22 : 17;
  const newSlot = f > 80 ? 4 : -1; // index of 10:30
  const done = f > 105;
  const doneS = spring({ frame: f - 105, fps, config: { damping: 14 } });

  const cx = interpolate(f, [0, 22, 60, 85, 110], [1500, 980, 1120, 1280, 1280], {
    extrapolateRight: "clamp",
  });
  const cy = interpolate(f, [0, 22, 60, 85, 110], [800, 340, 420, 540, 540], {
    extrapolateRight: "clamp",
  });

  const slots = ["08:00", "08:30", "09:00", "09:30", "10:30", "11:00"];

  return (
    <Frame title="Agendas" step="Reagendamento">
      <div
        style={{
          background: "#fff",
          border: `1px solid ${C.line}`,
          borderRadius: 16,
          padding: 18,
          opacity: s,
        }}
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "100px 1fr 200px",
            padding: "14px 12px",
            alignItems: "center",
            borderRadius: 10,
            background: "rgba(245,158,11,.10)",
          }}
        >
          <div
            style={{
              fontSize: 22,
              fontWeight: 700,
              fontFamily: dm,
              color: C.primary,
              textDecoration: done ? "line-through" : "none",
              opacity: done ? 0.5 : 1,
            }}
          >
            09:00 · 17/05
          </div>
          <div style={{ fontSize: 21, fontWeight: 600 }}>Pedro Costa · Consulta Cardio</div>
          <div style={{ fontSize: 16, color: "#b45309", fontWeight: 700, fontFamily: dm }}>
            Reagendando…
          </div>
        </div>
      </div>

      {openDialog && (
        <div
          style={{
            position: "absolute",
            left: "50%",
            top: 200,
            transform: `translateX(-50%) scale(${0.95 + dialogS * 0.05})`,
            opacity: dialogS,
            width: 820,
            background: "#fff",
            borderRadius: 20,
            padding: 28,
            border: `1px solid ${C.line}`,
            boxShadow: "0 30px 80px rgba(0,0,0,.2)",
            zIndex: 10,
          }}
        >
          <div style={{ fontSize: 24, fontWeight: 700, fontFamily: dm }}>
            Reagendar — Pedro Costa
          </div>
          <div style={{ fontSize: 17, color: C.sub, marginTop: 4 }}>
            De 17/05 às 09:00 para uma nova data
          </div>

          <div
            style={{ display: "grid", gridTemplateColumns: "1fr 1.4fr", gap: 18, marginTop: 18 }}
          >
            <div style={{ background: C.cream, borderRadius: 12, padding: 14 }}>
              <div style={{ fontSize: 16, color: C.sub, fontFamily: dm, marginBottom: 8 }}>
                maio · 2025
              </div>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(7,1fr)",
                  gap: 4,
                  fontSize: 15,
                }}
              >
                {["D", "S", "T", "Q", "Q", "S", "S"].map((d) => (
                  <div key={d} style={{ textAlign: "center", color: C.sub, padding: 3 }}>
                    {d}
                  </div>
                ))}
                {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
                  <div
                    key={d}
                    style={{
                      textAlign: "center",
                      padding: "6px 0",
                      borderRadius: 5,
                      background: d === newDay ? C.primary : "transparent",
                      color: d === newDay ? "#fff" : C.ink,
                      fontWeight: d === newDay ? 700 : 400,
                      border:
                        d === 17 && d !== newDay ? `1px solid ${C.sub}` : "1px solid transparent",
                      opacity: d === 17 ? 0.7 : 1,
                    }}
                  >
                    {d}
                  </div>
                ))}
              </div>
            </div>
            <div>
              <div style={{ fontSize: 16, color: C.sub, fontFamily: dm, marginBottom: 8 }}>
                Horários disponíveis · {String(newDay).padStart(2, "0")}/05
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
                {slots.map((h, i) => (
                  <div
                    key={h}
                    style={{
                      padding: "12px 0",
                      textAlign: "center",
                      borderRadius: 10,
                      fontSize: 18,
                      fontFamily: dm,
                      fontWeight: 600,
                      background: i === newSlot ? C.primary : "#fff",
                      color: i === newSlot ? "#fff" : C.ink,
                      border: `1px solid ${i === newSlot ? C.primary : C.line}`,
                      boxShadow: i === newSlot ? "0 10px 24px rgba(29,78,216,.25)" : "none",
                    }}
                  >
                    {h}
                  </div>
                ))}
              </div>
              <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 22 }}>
                <div
                  style={{
                    padding: "12px 20px",
                    borderRadius: 10,
                    border: `1px solid ${C.line}`,
                    fontSize: 17,
                  }}
                >
                  Cancelar
                </div>
                <div
                  style={{
                    padding: "12px 22px",
                    borderRadius: 10,
                    background: done ? C.accent : C.primary,
                    color: "#fff",
                    fontSize: 17,
                    fontWeight: 600,
                    fontFamily: dm,
                  }}
                >
                  Confirmar reagendamento
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {done && (
        <div
          style={{
            position: "absolute",
            right: 90,
            bottom: 70,
            background: C.accent,
            color: "#fff",
            padding: "14px 22px",
            borderRadius: 12,
            fontFamily: dm,
            fontWeight: 700,
            fontSize: 20,
            transform: `scale(${0.7 + doneS * 0.3})`,
            opacity: doneS,
            boxShadow: "0 20px 50px rgba(16,185,129,.4)",
          }}
        >
          Reagendado para 22/05 às 10:30
        </div>
      )}

      <Cursor x={cx} y={cy} />
    </Frame>
  );
};
