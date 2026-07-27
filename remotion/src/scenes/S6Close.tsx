import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { Backdrop, Rise } from "../components/Kit";
import { display, body } from "../fonts";
import { C } from "../theme";

export const S6Close: React.FC = () => {
  const frame = useCurrentFrame();
  const float = Math.sin(frame / 34) * 5;
  return (
    <AbsoluteFill>
      <Backdrop tone={2} />
      <AbsoluteFill style={{ padding: "0 140px", justifyContent: "center", alignItems: "flex-start" }}>
        <Rise delay={0} y={40}>
          <div style={{ fontFamily: display, color: C.cream, fontSize: 118, fontWeight: 700, lineHeight: 1, transform: `translateY(${float}px)` }}>
            4 passos.
          </div>
        </Rise>
        <div style={{ height: 14 }} />
        <Rise delay={12} y={40}>
          <div style={{ fontFamily: display, color: C.greenSoft, fontSize: 118, fontWeight: 700, lineHeight: 1 }}>
            Mensalidade paga.
          </div>
        </Rise>
        <div style={{ height: 36 }} />
        <Rise delay={26} y={26}>
          <div style={{ fontFamily: body, color: C.creamDim, fontSize: 30, maxWidth: 1000 }}>
            Disponível na Agenda, no Caixa, em Contratos e na ficha do paciente.
          </div>
        </Rise>
      </AbsoluteFill>
      <div style={{
        position: "absolute", right: 140, bottom: 110,
        fontFamily: body, color: C.clay, fontSize: 24, letterSpacing: 6, textTransform: "uppercase", fontWeight: 700,
        opacity: interpolate(frame, [30, 50], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
      }}>ClinicaOS</div>
    </AbsoluteFill>
  );
};
