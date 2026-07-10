import React from "react";
import {
  AbsoluteFill,
  Sequence,
  useCurrentFrame,
  useVideoConfig,
  interpolate,
  spring,
} from "remotion";
import { Bg, TitleWord, Chip, FadeSlide, inter, manrope } from "./common";
import { theme } from "./theme";

// ---------- Scene 1: hook ----------
const SceneIntro: React.FC = () => {
  const frame = useCurrentFrame();
  const pulse = 1 + Math.sin(frame / 8) * 0.04;
  return (
    <AbsoluteFill
      style={{ justifyContent: "center", alignItems: "center", flexDirection: "column", gap: 30 }}
    >
      <div style={{ transform: `scale(${pulse})` }}>
        <FadeSlide delay={4}>
          <Chip delay={4} bg={theme.accent} color={theme.ink}>
            📣 CHAMADA DO PACIENTE
          </Chip>
        </FadeSlide>
      </div>
      <div style={{ marginTop: 30 }}>
        <TitleWord text="Sem gritar" delay={10} size={140} />
      </div>
      <TitleWord text="na recepção." delay={30} size={150} color={theme.accent} />
      <FadeSlide delay={60}>
        <p
          style={{
            fontFamily: inter.fontFamily,
            color: theme.cream,
            fontSize: 36,
            opacity: 0.8,
            marginTop: 20,
          }}
        >
          O médico chama com um clique.
        </p>
      </FadeSlide>
    </AbsoluteFill>
  );
};

// ---------- Scene 2: médico clica "Chamar próximo" ----------
const SceneClique: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const press = spring({ frame: frame - 40, fps, config: { damping: 12, stiffness: 220 } });
  const btnScale = 1 - press * 0.08;
  const ripple = interpolate(frame, [40, 90], [0, 1], { extrapolateRight: "clamp" });
  return (
    <AbsoluteFill style={{ padding: 100, flexDirection: "column", justifyContent: "center" }}>
      <FadeSlide delay={0}>
        <p
          style={{
            fontFamily: inter.fontFamily,
            color: theme.accent,
            fontSize: 28,
            fontWeight: 600,
            letterSpacing: 4,
            textTransform: "uppercase",
          }}
        >
          Painel do médico
        </p>
        <h2
          style={{
            fontFamily: manrope.fontFamily,
            color: theme.cream,
            fontSize: 88,
            fontWeight: 800,
            lineHeight: 1,
            margin: "16px 0 50px",
            letterSpacing: -2,
          }}
        >
          Próximo paciente, um toque.
        </h2>
      </FadeSlide>

      <FadeSlide delay={14} from="left">
        <div
          style={{
            background: theme.cream,
            color: theme.ink,
            padding: 36,
            borderRadius: 28,
            maxWidth: 1200,
            boxShadow: "0 30px 80px rgba(0,0,0,0.4)",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 24,
            }}
          >
            <div>
              <div style={{ fontFamily: inter.fontFamily, fontSize: 22, opacity: 0.6 }}>
                FILA · CLÍNICO GERAL
              </div>
              <div
                style={{
                  fontFamily: manrope.fontFamily,
                  fontWeight: 800,
                  fontSize: 56,
                  color: theme.primary,
                }}
              >
                Maria Souza, 58
              </div>
              <div
                style={{ fontFamily: inter.fontFamily, fontSize: 24, opacity: 0.7, marginTop: 6 }}
              >
                Triagem concluída · PA 138/86 · HGT 102
              </div>
            </div>
            <div style={{ position: "relative" }}>
              <div
                style={{
                  position: "absolute",
                  inset: -ripple * 60,
                  borderRadius: 999,
                  border: `${4 - ripple * 3}px solid ${theme.primaryGlow}`,
                  opacity: 1 - ripple,
                }}
              />
              <div
                style={{
                  background: theme.primary,
                  color: theme.cream,
                  padding: "26px 44px",
                  borderRadius: 999,
                  fontFamily: manrope.fontFamily,
                  fontWeight: 800,
                  fontSize: 38,
                  transform: `scale(${btnScale})`,
                  boxShadow: "0 20px 50px rgba(22,163,74,0.5)",
                  display: "flex",
                  alignItems: "center",
                  gap: 14,
                }}
              >
                <span style={{ fontSize: 42 }}>📣</span> Chamar paciente
              </div>
            </div>
          </div>
        </div>
      </FadeSlide>
    </AbsoluteFill>
  );
};

// ---------- Scene 3: painel da sala de espera ----------
const SceneTV: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const flash = Math.abs(Math.sin(frame / 7));
  const enter = spring({ frame: frame - 10, fps, config: { damping: 16 } });
  return (
    <AbsoluteFill
      style={{ justifyContent: "center", alignItems: "center", flexDirection: "column", gap: 30 }}
    >
      <FadeSlide delay={0}>
        <Chip bg={theme.cream} color={theme.primary} delay={0}>
          📺 PAINEL DA SALA DE ESPERA
        </Chip>
      </FadeSlide>
      <div
        style={{
          width: 1500,
          background: theme.ink,
          borderRadius: 32,
          padding: 60,
          border: `4px solid ${theme.primary}`,
          boxShadow: `0 0 ${40 + flash * 40}px ${theme.primaryGlow}aa`,
          transform: `scale(${interpolate(enter, [0, 1], [0.9, 1])})`,
          opacity: enter,
        }}
      >
        <div
          style={{
            fontFamily: inter.fontFamily,
            color: theme.accent,
            fontSize: 32,
            letterSpacing: 6,
            textTransform: "uppercase",
            marginBottom: 16,
          }}
        >
          Próxima chamada
        </div>
        <div
          style={{
            fontFamily: manrope.fontFamily,
            color: theme.cream,
            fontWeight: 800,
            fontSize: 160,
            lineHeight: 1,
            letterSpacing: -4,
          }}
        >
          MARIA S.
        </div>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-end",
            marginTop: 40,
          }}
        >
          <div
            style={{
              fontFamily: inter.fontFamily,
              color: theme.cream,
              opacity: 0.85,
              fontSize: 42,
            }}
          >
            Consultório <strong style={{ color: theme.primaryGlow }}>03</strong> · Dr. Lima
          </div>
          <div
            style={{
              background: theme.accent,
              color: theme.ink,
              padding: "12px 28px",
              borderRadius: 999,
              fontFamily: manrope.fontFamily,
              fontWeight: 800,
              fontSize: 36,
              opacity: 0.6 + flash * 0.4,
            }}
          >
            ● AO VIVO
          </div>
        </div>
      </div>
      <FadeSlide delay={50}>
        <p style={{ fontFamily: inter.fontFamily, fontSize: 30, color: theme.cream, opacity: 0.8 }}>
          + áudio na sala · notificação no WhatsApp do paciente
        </p>
      </FadeSlide>
    </AbsoluteFill>
  );
};

// ---------- Scene 4: outro ----------
const SceneOutro: React.FC = () => (
  <AbsoluteFill
    style={{ justifyContent: "center", alignItems: "center", flexDirection: "column", gap: 30 }}
  >
    <TitleWord text="Chamada" delay={4} size={140} />
    <TitleWord text="sem fricção." delay={22} size={160} color={theme.accent} />
    <FadeSlide delay={60}>
      <p
        style={{
          fontFamily: inter.fontFamily,
          fontSize: 36,
          color: theme.cream,
          opacity: 0.85,
          marginTop: 30,
        }}
      >
        ClinicaOS · do clique à porta do consultório.
      </p>
    </FadeSlide>
  </AbsoluteFill>
);

export const ChamadaVideo: React.FC = () => (
  <AbsoluteFill style={{ background: theme.bg }}>
    <Bg />
    <Sequence from={0} durationInFrames={120}>
      <SceneIntro />
    </Sequence>
    <Sequence from={120} durationInFrames={180}>
      <SceneClique />
    </Sequence>
    <Sequence from={300} durationInFrames={180}>
      <SceneTV />
    </Sequence>
    <Sequence from={480} durationInFrames={120}>
      <SceneOutro />
    </Sequence>
  </AbsoluteFill>
);
