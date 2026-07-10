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

// ---------- Scene 1 ----------
const SceneIntro: React.FC = () => {
  const frame = useCurrentFrame();
  const pulse = 1 + Math.sin(frame / 10) * 0.03;
  return (
    <AbsoluteFill
      style={{ justifyContent: "center", alignItems: "center", flexDirection: "column", gap: 30 }}
    >
      <div style={{ transform: `scale(${pulse})` }}>
        <FadeSlide delay={4}>
          <Chip delay={4} bg={theme.accent} color={theme.ink}>
            🧠 ATENDIMENTO COM IA
          </Chip>
        </FadeSlide>
      </div>
      <div style={{ marginTop: 30 }}>
        <TitleWord text="O médico fala." delay={10} size={130} />
      </div>
      <TitleWord text="A IA documenta." delay={32} size={150} color={theme.accent} />
      <FadeSlide delay={70}>
        <p
          style={{
            fontFamily: inter.fontFamily,
            color: theme.cream,
            fontSize: 36,
            opacity: 0.8,
            marginTop: 20,
          }}
        >
          Mais olho no olho. Menos teclado.
        </p>
      </FadeSlide>
    </AbsoluteFill>
  );
};

// ---------- Scene 2: transcrição ao vivo ----------
const TypeLine: React.FC<{ text: string; delay: number; color?: string }> = ({
  text,
  delay,
  color = theme.ink,
}) => {
  const frame = useCurrentFrame();
  const chars = Math.max(0, Math.min(text.length, Math.floor((frame - delay) * 1.2)));
  return (
    <p
      style={{
        fontFamily: inter.fontFamily,
        fontSize: 30,
        color,
        margin: "8px 0",
        lineHeight: 1.5,
      }}
    >
      {text.slice(0, chars)}
      {chars < text.length && <span style={{ opacity: frame % 20 < 10 ? 1 : 0 }}>▍</span>}
    </p>
  );
};

const SceneTrans: React.FC = () => {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill style={{ padding: 100, justifyContent: "center" }}>
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
          Microfone ligado
        </p>
        <h2
          style={{
            fontFamily: manrope.fontFamily,
            color: theme.cream,
            fontSize: 88,
            fontWeight: 800,
            lineHeight: 1,
            margin: "16px 0 40px",
            letterSpacing: -2,
          }}
        >
          Transcrição em tempo real.
        </h2>
      </FadeSlide>
      <FadeSlide delay={10} from="up">
        <div
          style={{
            background: theme.cream,
            color: theme.ink,
            padding: 36,
            borderRadius: 24,
            maxWidth: 1500,
            boxShadow: "0 20px 60px rgba(0,0,0,0.3)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
            <span
              style={{
                width: 14,
                height: 14,
                borderRadius: "50%",
                background: theme.red,
                opacity: frame % 30 < 15 ? 1 : 0.4,
              }}
            />
            <span
              style={{
                fontFamily: inter.fontFamily,
                fontWeight: 600,
                color: theme.red,
                fontSize: 22,
              }}
            >
              ● GRAVANDO · 02:14
            </span>
          </div>
          <TypeLine text="Médico: Boa tarde, dona Maria. Como está se sentindo hoje?" delay={20} />
          <TypeLine
            text="Paciente: Doutor, tô com dor de cabeça há três dias, latejando…"
            delay={70}
          />
          <TypeLine
            text="Médico: A pressão hoje veio 162 por 104. Vou ajustar a medicação."
            delay={130}
            color={theme.primary}
          />
        </div>
      </FadeSlide>
    </AbsoluteFill>
  );
};

// ---------- Scene 3: SOAP gerado ----------
const SoapField: React.FC<{ label: string; valor: string; delay: number }> = ({
  label,
  valor,
  delay,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame: frame - delay, fps, config: { damping: 16 } });
  return (
    <div
      style={{
        background: theme.cream,
        padding: 22,
        borderRadius: 16,
        marginBottom: 14,
        opacity: s,
        transform: `translateX(${interpolate(s, [0, 1], [60, 0])}px)`,
        borderLeft: `6px solid ${theme.primary}`,
      }}
    >
      <div
        style={{
          fontFamily: inter.fontFamily,
          fontWeight: 600,
          color: theme.primary,
          fontSize: 18,
          textTransform: "uppercase",
          letterSpacing: 2,
        }}
      >
        {label}
      </div>
      <div style={{ fontFamily: inter.fontFamily, fontSize: 24, color: theme.ink, marginTop: 4 }}>
        {valor}
      </div>
    </div>
  );
};

const SceneSOAP: React.FC = () => {
  return (
    <AbsoluteFill style={{ padding: 100, justifyContent: "center" }}>
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
          Em segundos
        </p>
        <h2
          style={{
            fontFamily: manrope.fontFamily,
            color: theme.cream,
            fontSize: 88,
            fontWeight: 800,
            lineHeight: 1,
            margin: "16px 0 36px",
            letterSpacing: -2,
          }}
        >
          Prontuário SOAP pronto.
        </h2>
      </FadeSlide>
      <div style={{ maxWidth: 1600 }}>
        <SoapField
          label="Queixa principal"
          valor="Cefaleia pulsátil há 3 dias, sem náusea."
          delay={15}
        />
        <SoapField
          label="Exame físico"
          valor="PA 162/104 mmHg · FC 88 · ausculta cardíaca normal."
          delay={30}
        />
        <SoapField
          label="Hipótese diagnóstica"
          valor="I10 — Hipertensão arterial sistêmica descompensada."
          delay={45}
        />
        <SoapField
          label="Conduta"
          valor="Ajuste de losartana 50 mg 12/12h · MAPA · retorno em 15 dias."
          delay={60}
        />
      </div>
    </AbsoluteFill>
  );
};

// ---------- Scene 4: sugestões IA ----------
const SceneSugest: React.FC = () => {
  return (
    <AbsoluteFill
      style={{
        justifyContent: "center",
        alignItems: "center",
        flexDirection: "column",
        gap: 26,
        padding: 80,
      }}
    >
      <FadeSlide delay={0}>
        <h2
          style={{
            fontFamily: manrope.fontFamily,
            color: theme.cream,
            fontSize: 96,
            fontWeight: 800,
            lineHeight: 1,
            letterSpacing: -2,
            textAlign: "center",
          }}
        >
          IA sugere. <span style={{ color: theme.accent }}>Médico decide.</span>
        </h2>
      </FadeSlide>
      <div
        style={{
          display: "flex",
          gap: 18,
          flexWrap: "wrap",
          justifyContent: "center",
          maxWidth: 1500,
          marginTop: 30,
        }}
      >
        <Chip delay={20} bg={theme.primary} color={theme.cream}>
          CID · I10 Hipertensão
        </Chip>
        <Chip delay={26} bg={theme.primary} color={theme.cream}>
          CID · R51 Cefaleia
        </Chip>
        <Chip delay={32} bg={theme.cream} color={theme.ink}>
          📋 MAPA 24h
        </Chip>
        <Chip delay={38} bg={theme.cream} color={theme.ink}>
          🩸 Função renal + Na/K
        </Chip>
        <Chip delay={44} bg={theme.cream} color={theme.ink}>
          💊 Losartana 50 mg
        </Chip>
        <Chip delay={50} bg={theme.accent} color={theme.ink}>
          📂 Histórico resumido
        </Chip>
      </div>
      <FadeSlide delay={70}>
        <p
          style={{
            fontFamily: inter.fontFamily,
            color: theme.cream,
            opacity: 0.8,
            fontSize: 30,
            marginTop: 30,
            textAlign: "center",
            maxWidth: 1200,
          }}
        >
          CID, exames, prescrição e resumo dos últimos atendimentos — em um clique.
        </p>
      </FadeSlide>
    </AbsoluteFill>
  );
};

// ---------- Scene 5: outro ----------
const SceneOutro: React.FC = () => {
  return (
    <AbsoluteFill
      style={{ justifyContent: "center", alignItems: "center", flexDirection: "column", gap: 30 }}
    >
      <TitleWord text="Atendimento" delay={4} size={130} />
      <TitleWord text="que volta a ser" delay={20} size={110} />
      <TitleWord text="humano." delay={42} size={180} color={theme.accent} />
      <FadeSlide delay={70}>
        <p
          style={{
            fontFamily: inter.fontFamily,
            fontSize: 36,
            color: theme.cream,
            opacity: 0.85,
            marginTop: 20,
          }}
        >
          ClinicaOS · IA que cuida do prontuário, médico que cuida do paciente.
        </p>
      </FadeSlide>
    </AbsoluteFill>
  );
};

export const AtendimentoVideo: React.FC = () => (
  <AbsoluteFill style={{ background: theme.bg }}>
    <Bg />
    <Sequence from={0} durationInFrames={120}>
      <SceneIntro />
    </Sequence>
    <Sequence from={120} durationInFrames={180}>
      <SceneTrans />
    </Sequence>
    <Sequence from={300} durationInFrames={150}>
      <SceneSOAP />
    </Sequence>
    <Sequence from={450} durationInFrames={120}>
      <SceneSugest />
    </Sequence>
    <Sequence from={570} durationInFrames={90}>
      <SceneOutro />
    </Sequence>
  </AbsoluteFill>
);
