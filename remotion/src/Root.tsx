import { Composition } from "remotion";
import { TriagemVideo } from "./TriagemVideo";
import { AtendimentoVideo } from "./AtendimentoVideo";
import { ChamadaVideo } from "./ChamadaVideo";
import { TourVideo } from "./TourVideo";
import { AgendamentoVideo } from "./AgendamentoVideo";
import { EnfermagemVideo, ENFERMAGEM_DURATION } from "./EnfermagemVideo";
import { AgendasVideo, AGENDAS_DURATION } from "./AgendasVideo";

export const RemotionRoot: React.FC = () => (
  <>
    <Composition
      id="tour"
      component={TourVideo}
      durationInFrames={1830}
      fps={30}
      width={1920}
      height={1080}
    />
    <Composition
      id="agendamento"
      component={AgendamentoVideo}
      durationInFrames={753}
      fps={30}
      width={1920}
      height={1080}
    />
    <Composition
      id="agendas"
      component={AgendasVideo}
      durationInFrames={AGENDAS_DURATION}
      fps={30}
      width={1920}
      height={1080}
    />
    <Composition
      id="enfermagem"
      component={EnfermagemVideo}
      durationInFrames={ENFERMAGEM_DURATION}
      fps={30}
      width={1920}
      height={1080}
    />
    <Composition
      id="triagem"
      component={TriagemVideo}
      durationInFrames={660}
      fps={30}
      width={1920}
      height={1080}
    />
    <Composition
      id="atendimento"
      component={AtendimentoVideo}
      durationInFrames={660}
      fps={30}
      width={1920}
      height={1080}
    />
    <Composition
      id="chamada"
      component={ChamadaVideo}
      durationInFrames={600}
      fps={30}
      width={1920}
      height={1080}
    />
  </>
);
