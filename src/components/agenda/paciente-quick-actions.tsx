import { useEffect, useRef, useState } from "react";
import { Calendar, Camera, Check, IdCard, Loader2, MapPin, Phone, Save, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { mostrarErro } from "@/lib/traduzir-erro";

interface Props {
  pacienteId: string;
  clinicaId: string;
}

interface PacData {
  telefone: string | null;
  telefone2: string | null;
  cpf: string | null;
  data_nascimento: string | null;
  cep: string | null;
  logradouro: string | null;
  numero: string | null;
  complemento: string | null;
  bairro: string | null;
  cidade: string | null;
  estado: string | null;
  foto_url: string | null;
}

const EMPTY: PacData = {
  telefone: "",
  telefone2: "",
  cpf: "",
  data_nascimento: "",
  cep: "",
  logradouro: "",
  numero: "",
  complemento: "",
  bairro: "",
  cidade: "",
  estado: "",
  foto_url: null,
};

export function PacienteQuickActions({ pacienteId, clinicaId }: Props) {
  const [data, setData] = useState<PacData>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [savingPhone, setSavingPhone] = useState(false);
  const [edited, setEdited] = useState(false);
  const [endOpen, setEndOpen] = useState(false);
  const [fotoOpen, setFotoOpen] = useState(false);
  const [fotoPreviewUrl, setFotoPreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data: row } = await supabase
        .from("pacientes")
        .select(
          "telefone,telefone2,cpf,data_nascimento,cep,logradouro,numero,complemento,bairro,cidade,estado,foto_url",
        )
        .eq("id", pacienteId)
        .maybeSingle();
      if (cancelled) return;
      if (row) {
        setData({
          telefone: row.telefone ?? "",
          telefone2: row.telefone2 ?? "",
          cpf: row.cpf ?? "",
          data_nascimento: row.data_nascimento ?? "",
          cep: row.cep ?? "",
          logradouro: row.logradouro ?? "",
          numero: row.numero ?? "",
          complemento: row.complemento ?? "",
          bairro: row.bairro ?? "",
          cidade: row.cidade ?? "",
          estado: row.estado ?? "",
          foto_url: row.foto_url ?? null,
        });
        if (row.foto_url) {
          const { data: signed } = await supabase.storage
            .from("pacientes-fotos")
            .createSignedUrl(row.foto_url, 3600);
          if (!cancelled && signed?.signedUrl) setFotoPreviewUrl(signed.signedUrl);
        }
      }
      setEdited(false);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [pacienteId]);

  async function salvarDadosBasicos() {
    setSavingPhone(true);
    const cpfDigits = (data.cpf ?? "").replace(/\D/g, "");
    const { error } = await supabase
      .from("pacientes")
      .update({
        telefone: data.telefone?.trim() || null,
        cpf: cpfDigits || null,
        data_nascimento: data.data_nascimento || null,
      })
      .eq("id", pacienteId);
    setSavingPhone(false);
    if (error) {
      mostrarErro(error);
      return;
    }
    toast.success("Dados do paciente atualizados.");
    setEdited(false);
  }

  async function salvarEndereco() {
    const { error } = await supabase
      .from("pacientes")
      .update({
        cep: data.cep?.trim() || null,
        logradouro: data.logradouro?.trim() || null,
        numero: data.numero?.trim() || null,
        complemento: data.complemento?.trim() || null,
        bairro: data.bairro?.trim() || null,
        cidade: data.cidade?.trim() || null,
        estado: data.estado?.trim().toUpperCase() || null,
      })
      .eq("id", pacienteId);
    if (error) {
      mostrarErro(error);
      return;
    }
    toast.success("Endereço atualizado.");
    setEndOpen(false);
  }

  async function buscarCep() {
    const digits = (data.cep ?? "").replace(/\D/g, "");
    if (digits.length !== 8) return;
    try {
      const res = await fetch(`https://viacep.com.br/ws/${digits}/json/`);
      const j = await res.json();
      if (j?.erro) {
        toast.info("CEP não encontrado.");
        return;
      }
      setData((d) => ({
        ...d,
        logradouro: j.logradouro || d.logradouro,
        bairro: j.bairro || d.bairro,
        cidade: j.localidade || d.cidade,
        estado: j.uf || d.estado,
      }));
    } catch {
      /* silencioso */
    }
  }

  if (loading) {
    return (
      <div className="text-xs text-muted-foreground flex items-center gap-1">
        <Loader2 className="h-3 w-3 animate-spin" /> Carregando dados…
      </div>
    );
  }

  return (
    <div className="rounded-md border bg-muted/30 p-2 space-y-2">
      <div className="grid grid-cols-12 gap-2 items-center">
        <div className="col-span-12 sm:col-span-4 flex items-center gap-1 min-w-0">
          <Phone className="h-4 w-4 text-muted-foreground shrink-0" />
          <Input
            value={data.telefone ?? ""}
            placeholder="Telefone *"
            onChange={(e) => {
              setData((d) => ({ ...d, telefone: e.target.value }));
              setEdited(true);
            }}
            className="h-8 w-full min-w-0"
          />
        </div>
        <div className="col-span-7 sm:col-span-3 flex items-center gap-1 min-w-0">
          <IdCard className="h-4 w-4 text-muted-foreground shrink-0" />
          <Input
            value={data.cpf ?? ""}
            placeholder="CPF"
            inputMode="numeric"
            onChange={(e) => {
              setData((d) => ({ ...d, cpf: e.target.value }));
              setEdited(true);
            }}
            className="h-8 w-full min-w-0"
          />
        </div>
        <div className="col-span-5 sm:col-span-5 flex items-center gap-1 min-w-0">
          <Calendar className="h-4 w-4 text-muted-foreground shrink-0" />
          <Input
            type="date"
            value={data.data_nascimento ?? ""}
            onChange={(e) => {
              setData((d) => ({ ...d, data_nascimento: e.target.value }));
              setEdited(true);
            }}
            className="h-8 w-full min-w-0"
          />
        </div>
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        {edited && (
          <Button type="button" size="sm" onClick={salvarDadosBasicos} disabled={savingPhone}>
            {savingPhone ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Check className="h-3 w-3" />
            )}
            <span className="ml-1">Confirmar dados</span>
          </Button>
        )}
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => setEndOpen(true)}
          title="Endereço e outros dados"
        >
          <MapPin className="h-3.5 w-3.5" />
          <span className="ml-1 hidden sm:inline">Endereço</span>
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => setFotoOpen(true)}
          title="Tirar foto do paciente"
        >
          {fotoPreviewUrl ? (
            <img src={fotoPreviewUrl} alt="" className="h-5 w-5 rounded-full object-cover" />
          ) : (
            <Camera className="h-3.5 w-3.5" />
          )}
          <span className="ml-1 hidden sm:inline">Foto</span>
        </Button>
        {(!data.telefone?.trim() || !data.data_nascimento) && (
          <span className="text-xs text-amber-600 font-medium ml-auto">
            Telefone e nascimento são obrigatórios para agendar.
          </span>
        )}
      </div>

      <EnderecoDialog
        open={endOpen}
        onClose={() => setEndOpen(false)}
        data={data}
        setData={setData}
        onSave={salvarEndereco}
        onBuscarCep={buscarCep}
      />
      <FotoDialog
        open={fotoOpen}
        onClose={() => setFotoOpen(false)}
        pacienteId={pacienteId}
        clinicaId={clinicaId}
        atualUrl={fotoPreviewUrl}
        onSaved={(path, signed) => {
          setData((d) => ({ ...d, foto_url: path }));
          setFotoPreviewUrl(signed);
        }}
      />
    </div>
  );
}

function EnderecoDialog({
  open,
  onClose,
  data,
  setData,
  onSave,
  onBuscarCep,
}: {
  open: boolean;
  onClose: () => void;
  data: PacData;
  setData: React.Dispatch<React.SetStateAction<PacData>>;
  onSave: () => Promise<void>;
  onBuscarCep: () => Promise<void>;
}) {
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
    >
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MapPin className="h-5 w-5" /> Endereço do paciente
          </DialogTitle>
          <DialogDescription>
            Atualize CEP, rua, número, bairro e demais dados. Use o botão buscar para preencher pelo
            CEP.
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-3 gap-2">
          <div className="col-span-1 space-y-1">
            <Label className="text-xs">CEP</Label>
            <div className="flex gap-1">
              <Input
                value={data.cep ?? ""}
                onChange={(e) => setData((d) => ({ ...d, cep: e.target.value }))}
                onBlur={onBuscarCep}
              />
            </div>
          </div>
          <div className="col-span-2 space-y-1">
            <Label className="text-xs">Logradouro</Label>
            <Input
              value={data.logradouro ?? ""}
              onChange={(e) => setData((d) => ({ ...d, logradouro: e.target.value }))}
            />
          </div>
          <div className="col-span-1 space-y-1">
            <Label className="text-xs">Número</Label>
            <Input
              value={data.numero ?? ""}
              onChange={(e) => setData((d) => ({ ...d, numero: e.target.value }))}
            />
          </div>
          <div className="col-span-2 space-y-1">
            <Label className="text-xs">Complemento</Label>
            <Input
              value={data.complemento ?? ""}
              onChange={(e) => setData((d) => ({ ...d, complemento: e.target.value }))}
            />
          </div>
          <div className="col-span-2 space-y-1">
            <Label className="text-xs">Bairro</Label>
            <Input
              value={data.bairro ?? ""}
              onChange={(e) => setData((d) => ({ ...d, bairro: e.target.value }))}
            />
          </div>
          <div className="col-span-1 space-y-1">
            <Label className="text-xs">UF</Label>
            <Input
              value={data.estado ?? ""}
              maxLength={2}
              onChange={(e) => setData((d) => ({ ...d, estado: e.target.value.toUpperCase() }))}
            />
          </div>
          <div className="col-span-3 space-y-1">
            <Label className="text-xs">Cidade</Label>
            <Input
              value={data.cidade ?? ""}
              onChange={(e) => setData((d) => ({ ...d, cidade: e.target.value }))}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            <X className="h-4 w-4 mr-1" />
            Cancelar
          </Button>
          <Button onClick={() => void onSave()}>
            <Save className="h-4 w-4 mr-1" />
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function FotoDialog({
  open,
  onClose,
  pacienteId,
  clinicaId,
  atualUrl,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  pacienteId: string;
  clinicaId: string;
  atualUrl: string | null;
  onSaved: (path: string, signed: string) => void;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setPreview(null);
    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "user", width: 640, height: 480 },
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
      } catch {
        toast.error("Não foi possível acessar a câmera.");
        onClose();
      }
    })();
    return () => {
      cancelled = true;
      stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function stop() {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }

  async function capturar() {
    if (!videoRef.current) return;
    const v = videoRef.current;
    const canvas = document.createElement("canvas");
    canvas.width = v.videoWidth || 640;
    canvas.height = v.videoHeight || 480;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
    setPreview(dataUrl);
  }

  async function salvar() {
    if (!preview) return;
    setBusy(true);
    try {
      const blob = await (await fetch(preview)).blob();
      const path = `${clinicaId}/${pacienteId}.jpg`;
      const { error: upErr } = await supabase.storage
        .from("pacientes-fotos")
        .upload(path, blob, { upsert: true, contentType: "image/jpeg" });
      if (upErr) throw upErr;
      const { error: updErr } = await supabase
        .from("pacientes")
        .update({ foto_url: path, foto_atualizado_em: new Date().toISOString() })
        .eq("id", pacienteId);
      if (updErr) throw updErr;
      const { data: signed } = await supabase.storage
        .from("pacientes-fotos")
        .createSignedUrl(path, 3600);
      onSaved(path, signed?.signedUrl ?? "");
      toast.success("Foto salva!");
      stop();
      onClose();
    } catch (e: any) {
      mostrarErro(e);
    } finally {
      setBusy(false);
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
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Camera className="h-5 w-5" /> Foto do paciente
          </DialogTitle>
          <DialogDescription>
            {preview ? "Confirme ou tire outra foto." : "Posicione o paciente na câmera e capture."}
          </DialogDescription>
        </DialogHeader>
        <div className="relative rounded-lg overflow-hidden bg-black aspect-[4/3]">
          {preview ? (
            <img src={preview} alt="Captura" className="w-full h-full object-cover" />
          ) : (
            <video ref={videoRef} playsInline muted className="w-full h-full object-cover" />
          )}
        </div>
        {atualUrl && !preview && (
          <div className="text-xs text-muted-foreground flex items-center gap-2">
            <img
              src={atualUrl}
              alt="Foto atual do paciente"
              className="h-8 w-8 rounded-full object-cover border"
            />
            Foto atual
          </div>
        )}
        <DialogFooter className="gap-2">
          <Button
            variant="ghost"
            onClick={() => {
              stop();
              onClose();
            }}
          >
            Cancelar
          </Button>
          {preview ? (
            <>
              <Button variant="outline" onClick={() => setPreview(null)}>
                Tirar outra
              </Button>
              <Button onClick={() => void salvar()} disabled={busy}>
                {busy ? (
                  <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                ) : (
                  <Check className="h-4 w-4 mr-1" />
                )}{" "}
                Salvar foto
              </Button>
            </>
          ) : (
            <Button onClick={() => void capturar()}>
              <Camera className="h-4 w-4 mr-1" /> Capturar
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
