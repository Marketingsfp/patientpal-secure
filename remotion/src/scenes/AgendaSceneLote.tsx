import { useCurrentFrame, useVideoConfig, spring, interpolate } from "remotion";
import { Frame, Cursor } from "../components/Frame";
import { C, dm } from "../theme";

const ROWS = [
  { h: "08:30", n: "Lucas Andrade",  p: "Consulta Cardio",     v: 250 },
  { h: "09:00", n: "Maria Souza",    p: "Eletrocardiograma",   v: 180 },
  { h: "09:30", n: "Pedro Costa",    p: "Consulta Cardio",     v: 250 },
  { h: "10:00", n: "Helena Vargas",  p: "Ultrassom Abdomen",   v: 320 },
];

export const AgendaSceneLote: React.FC = () => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame: f, fps, config: { damping: 18 } });

  // sequential check-marks on rows 0,1,2
  const checked = [f > 18, f > 30, f > 42];
  const showBar = f > 50;
  const barS = spring({ frame: f - 50, fps, config: { damping: 16 } });
  const openDialog = f > 70;
  const dialogS = spring({ frame: f - 70, fps, config: { damping: 18 } });
  const done = f > 110;
  const doneS = spring({ frame: f - 110, fps, config: { damping: 14 } });

  const cx = interpolate(f, [0, 18, 30, 42, 60, 78, 115], [1500, 220, 220, 220, 1500, 1100, 1100], { extrapolateRight: "clamp" });
  const cy = interpolate(f, [0, 18, 30, 42, 60, 78, 115], [800, 320, 400, 480, 760, 540, 540], { extrapolateRight: "clamp" });

  const total = ROWS.slice(0, 3).reduce((s, r) => s + r.v, 0);

  return (
    <Frame title="Agendas" step="Pagamento em lote — vários pacientes">
      <div style={{ background: "#fff", border: `1px solid ${C.line}`, borderRadius: 16, padding: 18, opacity: s }}>
        {ROWS.map((r, i) => {
          const on = i < 3 && checked[i];
          return (
            <div key={i} style={{
              display: "grid", gridTemplateColumns: "44px 100px 1fr 1fr 120px",
              padding: "16px 12px", borderTop: i === 0 ? "none" : `1px solid ${C.line}`,
              alignItems: "center", borderRadius: 10,
              background: on ? "rgba(29,78,216,.06)" : "transparent",
            }}>
              <div style={{
                width: 24, height: 24, borderRadius: 6,
                border: `2px solid ${on ? C.primary : C.line}`,
                background: on ? C.primary : "#fff",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                {on && <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3"><path d="M5 12l5 5L20 7"/></svg>}
              </div>
              <div style={{ fontSize: 20, fontWeight: 700, fontFamily: dm, color: C.primary }}>{r.h}</div>
              <div style={{ fontSize: 19, color: C.ink }}>{r.n}</div>
              <div style={{ fontSize: 17, color: C.sub }}>{r.p}</div>
              <div style={{ fontSize: 18, fontFamily: dm, fontWeight: 700, color: C.ink, textAlign: "right" }}>R$ {r.v.toFixed(2).replace(".", ",")}</div>
            </div>
          );
        })}
      </div>

      {showBar && (
        <div style={{
          position: "absolute", left: "50%", bottom: openDialog ? -100 : 80,
          transform: `translateX(-50%) translateY(${(1 - barS) * 20}px)`,
          opacity: openDialog ? 1 - dialogS : barS,
          background: C.ink, color: "#fff",
          padding: "16px 24px", borderRadius: 14, display: "flex", alignItems: "center", gap: 20,
          boxShadow: "0 30px 80px rgba(0,0,0,.35)", fontFamily: dm, zIndex: 5,
        }}>
          <span style={{ fontSize: 19 }}>3 selecionados · R$ {total},00</span>
          <div style={{ background: C.accent, padding: "10px 18px", borderRadius: 10, fontWeight: 700, fontSize: 18 }}>Pagar selecionados</div>
        </div>
      )}

      {openDialog && (
        <div style={{
          position: "absolute", left: "50%", top: 230,
          transform: `translateX(-50%) scale(${0.95 + dialogS * 0.05})`,
          opacity: dialogS,
          width: 720, background: "#fff", borderRadius: 20, padding: 28,
          border: `1px solid ${C.line}`, boxShadow: "0 30px 80px rgba(0,0,0,.2)", zIndex: 10,
        }}>
          <div style={{ fontSize: 24, fontWeight: 700, fontFamily: dm }}>Pagamento agrupado</div>
          <div style={{ fontSize: 16, color: C.sub, marginTop: 4 }}>3 atendimentos · mesmo recebedor</div>

          <div style={{ marginTop: 16 }}>
            {ROWS.slice(0, 3).map((r, i) => (
              <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: `1px solid ${C.line}`, fontSize: 17 }}>
                <span style={{ color: C.ink }}>{r.n} · {r.p}</span>
                <span style={{ fontFamily: dm, fontWeight: 600 }}>R$ {r.v.toFixed(2).replace(".", ",")}</span>
              </div>
            ))}
            <div style={{ display: "flex", justifyContent: "space-between", padding: "14px 0 0", fontSize: 22, fontFamily: dm, fontWeight: 800, color: C.primary }}>
              <span>Total</span><span>R$ {total},00</span>
            </div>
          </div>

          <div style={{ marginTop: 18, display: "flex", justifyContent: "flex-end", gap: 10 }}>
            <div style={{ padding: "12px 22px", borderRadius: 10, background: done ? C.accent : C.primary, color: "#fff", fontFamily: dm, fontWeight: 700, fontSize: 18, boxShadow: "0 10px 24px rgba(29,78,216,.3)" }}>
              {done ? "Aprovado ✓" : "Confirmar pagamento"}
            </div>
          </div>
        </div>
      )}

      {done && (
        <div style={{
          position: "absolute", right: 90, bottom: 70,
          background: C.accent, color: "#fff", padding: "14px 22px", borderRadius: 12,
          fontFamily: dm, fontWeight: 700, fontSize: 20,
          transform: `scale(${0.7 + doneS * 0.3})`, opacity: doneS,
          boxShadow: "0 20px 50px rgba(16,185,129,.4)",
        }}>3 pagamentos · R$ {total},00 recebidos</div>
      )}

      <Cursor x={cx} y={cy} />
    </Frame>
  );
};