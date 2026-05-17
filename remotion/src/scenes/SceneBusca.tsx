import { useCurrentFrame, useVideoConfig, spring, interpolate } from "remotion";
import { Frame, Cursor } from "../components/Frame";
import { C, dm } from "../theme";

const TEXT = "Maria Souza";

export const SceneBusca: React.FC = () => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const typedChars = Math.max(0, Math.min(TEXT.length, Math.floor(interpolate(f, [15, 60], [0, TEXT.length + 1]))));
  const typed = TEXT.slice(0, typedChars);
  const showResult = f > 60;
  const resultSpring = spring({ frame: f - 60, fps, config: { damping: 18 } });
  const cardSpring = spring({ frame: f - 90, fps, config: { damping: 18 } });
  const cx = interpolate(f, [0, 25, 60, 95, 130], [1200, 720, 720, 760, 760], { extrapolateRight: "clamp" });
  const cy = interpolate(f, [0, 25, 60, 95, 130], [700, 240, 240, 430, 430], { extrapolateRight: "clamp" });

  return (
    <Frame title="Consulta rápida" step="Etapa 1 — Buscar paciente">
      <div style={{ display: "flex", alignItems: "center", gap: 16, background: "#fff", borderRadius: 16, padding: "18px 22px", border: `1px solid ${C.line}`, boxShadow: "0 6px 20px rgba(0,0,0,.04)" }}>
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke={C.sub} strokeWidth="2"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>
        <div style={{ fontSize: 30, color: C.ink, fontFamily: dm, flex: 1 }}>
          {typed}<span style={{ opacity: (f / 6) % 2 < 1 ? 1 : 0 }}>|</span>
        </div>
        <div style={{ background: C.primary, color: "#fff", padding: "10px 18px", borderRadius: 10, fontSize: 20 }}>Buscar</div>
      </div>

      {showResult && (
        <div style={{ marginTop: 28, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18, opacity: resultSpring, transform: `translateY(${(1 - resultSpring) * 16}px)` }}>
          {[
            { n: "Maria Souza", d: "CPF 123.456.789-00 · 34 anos", t: "Paciente" },
            { n: "Mariana Silva", d: "CPF 987.654.321-00 · 28 anos", t: "Paciente" },
          ].map((p, i) => (
            <div key={i} style={{ background: "#fff", border: `1px solid ${i === 0 ? C.primary : C.line}`, borderRadius: 16, padding: 22, display: "flex", alignItems: "center", gap: 16, boxShadow: i === 0 ? "0 10px 30px rgba(29,78,216,.18)" : "none" }}>
              <div style={{ width: 54, height: 54, borderRadius: 999, background: i === 0 ? C.primarySoft : "#EEF1F7", color: C.primary, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 22, fontFamily: dm }}>
                {p.n[0]}
              </div>
              <div>
                <div style={{ fontSize: 24, fontWeight: 600, fontFamily: dm }}>{p.n}</div>
                <div style={{ fontSize: 18, color: C.sub, marginTop: 2 }}>{p.d}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {f > 90 && (
        <div style={{ marginTop: 32, background: "#fff", borderRadius: 16, padding: 24, border: `1px solid ${C.line}`, opacity: cardSpring, transform: `translateY(${(1 - cardSpring) * 16}px)` }}>
          <div style={{ fontSize: 20, color: C.sub, fontFamily: dm, marginBottom: 12 }}>Procedimentos sugeridos</div>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            {[
              { n: "Consulta Cardiológica", v: "R$ 250,00", on: true },
              { n: "Ultrassonografia Abdomen", v: "R$ 180,00" },
              { n: "Eletrocardiograma", v: "R$ 120,00" },
            ].map((p, i) => (
              <div key={i} style={{ background: p.on ? C.primarySoft : "#F2F4F9", border: `1px solid ${p.on ? C.primary : C.line}`, padding: "14px 18px", borderRadius: 12, display: "flex", flexDirection: "column", gap: 4 }}>
                <div style={{ fontSize: 20, fontWeight: 600, color: C.ink }}>{p.n}</div>
                <div style={{ fontSize: 18, color: p.on ? C.primary : C.sub, fontWeight: 600, fontFamily: dm }}>{p.v}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      <Cursor x={cx} y={cy} />
    </Frame>
  );
};