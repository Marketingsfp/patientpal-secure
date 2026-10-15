import { useCallback, useEffect, useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Camera, Loader2, CheckCircle2, AlertTriangle, RefreshCw, Upload } from "lucide-react";
import { mostrarErro } from "@/lib/traduzir-erro";
import { detectDescriptor, ensureFaceModelsComLimite } from "@/lib/face-recognition";
import {
  abrirStream,
  cameraDisponivel,
  ligarStreamNoVideo,
  mensagemErroCamera,
  MSG_CAMERA_INDISPONIVEL,
  pararStream,
} from "@/lib/camera";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface Props {
  open: boolean;
  onClose: () => void;
  onCaptured: (descriptor: number[], foto?: Blob) => Promise<void> | void;
  titulo?: string;
}

// Sem imagem depois desse tempo = câmera aberta mas preta (ex.: câmera virtual
// do OBS/Teams escolhida como padrão, tampa da webcam, driver travado).
const ESPERA_IMAGEM_MS = 6000;

export function FaceCaptureDialog({ open, onClose, onCaptured, titulo = "Capturar rosto" }: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [busy, setBusy] = useState(false);
  const [camErro, setCamErro] = useState<string | null>(null);
  const [modelos, setModelos] = useState<"carregando" | "ok" | "erro">("carregando");
  const [tentativa, setTentativa] = useState(0);
  const [msg, setMsg] = useState("Posicione o rosto na câmera");
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  // deviceId = câmera mostrada no seletor; camPedida = câmera escolhida pela
  // pessoa (só ela reinicia a câmera — antes, gravar a câmera atual no seletor
  // derrubava e reabria o vídeo logo após abrir).
  const [deviceId, setDeviceId] = useState<string | undefined>(undefined);
  const [camPedida, setCamPedida] = useState<string | undefined>(undefined);
  const fileRef = useRef<HTMLInputElement | null>(null);

  // Liga o vídeo assim que o elemento aparece na tela (o modal monta o
  // conteúdo depois que o efeito já começou a abrir a câmera).
  const ligarVideo = useCallback((el: HTMLVideoElement | null) => {
    videoRef.current = el;
    const stream = streamRef.current;
    if (el && stream) ligarStreamNoVideo(el, stream);
  }, []);

  // Modelos do reconhecimento facial: baixam em paralelo com a câmera e só
  // travam o botão de capturar, nunca a imagem.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setModelos("carregando");
    ensureFaceModelsComLimite()
      .then(() => !cancelled && setModelos("ok"))
      .catch((e) => {
        console.error("Face models error:", e);
        if (!cancelled) setModelos("erro");
      });
    return () => {
      cancelled = true;
    };
  }, [open, tentativa]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    let vigia: ReturnType<typeof setTimeout> | undefined;
    setCamErro(null);
    setMsg("Abrindo câmera…");

    async function listarCameras() {
      try {
        const list = await navigator.mediaDevices.enumerateDevices();
        if (!cancelled) setDevices(list.filter((d) => d.kind === "videoinput"));
      } catch {
        /* enumeração indisponível */
      }
    }

    (async () => {
      if (!cameraDisponivel()) {
        setCamErro(MSG_CAMERA_INDISPONIVEL);
        return;
      }
      stop();
      let stream: MediaStream;
      try {
        stream = await abrirStream(camPedida);
      } catch (e) {
        if (cancelled) return;
        console.error("Camera Error:", (e as { name?: string } | null)?.name ?? e);
        setCamErro(mensagemErroCamera(e));
        await listarCameras();
        return;
      }
      if (cancelled) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      streamRef.current = stream;
      if (videoRef.current) ligarVideo(videoRef.current);
      setMsg("Posicione o rosto na câmera");

      const track = stream.getVideoTracks()[0];
      const atual = track?.getSettings().deviceId;
      if (atual) setDeviceId(atual);
      if (track) {
        track.onended = () => {
          if (!cancelled && streamRef.current === stream) {
            setCamErro("A câmera foi desconectada");
          }
        };
      }
      // Rótulos das câmeras só vêm depois da permissão concedida.
      await listarCameras();

      vigia = setTimeout(() => {
        if (cancelled || streamRef.current !== stream) return;
        if ((videoRef.current?.videoWidth ?? 0) === 0) {
          stop();
          setCamErro(
            "A câmera abriu, mas não está enviando imagem. Se houver mais de uma câmera, escolha outra abaixo; senão, confira a tampa da webcam ou reconecte o cabo",
          );
        }
      }, ESPERA_IMAGEM_MS);
    })();
    return () => {
      cancelled = true;
      clearTimeout(vigia);
      stop();
    };
  }, [open, tentativa, camPedida, ligarVideo]);

  function resetarCamera() {
    stop();
    setCamErro(null);
    setBusy(false);
    setMsg("Reiniciando câmera…");
    setTentativa((t) => t + 1);
  }

  function stop() {
    const v = videoRef.current;
    if (v) v.srcObject = null;
    pararStream(streamRef.current);
    streamRef.current = null;
  }

  const snapshot = useCallback(async (): Promise<Blob | undefined> => {
    const v = videoRef.current;
    if (!v) return undefined;
    const canvas = document.createElement("canvas");
    canvas.width = v.videoWidth || 640;
    canvas.height = v.videoHeight || 480;
    const ctx = canvas.getContext("2d");
    if (!ctx) return undefined;
    ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
    return await new Promise<Blob | undefined>((res) =>
      canvas.toBlob((b) => res(b ?? undefined), "image/jpeg", 0.9),
    );
  }, []);

  async function capturar() {
    if (!videoRef.current) return;
    setBusy(true);
    setMsg("Analisando…");
    const desc = await detectDescriptor(videoRef.current).catch((e) => {
      console.error("Face detect error:", e);
      return null;
    });
    if (!desc) {
      setMsg("Rosto não detectado. Aproxime e tente novamente.");
      setBusy(false);
      return;
    }
    setMsg("Salvando…");
    try {
      const foto = await snapshot();
      await onCaptured(Array.from(desc), foto);
      setMsg("Foto registrada!");
      stop();
      setTimeout(onClose, 700);
    } catch (e: any) {
      mostrarErro(e);
      setBusy(false);
      setMsg("Tente novamente");
    }
  }

  async function usarArquivo(file: File) {
    setBusy(true);
    setMsg("Analisando imagem…");
    try {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.src = url;
      await img.decode();
      const desc = await detectDescriptor(img);
      URL.revokeObjectURL(url);
      if (!desc) {
        setMsg("Rosto não detectado na imagem. Tente outra foto.");
        setBusy(false);
        return;
      }
      setMsg("Salvando…");
      await onCaptured(Array.from(desc), file);
      setMsg("Foto registrada!");
      stop();
      setTimeout(onClose, 700);
    } catch (e: any) {
      mostrarErro(e);
      setBusy(false);
      setMsg("Tente novamente");
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) {
          stop();
          onClose();
        }
      }}
    >
      {/* coluna da grade travada na largura do modal: sem isso o vídeo da
          webcam (640–1280px) alargava a grade e empurrava título e botões
          para fora */}
      <DialogContent className="max-w-lg grid-cols-[minmax(0,1fr)]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 break-words">
            <Camera className="h-5 w-5 shrink-0" /> <span className="min-w-0">{titulo}</span>
          </DialogTitle>
          <DialogDescription>{camErro ?? msg}</DialogDescription>
        </DialogHeader>
        {camErro ? (
          <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm space-y-3">
            <p className="flex items-start gap-2 text-destructive">
              <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
              <span>{camErro}.</span>
            </p>
            <Button type="button" variant="outline" size="sm" onClick={resetarCamera}>
              <RefreshCw className="h-4 w-4 mr-1" /> Tentar novamente
            </Button>
          </div>
        ) : (
          <div className="relative rounded-lg overflow-hidden bg-black aspect-[4/3]">
            <video
              ref={ligarVideo}
              autoPlay
              playsInline
              muted
              className="absolute inset-0 w-full h-full object-cover"
            />
            <div className="absolute inset-x-16 inset-y-6 border-4 border-white/60 rounded-[50%] pointer-events-none" />
            <span className="absolute bottom-2 inset-x-0 text-center text-[12px] text-white/85 pointer-events-none">
              Enquadre o rosto do paciente aqui
            </span>
          </div>
        )}
        {!camErro && modelos === "carregando" && (
          <p className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Preparando o reconhecimento facial…
          </p>
        )}
        {modelos === "erro" && (
          <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm space-y-2">
            <p className="flex items-start gap-2 text-destructive">
              <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
              <span>
                Não foi possível carregar o reconhecimento facial. Confira a internet e tente
                novamente.
              </span>
            </p>
            <Button type="button" variant="outline" size="sm" onClick={resetarCamera}>
              <RefreshCw className="h-4 w-4 mr-1" /> Tentar novamente
            </Button>
          </div>
        )}
        {devices.length > 1 && (
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">Câmera</p>
            <Select
              value={deviceId}
              onValueChange={(v) => {
                setDeviceId(v);
                setCamPedida(v);
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Selecionar câmera" />
              </SelectTrigger>
              <SelectContent>
                {devices.map((d, i) => (
                  <SelectItem key={d.deviceId || i} value={d.deviceId}>
                    {d.label || `Câmera ${i + 1}`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
        <DialogFooter className="flex-wrap gap-2 sm:space-x-0">
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (f) void usarArquivo(f);
            }}
          />
          <Button variant="outline" onClick={() => fileRef.current?.click()} disabled={busy}>
            <Upload className="h-4 w-4 mr-1" /> Anexar foto / arquivo
          </Button>
          <Button
            variant="ghost"
            onClick={() => {
              stop();
              onClose();
            }}
          >
            Cancelar
          </Button>
          <Button onClick={capturar} disabled={busy || !!camErro || modelos !== "ok"}>
            {busy ? (
              <Loader2 className="h-4 w-4 mr-1 animate-spin" />
            ) : (
              <CheckCircle2 className="h-4 w-4 mr-1" />
            )}{" "}
            Capturar foto biométrica
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
