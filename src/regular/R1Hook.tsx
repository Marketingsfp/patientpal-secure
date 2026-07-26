import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { Backdrop, Rise } from "../components/Kit";
import { display, body } from "../fonts";
import { C } from "../theme";

export const R1Hook: React.FC = () => {
  const frame = useCurrentFrame();
  const line = interpolate(frame, [16, 46], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <AbsoluteFill>
      <Backdrop tone={0} />
      <AbsoluteFill style={{ padding: "150px 140px", justifyContent: "center" }}>
        <Rise delay={0} y={30}>
          <div style={{ fontFamily: body, color: C.clay, fontSize: 28, letterSpacing: 6, textTransform: "uppercase" }}>
            Cartão Consulta · Cartão Desconto
          </div>
        </Rise>
        <div style={{ height: 26 }} />
        <Rise delay={8} y={50}>
          <div style={{ fontFamily: display, color: C.cream, fontSize: 108, fontWeight: 700, lineHeight: 1.03, maxWidth: 1480 }}>
            Pagamento avulso agora
            <br />
            regulariza o contrato
          </div>
        </Rise>
        <div style={{ height: 34, width: 620 * line, borderBottom: `6px solid ${C.clay}`, marginTop: 30 }} />
        <div style={{ height: 30 }} />
        <Rise delay={40} y={26}>
          <div style={{ fontFamily: body, color: C.creamDim, fontSize: 34, maxWidth: 1250 }}>
            O caixa recebe a mensalidade, informa o mês de referência e o sistema cria o contrato
            com as 12 parcelas — sem segurar a fila.
          </div>
        </Rise>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};