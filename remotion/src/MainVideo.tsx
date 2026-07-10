import { AbsoluteFill, useCurrentFrame, interpolate, Sequence, Audio, staticFile } from "remotion";
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
const D = { intro: 315, busca: 330, agendar: 375, pagto: 294, fluxo: 300, final: 240 };
const T = 18;
export const DURATION = D.intro + D.busca + D.agendar + D.fluxo + D.pagto + D.final - T * 5;

// scene start frames (accounting for overlapping transitions)
const START = {
  intro: 0,
  busca: D.intro - T,
  agendar: D.intro + D.busca - T * 2,
  pagto: D.intro + D.busca + D.agendar - T * 3,
  fluxo: D.intro + D.busca + D.agendar + D.pagto - T * 4,
  final: D.intro + D.busca + D.agendar + D.pagto + D.fluxo - T * 5,
};

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
        <TransitionSeries.Sequence durationInFrames={D.pagto}>
          <ScenePagamento />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition presentation={slide({ direction: "from-right" })} timing={springTiming({ config: { damping: 200 }, durationInFrames: T })} />
        <TransitionSeries.Sequence durationInFrames={D.fluxo}>
          <SceneFluxo />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition presentation={fade()} timing={springTiming({ config: { damping: 200 }, durationInFrames: T })} />
        <TransitionSeries.Sequence durationInFrames={D.final}>
          <SceneFinal />
        </TransitionSeries.Sequence>
      </TransitionSeries>
      <Sequence from={START.intro + 8}><Audio src={staticFile("audio/intro.mp3")} volume={0.95} /></Sequence>
      <Sequence from={START.busca + 8}><Audio src={staticFile("audio/busca.mp3")} volume={0.95} /></Sequence>
      <Sequence from={START.agendar + 8}><Audio src={staticFile("audio/agendar.mp3")} volume={0.95} /></Sequence>
      <Sequence from={START.pagto + 8}><Audio src={staticFile("audio/pagto.mp3")} volume={0.95} /></Sequence>
      <Sequence from={START.fluxo + 8}><Audio src={staticFile("audio/fluxo.mp3")} volume={0.95} /></Sequence>
      <Sequence from={START.final + 8}><Audio src={staticFile("audio/final.mp3")} volume={0.95} /></Sequence>
    </AbsoluteFill>
  );
};