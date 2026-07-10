import React from "react";
import { AbsoluteFill, Sequence, useCurrentFrame, useVideoConfig, interpolate, spring } from "remotion";
import { Bg, TitleWord, Chip, FadeSlide, inter, manrope } from "./common";
import { theme } from "./theme";

// ---------- Scene 1: hook ----------
const SceneIntro: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const pulse = 1 + Math.sin(frame / 8) * 0.04;
  return (
    <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", flexDirection: "column", gap: 30 }}>
      <div style={{ transform: `scale(${pulse})` }}>
        <FadeSlide delay={4}><Chip delay={4} bg={theme.accent} color={theme.ink}>♥ TRIAGEM HUMANIZADA</Chip></FadeSlide>
      </div>
      <div style={{ marginTop: 30 }}>
        <TitleWord text="Cada paciente," delay={10} size={130} />
      </div>
      <TitleWord text="cada detalhe." delay={30} size={150} color={theme.accent} />
      <FadeSlide delay={60}>
        <p style={{ fontFamily: inter.fontFamily, color: theme.cream, fontSize: 36, opacity: 0.8, marginTop: 20 }}>
          Não é só consulta. É cuidado.
        </p>
      </FadeSlide>
    </AbsoluteFill>
  );
};

// ---------- Scene 2: equipamentos ----------
const Equip: React.FC<{ icon: string; label: string; valor: string; unidade: string; delay: number; }>
  = ({ icon, label, valor, unidade, delay }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame: frame - delay, fps, config: { damping: 14 } });
  return (
    <div style={{
      width: 320, height: 260, borderRadius: 28, padding: 28,
      background: theme.cream, color: theme.ink,
      display: "flex", flexDirection: "column", justifyContent: "space-between",
      transform: `translateY(${interpolate(s, [0,1], [80, 0])}px) scale(${interpolate(s, [0,1], [0.85, 1])})`,
      opacity: s, boxShadow: "0 20px 60px rgba(0,0,0,0.4)",
    }}>
      <div style={{ fontSize: 80 }}>{icon}</div>
      <div>
        <div style={{ fontFamily: inter.fontFamily, fontSize: 22, fontWeight: 500, opacity: 0.6 }}>{label}</div>
        <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
          <span style={{ fontFamily: manrope.fontFamily, fontWeight: 800, fontSize: 64, color: theme.primary }}>{valor}</span>
          <span style={{ fontFamily: inter.fontFamily, fontSize: 24, color: theme.ink, opacity: 0.6 }}>{unidade}</span>
        </div>
      </div>
    </div>
  );
};

const SceneEquip: React.FC = () => {
  return (
    <AbsoluteFill style={{ padding: 100, flexDirection: "column", justifyContent: "center" }}>
      <FadeSlide delay={0}>
        <p style={{ fontFamily: inter.fontFamily, color: theme.accent, fontSize: 28, fontWeight: 600, letterSpacing: 4, textTransform: "uppercase" }}>
          Em todos os pacientes
        </p>
        <h2 style={{ fontFamily: manrope.fontFamily, color: theme.cream, fontSize: 96, fontWeight: 800, lineHeight: 1, margin: "16px 0 60px", letterSpacing: -2 }}>
          O protocolo completo.
        </h2>
      </FadeSlide>
      <div style={{ display: "flex", gap: 28, flexWrap: "wrap" }}>
        <Equip icon="⚖️" label="Peso"      valor="72,4" unidade="kg"    delay={20} />
        <Equip icon="💗" label="Pressão"   valor="120/80" unidade="mmHg" delay={28} />
        <Equip icon="🫁" label="Saturação" valor="98"   unidade="%"     delay={36} />
        <Equip icon="🌡️" label="Temperatura" valor="36,5" unidade="°C"  delay={44} />
        <Equip icon="🩸" label="HGT"       valor="92"   unidade="mg/dL" delay={52} />
      </div>
    </AbsoluteFill>
  );
};

// ---------- Scene 3: enfermagem humanizada ----------
const SceneHumano: React.FC = () => {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", flexDirection: "column", gap: 40 }}>
      <FadeSlide delay={0}><Chip bg={theme.cream} color={theme.primary} delay={0}>👩‍⚕️ ENFERMAGEM ATENTA</Chip></FadeSlide>
      <div style={{ textAlign: "center" }}>
        <TitleWord text="Escuta antes" delay={8} size={120} />
        <TitleWord text="da consulta." delay={26} size={120} color={theme.accent} />
      </div>
      <FadeSlide delay={60}>
        <p style={{ fontFamily: inter.fontFamily, color: theme.cream, opacity: 0.8, fontSize: 32, maxWidth: 1100, textAlign: "center", lineHeight: 1.4 }}>
          Acolhimento, sinais vitais e história — o médico recebe o paciente já preparado.
        </p>
      </FadeSlide>
    </AbsoluteFill>
  );
};

// ---------- Scene 4: alerta IA ----------
const SceneAlerta: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const beep = 1 + Math.abs(Math.sin(frame / 6)) * 0.08;
  return (
    <AbsoluteFill style={{ padding: 100, flexDirection: "column", justifyContent: "center" }}>
      <FadeSlide delay={0}>
        <p style={{ fontFamily: inter.fontFamily, color: theme.accent, fontSize: 28, fontWeight: 600, letterSpacing: 4, textTransform: "uppercase" }}>
          Quando algo foge da faixa
        </p>
        <h2 style={{ fontFamily: manrope.fontFamily, color: theme.cream, fontSize: 96, fontWeight: 800, lineHeight: 1, margin: "16px 0 60px", letterSpacing: -2 }}>
          A IA avisa a equipe.
        </h2>
      </FadeSlide>
      <FadeSlide delay={20} from="left">
        <div style={{
          background: theme.cream, color: theme.ink, padding: 32, borderRadius: 24, maxWidth: 1100,
          borderLeft: `12px solid ${theme.red}`, transform: `scale(${beep})`,
          boxShadow: "0 30px 80px rgba(239,68,68,0.4)",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 12 }}>
            <span style={{ fontSize: 48 }}>🔔</span>
            <span style={{ fontFamily: manrope.fontFamily, fontWeight: 800, fontSize: 36, color: theme.red }}>ALERTA · ENFERMEIRA IA</span>
          </div>
          <p style={{ fontFamily: inter.fontFamily, fontSize: 30, lineHeight: 1.4, margin: 0 }}>
            <strong>Maria S., 58 anos</strong> — PA 162/104 mmHg + HGT 248 mg/dL.<br/>
            Sugerido: contato imediato, reagendar avaliação cardiovascular.
          </p>
        </div>
      </FadeSlide>
    </AbsoluteFill>
  );
};

// ---------- Scene 5: fechamento ----------
const SceneOutro: React.FC = () => {
  return (
    <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", flexDirection: "column", gap: 30 }}>
      <TitleWord text="Triagem que" delay={4} size={130} />
      <TitleWord text="fideliza." delay={22} size={170} color={theme.accent} />
      <FadeSlide delay={60}>
        <p style={{ fontFamily: inter.fontFamily, fontSize: 36, color: theme.cream, opacity: 0.85, marginTop: 30 }}>
          ClinicaOS · cuidado de verdade, em todos os atendimentos.
        </p>
      </FadeSlide>
    </AbsoluteFill>
  );
};

export const TriagemVideo: React.FC = () => (
  <AbsoluteFill style={{ background: theme.bg }}>
    <Bg />
    <Sequence from={0} durationInFrames={120}><SceneIntro /></Sequence>
    <Sequence from={120} durationInFrames={170}><SceneEquip /></Sequence>
    <Sequence from={290} durationInFrames={130}><SceneHumano /></Sequence>
    <Sequence from={420} durationInFrames={150}><SceneAlerta /></Sequence>
    <Sequence from={570} durationInFrames={90}><SceneOutro /></Sequence>
  </AbsoluteFill>
);
