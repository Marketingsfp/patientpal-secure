import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { Backdrop, Rise } from "../components/Kit";
import { display, body } from "../fonts";
import { C } from "../theme";

export const A6Close: React.FC = () => {
  const frame = useCurrentFrame();
  const line = interpolate(frame, [16, 52], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <AbsoluteFill>
      <Backdrop tone={0} />
      <AbsoluteFill style={{ padding: "0 150px", justifyContent: "center" }}>
        <Rise delay={4} y={40}>
          <div style={{ fontFamily: display, color: C.cream, fontSize: 92, fontWeight: 700, lineHeight: 1.05 }}>
            Caixa livre em<br />poucos cliques
          </div>
        </Rise>
        <div style={{ height: 26 }} />
        <div style={{ height: 6, width: `${line * 640}px`, background: C.clay, borderRadius: 4 }} />
        <div style={{ height: 26 }} />
        <Rise delay={30} y={28}>
          <div style={{ fontFamily: body, color: C.creamDim, fontSize: 34, maxWidth: 1200 }}>
            Paciente sem contrato migrado? Use o pagamento avulso e regularize o cadastro depois, com calma.
          </div>
        </Rise>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
