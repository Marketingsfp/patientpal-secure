import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { Backdrop, Rise } from "../components/Kit";
import { display, body } from "../fonts";
import { C } from "../theme";

export const A1Hook: React.FC = () => {
  const frame = useCurrentFrame();
  const glow = interpolate(frame, [0, 60], [0.2, 0.55], { extrapolateRight: "clamp" });
  return (
    <AbsoluteFill>
      <Backdrop tone={0} />
      <AbsoluteFill style={{ padding: "0 150px", justifyContent: "center" }}>
        <Rise delay={4} y={44}>
          <div style={{ fontFamily: body, color: C.clay, fontSize: 30, letterSpacing: 6, fontWeight: 700 }}>
            CARTÃO CONSULTA · CARTÃO DESCONTO
          </div>
        </Rise>
        <div style={{ height: 26 }} />
        <Rise delay={14} y={54}>
          <div style={{ fontFamily: display, color: C.cream, fontSize: 104, fontWeight: 700, lineHeight: 1.02 }}>
            Pagamento avulso
          </div>
        </Rise>
        <Rise delay={26} y={40}>
          <div style={{ fontFamily: display, color: C.greenSoft, fontSize: 66, fontWeight: 600, marginTop: 10 }}>
            quando não há parcela em aberto
          </div>
        </Rise>
        <div style={{ height: 34 }} />
        <Rise delay={40} y={30}>
          <div style={{ fontFamily: body, color: C.creamDim, fontSize: 34, maxWidth: 1200 }}>
            Serve para o paciente que não veio na migração do sistema antigo — recebe na hora, sem segurar a fila do caixa.
          </div>
        </Rise>
      </AbsoluteFill>
      <AbsoluteFill style={{
        background: `radial-gradient(720px 420px at 78% 78%, ${C.clay}${Math.round(glow * 90).toString(16).padStart(2, "0")}, transparent 70%)`,
      }} />
    </AbsoluteFill>
  );
};
