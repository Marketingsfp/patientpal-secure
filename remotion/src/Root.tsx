import React from "react";
import { Composition } from "remotion";
import { MainVideo } from "./MainVideo";
import { AvulsoVideo } from "./AvulsoVideo";
import { RegularizacaoVideo } from "./RegularizacaoVideo";

export const RemotionRoot: React.FC = () => (
  <>
    <Composition id="main" component={MainVideo} durationInFrames={670} fps={30} width={1920} height={1080} />
    <Composition id="avulso" component={AvulsoVideo} durationInFrames={700} fps={30} width={1920} height={1080} />
    <Composition id="regularizacao" component={RegularizacaoVideo} durationInFrames={882} fps={30} width={1920} height={1080} />
  </>
);
