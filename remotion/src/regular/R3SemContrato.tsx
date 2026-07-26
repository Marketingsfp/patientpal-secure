import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { Backdrop, Rise, StepTag, Panel } from "../components/Kit";
import { display, body } from "../fonts";
import { C } from "../theme";

export const R3SemContrato: React.FC = () => {
  const frame = useCurrentFrame();
  const pulse = 0.5 + 0.5 * Math.sin(frame / 9);
  return (
    <AbsoluteFill>
      <Backdrop tone={2} />
      <AbsoluteFill style={{ padding: "100px 140px" }}>
        <StepTag n="2" label="Paciente sem contrato" delay={0} font={body} />
        <div style={{ height: 22 }} />
        <Rise delay={6} y={34}>
          <div style={{ fontFamily: display, color: C.cream, fontSize: 62, fontWeight: 700, maxWidth: 1400 }}>
            “Nenhuma mensalidade em aberto”
          </div>
        </Rise>
        <div style={{ height: 26 }} />
        <Rise delay={14} y={26}>
          <div style={{ fontFamily: body, color: C.creamDim, fontSize: 32, maxWidth: 1300 }}>
            Cadastro que não veio da migração do sistema antigo. Não segure o caixa: use o botão abaixo.
          </div>
        </Rise>
        <div style={{ height: 36 }} />
        <Panel delay={26} style={{ maxWidth: 1180 }}>
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "center", gap: 16,
            padding: "26px 30px", borderRadius: 18,
            background: C.clay, color: C.cream,
            fontFamily: display, fontSize: 40, fontWeight: 700,
            boxShadow: `0 0 ${20 + pulse * 40}px ${C.clay}66`,
          }}>
            Pagamento avulso (sem contrato)
          </div>
        </Panel>
        <div style={{ height: 30 }} />
        <Rise delay={62} y={24}>
          <div style={{ fontFamily: body, color: C.creamDim, fontSize: 28, maxWidth: 1300 }}>
            Se o paciente tem contrato mas está em dia, aparece também a opção
            <span style={{ color: C.cream, fontWeight: 700 }}> “Antecipar próxima parcela”</span>.
          </div>
        </Rise>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
