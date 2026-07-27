import React from "react";
import { AbsoluteFill } from "remotion";
import { Backdrop, Rise, StepTag, Panel, Cursor } from "../components/Kit";
import { display, body } from "../fonts";
import { C } from "../theme";

const LOCAIS = ["Agenda", "Caixa", "Contratos › Vendas", "Ficha do paciente"];

export const A2Onde: React.FC = () => (
  <AbsoluteFill>
    <Backdrop tone={1} />
    <AbsoluteFill style={{ padding: "110px 140px" }}>
      <StepTag n="1" label="Abrir o faturamento rápido" delay={0} font={body} />
      <div style={{ height: 24 }} />
      <Rise delay={6} y={34}>
        <div style={{ fontFamily: display, color: C.cream, fontSize: 62, fontWeight: 700 }}>
          Botão <span style={{ color: C.greenSoft }}>💳 Mensalidade do cartão</span>
        </div>
      </Rise>
      <div style={{ height: 34 }} />
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 22, maxWidth: 1300 }}>
        {LOCAIS.map((l, i) => (
          <Panel key={l} delay={14 + i * 7}>
            <div style={{ fontFamily: display, color: C.cream, fontSize: 38, fontWeight: 600 }}>{l}</div>
            <div style={{ fontFamily: body, color: C.creamDim, fontSize: 24, marginTop: 6 }}>
              mesmo diálogo, mesmo resultado
            </div>
          </Panel>
        ))}
      </div>
    </AbsoluteFill>
    <Cursor from={[1620, 900]} to={[900, 660]} start={70} click={94} />
  </AbsoluteFill>
);
