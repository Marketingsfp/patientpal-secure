// Abertura de webcam compartilhada por biometria (cadastro), totem e
// autoatendimento. Concentra as mensagens de erro e o fallback de câmera para
// as três telas se comportarem igual.

export function cameraDisponivel(): boolean {
  return typeof navigator !== "undefined" && !!navigator.mediaDevices?.getUserMedia;
}

export const MSG_CAMERA_INDISPONIVEL =
  "Este navegador não liberou a câmera para esta página. Use o Chrome ou o Edge atualizado, acessando o endereço com https";

export const MSG_CAMERA_SEM_IMAGEM =
  "A câmera abriu, mas não está enviando imagem. Confira a tampa da webcam ou reconecte o cabo";

// Mensagem que a recepção entende, a partir do erro do navegador.
export function mensagemErroCamera(e: unknown): string {
  if (e instanceof CameraSemImagemError) return MSG_CAMERA_SEM_IMAGEM;
  const nome = (e as { name?: string } | null)?.name;
  if (nome === "NotAllowedError" || nome === "SecurityError") {
    return "Câmera sem permissão no navegador. Clique no cadeado ao lado do endereço do site, permita a câmera e tente novamente";
  }
  if (
    nome === "NotFoundError" ||
    nome === "DevicesNotFoundError" ||
    nome === "OverconstrainedError"
  ) {
    return "Câmera não encontrada. Confira se a webcam está conectada no computador";
  }
  if (nome === "NotReadableError" || nome === "TrackStartError" || nome === "AbortError") {
    return "A câmera está em uso por outro programa (WhatsApp, Zoom, Teams, OBS…). Feche o programa e tente novamente";
  }
  return "Câmera não encontrada ou sem permissão no navegador";
}

export class CameraSemImagemError extends Error {
  constructor() {
    super("camera sem imagem");
    this.name = "CameraSemImagemError";
  }
}

export class CameraCanceladaError extends Error {
  constructor() {
    super("camera cancelada");
    this.name = "CameraCanceladaError";
  }
}

// Abre a câmera pedida; se ela sumiu (trocou de porta USB, foi desconectada),
// cai para a câmera padrão do computador em vez de falhar.
export async function abrirStream(deviceId?: string): Promise<MediaStream> {
  if (deviceId) {
    try {
      return await navigator.mediaDevices.getUserMedia({
        video: { deviceId: { exact: deviceId } },
        audio: false,
      });
    } catch (e) {
      const nome = (e as { name?: string } | null)?.name;
      if (nome !== "OverconstrainedError" && nome !== "NotFoundError") throw e;
    }
  }
  return navigator.mediaDevices.getUserMedia({ video: true, audio: false });
}

export function pararStream(stream: MediaStream | null | undefined) {
  stream?.getTracks().forEach((t) => t.stop());
}

const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));

// true quando o vídeo começa a mostrar quadros dentro do prazo.
export async function esperarImagem(
  video: HTMLVideoElement,
  ms: number,
  cancelado: () => boolean = () => false,
): Promise<boolean> {
  const fim = Date.now() + ms;
  while (Date.now() < fim) {
    if (cancelado()) return false;
    if (video.videoWidth > 0 && video.readyState >= 2) return true;
    await esperar(150);
  }
  return video.videoWidth > 0;
}

export function ligarStreamNoVideo(video: HTMLVideoElement, stream: MediaStream) {
  if (video.srcObject !== stream) video.srcObject = stream;
  video.play().catch(() => {
    /* vídeo mudo: o play é só garantia contra autoplay travado */
  });
}

interface LigarCameraOpts {
  // O <video> só existe depois que a tela troca de etapa; é lido de novo a
  // cada tentativa.
  obterVideo: () => HTMLVideoElement | null;
  cancelado: () => boolean;
  onStream: (stream: MediaStream) => void;
  esperaImagemMs?: number;
}

// Para telas sem seletor de câmera (totem/autoatendimento): abre a câmera
// padrão e, se ela não mandar imagem (ex.: câmera virtual do OBS/Teams como
// padrão do Windows), tenta as outras webcams conectadas, uma a uma.
export async function ligarCameraComImagem({
  obterVideo,
  cancelado,
  onStream,
  esperaImagemMs = 5000,
}: LigarCameraOpts): Promise<MediaStream> {
  if (!cameraDisponivel()) throw new Error(MSG_CAMERA_INDISPONIVEL);

  let video = obterVideo();
  for (let i = 0; !video && i < 20; i++) {
    await esperar(100);
    if (cancelado()) throw new CameraCanceladaError();
    video = obterVideo();
  }
  if (!video) throw new CameraSemImagemError();

  async function testar(deviceId?: string): Promise<MediaStream | null> {
    const stream = await abrirStream(deviceId);
    if (cancelado()) {
      pararStream(stream);
      throw new CameraCanceladaError();
    }
    onStream(stream);
    const v = obterVideo();
    if (!v) {
      pararStream(stream);
      throw new CameraCanceladaError();
    }
    ligarStreamNoVideo(v, stream);
    if (await esperarImagem(v, esperaImagemMs, cancelado)) return stream;
    pararStream(stream);
    if (cancelado()) throw new CameraCanceladaError();
    return null;
  }

  const primeira = await testar();
  if (primeira) return primeira;

  let outras: MediaDeviceInfo[] = [];
  try {
    outras = (await navigator.mediaDevices.enumerateDevices()).filter(
      (d) => d.kind === "videoinput" && d.deviceId,
    );
  } catch {
    /* enumeração indisponível */
  }
  for (const d of outras) {
    try {
      const s = await testar(d.deviceId);
      if (s) return s;
    } catch (e) {
      if (e instanceof CameraCanceladaError) throw e;
      /* essa câmera falhou; tenta a próxima */
    }
  }
  throw new CameraSemImagemError();
}
