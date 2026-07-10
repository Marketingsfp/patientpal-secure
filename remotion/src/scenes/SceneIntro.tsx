import { AbsoluteFill, useCurrentFrame, useVideoConfig, spring, interpolate } from "remotion";
import { C, dm, inter } from "../theme";

export const SceneIntro: React.FC = () => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s1 = spring({ frame: f, fps, config: { damping: 18, stiffness: 120 } });
  const s2 = spring({ frame: f - 12, fps, config: { damping: 18, stiffness: 120 } });
  const s3 = spring({ frame: f - 22, fps, config: { damping: 22, stiffness: 100 } });
  const ringR = interpolate(f, [0, 60], [0, 220], { extrapolateRight: "clamp" });
  return (
    <AbsoluteFill
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexDirection: "column",
        gap: 32,
      }}
    >
      <div
        style={{
          position: "relative",
          width: 160,
          height: 160,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <div
          style={{
            position: "absolute",
            width: ringR,
            height: ringR,
            borderRadius: 999,
            border: `2px solid ${C.accent}`,
            opacity: 0.3,
          }}
        />
        <div
          style={{
            width: 110 * s1,
            height: 110 * s1,
            borderRadius: 28,
            background: `linear-gradient(135deg, ${C.accent}, ${C.primary})`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            boxShadow: "0 20px 60px rgba(16,185,129,.4)",
          }}
        >
          <svg
            width="60"
            height="60"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#fff"
            strokeWidth="2.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M12 2v20M2 12h20" />
          </svg>
        </div>
      </div>
      <div
        style={{ textAlign: "center", transform: `translateY(${(1 - s2) * 20}px)`, opacity: s2 }}
      >
        <div
          style={{
            color: "#fff",
            fontSize: 84,
            fontWeight: 700,
            fontFamily: dm,
            letterSpacing: -1.5,
          }}
        >
          ClinicaOS
        </div>
        <div
          style={{ color: "rgba(255,255,255,.7)", fontSize: 30, marginTop: 8, fontFamily: inter }}
        >
          Do agendamento ao pagamento
        </div>
      </div>
      <div style={{ display: "flex", gap: 14, opacity: s3 }}>
        {["Agendar", "Recepção", "Caixa", "Pagamento"].map((t, i) => (
          <div
            key={t}
            style={{
              padding: "10px 22px",
              borderRadius: 999,
              background: "rgba(255,255,255,.08)",
              color: "#fff",
              border: "1px solid rgba(255,255,255,.15)",
              fontSize: 22,
              fontFamily: inter,
            }}
          >
            {i + 1}. {t}
          </div>
        ))}
      </div>
    </AbsoluteFill>
  );
};
