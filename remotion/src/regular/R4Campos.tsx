import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { Backdrop, Rise, StepTag, Panel } from "../components/Kit";
import { display, body } from "../fonts";
import { C } from "../theme";

const CAMPOS: Array<[string, string]> = [
  ["Paciente", "busca por nome ou prontuário"],
  ["Mês de referência", "o mês que está sendo pago (ex.: Julho / 2026)"],
  ["Valor", "valor da mensalidade combinada"],
  ["Plano", "Cartão Consulta / Cartão Desconto"],
  ["Convênio", "opcional"],
  ["Dia de vencimento", "dia fixo das próximas parcelas"],
];

export const R4Campos: React.FC = () => {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill>
      <Backdrop tone={1} />
      <AbsoluteFill style={{ padding: "90px 140px" }}>
        <StepTag n="3" label="Preencher" delay={0} font={body} />
        <div style={{ height: 18 }} />
        <Rise delay={6} y={30}>
          <div style={{ fontFamily: display, color: C.cream, fontSize: 58, fontWeight: 700 }}>
            O que o sistema pergunta
          </div>
        </Rise>
        <div style={{ height: 26 }} />
        <Panel delay={12} style={{ maxWidth: 1520 }}>
          {CAMPOS.map(([k, v], i) => {
            const op = interpolate(frame, [16 + i * 9, 28 + i * 9], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
            const destaque = i === 1;
            return (
              <div key={k} style={{
                opacity: op, display: "flex", gap: 26, alignItems: "baseline",
                borderBottom: i < CAMPOS.length - 1 ? `1px solid ${C.greenSoft}33` : "none",
                padding: "15px 4px",
              }}>
                <div style={{
                  fontFamily: display, fontSize: 30, fontWeight: 700, width: 330,
                  color: destaque ? C.clay : C.greenSoft,
                }}>{k}</div>
                <div style={{ fontFamily: body, color: C.cream, fontSize: 29 }}>{v}</div>
              </div>
            );
          })}
        </Panel>
        <div style={{ height: 24 }} />
        <Rise delay={82} y={24}>
          <div style={{ fontFamily: body, color: C.creamDim, fontSize: 28, maxWidth: 1400 }}>
            O <span style={{ color: C.clay, fontWeight: 700 }}>mês de referência</span> é o que manda:
            ele define a parcela 1 e o vencimento das seguintes.
          </div>
        </Rise>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
