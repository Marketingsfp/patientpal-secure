import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { Backdrop, Rise, StepTag, Panel, Cursor } from "../components/Kit";
import { display, body } from "../fonts";
import { C } from "../theme";

export const A3SemParcela: React.FC = () => {
  const frame = useCurrentFrame();
  const aviso = interpolate(frame, [40, 58], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <AbsoluteFill>
      <Backdrop tone={2} />
      <AbsoluteFill style={{ padding: "110px 140px" }}>
        <StepTag n="2" label="Buscar o paciente" delay={0} font={body} />
        <div style={{ height: 24 }} />
        <Rise delay={6} y={34}>
          <div style={{ fontFamily: display, color: C.cream, fontSize: 60, fontWeight: 700 }}>
            Nenhuma mensalidade em aberto?
          </div>
        </Rise>
        <div style={{ height: 34 }} />
        <Panel delay={14} style={{ maxWidth: 1300 }}>
          <div style={{ fontFamily: body, fontSize: 30, color: C.creamDim }}>
            O sistema avisa e já oferece a saída:
          </div>
          <div style={{ height: 20, opacity: aviso }} />
          <div style={{
            opacity: aviso,
            background: `${C.clay}22`, border: `1px solid ${C.clay}77`, borderRadius: 16, padding: "22px 26px",
            fontFamily: body, fontSize: 28, color: C.cream,
          }}>
            “Este paciente não tem contrato ativo cadastrado — pode ser um cadastro que não veio
            na migração do sistema antigo. Use o pagamento avulso abaixo.”
          </div>
          <div style={{ height: 22 }} />
          <div style={{
            opacity: interpolate(frame, [62, 78], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
            background: `${C.green}44`, border: `1px solid ${C.greenSoft}`, borderRadius: 16, padding: "24px 30px",
            fontFamily: display, fontSize: 36, fontWeight: 700, color: C.cream, textAlign: "center",
          }}>
            Pagamento avulso (sem contrato)
          </div>
        </Panel>
      </AbsoluteFill>
      <Cursor from={[1600, 940]} to={[960, 830]} start={80} click={104} />
    </AbsoluteFill>
  );
};
