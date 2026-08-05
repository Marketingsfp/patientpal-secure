import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { Backdrop, Rise } from "../components/Kit";
import { display, body } from "../fonts";
import { C } from "../theme";

export const R7Close: React.FC = () => {
  const frame = useCurrentFrame();
  const w = interpolate(frame, [14, 50], [0, 760], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <AbsoluteFill>
      <Backdrop tone={0} />
      <AbsoluteFill style={{ padding: "150px 140px", justifyContent: "center" }}>
        <Rise delay={0} y={40}>
          <div style={{ fontFamily: display, color: C.cream, fontSize: 96, fontWeight: 700, lineHeight: 1.05, maxWidth: 1500 }}>
            Recebeu, registrou,
            <br />
            contrato regularizado.
          </div>
        </Rise>
        <div style={{ height: 30, width: w, borderBottom: `6px solid ${C.greenSoft}`, marginTop: 26 }} />
        <div style={{ height: 30 }} />
        <Rise delay={40} y={26}>
          <div style={{ fontFamily: body, color: C.creamDim, fontSize: 34, maxWidth: 1300 }}>
            Dúvida no valor ou no mês? Chame a coordenação antes de confirmar — depois de criado,
            o ajuste é feito na tela de Contratos.
          </div>
        </Rise>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
