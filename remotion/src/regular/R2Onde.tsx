import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { Backdrop, Rise, StepTag, Panel } from "../components/Kit";
import { display, body } from "../fonts";
import { C } from "../theme";

const LOCAIS = ["Agenda", "Caixa", "Contratos / Cartão Benefícios", "Ficha do paciente"];

export const R2Onde: React.FC = () => {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill>
      <Backdrop tone={1} />
      <AbsoluteFill style={{ padding: "100px 140px" }}>
        <StepTag n="1" label="Onde encontrar" delay={0} font={body} />
        <div style={{ height: 22 }} />
        <Rise delay={6} y={34}>
          <div style={{ fontFamily: display, color: C.cream, fontSize: 62, fontWeight: 700, maxWidth: 1400 }}>
            Botão “Faturamento rápido — Mensalidade do Cartão”
          </div>
        </Rise>
        <div style={{ height: 34 }} />
        <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
          {LOCAIS.map((l, i) => {
            const op = interpolate(frame, [16 + i * 10, 30 + i * 10], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
            const y = interpolate(op, [0, 1], [26, 0]);
            return (
              <div key={l} style={{
                opacity: op, transform: `translateY(${y}px)`,
                fontFamily: body, fontSize: 32, color: C.cream, fontWeight: 600,
                padding: "20px 32px", borderRadius: 999,
                border: `1px solid ${C.greenSoft}66`, background: "#0B1A16CC",
              }}>{l}</div>
            );
          })}
        </div>
        <div style={{ height: 40 }} />
        <Panel delay={62} style={{ maxWidth: 1440 }}>
          <div style={{ fontFamily: body, color: C.creamDim, fontSize: 30, lineHeight: 1.5 }}>
            Busque o paciente pelo nome ou prontuário. Se ele já tiver contrato ativo, as parcelas em aberto
            aparecem na hora — é só clicar em <span style={{ color: C.cream, fontWeight: 700 }}>Receber</span>.
          </div>
        </Panel>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
