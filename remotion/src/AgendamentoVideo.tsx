import { AbsoluteFill, useCurrentFrame, interpolate, Sequence, Audio, staticFile } from "remotion";
import { TransitionSeries, springTiming } from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";
import { slide } from "@remotion/transitions/slide";
import { C, inter } from "./theme";
import { SceneBusca } from "./scenes/SceneBusca";
import { SceneAgendar } from "./scenes/SceneAgendar";
import { ScenePagamento } from "./scenes/ScenePagamento";

const D = { busca: 330, agendar: 165, pagto: 294 };
const T = 18;
export const AGENDAMENTO_DURATION = D.busca + D.agendar + D.pagto - T * 2;

const START = {
  busca: 0,
  agendar: D.busca - T,
  pagto: D.busca + D.agendar - T * 2,
};

function Background() {
  const f = useCurrentFrame();
  const a = interpolate(f, [0, AGENDAMENTO_DURATION], [0, 1]);
  return (
    <AbsoluteFill
      style={{
        background: `radial-gradient(1200px 800px at ${20 + a * 30}% ${30 + a * 20}%, #1a2a4a 0%, ${C.bg} 60%)`,
      }}
    />
  );
}

export const AgendamentoVideo: React.FC = () => {
  return (
    <AbsoluteFill style={{ fontFamily: inter, background: C.bg }}>
      <Background />
      <TransitionSeries>
        <TransitionSeries.Sequence durationInFrames={D.busca}>
          <SceneBusca />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition presentation={slide({ direction: "from-right" })} timing={springTiming({ config: { damping: 200 }, durationInFrames: T })} />
        <TransitionSeries.Sequence durationInFrames={D.agendar}>
          <SceneAgendar />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition presentation={fade()} timing={springTiming({ config: { damping: 200 }, durationInFrames: T })} />
        <TransitionSeries.Sequence durationInFrames={D.pagto}>
          <ScenePagamento />
        </TransitionSeries.Sequence>
      </TransitionSeries>
      <Sequence from={START.busca + 8}><Audio src={staticFile("audio/busca.mp3")} volume={0.95} /></Sequence>
      <Sequence from={START.agendar + 8}><Audio src={staticFile("audio/agendar.mp3")} volume={0.95} /></Sequence>
      <Sequence from={START.pagto + 8}><Audio src={staticFile("audio/pagto.mp3")} volume={0.95} /></Sequence>
    </AbsoluteFill>
  );
};
