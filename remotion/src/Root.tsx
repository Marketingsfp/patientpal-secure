import React from "react";
import { Composition } from "remotion";
import { MainVideo } from "./MainVideo";
import { AvulsoVideo } from "./AvulsoVideo";

export const RemotionRoot: React.FC = () => (
  <>
    <Composition id="main" component={MainVideo} durationInFrames={670} fps={30} width={1920} height={1080} />
    <Composition id="avulso" component={AvulsoVideo} durationInFrames={700} fps={30} width={1920} height={1080} />
  </>
);
