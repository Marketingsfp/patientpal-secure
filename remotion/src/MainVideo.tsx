import React from "react";
import { AbsoluteFill } from "remotion";
import { TransitionSeries, springTiming } from "@remotion/transitions";
import { wipe } from "@remotion/transitions/wipe";
import { fade } from "@remotion/transitions/fade";
import { S1Hook } from "./scenes/S1Hook";
import { S2Onde } from "./scenes/S2Onde";
import { S3Busca } from "./scenes/S3Busca";
import { S4Parcelas } from "./scenes/S4Parcelas";
import { S5Pagar } from "./scenes/S5Pagar";
import { S6Close } from "./scenes/S6Close";
import { C } from "./theme";

const T = springTiming({ config: { damping: 200 }, durationInFrames: 18 });

export const MainVideo: React.FC = () => (
  <AbsoluteFill style={{ backgroundColor: C.bgDeep }}>
    <TransitionSeries>
      <TransitionSeries.Sequence durationInFrames={110}><S1Hook /></TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={wipe({ direction: "from-bottom" })} timing={T} />
      <TransitionSeries.Sequence durationInFrames={130}><S2Onde /></TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={wipe({ direction: "from-right" })} timing={T} />
      <TransitionSeries.Sequence durationInFrames={130}><S3Busca /></TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={wipe({ direction: "from-right" })} timing={T} />
      <TransitionSeries.Sequence durationInFrames={140}><S4Parcelas /></TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={wipe({ direction: "from-right" })} timing={T} />
      <TransitionSeries.Sequence durationInFrames={140}><S5Pagar /></TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={fade()} timing={T} />
      <TransitionSeries.Sequence durationInFrames={110}><S6Close /></TransitionSeries.Sequence>
    </TransitionSeries>
  </AbsoluteFill>
);
