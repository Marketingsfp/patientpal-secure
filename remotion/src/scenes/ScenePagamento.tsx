import { useCurrentFrame, useVideoConfig, spring, interpolate } from "remotion";
import { Frame, Cursor } from "../components/Frame";
import { C, dm } from "../theme";

export const ScenePagamento: React.FC = () => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame: f, fps, config: { damping: 18 } });
  const selected = f > 50 ? "pix" : null;
  const processing = f > 85 && f < 130;
  const done = f > 130;
  const doneS = spring({ frame: f - 130, fps, config: { damping: 12 } });
  const barW = interpolate(f, [85, 130], [0, 100], { extrapolateRight: "clamp" });

  const cx = interpolate(f, [0, 25, 55, 95], [1500, 700, 700, 1450], { extrapolateRight: "clamp" });
  const cy = interpolate(f, [0, 25, 55, 95], [800, 480, 480, 760], { extrapolateRight: "clamp" });

  return (
    <Frame title="Caixa" step="Etapa 3 — Pagamento (antes do atendimento)">
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1.1fr", gap: 28, opacity: s, transform: `translateY(${(1 - s) * 12}px)` }}>
        <div style={{ background: "#fff", borderRadius: 16, padding: 26, border: `1px solid ${C.line}` }}>
          <div style={{ fontSize: 20, color: C.sub, fontFamily: dm, marginBottom: 8 }}>Resumo do atendimento</div>
          <div style={{ fontSize: 26, fontWeight: 700, fontFamily: dm }}>Maria Souza</div>
          <div style={{ fontSize: 18, color: C.sub }}>Consulta Cardiológica · Dr. Roberto</div>

          <div style={{ marginTop: 22, padding: 18, background: C.cream, borderRadius: 12 }}>
            <Row k="Procedimento" v="R$ 250,00" />
            <Row k="Desconto" v="- R$ 0,00" />
            <div style={{ height: 1, background: C.line, margin: "12px 0" }} />
            <Row k="Total" v="R$ 250,00" bold />
          </div>
        </div>

        <div style={{ background: "#fff", borderRadius: 16, padding: 26, border: `1px solid ${C.line}` }}>
          <div style={{ fontSize: 20, color: C.sub, fontFamily: dm, marginBottom: 14 }}>Forma de pagamento</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <Pay label="PIX" sub="R$ 250,00" on={selected === "pix"} />
            <Pay label="Cartão Crédito" sub="R$ 275,00" />
            <Pay label="Dinheiro" sub="R$ 250,00" />
            <Pay label="Cartão Débito" sub="R$ 250,00" />
          </div>

          <div style={{ marginTop: 22 }}>
            <div style={{ height: 10, background: C.line, borderRadius: 999, overflow: "hidden" }}>
              <div style={{ width: `${barW}%`, height: "100%", background: `linear-gradient(90deg, ${C.primary}, ${C.accent})` }} />
            </div>
            <div style={{ marginTop: 12, color: processing ? C.primary : done ? C.accent : C.sub, fontSize: 18, fontWeight: 600, fontFamily: dm }}>
              {processing ? "Processando pagamento…" : done ? "Pagamento aprovado" : "Aguardando seleção"}
            </div>
          </div>
        </div>
      </div>

      {done && (
        <div style={{
          position: "absolute", right: 60, bottom: 60,
          background: C.accent, color: "#fff", padding: "18px 28px", borderRadius: 16,
          display: "flex", alignItems: "center", gap: 12, fontFamily: dm, fontWeight: 700, fontSize: 24,
          transform: `scale(${0.6 + doneS * 0.4})`, opacity: doneS,
          boxShadow: "0 20px 60px rgba(16,185,129,.4)",
        }}>
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3"><path d="M5 12l5 5L20 7"/></svg>
          R$ 250,00 recebidos via PIX
        </div>
      )}

      <Cursor x={cx} y={cy} />
    </Frame>
  );
};

const Row: React.FC<{ k: string; v: string; bold?: boolean }> = ({ k, v, bold }) => (
  <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", fontSize: bold ? 24 : 20, fontWeight: bold ? 700 : 500, color: bold ? C.ink : C.sub, fontFamily: dm }}>
    <span>{k}</span><span style={{ color: bold ? C.primary : C.ink }}>{v}</span>
  </div>
);

const Pay: React.FC<{ label: string; sub: string; on?: boolean }> = ({ label, sub, on }) => (
  <div style={{
    padding: 18, borderRadius: 12,
    background: on ? C.primarySoft : "#fff",
    border: `2px solid ${on ? C.primary : C.line}`,
    boxShadow: on ? "0 10px 30px rgba(29,78,216,.18)" : "none",
  }}>
    <div style={{ fontSize: 22, fontWeight: 700, fontFamily: dm, color: on ? C.primary : C.ink }}>{label}</div>
    <div style={{ fontSize: 18, color: C.sub, marginTop: 4 }}>{sub}</div>
  </div>
);