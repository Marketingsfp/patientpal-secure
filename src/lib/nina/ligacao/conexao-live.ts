/**
 * Conexão do navegador com a ligação. O navegador nunca vê a chave:
 * gera a oferta WebRTC, abre a conexão contínua com o servidor
 * (`/api/nina-ligacao`, ver `sessao-live.server.ts`) e recebe por ela a
 * resposta SDP e todos os eventos. O áudio vai pelas trilhas de mídia; o canal
 * de dados `oai-events` só confirma que a mídia está pronta (o gateway não
 * aceita comandos por ele). Enquanto a ligação dura, manda o "estou vivo" a
 * cada segundo; sem ele, a voz encerra a sessão.
 */
import { CANAL_EVENTOS_LIVE } from "./eventos-ligacao";

export type ConexaoLigacao = {
  mutar: (mudo: boolean) => void;
  /** Pede `session.close` e aguarda `session.closed` (no máximo 15 s). */
  encerrar: () => Promise<void>;
};

export async function conectarLigacao(o: {
  clinicaId: string;
  voz: string;
  token: string;
  aoEvento: (evento: unknown) => void;
  aoCair: (motivo?: string) => void;
}): Promise<ConexaoLigacao> {
  const microfone = await navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: true, noiseSuppression: true },
  });
  const pc = new RTCPeerConnection();
  const audio = new Audio();
  audio.autoplay = true;
  let socket: WebSocket | undefined;
  let fechado = false;
  let ativo = false;
  let respostaAplicada = false;
  let pulso: ReturnType<typeof setInterval> | undefined;
  let ultimoAck = 0;
  let aoFechar: (() => void) | null = null;

  const liberar = (motivo?: string, avisar = false) => {
    if (fechado) return;
    fechado = true;
    clearInterval(pulso);
    microfone.getTracks().forEach((t) => t.stop());
    audio.srcObject = null;
    pc.close();
    socket?.close();
    aoFechar?.();
    if (avisar) o.aoCair(motivo);
  };

  const enviar = (e: object) => {
    if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(e));
  };

  const canal = pc.createDataChannel(CANAL_EVENTOS_LIVE);
  const midiaPronta = () => pc.connectionState === "connected" && canal.readyState === "open";
  const ativar = () => {
    if (ativo || !respostaAplicada || !midiaPronta()) return;
    ativo = true;
    ultimoAck = Date.now();
    pulso = setInterval(() => {
      if (Date.now() - ultimoAck > 5000) return liberar("A conexão de voz caiu.", true);
      if (midiaPronta()) enviar({ type: "gateway.heartbeat" });
    }, 1000);
    enviar({ type: "gateway.heartbeat" });
    enviar({ type: "app.ready" });
    o.aoEvento({ type: "session.started" });
  };

  try {
    microfone.getAudioTracks().forEach((t) => pc.addTrack(t, microfone));
    pc.ontrack = (e) => {
      audio.srcObject = e.streams[0] ?? new MediaStream([e.track]);
      void audio.play().catch(() => undefined);
    };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "failed" || pc.connectionState === "closed")
        liberar("A conexão de voz caiu.", true);
      else ativar();
    };
    canal.onopen = ativar;

    await pc.setLocalDescription(await pc.createOffer());
    await new Promise<void>((resolve) => {
      if (pc.iceGatheringState === "complete") return resolve();
      const t = setTimeout(resolve, 5000);
      pc.addEventListener("icegatheringstatechange", () => {
        if (pc.iceGatheringState === "complete") {
          clearTimeout(t);
          resolve();
        }
      });
    });
    const sdp = pc.localDescription?.sdp;
    if (!sdp) throw new Error("Não foi possível preparar a ligação.");

    const url = new URL("/api/nina-ligacao", window.location.href);
    url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
    await new Promise<void>((resolve, reject) => {
      const ws = new WebSocket(url.href);
      socket = ws;
      const prazo = setTimeout(() => reject(new Error("A voz demorou para responder.")), 50_000);
      ws.onopen = () =>
        ws.send(
          JSON.stringify({ type: "app.start", sdp, token: o.token, clinicaId: o.clinicaId, voz: o.voz }),
        );
      ws.onmessage = ({ data }) => {
        let e: { type?: string; transport?: { sdp?: string }; error?: { message?: string } };
        try {
          e = JSON.parse(String(data));
        } catch {
          return;
        }
        if (e.type === "gateway.heartbeat.ack") {
          ultimoAck = Date.now();
          return;
        }
        if (e.type === "gateway.session.created" && !respostaAplicada && e.transport?.sdp) {
          respostaAplicada = true;
          clearTimeout(prazo);
          void pc
            .setRemoteDescription({ type: "answer", sdp: e.transport.sdp })
            .then(() => {
              resolve();
              ativar();
            })
            .catch(() => reject(new Error("Não foi possível conectar o áudio.")));
          return;
        }
        if (e.type === "session.started") return; // o início é marcado em ativar()
        o.aoEvento(e);
        if (!respostaAplicada && (e.type === "app.error" || e.type === "gateway.error")) {
          clearTimeout(prazo);
          reject(new Error(e.error?.message ?? "Não foi possível ligar agora."));
        }
        if (e.type === "session.closed") liberar(undefined, true);
      };
      ws.onerror = () => reject(new Error("Não foi possível ligar agora."));
      ws.onclose = () => {
        clearTimeout(prazo);
        reject(new Error("Não foi possível ligar agora."));
        liberar(undefined, true);
      };
    });

    return {
      mutar: (mudo) => microfone.getAudioTracks().forEach((t) => (t.enabled = !mudo)),
      encerrar: async () => {
        if (fechado) return;
        const fechou = new Promise<void>((r) => (aoFechar = r));
        enviar({ type: "session.close" });
        clearInterval(pulso);
        microfone.getTracks().forEach((t) => t.stop());
        await Promise.race([fechou, new Promise((r) => setTimeout(r, 15_000))]);
        liberar();
      },
    };
  } catch (erro) {
    liberar();
    throw erro;
  }
}
