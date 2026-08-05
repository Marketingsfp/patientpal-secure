import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { Backdrop, Rise } from "../components/Kit";
import { display, body } from "../fonts";
import { C } from "../theme";

export const S1Hook: React.FC = () => {
  const frame = useCurrentFrame();
  const float = Math.sin(frame / 40) * 6;
  return (
    <AbsoluteFill>
      <Backdrop />
      <AbsoluteFill style={{ padding: "0 140px", justifyContent: "center" }}>
        <Rise delay={0} y={20}>
          <div style={{ fontFamily: body, color: C.clay, letterSpacing: 8, fontSize: 24, textTransform: "uppercase", fontWeight: 700 }}>
            ClinicaOS · Cartão Consulta
          </div>
        </Rise>
        <div style={{ height: 28 }} />
        <Rise delay={8} y={60}>
          <div style={{ fontFamily: display, color: C.cream, fontSize: 104, lineHeight: 1.02, fontWeight: 700, maxWidth: 1300, transform: `translateY(${float}px)` }}>
            Receber a mensalidade<br />
            <span style={{ color: C.greenSoft }}>ficou muito mais rápido.</span>
          </div>
        </Rise>
        <div style={{ height: 34 }} />
        <Rise delay={22} y={30}>
          <div style={{ fontFamily: body, color: C.creamDim, fontSize: 30, maxWidth: 980 }}>
            Um só botão — <b style={{ color: C.cream }}>💳 Mensalidade do cartão</b> — em 4 lugares do sistema.
          </div>
        </Rise>
      </AbsoluteFill>
      <div style={{
        position: "absolute", left: 0, bottom: 96, height: 6, background: C.clay,
        width: interpolate(frame, [10, 90], [0, 620], { extrapolateRight: "clamp" }),
      }} />
    </AbsoluteFill>
  );
};
