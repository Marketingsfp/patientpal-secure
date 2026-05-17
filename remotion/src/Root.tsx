import { Composition } from "remotion";
import { TriagemVideo } from "./TriagemVideo";
import { AtendimentoVideo } from "./AtendimentoVideo";
import { ChamadaVideo } from "./ChamadaVideo";

export const RemotionRoot: React.FC = () => (
  <>
    <Composition id="triagem" component={TriagemVideo} durationInFrames={660} fps={30} width={1920} height={1080} />
    <Composition id="atendimento" component={AtendimentoVideo} durationInFrames={660} fps={30} width={1920} height={1080} />
    <Composition id="chamada" component={ChamadaVideo} durationInFrames={600} fps={30} width={1920} height={1080} />
  </>
);
