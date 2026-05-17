import { AbsoluteFill, useCurrentFrame, interpolate } from "remotion";
import { TransitionSeries, springTiming } from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";
import { slide } from "@remotion/transitions/slide";
import { C, inter } from "./theme";
import { SceneIntro } from "./scenes/SceneIntro";
import { SceneBusca } from "./scenes/SceneBusca";
import { SceneAgendar } from "./scenes/SceneAgendar";
import { SceneFluxo } from "./scenes/SceneFluxo";
import { ScenePagamento } from "./scenes/ScenePagamento";
import { SceneFinal } from "./scenes/SceneFinal";

export const FPS = 30;
const D = { intro: 75, busca: 150, agendar: 135, fluxo: 135, pagto: 165, final: 105 };
const T = 18;
export const DURATION = D.intro + D.busca + D.agendar + D.fluxo + D.pagto + D.final - T * 5;

function Background() {
  const f = useCurrentFrame();
  const a = interpolate(f, [0, DURATION], [0, 1]);
  return (
    <AbsoluteFill
      style={{
        background: `radial-gradient(1200px 800px at ${20 + a * 30}% ${30 + a * 20}%, #1a2a4a 0%, ${C.bg} 60%)`,
      }}
    />
  );
}

export const MainVideo: React.FC = () => {
  return (
    <AbsoluteFill style={{ fontFamily: inter, background: C.bg }}>
      <Background />
      <TransitionSeries>
        <TransitionSeries.Sequence durationInFrames={D.intro}>
          <SceneIntro />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition presentation={fade()} timing={springTiming({ config: { damping: 200 }, durationInFrames: T })} />
        <TransitionSeries.Sequence durationInFrames={D.busca}>
          <SceneBusca />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition presentation={slide({ direction: "from-right" })} timing={springTiming({ config: { damping: 200 }, durationInFrames: T })} />
        <TransitionSeries.Sequence durationInFrames={D.agendar}>
          <SceneAgendar />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition presentation={slide({ direction: "from-right" })} timing={springTiming({ config: { damping: 200 }, durationInFrames: T })} />
        <TransitionSeries.Sequence durationInFrames={D.fluxo}>
          <SceneFluxo />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition presentation={slide({ direction: "from-right" })} timing={springTiming({ config: { damping: 200 }, durationInFrames: T })} />
        <TransitionSeries.Sequence durationInFrames={D.pagto}>
          <ScenePagamento />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition presentation={fade()} timing={springTiming({ config: { damping: 200 }, durationInFrames: T })} />
        <TransitionSeries.Sequence durationInFrames={D.final}>
          <SceneFinal />
        </TransitionSeries.Sequence>
      </TransitionSeries>
    </AbsoluteFill>
  );
};