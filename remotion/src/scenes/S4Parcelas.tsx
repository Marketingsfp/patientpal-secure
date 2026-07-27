import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { Backdrop, Panel, Rise, StepTag } from "../components/Kit";
import { display, body } from "../fonts";
import { C } from "../theme";

const rows = [
  { p: "05/2026", venc: "10/05", base: "59,90", tot: "67,68", late: true },
  { p: "06/2026", venc: "10/06", base: "59,90", tot: "64,20", late: true },
  { p: "07/2026", venc: "10/07", base: "59,90", tot: "59,90", late: false },
];

export const S4Parcelas: React.FC = () => {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill>
      <Backdrop tone={1} />
      <AbsoluteFill style={{ padding: "104px 140px" }}>
        <StepTag n="3" label="Conferir o que está em aberto" delay={0} font={body} />
        <div style={{ height: 22 }} />
        <Rise delay={6} y={32}>
          <div style={{ fontFamily: display, color: C.cream, fontSize: 58, fontWeight: 700 }}>
            Juros e multa já vêm <span style={{ color: C.clay }}>calculados</span>
          </div>
        </Rise>
        <div style={{ height: 32 }} />
        <Panel delay={14} style={{ maxWidth: 1300, padding: 26 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1.1fr 1fr 1fr 1fr", fontFamily: body, color: C.creamDim, fontSize: 20, letterSpacing: 2, textTransform: "uppercase", paddingBottom: 12 }}>
            <div>Competência</div><div>Vencimento</div><div>Valor base</div><div>Total a pagar</div>
          </div>
          {rows.map((r, i) => {
            const o = interpolate(frame, [20 + i * 9, 34 + i * 9], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
            return (
              <div key={r.p} style={{
                opacity: o, transform: `translateX(${interpolate(o, [0, 1], [30, 0])}px)`,
                display: "grid", gridTemplateColumns: "1.1fr 1fr 1fr 1fr", alignItems: "center",
                fontFamily: body, color: C.cream, fontSize: 30, padding: "18px 0",
                borderTop: `1px solid ${C.greenSoft}33`,
              }}>
                <div>{r.p}</div>
                <div style={{ color: r.late ? C.clay : C.creamDim }}>{r.venc}{r.late ? " · atrasada" : ""}</div>
                <div style={{ color: C.creamDim }}>R$ {r.base}</div>
                <div style={{ fontWeight: 700 }}>R$ {r.tot}</div>
              </div>
            );
          })}
        </Panel>
        <div style={{ height: 24 }} />
        <Rise delay={54} y={22}>
          <div style={{ fontFamily: body, color: C.creamDim, fontSize: 26 }}>
            5 dias de tolerância · depois, multa de 10% + 0,33% ao dia — automático.
          </div>
        </Rise>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
