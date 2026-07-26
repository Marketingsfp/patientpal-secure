import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { Backdrop, Rise, StepTag, Panel } from "../components/Kit";
import { display, body } from "../fonts";
import { C } from "../theme";

const AVISOS = [
  "Confira o valor antes de confirmar — ele vira o valor das 12 parcelas.",
  "Mês de referência errado gera vencimentos errados: revise antes.",
  "Se não quiser criar contrato, desmarque a opção e só o caixa é lançado.",
  "Isso é um acerto pontual, não substitui o cadastro normal do contrato.",
];

export const R6Cuidados: React.FC = () => {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill>
      <Backdrop tone={2} />
      <AbsoluteFill style={{ padding: "100px 140px" }}>
        <StepTag n="5" label="Atenção da equipe" delay={0} font={body} />
        <div style={{ height: 20 }} />
        <Rise delay={6} y={30}>
          <div style={{ fontFamily: display, color: C.cream, fontSize: 58, fontWeight: 700 }}>
            Antes de confirmar
          </div>
        </Rise>
        <div style={{ height: 30 }} />
        <Panel delay={12} style={{ maxWidth: 1520 }}>
          {AVISOS.map((a, i) => {
            const op = interpolate(frame, [18 + i * 12, 32 + i * 12], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
            return (
              <div key={a} style={{
                opacity: op, display: "flex", gap: 22, alignItems: "flex-start", padding: "16px 4px",
                borderBottom: i < AVISOS.length - 1 ? `1px solid ${C.greenSoft}33` : "none",
              }}>
                <div style={{ width: 14, height: 14, borderRadius: 4, background: C.clay, marginTop: 12 }} />
                <div style={{ fontFamily: body, color: C.cream, fontSize: 30, lineHeight: 1.45 }}>{a}</div>
              </div>
            );
          })}
        </Panel>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
