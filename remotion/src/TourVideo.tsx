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

// ---------- helpers ----------
const Card: React.FC<{
  children: React.ReactNode;
  w?: number;
  pad?: number;
  delay?: number;
  from?: "up" | "left" | "right";
}> = ({ children, w = 900, pad = 28, delay = 0, from = "up" }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame: frame - delay, fps, config: { damping: 18 } });
  const off = interpolate(s, [0, 1], [60, 0]);
  const tr =
    from === "up"
      ? `translateY(${off}px)`
      : from === "left"
        ? `translateX(${off}px)`
        : `translateX(${-off}px)`;
  return (
    <div
      style={{
        width: w,
        background: theme.cream,
        color: theme.ink,
        borderRadius: 28,
        padding: pad,
        boxShadow: "0 30px 80px rgba(0,0,0,.4)",
        opacity: s,
        transform: tr,
      }}
    >
      {children}
    </div>
  );
};

const SectionTitle: React.FC<{ kicker: string; title: string }> = ({ kicker, title }) => (
  <FadeSlide delay={0}>
    <p
      style={{
        fontFamily: inter.fontFamily,
        color: theme.accent,
        fontSize: 26,
        fontWeight: 600,
        letterSpacing: 4,
        textTransform: "uppercase",
        margin: 0,
      }}
    >
      {kicker}
    </p>
    <h2
      style={{
        fontFamily: manrope.fontFamily,
        color: theme.cream,
        fontSize: 78,
        fontWeight: 800,
        lineHeight: 1.02,
        margin: "14px 0 40px",
        letterSpacing: -2,
      }}
    >
      {title}
    </h2>
  </FadeSlide>
);

// ---------- Scene 1: Intro ----------
const SceneIntro: React.FC = () => {
  const frame = useCurrentFrame();
  const pulse = 1 + Math.sin(frame / 8) * 0.04;
  return (
    <AbsoluteFill
      style={{ justifyContent: "center", alignItems: "center", flexDirection: "column", gap: 26 }}
    >
      <div style={{ transform: `scale(${pulse})` }}>
        <FadeSlide delay={2}>
          <Chip delay={2} bg={theme.accent} color={theme.ink}>
            ★ TOUR COMPLETO
          </Chip>
        </FadeSlide>
      </div>
      <div style={{ textAlign: "center" }}>
        <TitleWord text="ClinicaOS" delay={10} size={170} />
        <TitleWord text="por dentro." delay={32} size={130} color={theme.accent} />
      </div>
      <FadeSlide delay={60}>
        <p
          style={{
            fontFamily: inter.fontFamily,
            color: theme.cream,
            fontSize: 32,
            opacity: 0.85,
            textAlign: "center",
            maxWidth: 1100,
          }}
        >
          Agenda · Cartões · Nina IA · Financeiro · Estorno
        </p>
      </FadeSlide>
    </AbsoluteFill>
  );
};

// ---------- Scene 2: Abertura de Agenda ----------
const SceneAgenda: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const opened = frame > 70;
  const openSpring = spring({ frame: frame - 70, fps, config: { damping: 16 } });
  const slots = ["08:00", "08:30", "09:00", "09:30", "10:00", "10:30", "11:00", "11:30"];
  return (
    <AbsoluteFill style={{ padding: 90, flexDirection: "column", justifyContent: "center" }}>
      <SectionTitle kicker="01 · Agenda" title="Abertura de horários, em segundos." />
      <div style={{ display: "flex", gap: 30, alignItems: "flex-start" }}>
        <Card w={520} delay={10} from="left">
          <p style={{ fontFamily: inter.fontFamily, fontSize: 22, opacity: 0.6, margin: 0 }}>
            Médico
          </p>
          <p
            style={{
              fontFamily: manrope.fontFamily,
              fontWeight: 800,
              fontSize: 38,
              margin: "6px 0 18px",
            }}
          >
            Dr. Roberto Lima
          </p>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 18 }}>
            {["Seg", "Ter", "Qua", "Qui", "Sex"].map((d, i) => (
              <div
                key={d}
                style={{
                  padding: "10px 16px",
                  borderRadius: 12,
                  background: i < 3 ? theme.primary : "#e5e7eb",
                  color: i < 3 ? "#fff" : "#9ca3af",
                  fontFamily: inter.fontFamily,
                  fontWeight: 600,
                  fontSize: 22,
                }}
              >
                {d}
              </div>
            ))}
          </div>
          <p style={{ fontFamily: inter.fontFamily, fontSize: 22, opacity: 0.6, margin: 0 }}>
            Intervalo
          </p>
          <p
            style={{
              fontFamily: manrope.fontFamily,
              fontWeight: 700,
              fontSize: 30,
              margin: "4px 0 0",
              color: theme.primary,
            }}
          >
            30 min · 08h – 12h
          </p>
        </Card>
        <Card w={840} delay={30} from="right">
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 16,
            }}
          >
            <p style={{ fontFamily: manrope.fontFamily, fontWeight: 800, fontSize: 30, margin: 0 }}>
              Segunda · 18/05
            </p>
            <span
              style={{
                padding: "8px 16px",
                borderRadius: 999,
                background: theme.primary,
                color: "#fff",
                fontFamily: inter.fontFamily,
                fontWeight: 600,
                fontSize: 20,
              }}
            >
              {opened ? `${slots.length} horários publicados` : "gerando…"}
            </span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
            {slots.map((t, i) => {
              const s = spring({ frame: frame - 70 - i * 4, fps, config: { damping: 14 } });
              return (
                <div
                  key={t}
                  style={{
                    padding: "18px 0",
                    textAlign: "center",
                    borderRadius: 14,
                    background: theme.primary,
                    color: "#fff",
                    fontFamily: manrope.fontFamily,
                    fontWeight: 800,
                    fontSize: 28,
                    opacity: opened ? s : 0.2,
                    transform: `scale(${opened ? interpolate(s, [0, 1], [0.6, 1]) : 0.95})`,
                    boxShadow: opened ? "0 10px 30px rgba(22,163,74,.35)" : "none",
                  }}
                >
                  {t}
                </div>
              );
            })}
          </div>
          {opened && (
            <p
              style={{
                marginTop: 18,
                fontFamily: inter.fontFamily,
                fontSize: 22,
                color: theme.ink,
                opacity: openSpring * 0.7,
                transform: `translateY(${(1 - openSpring) * 10}px)`,
              }}
            >
              Os pacientes já podem agendar online.
            </p>
          )}
        </Card>
      </div>
    </AbsoluteFill>
  );
};

// ---------- Scene 3: Cartões ----------
const SceneCartoes: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const flip = interpolate(frame, [60, 110], [0, 1], { extrapolateRight: "clamp" });
  const discount = spring({ frame: frame - 140, fps, config: { damping: 18 } });
  return (
    <AbsoluteFill style={{ padding: 90, flexDirection: "column", justifyContent: "center" }}>
      <SectionTitle kicker="02 · Cartões" title="Cartão Consulta & Cartão Desconto." />
      <div style={{ display: "flex", gap: 40, alignItems: "center" }}>
        {/* Cartão Consulta */}
        <div style={{ perspective: 1200 }}>
          <div
            style={{
              width: 520,
              height: 320,
              borderRadius: 28,
              padding: 28,
              background: `linear-gradient(135deg, ${theme.primary}, ${theme.primaryGlow})`,
              color: "#fff",
              display: "flex",
              flexDirection: "column",
              justifyContent: "space-between",
              boxShadow: "0 30px 80px rgba(0,0,0,.4)",
              transform: `rotateY(${interpolate(flip, [0, 1], [-20, 0])}deg) translateY(${(1 - flip) * 30}px)`,
              opacity: flip,
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span
                style={{
                  fontFamily: inter.fontFamily,
                  fontWeight: 600,
                  fontSize: 22,
                  opacity: 0.85,
                }}
              >
                CARTÃO CONSULTA
              </span>
              <span style={{ fontFamily: manrope.fontFamily, fontSize: 22, fontWeight: 800 }}>
                ✚
              </span>
            </div>
            <div>
              <p style={{ margin: 0, fontFamily: inter.fontFamily, fontSize: 20, opacity: 0.85 }}>
                Titular
              </p>
              <p
                style={{ margin: 0, fontFamily: manrope.fontFamily, fontWeight: 800, fontSize: 36 }}
              >
                Maria Souza
              </p>
              <p
                style={{
                  margin: "10px 0 0",
                  fontFamily: inter.fontFamily,
                  fontSize: 22,
                  opacity: 0.85,
                }}
              >
                4 consultas · validade 12/2026
              </p>
            </div>
          </div>
        </div>
        {/* Cartão Desconto */}
        <div style={{ perspective: 1200 }}>
          <div
            style={{
              width: 520,
              height: 320,
              borderRadius: 28,
              padding: 28,
              background: `linear-gradient(135deg, ${theme.accent}, #ea580c)`,
              color: theme.ink,
              display: "flex",
              flexDirection: "column",
              justifyContent: "space-between",
              boxShadow: "0 30px 80px rgba(0,0,0,.4)",
              transform: `rotateY(${interpolate(discount, [0, 1], [20, 0])}deg) translateY(${(1 - discount) * 30}px)`,
              opacity: discount,
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ fontFamily: inter.fontFamily, fontWeight: 700, fontSize: 22 }}>
                CARTÃO DESCONTO
              </span>
              <span style={{ fontFamily: manrope.fontFamily, fontSize: 22, fontWeight: 800 }}>
                %
              </span>
            </div>
            <div>
              <p style={{ margin: 0, fontFamily: inter.fontFamily, fontSize: 20, opacity: 0.7 }}>
                Benefício ativo
              </p>
              <p
                style={{
                  margin: 0,
                  fontFamily: manrope.fontFamily,
                  fontWeight: 800,
                  fontSize: 56,
                  letterSpacing: -1,
                }}
              >
                até 40% OFF
              </p>
              <p
                style={{
                  margin: "6px 0 0",
                  fontFamily: inter.fontFamily,
                  fontSize: 22,
                  opacity: 0.85,
                }}
              >
                exames, consultas e procedimentos
              </p>
            </div>
          </div>
        </div>
      </div>
      {frame > 180 && (
        <FadeSlide delay={180}>
          <p
            style={{
              fontFamily: inter.fontFamily,
              color: theme.cream,
              fontSize: 28,
              opacity: 0.85,
              marginTop: 36,
            }}
          >
            Validados no caixa em 1 clique — saldo, validade e desconto automáticos.
          </p>
        </FadeSlide>
      )}
    </AbsoluteFill>
  );
};

// ---------- Scene 4: Nina IA (WhatsApp + Telefone) ----------
const SceneNina: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  type Msg = { from: "pac" | "nina"; text: string; at: number };
  const msgs: Msg[] = [
    { from: "pac", text: "Oi! Quero marcar um cardiologista 🙏", at: 20 },
    {
      from: "nina",
      text: "Olá Maria! Tenho horário com Dr. Roberto na quinta às 09:30. Confirmo?",
      at: 55,
    },
    { from: "pac", text: "Pode confirmar 👍", at: 95 },
    { from: "nina", text: "Agendado ✅ Enviei o Pix de R$ 250,00 e lembrete 24h antes.", at: 130 },
  ];
  return (
    <AbsoluteFill style={{ padding: 90, flexDirection: "column", justifyContent: "center" }}>
      <SectionTitle kicker="03 · Nina IA" title="Agenda pelo WhatsApp e pelo telefone." />
      <div style={{ display: "flex", gap: 40, alignItems: "flex-start" }}>
        {/* WhatsApp */}
        <Card w={620} pad={0} delay={10} from="left">
          <div
            style={{
              background: "#075e54",
              color: "#fff",
              padding: "16px 22px",
              borderTopLeftRadius: 28,
              borderTopRightRadius: 28,
              display: "flex",
              alignItems: "center",
              gap: 14,
            }}
          >
            <div
              style={{
                width: 44,
                height: 44,
                borderRadius: 999,
                background: theme.primaryGlow,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontFamily: manrope.fontFamily,
                fontWeight: 800,
                color: theme.ink,
              }}
            >
              N
            </div>
            <div>
              <p
                style={{ margin: 0, fontFamily: manrope.fontFamily, fontWeight: 800, fontSize: 22 }}
              >
                Nina · ClinicaOS
              </p>
              <p style={{ margin: 0, fontFamily: inter.fontFamily, fontSize: 16, opacity: 0.8 }}>
                online · responde em segundos
              </p>
            </div>
          </div>
          <div
            style={{
              padding: 20,
              background: "#ece5dd",
              minHeight: 420,
              display: "flex",
              flexDirection: "column",
              gap: 10,
            }}
          >
            {msgs.map((m, i) => {
              const s = spring({ frame: frame - m.at, fps, config: { damping: 18 } });
              return (
                <div
                  key={i}
                  style={{
                    alignSelf: m.from === "pac" ? "flex-end" : "flex-start",
                    background: m.from === "pac" ? "#dcf8c6" : "#fff",
                    color: theme.ink,
                    padding: "12px 16px",
                    borderRadius: 14,
                    maxWidth: "82%",
                    fontFamily: inter.fontFamily,
                    fontSize: 22,
                    lineHeight: 1.3,
                    boxShadow: "0 2px 6px rgba(0,0,0,.1)",
                    opacity: s,
                    transform: `translateY(${(1 - s) * 10}px)`,
                  }}
                >
                  {m.text}
                </div>
              );
            })}
          </div>
        </Card>
        {/* Telefone */}
        <Card w={460} delay={60} from="right">
          <Chip bg={theme.primary} color="#fff" delay={60} icon={<span>📞</span>}>
            LIGAÇÃO ATIVA
          </Chip>
          <p
            style={{
              fontFamily: manrope.fontFamily,
              fontWeight: 800,
              fontSize: 36,
              margin: "20px 0 4px",
            }}
          >
            +55 81 9•••• 1234
          </p>
          <p style={{ fontFamily: inter.fontFamily, fontSize: 22, opacity: 0.7, margin: 0 }}>
            Nina atende, identifica o paciente e agenda.
          </p>
          <div style={{ marginTop: 22, display: "flex", flexDirection: "column", gap: 10 }}>
            {[
              { t: "Identifiquei seu cadastro, Sr. João.", at: 80 },
              { t: "Posso marcar oftalmo amanhã às 14h?", at: 115 },
              { t: "Pronto, confirmado. Lembrete enviado ✅", at: 160 },
            ].map((l, i) => {
              const s = spring({ frame: frame - l.at, fps, config: { damping: 18 } });
              return (
                <div
                  key={i}
                  style={{
                    fontFamily: inter.fontFamily,
                    fontSize: 20,
                    color: theme.ink,
                    opacity: s,
                    transform: `translateX(${(1 - s) * 20}px)`,
                  }}
                >
                  <span style={{ color: theme.primary, fontWeight: 700 }}>Nina:</span> {l.t}
                </div>
              );
            })}
          </div>
        </Card>
      </div>
    </AbsoluteFill>
  );
};

// ---------- Scene 5: Paciente paga -> Financeiro ----------
const ScenePagamentoPaciente: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const paid = frame > 70;
  const lineSpring = spring({ frame: frame - 90, fps, config: { damping: 18 } });
  return (
    <AbsoluteFill style={{ padding: 90, flexDirection: "column", justifyContent: "center" }}>
      <SectionTitle kicker="04 · Financeiro" title="Paciente pagou? Aparece no caixa, na hora." />
      <div style={{ display: "flex", gap: 30, alignItems: "flex-start" }}>
        <Card w={520} delay={10} from="left">
          <p style={{ fontFamily: inter.fontFamily, fontSize: 22, opacity: 0.6, margin: 0 }}>
            Recebimento Pix
          </p>
          <p
            style={{
              fontFamily: manrope.fontFamily,
              fontWeight: 800,
              fontSize: 64,
              color: theme.primary,
              margin: "6px 0",
            }}
          >
            R$ 250,00
          </p>
          <p style={{ fontFamily: inter.fontFamily, fontSize: 22, margin: 0 }}>
            Maria Souza · Consulta Cardio
          </p>
          <div
            style={{
              marginTop: 24,
              padding: 18,
              background: paid ? "#dcfce7" : "#fef3c7",
              borderRadius: 14,
              display: "flex",
              alignItems: "center",
              gap: 12,
            }}
          >
            <span style={{ fontSize: 32 }}>{paid ? "✅" : "⏳"}</span>
            <div>
              <p
                style={{
                  margin: 0,
                  fontFamily: manrope.fontFamily,
                  fontWeight: 800,
                  fontSize: 24,
                  color: paid ? "#166534" : "#92400e",
                }}
              >
                {paid ? "Pagamento confirmado" : "Aguardando Pix…"}
              </p>
              <p style={{ margin: 0, fontFamily: inter.fontFamily, fontSize: 18, opacity: 0.7 }}>
                {paid ? "Liquidado às 09:14" : "QR Code exibido ao paciente"}
              </p>
            </div>
          </div>
        </Card>
        <Card w={820} delay={40} from="right">
          <p style={{ fontFamily: inter.fontFamily, fontSize: 22, opacity: 0.6, margin: 0 }}>
            Financeiro · Movimento de hoje
          </p>
          <p
            style={{
              fontFamily: manrope.fontFamily,
              fontWeight: 800,
              fontSize: 30,
              margin: "4px 0 18px",
            }}
          >
            Entradas
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {[
              { h: "08:42", n: "João P.", v: "R$ 180,00", t: "Cartão Crédito" },
              { h: "08:55", n: "Ana C.", v: "R$ 120,00", t: "Dinheiro" },
              { h: "09:14", n: "Maria Souza", v: "R$ 250,00", t: "Pix", hi: true },
            ].map((r, i) => {
              const s = r.hi
                ? lineSpring
                : spring({ frame: frame - 40 - i * 8, fps, config: { damping: 18 } });
              return (
                <div
                  key={i}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "80px 1fr 160px 180px",
                    gap: 14,
                    alignItems: "center",
                    padding: "14px 16px",
                    borderRadius: 12,
                    background: r.hi ? "#dcfce7" : "#f3f4f6",
                    border: r.hi ? `2px solid ${theme.primary}` : "1px solid transparent",
                    opacity: s,
                    transform: `translateY(${(1 - s) * 14}px)`,
                  }}
                >
                  <span
                    style={{
                      fontFamily: manrope.fontFamily,
                      fontWeight: 700,
                      fontSize: 20,
                      color: theme.ink,
                    }}
                  >
                    {r.h}
                  </span>
                  <span style={{ fontFamily: inter.fontFamily, fontSize: 22 }}>{r.n}</span>
                  <span style={{ fontFamily: inter.fontFamily, fontSize: 20, opacity: 0.7 }}>
                    {r.t}
                  </span>
                  <span
                    style={{
                      fontFamily: manrope.fontFamily,
                      fontWeight: 800,
                      fontSize: 24,
                      color: theme.primary,
                      textAlign: "right",
                    }}
                  >
                    {r.v}
                  </span>
                </div>
              );
            })}
          </div>
          <div
            style={{
              marginTop: 18,
              display: "flex",
              justifyContent: "space-between",
              padding: "14px 18px",
              borderTop: `2px solid ${theme.ink}22`,
            }}
          >
            <span style={{ fontFamily: manrope.fontFamily, fontWeight: 800, fontSize: 26 }}>
              Total
            </span>
            <span
              style={{
                fontFamily: manrope.fontFamily,
                fontWeight: 800,
                fontSize: 30,
                color: theme.primary,
              }}
            >
              R$ {paid ? "550,00" : "300,00"}
            </span>
          </div>
        </Card>
      </div>
    </AbsoluteFill>
  );
};

// ---------- Scene 6: Repasse médico ----------
const SceneRepasse: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const paySpring = spring({ frame: frame - 120, fps, config: { damping: 14 } });
  return (
    <AbsoluteFill style={{ padding: 90, flexDirection: "column", justifyContent: "center" }}>
      <SectionTitle
        kicker="05 · Repasse médico"
        title="Comissões calculadas, pagamento com 1 clique."
      />
      <Card w={1200} delay={10}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 20,
          }}
        >
          <div>
            <p style={{ margin: 0, fontFamily: inter.fontFamily, fontSize: 22, opacity: 0.6 }}>
              Médico
            </p>
            <p style={{ margin: 0, fontFamily: manrope.fontFamily, fontWeight: 800, fontSize: 38 }}>
              Dr. Roberto Lima
            </p>
            <p style={{ margin: 0, fontFamily: inter.fontFamily, fontSize: 20, opacity: 0.7 }}>
              Cardiologia · maio/2026
            </p>
          </div>
          <div style={{ textAlign: "right" }}>
            <p style={{ margin: 0, fontFamily: inter.fontFamily, fontSize: 20, opacity: 0.6 }}>
              A repassar
            </p>
            <p
              style={{
                margin: 0,
                fontFamily: manrope.fontFamily,
                fontWeight: 800,
                fontSize: 56,
                color: theme.primary,
              }}
            >
              R$ 4.275,00
            </p>
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 18 }}>
          {[
            { d: "02/05", p: "Consulta · 7 pacientes", v: "R$ 1.225,00" },
            { d: "09/05", p: "Consulta · 8 pacientes", v: "R$ 1.400,00" },
            { d: "16/05", p: "Consulta · 9 pacientes", v: "R$ 1.650,00" },
          ].map((r, i) => {
            const s = spring({ frame: frame - 40 - i * 10, fps, config: { damping: 18 } });
            return (
              <div
                key={i}
                style={{
                  display: "grid",
                  gridTemplateColumns: "120px 1fr 200px",
                  padding: "14px 16px",
                  borderRadius: 12,
                  background: "#f3f4f6",
                  opacity: s,
                  transform: `translateY(${(1 - s) * 12}px)`,
                  alignItems: "center",
                }}
              >
                <span style={{ fontFamily: manrope.fontFamily, fontWeight: 700, fontSize: 22 }}>
                  {r.d}
                </span>
                <span style={{ fontFamily: inter.fontFamily, fontSize: 22 }}>{r.p}</span>
                <span
                  style={{
                    fontFamily: manrope.fontFamily,
                    fontWeight: 800,
                    fontSize: 24,
                    color: theme.ink,
                    textAlign: "right",
                  }}
                >
                  {r.v}
                </span>
              </div>
            );
          })}
        </div>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            background: frame > 120 ? theme.primary : "#e5e7eb",
            color: frame > 120 ? "#fff" : theme.ink,
            padding: "20px 24px",
            borderRadius: 16,
            transform: `scale(${interpolate(paySpring, [0, 1], [0.95, 1])})`,
            transition: "none",
            boxShadow: frame > 120 ? "0 20px 50px rgba(22,163,74,.4)" : "none",
          }}
        >
          <span style={{ fontFamily: manrope.fontFamily, fontWeight: 800, fontSize: 28 }}>
            {frame > 120 ? "✓ Pago via Pix — comprovante enviado" : "Pagar repasse"}
          </span>
          <span style={{ fontFamily: manrope.fontFamily, fontWeight: 800, fontSize: 28 }}>
            R$ 4.275,00
          </span>
        </div>
      </Card>
    </AbsoluteFill>
  );
};

// ---------- Scene 7: Estorno ----------
const SceneEstorno: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const refunded = frame > 90;
  const refundSpring = spring({ frame: frame - 90, fps, config: { damping: 12 } });
  const shake = frame < 60 ? Math.sin(frame / 2) * (60 - frame) * 0.5 : 0;
  return (
    <AbsoluteFill style={{ padding: 90, flexDirection: "column", justifyContent: "center" }}>
      <SectionTitle kicker="06 · Estorno" title="Errou o valor? Estorne em 2 cliques." />
      <div style={{ display: "flex", gap: 30, alignItems: "center", justifyContent: "center" }}>
        <Card w={520} delay={10} from="left">
          <Chip bg={theme.red} color="#fff" delay={10}>
            ⚠ COBRANÇA ERRADA
          </Chip>
          <p
            style={{ fontFamily: inter.fontFamily, fontSize: 22, opacity: 0.6, margin: "20px 0 0" }}
          >
            Lançamento original
          </p>
          <p
            style={{
              fontFamily: manrope.fontFamily,
              fontWeight: 800,
              fontSize: 48,
              margin: "4px 0",
              color: theme.red,
              textDecoration: refunded ? "line-through" : "none",
              transform: `translateX(${shake}px)`,
            }}
          >
            R$ 520,00
          </p>
          <p style={{ fontFamily: inter.fontFamily, fontSize: 22, margin: 0 }}>
            Cartão crédito · Ana Lima
          </p>
        </Card>
        <div
          style={{
            fontFamily: manrope.fontFamily,
            fontWeight: 800,
            fontSize: 80,
            color: theme.cream,
            opacity: refunded ? 1 : 0.3,
          }}
        >
          →
        </div>
        <Card w={520} delay={40} from="right">
          <Chip bg={refunded ? theme.primary : "#9ca3af"} color="#fff" delay={40}>
            {refunded ? "✓ ESTORNO CONFIRMADO" : "AGUARDANDO"}
          </Chip>
          <p
            style={{ fontFamily: inter.fontFamily, fontSize: 22, opacity: 0.6, margin: "20px 0 0" }}
          >
            Valor estornado
          </p>
          <p
            style={{
              fontFamily: manrope.fontFamily,
              fontWeight: 800,
              fontSize: 48,
              margin: "4px 0",
              color: theme.primary,
              opacity: refunded ? refundSpring : 0.2,
            }}
          >
            - R$ 520,00
          </p>
          <p style={{ fontFamily: inter.fontFamily, fontSize: 20, opacity: 0.7, margin: 0 }}>
            Movimento auditável · motivo registrado
          </p>
          {refunded && (
            <div
              style={{
                marginTop: 18,
                padding: 14,
                background: "#dcfce7",
                borderRadius: 12,
                opacity: refundSpring,
              }}
            >
              <p
                style={{ margin: 0, fontFamily: inter.fontFamily, fontSize: 18, color: "#166534" }}
              >
                <strong>Saldo do caixa atualizado automaticamente.</strong> Comissão do médico
                recalculada.
              </p>
            </div>
          )}
        </Card>
      </div>
    </AbsoluteFill>
  );
};

// ---------- Scene 8: Outro ----------
const SceneOutro: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const items = ["Agenda", "Cartões", "Nina IA", "Caixa", "Repasse", "Estorno"];
  return (
    <AbsoluteFill
      style={{ justifyContent: "center", alignItems: "center", flexDirection: "column", gap: 30 }}
    >
      <TitleWord text="Tudo num lugar só." delay={4} size={120} />
      <TitleWord text="ClinicaOS." delay={28} size={160} color={theme.accent} />
      <div
        style={{
          display: "flex",
          gap: 12,
          flexWrap: "wrap",
          justifyContent: "center",
          maxWidth: 1300,
          marginTop: 18,
        }}
      >
        {items.map((t, i) => {
          const s = spring({ frame: frame - 50 - i * 5, fps, config: { damping: 14 } });
          return (
            <div
              key={t}
              style={{
                padding: "12px 22px",
                borderRadius: 999,
                background: "rgba(255,255,255,.08)",
                color: theme.cream,
                border: `1px solid ${theme.cream}33`,
                fontFamily: inter.fontFamily,
                fontWeight: 600,
                fontSize: 26,
                opacity: s,
                transform: `translateY(${(1 - s) * 14}px)`,
              }}
            >
              ✓ {t}
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};

// ---------- Composition ----------
export const TourVideo: React.FC = () => (
  <AbsoluteFill style={{ background: theme.bg }}>
    <Bg />
    <Sequence from={0} durationInFrames={110}>
      <SceneIntro />
    </Sequence>
    <Sequence from={110} durationInFrames={250}>
      <SceneAgenda />
    </Sequence>
    <Sequence from={360} durationInFrames={260}>
      <SceneCartoes />
    </Sequence>
    <Sequence from={620} durationInFrames={300}>
      <SceneNina />
    </Sequence>
    <Sequence from={920} durationInFrames={280}>
      <ScenePagamentoPaciente />
    </Sequence>
    <Sequence from={1200} durationInFrames={260}>
      <SceneRepasse />
    </Sequence>
    <Sequence from={1460} durationInFrames={240}>
      <SceneEstorno />
    </Sequence>
    <Sequence from={1700} durationInFrames={130}>
      <SceneOutro />
    </Sequence>
  </AbsoluteFill>
);
