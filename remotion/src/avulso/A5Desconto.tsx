import React from "react";
import { AbsoluteFill } from "remotion";
import { Backdrop, Rise, StepTag, Panel } from "../components/Kit";
import { display, body } from "../fonts";
import { C } from "../theme";

export const A5Desconto: React.FC = () => (
  <AbsoluteFill>
    <Backdrop tone={2} />
    <AbsoluteFill style={{ padding: "110px 140px" }}>
      <StepTag n="4" label="Cartão Consulta e Cartão Desconto" delay={0} font={body} />
      <div style={{ height: 24 }} />
      <Rise delay={6} y={34}>
        <div style={{ fontFamily: display, color: C.cream, fontSize: 58, fontWeight: 700 }}>
          Vale para os dois cartões
        </div>
      </Rise>
      <div style={{ height: 30 }} />
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 26, maxWidth: 1400 }}>
        <Panel delay={14}>
          <div style={{ fontFamily: display, color: C.greenSoft, fontSize: 40, fontWeight: 700 }}>Cartão Consulta</div>
          <div style={{ fontFamily: body, color: C.cream, fontSize: 27, marginTop: 12, lineHeight: 1.4 }}>
            Mensalidade do plano. Se houver contrato em dia, dá para <b>antecipar a próxima parcela</b> em vez do avulso.
          </div>
        </Panel>
        <Panel delay={24}>
          <div style={{ fontFamily: display, color: C.clay, fontSize: 40, fontWeight: 700 }}>Cartão Desconto</div>
          <div style={{ fontFamily: body, color: C.cream, fontSize: 27, marginTop: 12, lineHeight: 1.4 }}>
            Mesmo caminho: busca o paciente, escolhe o avulso e recebe. O lançamento entra no caixa do dia.
          </div>
        </Panel>
      </div>
      <div style={{ height: 28 }} />
      <Rise delay={40} y={26}>
        <div style={{ fontFamily: body, color: C.creamDim, fontSize: 28, maxWidth: 1400 }}>
          Importante: o avulso <b>não</b> dá baixa em parcela e <b>não</b> imprime GR de mensalidade — ele registra o recebimento no caixa.
        </div>
      </Rise>
    </AbsoluteFill>
  </AbsoluteFill>
);
