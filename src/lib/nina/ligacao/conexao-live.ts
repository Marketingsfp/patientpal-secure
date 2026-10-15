/**
 * Conexão WebRTC do navegador com a sessão de voz. O navegador nunca vê a
 * chave: ele gera a oferta, o servidor abre a sessão (`iniciarLigacaoNina`) e
 * devolve a resposta SDP. Áudio vai pelas trilhas de mídia; eventos JSON pelo
 * canal de dados.
 *
 * PARA A LOVABLE: se o GPT-Live 1 no gateway usar outro nome de canal de dados
 * ou outro transporte, o ajuste fica só aqui e em `sessao-live.server.ts`.
 */
import { CANAL_EVENTOS_LIVE, eventoEncerrar } from "./eventos-ligacao";

export type ConexaoLigacao = {
  enviar: (evento: Record<string, unknown>) => void;
  mutar: (mudo: boolean) => void;
  /** Encerramento gracioso: pede `session.close` e aguarda `session.closed`. */
  encerrar: () => Promise<void>;
};

export async function conectarLigacao(o: {
  iniciar: (sdpOferta: string) => Promise<{ sdp: string }>;
  aoEvento: (evento: unknown) => void;
  aoCair: () => void;
}): Promise<ConexaoLigacao> {
  const microfone = await navigator.mediaDevices.getUserMedia({ audio: true });
  const pc = new RTCPeerConnection();
  const audio = new Audio();
  audio.autoplay = true;
  let fechado = false;
  let aoFechar: (() => void) | null = null;

  const liberar = () => {
    if (fechado) return;
    fechado = true;
    microfone.getTracks().forEach((t) => t.stop());
    audio.srcObject = null;
    pc.close();
  };

  try {
    microfone.getTracks().forEach((t) => pc.addTrack(t, microfone));
    pc.ontrack = (e) => {
      audio.srcObject = e.streams[0] ?? null;
    };
    pc.onconnectionstatechange = () => {
      if (["failed", "disconnected", "closed"].includes(pc.connectionState) && !fechado) {
        liberar();
        o.aoCair();
      }
    };
    const canal = pc.createDataChannel(CANAL_EVENTOS_LIVE);
    canal.onmessage = (m) => {
      let evento: unknown;
      try {
        evento = JSON.parse(String(m.data));
      } catch {
        return;
      }
      o.aoEvento(evento);
      if ((evento as { type?: unknown })?.type === "session.closed") aoFechar?.();
    };

    const oferta = await pc.createOffer();
    await pc.setLocalDescription(oferta);
    const { sdp } = await o.iniciar(oferta.sdp ?? "");
    await pc.setRemoteDescription({ type: "answer", sdp });

    const enviar = (evento: Record<string, unknown>) => {
      if (canal.readyState === "open") canal.send(JSON.stringify(evento));
    };
    return {
      enviar,
      mutar: (mudo) => microfone.getAudioTracks().forEach((t) => (t.enabled = !mudo)),
      encerrar: async () => {
        if (fechado) return;
        if (canal.readyState === "open") {
          const fechou = new Promise<void>((r) => (aoFechar = r));
          enviar(eventoEncerrar());
          // Sem confirmação em 3 s, a ligação é desfeita assim mesmo.
          await Promise.race([fechou, new Promise((r) => setTimeout(r, 3000))]);
        }
        liberar();
      },
    };
  } catch (erro) {
    liberar();
    throw erro;
  }
}
