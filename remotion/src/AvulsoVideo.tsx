import React from "react";
import { AbsoluteFill } from "remotion";
import { TransitionSeries, springTiming } from "@remotion/transitions";
import { wipe } from "@remotion/transitions/wipe";
import { fade } from "@remotion/transitions/fade";
import { A1Hook } from "./avulso/A1Hook";
import { A2Onde } from "./avulso/A2Onde";
import { A3SemParcela } from "./avulso/A3SemParcela";
import { A4Preencher } from "./avulso/A4Preencher";
import { A5Desconto } from "./avulso/A5Desconto";
import { A6Close } from "./avulso/A6Close";
import { C } from "./theme";

const T = springTiming({ config: { damping: 200 }, durationInFrames: 18 });

export const AvulsoVideo: React.FC = () => (
  <AbsoluteFill style={{ backgroundColor: C.bgDeep }}>
    <TransitionSeries>
      <TransitionSeries.Sequence durationInFrames={115}><A1Hook /></TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={wipe({ direction: "from-bottom" })} timing={T} />
      <TransitionSeries.Sequence durationInFrames={125}><A2Onde /></TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={wipe({ direction: "from-right" })} timing={T} />
      <TransitionSeries.Sequence durationInFrames={145}><A3SemParcela /></TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={wipe({ direction: "from-right" })} timing={T} />
      <TransitionSeries.Sequence durationInFrames={150}><A4Preencher /></TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={wipe({ direction: "from-right" })} timing={T} />
      <TransitionSeries.Sequence durationInFrames={140}><A5Desconto /></TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={fade()} timing={T} />
      <TransitionSeries.Sequence durationInFrames={115}><A6Close /></TransitionSeries.Sequence>
    </TransitionSeries>
  </AbsoluteFill>
);
