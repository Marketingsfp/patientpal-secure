import React from "react";
import { AbsoluteFill } from "remotion";
import { Backdrop, Panel, Rise, StepTag, Cursor } from "../components/Kit";
import { display, body } from "../fonts";
import { C } from "../theme";

const locais = [
  { t: "Agenda", d: "botão no topo da tela" },
  { t: "Caixa", d: "cabeçalho do movimento" },
  { t: "Contratos › Vendas", d: "ação da lista" },
  { t: "Ficha do paciente", d: "aba Cartão Benefícios" },
];

export const S2Onde: React.FC = () => (
  <AbsoluteFill>
    <Backdrop tone={1} />
    <AbsoluteFill style={{ padding: "110px 140px" }}>
      <StepTag n="1" label="Onde encontrar" delay={0} font={body} />
      <div style={{ height: 26 }} />
      <Rise delay={6} y={36}>
        <div style={{ fontFamily: display, color: C.cream, fontSize: 66, fontWeight: 700 }}>
          Clique em <span style={{ color: C.clay }}>💳 Mensalidade do cartão</span>
        </div>
      </Rise>
      <div style={{ height: 44 }} />
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 22, maxWidth: 1200 }}>
        {locais.map((l, i) => (
          <Panel key={l.t} delay={16 + i * 7} style={{ padding: "24px 28px" }}>
            <div style={{ fontFamily: display, color: C.cream, fontSize: 34, fontWeight: 600 }}>{l.t}</div>
            <div style={{ fontFamily: body, color: C.creamDim, fontSize: 22, marginTop: 6 }}>{l.d}</div>
          </Panel>
        ))}
      </div>
    </AbsoluteFill>
    <Cursor from={[1500, 900]} to={[1080, 640]} start={54} />
  </AbsoluteFill>
);
