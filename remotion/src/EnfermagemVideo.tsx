import { AbsoluteFill, useCurrentFrame, interpolate } from "remotion";
import { TransitionSeries, springTiming } from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";
import { slide } from "@remotion/transitions/slide";
import { C, inter } from "./theme";
import { SceneEnfRecursos } from "./scenes/SceneEnfRecursos";
import { SceneEnfDisp } from "./scenes/SceneEnfDisp";
import { SceneEnfGerar } from "./scenes/SceneEnfGerar";
import { SceneEnfAgendar } from "./scenes/SceneEnfAgendar";

const D = { recursos: 150, disp: 165, gerar: 180, agendar: 195 };
const T = 18;
export const ENFERMAGEM_DURATION = D.recursos + D.disp + D.gerar + D.agendar - T * 3;

function Background() {
  const f = useCurrentFrame();
  const a = interpolate(f, [0, ENFERMAGEM_DURATION], [0, 1]);
  return (
    <AbsoluteFill
      style={{
        background: `radial-gradient(1200px 800px at ${20 + a * 30}% ${30 + a * 20}%, #1a2a4a 0%, ${C.bg} 60%)`,
      }}
    />
  );
}

export const EnfermagemVideo: React.FC = () => {
  return (
    <AbsoluteFill style={{ fontFamily: inter, background: C.bg }}>
      <Background />
      <TransitionSeries>
        <TransitionSeries.Sequence durationInFrames={D.recursos}>
          <SceneEnfRecursos />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          presentation={slide({ direction: "from-right" })}
          timing={springTiming({ config: { damping: 200 }, durationInFrames: T })}
        />
        <TransitionSeries.Sequence durationInFrames={D.disp}>
          <SceneEnfDisp />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          presentation={fade()}
          timing={springTiming({ config: { damping: 200 }, durationInFrames: T })}
        />
        <TransitionSeries.Sequence durationInFrames={D.gerar}>
          <SceneEnfGerar />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          presentation={slide({ direction: "from-right" })}
          timing={springTiming({ config: { damping: 200 }, durationInFrames: T })}
        />
        <TransitionSeries.Sequence durationInFrames={D.agendar}>
          <SceneEnfAgendar />
        </TransitionSeries.Sequence>
      </TransitionSeries>
    </AbsoluteFill>
  );
};
