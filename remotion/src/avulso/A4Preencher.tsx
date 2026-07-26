import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { Backdrop, Rise, StepTag, Panel } from "../components/Kit";
import { display, body } from "../fonts";
import { C } from "../theme";

const LINHAS: Array<[string, string]> = [
  ["Categoria", "MENSALIDADE CARTAO CONSULTA (já vem preenchida)"],
  ["Descrição", "Mensalidade Cartão (avulso) — nome do paciente"],
  ["Valor", "digite o valor combinado"],
  ["Forma", "Dinheiro · Pix · Cartão · Misto"],
];

export const A4Preencher: React.FC = () => {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill>
      <Backdrop tone={1} />
      <AbsoluteFill style={{ padding: "100px 140px" }}>
        <StepTag n="3" label="Preencher e confirmar" delay={0} font={body} />
        <div style={{ height: 22 }} />
        <Rise delay={6} y={34}>
          <div style={{ fontFamily: display, color: C.cream, fontSize: 58, fontWeight: 700 }}>
            Quatro campos e pronto
          </div>
        </Rise>
        <div style={{ height: 30 }} />
        <Panel delay={12} style={{ maxWidth: 1400 }}>
          {LINHAS.map(([k, v], i) => {
            const op = interpolate(frame, [18 + i * 12, 32 + i * 12], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
            return (
              <div key={k} style={{
                opacity: op, display: "flex", gap: 26, alignItems: "baseline",
                borderBottom: i < LINHAS.length - 1 ? `1px solid ${C.greenSoft}33` : "none",
                padding: "18px 4px",
              }}>
                <div style={{ fontFamily: display, color: C.greenSoft, fontSize: 32, fontWeight: 700, width: 220 }}>{k}</div>
                <div style={{ fontFamily: body, color: C.cream, fontSize: 30 }}>{v}</div>
              </div>
            );
          })}
        </Panel>
        <div style={{ height: 26 }} />
        <Rise delay={70} y={26}>
          <div style={{ fontFamily: body, color: C.creamDim, fontSize: 28, maxWidth: 1300 }}>
            Dica: anote na descrição o número do contrato antigo — assim o financeiro consegue conciliar depois.
          </div>
        </Rise>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
