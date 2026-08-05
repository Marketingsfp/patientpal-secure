import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { Backdrop, Rise, StepTag } from "../components/Kit";
import { display, body } from "../fonts";
import { C } from "../theme";

const MESES = ["JUL", "AGO", "SET", "OUT", "NOV", "DEZ", "JAN", "FEV", "MAR", "ABR", "MAI", "JUN"];

export const R5Parcelas: React.FC = () => {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill>
      <Backdrop tone={3} />
      <AbsoluteFill style={{ padding: "90px 140px" }}>
        <StepTag n="4" label="O que o sistema faz sozinho" delay={0} font={body} />
        <div style={{ height: 18 }} />
        <Rise delay={6} y={30}>
          <div style={{ fontFamily: display, color: C.cream, fontSize: 58, fontWeight: 700, maxWidth: 1500 }}>
            Cria o contrato e completa os 12 meses
          </div>
        </Rise>
        <div style={{ height: 40 }} />
        <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 20, maxWidth: 1560 }}>
          {MESES.map((m, i) => {
            const op = interpolate(frame, [18 + i * 6, 30 + i * 6], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
            const paga = i === 0;
            return (
              <div key={m} style={{
                opacity: op, transform: `translateY(${interpolate(op, [0, 1], [22, 0])}px)`,
                borderRadius: 20, padding: "20px 14px", textAlign: "center",
                background: paga ? C.green : "#0B1A16CC",
                border: `1px solid ${paga ? C.greenSoft : C.greenSoft + "44"}`,
              }}>
                <div style={{ fontFamily: body, color: C.creamDim, fontSize: 20, letterSpacing: 2 }}>{i + 1}/12</div>
                <div style={{ fontFamily: display, color: C.cream, fontSize: 34, fontWeight: 700, margin: "6px 0" }}>{m}</div>
                <div style={{ fontFamily: body, fontSize: 20, color: paga ? C.cream : C.creamDim }}>
                  {paga ? "PAGA" : "pendente"}
                </div>
              </div>
            );
          })}
        </div>
        <div style={{ height: 40 }} />
        <Rise delay={96} y={26}>
          <div style={{ fontFamily: body, color: C.creamDim, fontSize: 30, maxWidth: 1500 }}>
            A parcela do mês de referência já entra <span style={{ color: C.cream, fontWeight: 700 }}>paga</span>,
            ligada ao caixa, e a GR sai para impressão. O paciente passa a aparecer na aba de Convênio.
          </div>
        </Rise>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
