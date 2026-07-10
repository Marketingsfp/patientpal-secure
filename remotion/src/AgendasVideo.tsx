import { AbsoluteFill, useCurrentFrame, interpolate } from "remotion";
import { TransitionSeries, springTiming } from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";
import { slide } from "@remotion/transitions/slide";
import { C, inter } from "./theme";
import { AgendaSceneFiltro } from "./scenes/AgendaSceneFiltro";
import { AgendaSceneNovo } from "./scenes/AgendaSceneNovo";
import { AgendaScenePagamento } from "./scenes/AgendaScenePagamento";
import { AgendaSceneCheckin } from "./scenes/AgendaSceneCheckin";
import { AgendaSceneReagendar } from "./scenes/AgendaSceneReagendar";
import { AgendaSceneLote } from "./scenes/AgendaSceneLote";
import { AgendaSceneHistorico } from "./scenes/AgendaSceneHistorico";

const D = {
  filtro: 130,
  novo: 160,
  pagto: 135,
  checkin: 100,
  reagendar: 140,
  lote: 150,
  historico: 130,
};
const T = 15;
export const AGENDAS_DURATION =
  D.filtro + D.novo + D.pagto + D.checkin + D.reagendar + D.lote + D.historico - T * 6;

function Background() {
  const f = useCurrentFrame();
  const a = interpolate(f, [0, AGENDAS_DURATION], [0, 1]);
  return (
    <AbsoluteFill
      style={{
        background: `radial-gradient(1200px 800px at ${20 + a * 30}% ${30 + a * 20}%, #1a2a4a 0%, ${C.bg} 60%)`,
      }}
    />
  );
}

const slideR = slide({ direction: "from-right" });
const fadeT = fade();
const timing = springTiming({ config: { damping: 200 }, durationInFrames: T });

export const AgendasVideo: React.FC = () => (
  <AbsoluteFill style={{ fontFamily: inter, background: C.bg }}>
    <Background />
    <TransitionSeries>
      <TransitionSeries.Sequence durationInFrames={D.filtro}>
        <AgendaSceneFiltro />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={slideR} timing={timing} />
      <TransitionSeries.Sequence durationInFrames={D.novo}>
        <AgendaSceneNovo />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={fadeT} timing={timing} />
      <TransitionSeries.Sequence durationInFrames={D.pagto}>
        <AgendaScenePagamento />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={slideR} timing={timing} />
      <TransitionSeries.Sequence durationInFrames={D.checkin}>
        <AgendaSceneCheckin />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={fadeT} timing={timing} />
      <TransitionSeries.Sequence durationInFrames={D.reagendar}>
        <AgendaSceneReagendar />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={slideR} timing={timing} />
      <TransitionSeries.Sequence durationInFrames={D.lote}>
        <AgendaSceneLote />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={fadeT} timing={timing} />
      <TransitionSeries.Sequence durationInFrames={D.historico}>
        <AgendaSceneHistorico />
      </TransitionSeries.Sequence>
    </TransitionSeries>
  </AbsoluteFill>
);
