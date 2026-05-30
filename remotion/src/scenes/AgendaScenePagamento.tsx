import { useCurrentFrame, useVideoConfig, spring, interpolate } from "remotion";
import { Frame, Cursor } from "../components/Frame";
import { C, dm } from "../theme";

export const AgendaScenePagamento: React.FC = () => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame: f, fps, config: { damping: 18 } });
  const openDialog = f > 22;
  const dialogS = spring({ frame: f - 22, fps, config: { damping: 18 } });
  const pixSel = f > 55;
  const processing = f > 75 && f < 100;
  const done = f > 100;
  const doneS = spring({ frame: f - 100, fps, config: { damping: 14 } });
  const barW = interpolate(f, [75, 100], [0, 100], { extrapolateRight: "clamp" });

  const cx = interpolate(f, [0, 22, 60, 110], [1500, 1450, 1100, 1100], { extrapolateRight: "clamp" });
  const cy = interpolate(f, [0, 22, 60, 110], [800, 360, 540, 540], { extrapolateRight: "clamp" });

  return (
    <Frame title="Agendas" step="Pagamento do agendamento">
      <div style={{ background: "#fff", border: `1px solid ${C.line}`, borderRadius: 16, padding: 22, opacity: s }}>
        {[
          { h: "08:30", n: "Lucas Andrade", st: "Confirmado", paid: true },
          { h: "09:00", n: "Maria Souza", st: done ? "Pago" : "Agendado", paid: done, hl: true },
          { h: "09:30", n: "Pedro Costa", st: "Agendado", paid: false },
        ].map((r, i) => (
          <div key={i} style={{ display: "grid", gridTemplateColumns: "100px 1fr 160px 60px", padding: "16px 12px", borderTop: i === 0 ? "none" : `1px solid ${C.line}`, alignItems: "center", borderRadius: 10, background: r.hl ? "rgba(29,78,216,.06)" : "transparent" }}>
            <div style={{ fontSize: 22, fontWeight: 700, fontFamily: dm, color: C.primary }}>{r.h}</div>
            <div style={{ fontSize: 21, color: C.ink, fontWeight: r.hl ? 600 : 400 }}>{r.n}</div>
            <div style={{ fontSize: 16, color: r.paid ? C.accent : C.sub, fontWeight: 600, fontFamily: dm }}>{r.st}</div>
            <div style={{ textAlign: "right" }}>
              <div style={{ width: 36, height: 36, borderRadius: 10, background: r.paid ? "rgba(16,185,129,.15)" : "#F2F4F9", display: "inline-flex", alignItems: "center", justifyContent: "center", color: r.paid ? C.accent : C.sub, fontWeight: 700 }}>$</div>
            </div>
          </div>
        ))}
      </div>

      {openDialog && (
        <div style={{
          position: "absolute", left: "50%", top: 200,
          transform: `translateX(-50%) scale(${0.95 + dialogS * 0.05})`,
          opacity: dialogS,
          width: 760, background: "#fff", borderRadius: 20, padding: 30,
          border: `1px solid ${C.line}`, boxShadow: "0 30px 80px rgba(0,0,0,.2)", zIndex: 10,
        }}>
          <div style={{ fontSize: 24, fontWeight: 700, fontFamily: dm }}>Receber pagamento</div>
          <div style={{ fontSize: 17, color: C.sub, marginTop: 4 }}>Maria Souza · Consulta Cardiológica</div>

          <div style={{ background: C.cream, borderRadius: 12, padding: 18, marginTop: 16, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: 20, fontFamily: dm, color: C.sub }}>Total</span>
            <span style={{ fontSize: 30, fontWeight: 800, fontFamily: dm, color: C.primary }}>R$ 250,00</span>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 10, marginTop: 18 }}>
            {["PIX","Dinheiro","Débito","Crédito"].map((m,i)=>(
              <div key={m} style={{ padding: "14px 0", borderRadius: 10, textAlign: "center", fontFamily: dm, fontWeight: 600, fontSize: 18,
                background: pixSel && i===0 ? C.primarySoft : "#fff",
                border: `2px solid ${pixSel && i===0 ? C.primary : C.line}`,
                color: pixSel && i===0 ? C.primary : C.ink,
              }}>{m}</div>
            ))}
          </div>

          <div style={{ marginTop: 18 }}>
            <div style={{ height: 8, background: C.line, borderRadius: 999, overflow: "hidden" }}>
              <div style={{ width: `${barW}%`, height: "100%", background: `linear-gradient(90deg, ${C.primary}, ${C.accent})` }} />
            </div>
            <div style={{ marginTop: 10, color: processing ? C.primary : done ? C.accent : C.sub, fontSize: 16, fontWeight: 600, fontFamily: dm }}>
              {processing ? "Processando…" : done ? "Pagamento aprovado · recibo enviado" : "Selecione a forma de pagamento"}
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
        }}>R$ 250,00 · PIX recebido</div>
      )}

      <Cursor x={cx} y={cy} />
    </Frame>
  );
};