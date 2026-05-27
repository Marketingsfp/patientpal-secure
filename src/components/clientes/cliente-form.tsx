import { useEffect, useRef, useState, type FormEvent } from "react";
import { Camera, Loader2, MapPin, Mic, MicOff, Upload, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { isCPFValido, somenteDigitos } from "@/lib/cpf";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export interface Paciente {
  id: string;
  nome: string;
  cpf: string | null;
  numero_pasta: string | null;
  telefone: string | null;
  telefone2: string | null;
  email: string | null;
  data_nascimento: string | null;
  sexo: string | null;
  ativo: boolean;
  cep: string | null;
  logradouro: string | null;
  numero: string | null;
  complemento: string | null;
  bairro: string | null;
  cidade: string | null;
  estado: string | null;
  responsavel_nome: string | null;
  responsavel_cpf: string | null;
  responsavel_telefone: string | null;
  responsavel_parentesco: string | null;
  foto_url?: string | null;
}

type FormState = {
  nome: string; cpf: string; numero_pasta: string; telefone: string; telefone2: string; email: string;
  data_nascimento: string; sexo: string; ativo: boolean;
  cep: string; logradouro: string; numero: string; complemento: string;
  bairro: string; cidade: string; estado: string;
  responsavel_nome: string; responsavel_cpf: string;
  responsavel_telefone: string; responsavel_parentesco: string;
};

const EMPTY: FormState = {
  nome: "", cpf: "", numero_pasta: "", telefone: "", telefone2: "", email: "",
  data_nascimento: "", sexo: "nao_informar", ativo: true,
  cep: "", logradouro: "", numero: "", complemento: "",
  bairro: "", cidade: "", estado: "",
  responsavel_nome: "", responsavel_cpf: "",
  responsavel_telefone: "", responsavel_parentesco: "",
};

function calcIdade(dn: string | null): number | null {
  if (!dn) return null;
  const d = new Date(dn + "T00:00:00");
  if (isNaN(d.getTime())) return null;
  const t = new Date();
  let a = t.getFullYear() - d.getFullYear();
  const m = t.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && t.getDate() < d.getDate())) a--;
  return a;
}

function normalizarFalaEmail(t: string): string {
  return t
    .toLowerCase()
    .replace(/\s*\barroba\b\s*/g, "@")
    .replace(/\s*\bponto\b\s*/g, ".")
    .replace(/\s*\bhífen\b\s*/g, "-")
    .replace(/\s*\bhifen\b\s*/g, "-")
    .replace(/\s*\btraço\b\s*/g, "-")
    .replace(/\s*\btraco\b\s*/g, "-")
    .replace(/\s*\bunderline\b\s*/g, "_")
    .replace(/\s*\bunder ?score\b\s*/g, "_")
    .replace(/\s+/g, "");
}
function normalizarFalaDigitos(t: string): string { return t.replace(/\D+/g, ""); }
function normalizarFala(field: string, raw: string): string {
  if (field === "email") return normalizarFalaEmail(raw);
  if (field === "cpf" || field === "telefone" || field === "cep" ||
      field === "responsavel_cpf" || field === "responsavel_telefone" ||
      field === "numero") return normalizarFalaDigitos(raw);
  return raw;
}

function InputVoz({
  field, type = "text", value, onChange, onVoice, voiceActive, speechSupported, ...rest
}: {
  field: string; type?: string; value: string;
  onChange: (v: string) => void; onVoice: () => void;
  voiceActive: boolean; speechSupported: boolean;
  [k: string]: any;
}) {
  return (
    <div className="flex gap-2">
      <Input type={type} value={value} onChange={(e) => onChange(e.target.value)} {...rest} />
      {speechSupported && (
        <Button
          type="button" size="icon" variant={voiceActive ? "default" : "outline"}
          className="h-9 w-9 shrink-0" onClick={onVoice} title="Ditar por voz"
        >
          {voiceActive ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
        </Button>
      )}
    </div>
  );
}

interface ClienteFormProps {
  clinicaId: string;
  paciente: Paciente | null;
  onSaved: (pacienteId: string) => void;
  onCancel: () => void;
  /** Footer apresentado em modo "sticky" (uso no Dialog). Default: false. */
  stickyFooter?: boolean;
}

export function ClienteForm({ clinicaId, paciente, onSaved, onCancel, stickyFooter }: ClienteFormProps) {
  const editing = paciente;
  const [form, setForm] = useState<FormState>(EMPTY);
  const [tab, setTab] = useState("dados");
  const [saving, setSaving] = useState(false);
  const [cepLoading, setCepLoading] = useState(false);

  // Foto
  const [fotoFile, setFotoFile] = useState<File | null>(null);
  const [fotoPreview, setFotoPreview] = useState<string | null>(null);
  const fotoInputRef = useRef<HTMLInputElement | null>(null);

  // Câmera
  const [camOpen, setCamOpen] = useState(false);
  const camVideoRef = useRef<HTMLVideoElement | null>(null);
  const camStreamRef = useRef<MediaStream | null>(null);

  // Voz
  const [recording, setRecording] = useState(false);
  const [voiceField, setVoiceField] = useState<keyof FormState | null>(null);
  const recogRef = useRef<any>(null);
  const speechSupported = typeof window !== "undefined" &&
    ("webkitSpeechRecognition" in window || "SpeechRecognition" in window);

  // Inicializa o form quando o paciente muda
  useEffect(() => {
    if (!editing) {
      setForm(EMPTY); setFotoFile(null); setFotoPreview(null); setTab("dados");
      return;
    }
    setForm({
      nome: editing.nome,
      cpf: editing.cpf ?? "", numero_pasta: editing.numero_pasta ?? "",
      telefone: editing.telefone ?? "", telefone2: editing.telefone2 ?? "",
      email: editing.email ?? "",
      data_nascimento: editing.data_nascimento ?? "",
      sexo: editing.sexo ?? "nao_informar", ativo: editing.ativo,
      cep: editing.cep ?? "", logradouro: editing.logradouro ?? "",
      numero: editing.numero ?? "", complemento: editing.complemento ?? "",
      bairro: editing.bairro ?? "", cidade: editing.cidade ?? "",
      estado: editing.estado ?? "",
      responsavel_nome: editing.responsavel_nome ?? "",
      responsavel_cpf: editing.responsavel_cpf ?? "",
      responsavel_telefone: editing.responsavel_telefone ?? "",
      responsavel_parentesco: editing.responsavel_parentesco ?? "",
    });
    setTab("dados");
    setFotoFile(null);
    if (editing.foto_url) {
      void supabase.storage.from("pacientes-fotos")
        .createSignedUrl(editing.foto_url, 3600)
        .then(({ data }) => setFotoPreview(data?.signedUrl ?? null));
    } else {
      setFotoPreview(null);
    }
  }, [editing?.id]);

  const abrirCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 640 } },
        audio: false,
      });
      camStreamRef.current = stream;
      setCamOpen(true);
      setTimeout(() => {
        if (camVideoRef.current) {
          camVideoRef.current.srcObject = stream;
          void camVideoRef.current.play();
        }
      }, 50);
    } catch {
      toast.error("Não foi possível acessar a câmera. Verifique a permissão do navegador.");
    }
  };
  const fecharCamera = () => {
    camStreamRef.current?.getTracks().forEach(t => t.stop());
    camStreamRef.current = null;
    setCamOpen(false);
  };
  const capturarFoto = () => {
    const v = camVideoRef.current;
    if (!v) return;
    const w = v.videoWidth, h = v.videoHeight;
    if (!w || !h) { toast.error("Câmera ainda não está pronta."); return; }
    const side = Math.min(w, h);
    const sx = (w - side) / 2, sy = (h - side) / 2;
    const canvas = document.createElement("canvas");
    canvas.width = 480; canvas.height = 480;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(v, sx, sy, side, side, 0, 0, 480, 480);
    canvas.toBlob((blob) => {
      if (!blob) return;
      const file = new File([blob], `foto-${Date.now()}.jpg`, { type: "image/jpeg" });
      setFotoFile(file);
      setFotoPreview(URL.createObjectURL(blob));
      fecharCamera();
    }, "image/jpeg", 0.9);
  };

  const buscarCep = async (cepRaw: string) => {
    const cep = cepRaw.replace(/\D/g, "");
    if (cep.length !== 8) return;
    setCepLoading(true);
    try {
      const r = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
      const d = await r.json();
      if (d.erro) { toast.error("CEP não encontrado."); return; }
      setForm(f => ({
        ...f,
        logradouro: d.logradouro ?? f.logradouro,
        bairro: d.bairro ?? f.bairro,
        cidade: d.localidade ?? f.cidade,
        estado: d.uf ?? f.estado,
      }));
      toast.success("Endereço preenchido pelo CEP.");
    } catch {
      toast.error("Falha ao consultar o CEP.");
    } finally { setCepLoading(false); }
  };

  const startVoice = (field: keyof FormState) => {
    if (!speechSupported) { toast.error("Reconhecimento de voz não suportado neste navegador."); return; }
    const SR: any = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    const r = new SR();
    r.lang = "pt-BR"; r.continuous = false; r.interimResults = false;
    r.onresult = (e: any) => {
      const raw = e.results[0][0].transcript as string;
      const text = normalizarFala(field as string, raw);
      setForm(f => {
        const cur = (f[field] as string) ?? "";
        const sep = cur && field !== "email" && field !== "cpf" && field !== "telefone" && field !== "telefone2" &&
                    field !== "cep" && field !== "numero" &&
                    field !== "responsavel_cpf" && field !== "responsavel_telefone" ? " " : "";
        return { ...f, [field]: cur + sep + text } as FormState;
      });
    };
    r.onerror = () => { toast.error("Erro no reconhecimento de voz."); setRecording(false); setVoiceField(null); };
    r.onend = () => { setRecording(false); setVoiceField(null); };
    recogRef.current = r;
    setRecording(true); setVoiceField(field);
    r.start();
  };
  const stopVoice = () => { try { recogRef.current?.stop(); } catch { /* */ } };

  useEffect(() => () => { stopVoice(); fecharCamera(); }, []); // cleanup

  const idade = calcIdade(form.data_nascimento);
  const sugerirResponsavel = idade !== null && (idade < 18 || idade >= 70);

  const fieldProps = (field: keyof FormState) => {
    const active = recording && voiceField === field;
    return {
      field: field as string,
      value: form[field] as string,
      onChange: (v: string) => setForm(f => ({ ...f, [field]: v } as FormState)),
      onVoice: () => active ? stopVoice() : startVoice(field),
      voiceActive: active,
      speechSupported,
    };
  };

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!form.nome.trim()) { toast.error("Informe o nome."); return; }
    if (!form.telefone.trim()) { toast.error("Informe o telefone."); return; }
    if (!form.data_nascimento) { toast.error("Informe a data de nascimento."); return; }
    if (form.cpf.trim() && !isCPFValido(form.cpf)) { toast.error("CPF inválido."); return; }
    if (form.responsavel_cpf.trim() && !isCPFValido(form.responsavel_cpf)) {
      toast.error("CPF do responsável inválido."); return;
    }
    setSaving(true);
    const payload = {
      nome: form.nome.trim(),
      cpf: form.cpf.trim() ? somenteDigitos(form.cpf) : null,
      numero_pasta: form.numero_pasta.trim() || null,
      telefone: form.telefone.trim() || null,
      telefone2: form.telefone2.trim() || null,
      email: form.email.trim() || null,
      data_nascimento: form.data_nascimento || null,
      sexo: form.sexo,
      ativo: form.ativo,
      cep: form.cep.trim() || null,
      logradouro: form.logradouro.trim() || null,
      numero: form.numero.trim() || null,
      complemento: form.complemento.trim() || null,
      bairro: form.bairro.trim() || null,
      cidade: form.cidade.trim() || null,
      estado: form.estado.trim() || null,
      responsavel_nome: form.responsavel_nome.trim() || null,
      responsavel_cpf: form.responsavel_cpf.trim() ? somenteDigitos(form.responsavel_cpf) : null,
      responsavel_telefone: form.responsavel_telefone.trim() || null,
      responsavel_parentesco: form.responsavel_parentesco.trim() || null,
      clinica_id: clinicaId,
    };
    let pacienteId: string | undefined = editing?.id;
    if (editing) {
      const { error } = await supabase.from("pacientes").update(payload).eq("id", editing.id);
      if (error) { setSaving(false); toast.error(error.message); return; }
    } else {
      const { data: novo, error } = await supabase
        .from("pacientes").insert(payload).select("id").single();
      if (error) { setSaving(false); toast.error(error.message); return; }
      pacienteId = novo?.id;
    }

    if (fotoFile && pacienteId) {
      const ext = (fotoFile.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
      const path = `${clinicaId}/${pacienteId}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("pacientes-fotos")
        .upload(path, fotoFile, { upsert: true, contentType: fotoFile.type || "image/jpeg" });
      if (upErr) {
        setSaving(false);
        toast.error("Cliente salvo, mas a foto falhou: " + upErr.message);
        onSaved(pacienteId); return;
      }
      await supabase.from("pacientes")
        .update({ foto_url: path, foto_atualizado_em: new Date().toISOString() })
        .eq("id", pacienteId);
    }

    setSaving(false);
    toast.success(editing ? "Cliente atualizado." : "Cliente cadastrado.");
    if (pacienteId) onSaved(pacienteId);
  };

  const footerClass = stickyFooter
    ? "sticky bottom-0 bg-background border-t -mx-6 -mb-6 px-6 py-3 z-10 flex justify-end gap-2"
    : "flex justify-end gap-2 pt-4 border-t";

  return (
    <>
      <form onSubmit={onSubmit} className="space-y-4">
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="grid grid-cols-3 w-full">
            <TabsTrigger value="dados">Dados</TabsTrigger>
            <TabsTrigger value="endereco">Endereço</TabsTrigger>
            <TabsTrigger value="responsavel">
              Responsável{sugerirResponsavel ? " •" : ""}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="dados" className="space-y-4 pt-4 pb-16">
            <div className="flex items-center gap-4">
              <div className="relative h-20 w-20 rounded-full overflow-hidden border bg-muted flex items-center justify-center shrink-0">
                {fotoPreview ? (
                  <img src={fotoPreview} alt="Foto do paciente" className="h-full w-full object-cover" />
                ) : (
                  <Camera className="h-7 w-7 text-muted-foreground" />
                )}
              </div>
              <div className="flex flex-col gap-2">
                <input
                  ref={fotoInputRef} type="file"
                  accept="image/png,image/jpeg,image/webp" className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0] ?? null;
                    if (!f) return;
                    if (f.size > 5 * 1024 * 1024) { toast.error("Imagem acima de 5 MB."); return; }
                    setFotoFile(f);
                    setFotoPreview(URL.createObjectURL(f));
                  }}
                />
                <div className="flex gap-2 flex-wrap">
                  <Button type="button" variant="outline" size="sm" onClick={() => fotoInputRef.current?.click()}>
                    <Upload className="h-4 w-4 mr-2" /> {fotoPreview ? "Trocar foto" : "Enviar foto"}
                  </Button>
                  <Button type="button" variant="outline" size="sm" onClick={abrirCamera}>
                    <Camera className="h-4 w-4 mr-2" /> Tirar foto
                  </Button>
                  {fotoPreview && (
                    <Button type="button" variant="ghost" size="sm" onClick={() => { setFotoFile(null); setFotoPreview(null); }}>
                      <X className="h-4 w-4 mr-1" /> Remover
                    </Button>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">JPG, PNG ou WebP até 5 MB. Acesso restrito à clínica.</p>
              </div>
            </div>
            <div className="space-y-1"><Label>Nome *</Label><InputVoz {...fieldProps("nome")} required /></div>
            <div className="space-y-1"><Label>Número de pasta</Label><InputVoz {...fieldProps("numero_pasta")} placeholder="Ex.: 1234" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1"><Label>CPF</Label><InputVoz {...fieldProps("cpf")} /></div>
              <div className="space-y-1"><Label>Telefone *</Label><InputVoz {...fieldProps("telefone")} /></div>
            </div>
            <div className="space-y-1"><Label>Telefone 2 <span className="text-xs text-muted-foreground">(opcional)</span></Label><InputVoz {...fieldProps("telefone2")} /></div>
            <div className="space-y-1"><Label>E-mail <span className="text-xs text-muted-foreground">(usado em nota fiscal)</span></Label><InputVoz {...fieldProps("email")} type="email" /></div>
            <div className="grid grid-cols-2 gap-3 items-end">
              <div className="space-y-1">
                <Label>Data de nascimento *</Label>
                <Input type="date" required value={form.data_nascimento}
                  onChange={(e) => setForm({ ...form, data_nascimento: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label>Sexo</Label>
                <Select value={form.sexo} onValueChange={(v) => setForm({ ...form, sexo: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="masculino">Masculino</SelectItem>
                    <SelectItem value="feminino">Feminino</SelectItem>
                    <SelectItem value="outro">Outro</SelectItem>
                    <SelectItem value="nao_informar">Prefiro não informar</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            {idade !== null && (
              <div className="text-sm text-muted-foreground">
                Idade: <span className="font-medium text-foreground">{idade} anos</span>
                {sugerirResponsavel && (
                  <span className="block text-xs text-amber-600 dark:text-amber-400">
                    Recomendado cadastrar responsável.
                  </span>
                )}
              </div>
            )}
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <Checkbox checked={form.ativo} onCheckedChange={(v) => setForm({ ...form, ativo: !!v })} />
              Cliente ativo
            </label>
          </TabsContent>

          <TabsContent value="endereco" className="space-y-4 pt-4 pb-16">
            <div className="space-y-1">
              <Label className="flex items-center gap-1"><MapPin className="h-3.5 w-3.5" /> CEP</Label>
              <div className="flex gap-2">
                <Input
                  value={form.cep}
                  onChange={(e) => setForm({ ...form, cep: e.target.value })}
                  onBlur={(e) => buscarCep(e.target.value)}
                  placeholder="00000-000" maxLength={9}
                />
                <Button type="button" variant="outline" onClick={() => buscarCep(form.cep)} disabled={cepLoading}>
                  {cepLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Buscar"}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">Preenche o endereço automaticamente.</p>
            </div>
            <div className="space-y-1"><Label>Logradouro</Label><InputVoz {...fieldProps("logradouro")} /></div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1"><Label>Número</Label><InputVoz {...fieldProps("numero")} /></div>
              <div className="space-y-1 col-span-2"><Label>Complemento</Label><InputVoz {...fieldProps("complemento")} /></div>
            </div>
            <div className="space-y-1"><Label>Bairro</Label><InputVoz {...fieldProps("bairro")} /></div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1 col-span-2"><Label>Cidade</Label><InputVoz {...fieldProps("cidade")} /></div>
              <div className="space-y-1">
                <Label>UF</Label>
                <Input value={form.estado} maxLength={2}
                  onChange={(e) => setForm({ ...form, estado: e.target.value.toUpperCase() })} />
              </div>
            </div>
          </TabsContent>

          <TabsContent value="responsavel" className="space-y-4 pt-4 pb-16">
            <p className="text-sm text-muted-foreground">
              Para menores de idade ou pacientes que precisam de acompanhante.
            </p>
            <div className="space-y-1"><Label>Nome do responsável</Label><InputVoz {...fieldProps("responsavel_nome")} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1"><Label>CPF</Label><InputVoz {...fieldProps("responsavel_cpf")} /></div>
              <div className="space-y-1"><Label>Telefone</Label><InputVoz {...fieldProps("responsavel_telefone")} /></div>
            </div>
            <div className="space-y-1">
              <Label>Parentesco</Label>
              <Input value={form.responsavel_parentesco}
                onChange={(e) => setForm({ ...form, responsavel_parentesco: e.target.value })}
                placeholder="Ex.: Mãe, Pai, Filho(a), Cuidador" />
            </div>
          </TabsContent>
        </Tabs>

        <div className={footerClass}>
          <Button type="button" variant="outline" onClick={() => { stopVoice(); onCancel(); }}>Cancelar</Button>
          <Button type="submit" disabled={saving}>{saving ? "Salvando…" : "Salvar"}</Button>
        </div>
      </form>

      <Dialog open={camOpen} onOpenChange={(o) => { if (!o) fecharCamera(); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Tirar foto</DialogTitle>
            <DialogDescription>Enquadre o rosto do paciente e clique em Capturar.</DialogDescription>
          </DialogHeader>
          <div className="rounded-md overflow-hidden bg-black aspect-square">
            <video ref={camVideoRef} className="w-full h-full object-cover" playsInline muted />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={fecharCamera}>Cancelar</Button>
            <Button onClick={capturarFoto}><Camera className="h-4 w-4 mr-2" /> Capturar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}