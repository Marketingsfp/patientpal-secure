import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { Backdrop, Panel, Rise, StepTag, Cursor } from "../components/Kit";
import { display, body } from "../fonts";
import { C } from "../theme";

const NOME = "Quédima da Silva";

export const S3Busca: React.FC = () => {
  const frame = useCurrentFrame();
  const chars = Math.round(interpolate(frame, [26, 62], [0, NOME.length], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }));
  const caret = Math.floor(frame / 8) % 2 === 0;
  const showRes = frame > 64;
  return (
    <AbsoluteFill>
      <Backdrop tone={2} />
      <AbsoluteFill style={{ padding: "110px 140px" }}>
        <StepTag n="2" label="Buscar o paciente" delay={0} font={body} />
        <div style={{ height: 24 }} />
        <Rise delay={6} y={34}>
          <div style={{ fontFamily: display, color: C.cream, fontSize: 62, fontWeight: 700 }}>
            Digite o nome ou o <span style={{ color: C.greenSoft }}>prontuário</span>
          </div>
        </Rise>
        <div style={{ height: 40 }} />
        <Panel delay={14} style={{ maxWidth: 1180 }}>
          <div style={{
            fontFamily: body, fontSize: 32, color: C.cream, background: "#07110EAA",
            border: `1px solid ${C.greenSoft}55`, borderRadius: 16, padding: "20px 26px",
          }}>
            {NOME.slice(0, chars)}<span style={{ opacity: caret ? 1 : 0, color: C.clay }}>|</span>
          </div>
          <div style={{ height: 20 }} />
          <div style={{
            opacity: showRes ? interpolate(frame, [64, 78], [0, 1], { extrapolateRight: "clamp" }) : 0,
            display: "flex", justifyContent: "space-between", alignItems: "center",
            background: `${C.green}33`, border: `1px solid ${C.greenSoft}66`, borderRadius: 16, padding: "22px 26px",
          }}>
            <div>
              <div style={{ fontFamily: display, color: C.cream, fontSize: 32, fontWeight: 600 }}>QUÉDIMA DA SILVA SOARES</div>
              <div style={{ fontFamily: body, color: C.creamDim, fontSize: 22, marginTop: 4 }}>Prontuário 20260293 · Cartão Consulta</div>
            </div>
            <div style={{ fontFamily: body, color: C.clay, fontSize: 24, fontWeight: 700 }}>3 em aberto</div>
          </div>
        </Panel>
      </AbsoluteFill>
      <Cursor from={[1560, 880]} to={[1180, 700]} start={78} click={100} />
    </AbsoluteFill>
  );
};
