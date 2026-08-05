import React from "react";
import { AbsoluteFill } from "remotion";
import { TransitionSeries, springTiming } from "@remotion/transitions";
import { wipe } from "@remotion/transitions/wipe";
import { fade } from "@remotion/transitions/fade";
import { R1Hook } from "./regular/R1Hook";
import { R2Onde } from "./regular/R2Onde";
import { R3SemContrato } from "./regular/R3SemContrato";
import { R4Campos } from "./regular/R4Campos";
import { R5Parcelas } from "./regular/R5Parcelas";
import { R6Cuidados } from "./regular/R6Cuidados";
import { R7Close } from "./regular/R7Close";
import { C } from "./theme";

const T = springTiming({ config: { damping: 200 }, durationInFrames: 18 });

export const RegularizacaoVideo: React.FC = () => (
  <AbsoluteFill style={{ backgroundColor: C.bgDeep }}>
    <TransitionSeries>
      <TransitionSeries.Sequence durationInFrames={125}><R1Hook /></TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={wipe({ direction: "from-bottom" })} timing={T} />
      <TransitionSeries.Sequence durationInFrames={130}><R2Onde /></TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={wipe({ direction: "from-right" })} timing={T} />
      <TransitionSeries.Sequence durationInFrames={135}><R3SemContrato /></TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={wipe({ direction: "from-right" })} timing={T} />
      <TransitionSeries.Sequence durationInFrames={155}><R4Campos /></TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={wipe({ direction: "from-right" })} timing={T} />
      <TransitionSeries.Sequence durationInFrames={175}><R5Parcelas /></TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={wipe({ direction: "from-right" })} timing={T} />
      <TransitionSeries.Sequence durationInFrames={150}><R6Cuidados /></TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={fade()} timing={T} />
      <TransitionSeries.Sequence durationInFrames={120}><R7Close /></TransitionSeries.Sequence>
    </TransitionSeries>
  </AbsoluteFill>
);
