import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { Backdrop, Panel, Rise, StepTag, Cursor } from "../components/Kit";
import { display, body } from "../fonts";
import { C } from "../theme";

const formas = ["Dinheiro", "Pix", "Débito", "Crédito", "Misto"];

export const S5Pagar: React.FC = () => {
  const frame = useCurrentFrame();
  const sel = 1;
  return (
    <AbsoluteFill>
      <Backdrop tone={0} />
      <AbsoluteFill style={{ padding: "104px 140px" }}>
        <StepTag n="4" label="Receber e imprimir" delay={0} font={body} />
        <div style={{ height: 22 }} />
        <Rise delay={6} y={32}>
          <div style={{ fontFamily: display, color: C.cream, fontSize: 60, fontWeight: 700 }}>
            Escolha a forma e <span style={{ color: C.greenSoft }}>confirme</span>
          </div>
        </Rise>
        <div style={{ height: 38 }} />
        <div style={{ display: "flex", gap: 16, flexWrap: "wrap", maxWidth: 1150 }}>
          {formas.map((f, i) => {
            const o = interpolate(frame, [14 + i * 6, 26 + i * 6], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
            const active = i === sel && frame > 62;
            return (
              <div key={f} style={{
                opacity: o, transform: `translateY(${interpolate(o, [0, 1], [24, 0])}px)`,
                fontFamily: body, fontSize: 28, fontWeight: 600,
                color: active ? C.ink : C.cream,
                background: active ? C.greenSoft : "#0B1A16CC",
                border: `1px solid ${active ? C.greenSoft : C.greenSoft + "44"}`,
                borderRadius: 999, padding: "16px 32px",
              }}>{f}</div>
            );
          })}
        </div>
        <div style={{ height: 40 }} />
        <Panel delay={70} style={{ maxWidth: 900, display: "flex", alignItems: "center", gap: 26 }}>
          <div style={{ fontSize: 54 }}>🧾</div>
          <div>
            <div style={{ fontFamily: display, color: C.cream, fontSize: 36, fontWeight: 600 }}>Baixa feita + GR impressa</div>
            <div style={{ fontFamily: body, color: C.creamDim, fontSize: 24, marginTop: 6 }}>
              Entra no caixa do dia e conta como GR na conferência.
            </div>
          </div>
        </Panel>
      </AbsoluteFill>
      <Cursor from={[1600, 900]} to={[560, 560]} start={44} click={64} />
    </AbsoluteFill>
  );
};
