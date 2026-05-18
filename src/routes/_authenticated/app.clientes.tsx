import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Plus, Search, Pencil, Trash2, Users, Mic, MicOff, Loader2, MapPin, Download, ScanFace, Camera, Upload, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useClinica } from "@/hooks/use-clinica";
import { exportToExcel } from "@/lib/export-csv";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FaceCaptureDialog } from "@/components/face/FaceCaptureDialog";

export const Route = createFileRoute("/_authenticated/app/clientes")({
  component: ClientesPage,
  head: () => ({ meta: [{ title: "Clientes — ClinicaOS" }] }),
});

interface Paciente {
  id: string;
  nome: string;
  cpf: string | null;
  numero_pasta: string | null;
  telefone: string | null;
  email: string | null;
  data_nascimento: string | null;
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
  created_at: string;
  foto_url?: string | null;
}

type FormState = {
  nome: string; cpf: string; numero_pasta: string; telefone: string; email: string;
  data_nascimento: string; ativo: boolean;
  cep: string; logradouro: string; numero: string; complemento: string;
  bairro: string; cidade: string; estado: string;
  responsavel_nome: string; responsavel_cpf: string;
  responsavel_telefone: string; responsavel_parentesco: string;
};

const EMPTY: FormState = {
  nome: "", cpf: "", numero_pasta: "", telefone: "", email: "",
  data_nascimento: "", ativo: true,
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

// Converte palavras ditadas em pontuação real (ponto, arroba, hífen…)
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
function normalizarFalaDigitos(t: string): string {
  return t.replace(/\D+/g, "");
}
function normalizarFala(field: string, raw: string): string {
  if (field === "email") return normalizarFalaEmail(raw);
  if (field === "cpf" || field === "telefone" || field === "cep" ||
      field === "responsavel_cpf" || field === "responsavel_telefone" ||
      field === "numero") return normalizarFalaDigitos(raw);
  return raw;
}

// Componente estável fora do pai — evita remount/perda de foco a cada tecla.
function InputVoz({
  field, type = "text", value, onChange, onVoice, voiceActive, speechSupported, ...rest
}: {
  field: string;
  type?: string;
  value: string;
  onChange: (v: string) => void;
  onVoice: () => void;
  voiceActive: boolean;
  speechSupported: boolean;
  [k: string]: any;
}) {
  return (
    <div className="flex gap-2">
      <Input type={type} value={value} onChange={(e) => onChange(e.target.value)} {...rest} />
      {speechSupported && (
        <Button
          type="button" size="icon" variant={voiceActive ? "default" : "outline"}
          className="h-9 w-9 shrink-0"
          onClick={onVoice}
          title="Ditar por voz"
        >
          {voiceActive ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
        </Button>
      )}
    </div>
  );
}

function ClientesPage() {
  const { clinicaAtual } = useClinica();
  const [items, setItems] = useState<Paciente[]>([]);
  const [busca, setBusca] = useState("");
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Paciente | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [cepLoading, setCepLoading] = useState(false);
  const [tab, setTab] = useState("dados");

  // Foto
  const [fotoFile, setFotoFile] = useState<File | null>(null);
  const [fotoPreview, setFotoPreview] = useState<string | null>(null);
  const fotoInputRef = useRef<HTMLInputElement | null>(null);

  // Biometria facial
  const [faceFor, setFaceFor] = useState<Paciente | null>(null);
  const [consentFor, setConsentFor] = useState<Paciente | null>(null);
  const [hasBiometria, setHasBiometria] = useState<Record<string, boolean>>({});
  const [fotoSigned, setFotoSigned] = useState<Record<string, string>>({});

  // Voz
  const [recording, setRecording] = useState(false);
  const [voiceField, setVoiceField] = useState<keyof FormState | null>(null);
  const recogRef = useRef<any>(null);
  const speechSupported = typeof window !== "undefined" &&
    ("webkitSpeechRecognition" in window || "SpeechRecognition" in window);

  const load = async () => {
    if (!clinicaAtual) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("pacientes")
      .select("id,nome,cpf,telefone,email,ativo,cidade,estado,created_at,foto_url")
      .eq("clinica_id", clinicaAtual.clinica_id)
      .order("nome")
      .limit(100);
    setLoading(false);
    if (error) { toast.error(error.message); return; }
    setItems((data ?? []) as any);
  };

  useEffect(() => { void load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [clinicaAtual?.clinica_id]);

  // Carrega quais pacientes já possuem biometria cadastrada (apenas ids da página atual)
  useEffect(() => {
    if (!clinicaAtual || items.length === 0) { setHasBiometria({}); return; }
    (async () => {
      const { data } = await supabase
        .from("paciente_biometria")
        .select("paciente_id")
        .eq("clinica_id", clinicaAtual.clinica_id)
        .is("revogado_em", null)
        .in("paciente_id", items.map(p => p.id));
      const map: Record<string, boolean> = {};
      (data ?? []).forEach((b: any) => { map[b.paciente_id] = true; });
      setHasBiometria(map);
    })();
  }, [items, clinicaAtual?.clinica_id]);

  // Gera signed URLs em lote para as fotos dos pacientes da página
  useEffect(() => {
    const paths = items.filter(p => p.foto_url).map(p => p.foto_url as string);
    if (paths.length === 0) { setFotoSigned({}); return; }
    (async () => {
      const { data } = await supabase.storage.from("pacientes-fotos").createSignedUrls(paths, 3600);
      const map: Record<string, string> = {};
      items.forEach((p) => {
        if (!p.foto_url) return;
        const found = data?.find(d => d.path === p.foto_url);
        if (found?.signedUrl) map[p.id] = found.signedUrl;
      });
      setFotoSigned(map);
    })();
  }, [items]);

  async function salvarBiometria(descriptor: number[]) {
    if (!faceFor || !clinicaAtual) return;
    // Revoga biometria anterior (se houver) e insere nova
    await supabase.from("paciente_biometria")
      .update({ revogado_em: new Date().toISOString() })
      .eq("paciente_id", faceFor.id)
      .eq("clinica_id", clinicaAtual.clinica_id)
      .is("revogado_em", null);
    const { error } = await supabase.from("paciente_biometria").insert({
      paciente_id: faceFor.id,
      clinica_id: clinicaAtual.clinica_id,
      descriptor: descriptor as any,
      consentimento_em: new Date().toISOString(),
    });
    if (error) throw error;
    setHasBiometria(prev => ({ ...prev, [faceFor.id]: true }));
    toast.success("Biometria facial cadastrada");
  }

  async function revogarBiometria(p: Paciente) {
    if (!clinicaAtual) return;
    if (!confirm(`Remover a biometria facial de ${p.nome}? (direito de exclusão — LGPD)`)) return;
    const { error } = await supabase.from("paciente_biometria")
      .update({ revogado_em: new Date().toISOString() })
      .eq("paciente_id", p.id)
      .eq("clinica_id", clinicaAtual.clinica_id)
      .is("revogado_em", null);
    if (error) { toast.error(error.message); return; }
    setHasBiometria(prev => { const c = { ...prev }; delete c[p.id]; return c; });
    toast.success("Biometria removida");
  }

  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    if (!q) return items;
    return items.filter(p =>
      p.nome.toLowerCase().includes(q) ||
      (p.cpf ?? "").toLowerCase().includes(q) ||
      (p.telefone ?? "").toLowerCase().includes(q) ||
      (p.email ?? "").toLowerCase().includes(q) ||
      (p.numero_pasta ?? "").toLowerCase().includes(q) ||
      (p.data_nascimento ?? "").toLowerCase().includes(q) ||
      (p.data_nascimento ? p.data_nascimento.split("-").reverse().join("/") : "").includes(q)
    );
  }, [items, busca]);

  const openNew = () => {
    setEditing(null); setForm(EMPTY); setTab("dados"); setOpen(true);
    setFotoFile(null); setFotoPreview(null);
  };
  const openEdit = async (p: Paciente) => {
    const { data, error } = await supabase.from("pacientes").select("*").eq("id", p.id).single();
    if (error) { toast.error(error.message); return; }
    const paciente = data as Paciente;
    setEditing(p);
    setForm({
      nome: paciente.nome,
      cpf: paciente.cpf ?? "", numero_pasta: paciente.numero_pasta ?? "",
      telefone: paciente.telefone ?? "", email: paciente.email ?? "",
      data_nascimento: paciente.data_nascimento ?? "", ativo: paciente.ativo,
      cep: paciente.cep ?? "", logradouro: paciente.logradouro ?? "", numero: paciente.numero ?? "",
      complemento: paciente.complemento ?? "", bairro: paciente.bairro ?? "",
      cidade: paciente.cidade ?? "", estado: paciente.estado ?? "",
      responsavel_nome: paciente.responsavel_nome ?? "",
      responsavel_cpf: paciente.responsavel_cpf ?? "",
      responsavel_telefone: paciente.responsavel_telefone ?? "",
      responsavel_parentesco: paciente.responsavel_parentesco ?? "",
    });
    setTab("dados");
    setOpen(true);
    setFotoFile(null);
    if (paciente.foto_url) {
      const { data: s } = await supabase.storage.from("pacientes-fotos")
        .createSignedUrl(paciente.foto_url, 3600);
      setFotoPreview(s?.signedUrl ?? null);
    } else {
      setFotoPreview(null);
    }
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
    r.lang = "pt-BR";
    r.continuous = false;
    r.interimResults = false;
    r.onresult = (e: any) => {
      const raw = e.results[0][0].transcript as string;
      const text = normalizarFala(field as string, raw);
      setForm(f => {
        const cur = (f[field] as string) ?? "";
        const sep = cur && field !== "email" && field !== "cpf" && field !== "telefone" &&
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

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!clinicaAtual) return;
    if (!form.nome.trim()) { toast.error("Informe o nome."); return; }
    setSaving(true);
    const payload = {
      nome: form.nome.trim(),
      cpf: form.cpf.trim() || null,
      numero_pasta: form.numero_pasta.trim() || null,
      telefone: form.telefone.trim() || null,
      email: form.email.trim() || null,
      data_nascimento: form.data_nascimento || null,
      ativo: form.ativo,
      cep: form.cep.trim() || null,
      logradouro: form.logradouro.trim() || null,
      numero: form.numero.trim() || null,
      complemento: form.complemento.trim() || null,
      bairro: form.bairro.trim() || null,
      cidade: form.cidade.trim() || null,
      estado: form.estado.trim() || null,
      responsavel_nome: form.responsavel_nome.trim() || null,
      responsavel_cpf: form.responsavel_cpf.trim() || null,
      responsavel_telefone: form.responsavel_telefone.trim() || null,
      responsavel_parentesco: form.responsavel_parentesco.trim() || null,
      clinica_id: clinicaAtual.clinica_id,
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
      const path = `${clinicaAtual.clinica_id}/${pacienteId}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("pacientes-fotos")
        .upload(path, fotoFile, { upsert: true, contentType: fotoFile.type || "image/jpeg" });
      if (upErr) {
        setSaving(false);
        toast.error("Cliente salvo, mas a foto falhou: " + upErr.message);
        setOpen(false); void load(); return;
      }
      await supabase.from("pacientes")
        .update({ foto_url: path, foto_atualizado_em: new Date().toISOString() })
        .eq("id", pacienteId);
    }

    setSaving(false);
    toast.success(editing ? "Cliente atualizado." : "Cliente cadastrado.");
    setOpen(false);
    void load();
  };

  const onDelete = async (p: Paciente) => {
    if (!confirm(`Excluir ${p.nome}?`)) return;
    const { error } = await supabase.from("pacientes").delete().eq("id", p.id);
    if (error) { toast.error(error.message); return; }
    toast.success("Cliente excluído.");
    void load();
  };

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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <Users className="h-6 w-6 text-primary" /> Clientes
          </h1>
          <p className="text-sm text-muted-foreground">Cadastre e gerencie os pacientes da clínica.</p>
        </div>
        <div className="flex gap-2">
        <Button
          variant="outline"
          onClick={async () => {
            if (!clinicaAtual) return;
            const { data, error } = await supabase
              .from("pacientes")
              .select("nome,cpf,telefone,email,data_nascimento,cidade,estado,bairro,logradouro,numero,cep,ativo")
              .eq("clinica_id", clinicaAtual.clinica_id)
              .order("nome");
            if (error) { toast.error(error.message); return; }
            if (!data?.length) { toast.info("Sem dados para exportar."); return; }
            exportToExcel(
              data.map((p: any) => ({
                nome: p.nome,
                cpf: p.cpf ?? "",
                telefone: p.telefone ?? "",
                email: p.email ?? "",
                nascimento: p.data_nascimento ?? "",
                cidade_uf: p.cidade ? `${p.cidade}${p.estado ? "/" + p.estado : ""}` : "",
                bairro: p.bairro ?? "",
                endereco: [p.logradouro, p.numero].filter(Boolean).join(", "),
                cep: p.cep ?? "",
                ativo: p.ativo ? "Sim" : "Não",
              })),
              `clientes-${new Date().toISOString().slice(0, 10)}`,
              [
                { key: "nome", label: "Nome" },
                { key: "cpf", label: "CPF" },
                { key: "telefone", label: "Telefone" },
                { key: "email", label: "E-mail" },
                { key: "nascimento", label: "Nascimento" },
                { key: "cidade_uf", label: "Cidade/UF" },
                { key: "bairro", label: "Bairro" },
                { key: "endereco", label: "Endereço" },
                { key: "cep", label: "CEP" },
                { key: "ativo", label: "Ativo" },
              ],
            );
          }}
        >
          <Download className="h-4 w-4 mr-2" /> Exportar Excel
        </Button>
          <Button onClick={openNew}><Plus className="h-4 w-4 mr-2" /> Novo cliente</Button>
        </div>
      </div>

      <div className="rounded-lg border border-border bg-card p-4">
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por nº pasta, nome, CPF, telefone, e-mail ou nascimento (dd/mm/aaaa)…"
            className="pl-9"
          />
        </div>
      </div>

      <div className="rounded-lg border border-border bg-card overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/40">
              <TableHead>Nome</TableHead>
              <TableHead className="w-48">E-mail</TableHead>
              <TableHead className="w-36">Telefone</TableHead>
              <TableHead className="w-40">Cidade/UF</TableHead>
              <TableHead className="w-24">Situação</TableHead>
              <TableHead className="w-28 text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Carregando…</TableCell></TableRow>
            ) : !clinicaAtual ? (
              <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Selecione uma clínica.</TableCell></TableRow>
            ) : filtrados.length === 0 ? (
              <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Nenhum cliente encontrado.</TableCell></TableRow>
            ) : filtrados.map(p => (
              <TableRow key={p.id}>
                <TableCell className="font-medium">{p.nome}</TableCell>
                <TableCell className="text-sm text-muted-foreground truncate max-w-[12rem]">{p.email ?? "—"}</TableCell>
                <TableCell className="text-sm text-muted-foreground">{p.telefone ?? "—"}</TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {p.cidade ? `${p.cidade}${p.estado ? "/" + p.estado : ""}` : "—"}
                </TableCell>
                <TableCell>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${p.ativo ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300" : "bg-muted text-muted-foreground"}`}>
                    {p.ativo ? "Ativo" : "Inativo"}
                  </span>
                </TableCell>
                <TableCell className="text-right">
                  {hasBiometria[p.id] ? (
                    <Button variant="ghost" size="icon" onClick={() => revogarBiometria(p)} title="Biometria cadastrada — clique para remover">
                      <ScanFace className="h-4 w-4 text-emerald-600" />
                    </Button>
                  ) : (
                    <Button variant="ghost" size="icon" onClick={() => setConsentFor(p)} title="Cadastrar biometria facial">
                      <ScanFace className="h-4 w-4 text-muted-foreground" />
                    </Button>
                  )}
                  <Button variant="ghost" size="icon" onClick={() => openEdit(p)}><Pencil className="h-4 w-4" /></Button>
                  <Button variant="ghost" size="icon" onClick={() => onDelete(p)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) stopVoice(); }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "Editar cliente" : "Novo cliente"}</DialogTitle>
            <DialogDescription>
              {speechSupported
                ? "Use o microfone ao lado de cada campo para ditar por voz."
                : "Reconhecimento de voz não disponível neste navegador."}
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={onSubmit} className="space-y-4">
            <Tabs value={tab} onValueChange={setTab}>
              <TabsList className="grid grid-cols-3 w-full">
                <TabsTrigger value="dados">Dados</TabsTrigger>
                <TabsTrigger value="endereco">Endereço</TabsTrigger>
                <TabsTrigger value="responsavel">
                  Responsável{sugerirResponsavel ? " •" : ""}
                </TabsTrigger>
              </TabsList>

              <TabsContent value="dados" className="space-y-4 pt-4">
                <div className="space-y-1">
                  <Label>Nome *</Label>
                  <InputVoz {...fieldProps("nome")} required />
                </div>
                <div className="space-y-1">
                  <Label>Número de pasta</Label>
                  <InputVoz {...fieldProps("numero_pasta")} placeholder="Ex.: 1234" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label>CPF</Label>
                    <InputVoz {...fieldProps("cpf")} />
                  </div>
                  <div className="space-y-1">
                    <Label>Telefone</Label>
                    <InputVoz {...fieldProps("telefone")} />
                  </div>
                </div>
                <div className="space-y-1">
                  <Label>E-mail <span className="text-xs text-muted-foreground">(usado em nota fiscal)</span></Label>
                  <InputVoz {...fieldProps("email")} type="email" />
                </div>
                <div className="grid grid-cols-2 gap-3 items-end">
                  <div className="space-y-1">
                    <Label>Data de nascimento</Label>
                    <Input type="date" value={form.data_nascimento}
                      onChange={(e) => setForm({ ...form, data_nascimento: e.target.value })} />
                  </div>
                  {idade !== null && (
                    <div className="text-sm text-muted-foreground pb-2">
                      Idade: <span className="font-medium text-foreground">{idade} anos</span>
                      {sugerirResponsavel && (
                        <span className="block text-xs text-amber-600 dark:text-amber-400">
                          Recomendado cadastrar responsável.
                        </span>
                      )}
                    </div>
                  )}
                </div>
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <Checkbox checked={form.ativo} onCheckedChange={(v) => setForm({ ...form, ativo: !!v })} />
                  Cliente ativo
                </label>
              </TabsContent>

              <TabsContent value="endereco" className="space-y-4 pt-4">
                <div className="space-y-1">
                  <Label className="flex items-center gap-1"><MapPin className="h-3.5 w-3.5" /> CEP</Label>
                  <div className="flex gap-2">
                    <Input
                      value={form.cep}
                      onChange={(e) => setForm({ ...form, cep: e.target.value })}
                      onBlur={(e) => buscarCep(e.target.value)}
                      placeholder="00000-000"
                      maxLength={9}
                    />
                    <Button type="button" variant="outline" onClick={() => buscarCep(form.cep)} disabled={cepLoading}>
                      {cepLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Buscar"}
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">Preenche o endereço automaticamente.</p>
                </div>
                <div className="space-y-1">
                  <Label>Logradouro</Label>
                  <InputVoz {...fieldProps("logradouro")} />
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div className="space-y-1">
                    <Label>Número</Label>
                    <InputVoz {...fieldProps("numero")} />
                  </div>
                  <div className="space-y-1 col-span-2">
                    <Label>Complemento</Label>
                    <InputVoz {...fieldProps("complemento")} />
                  </div>
                </div>
                <div className="space-y-1">
                  <Label>Bairro</Label>
                  <InputVoz {...fieldProps("bairro")} />
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div className="space-y-1 col-span-2">
                    <Label>Cidade</Label>
                    <InputVoz {...fieldProps("cidade")} />
                  </div>
                  <div className="space-y-1">
                    <Label>UF</Label>
                    <Input value={form.estado} maxLength={2}
                      onChange={(e) => setForm({ ...form, estado: e.target.value.toUpperCase() })} />
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="responsavel" className="space-y-4 pt-4">
                <p className="text-sm text-muted-foreground">
                  Para menores de idade ou pacientes que precisam de acompanhante.
                </p>
                <div className="space-y-1">
                  <Label>Nome do responsável</Label>
                  <InputVoz {...fieldProps("responsavel_nome")} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label>CPF</Label>
                    <InputVoz {...fieldProps("responsavel_cpf")} />
                  </div>
                  <div className="space-y-1">
                    <Label>Telefone</Label>
                    <InputVoz {...fieldProps("responsavel_telefone")} />
                  </div>
                </div>
                <div className="space-y-1">
                  <Label>Parentesco</Label>
                  <Input value={form.responsavel_parentesco}
                    onChange={(e) => setForm({ ...form, responsavel_parentesco: e.target.value })}
                    placeholder="Ex.: Mãe, Pai, Filho(a), Cuidador" />
                </div>
              </TabsContent>
            </Tabs>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
              <Button type="submit" disabled={saving}>{saving ? "Salvando…" : "Salvar"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Consentimento LGPD para biometria facial */}
      <Dialog open={!!consentFor} onOpenChange={(o) => { if (!o) setConsentFor(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Consentimento — Biometria facial</DialogTitle>
            <DialogDescription>
              Termo obrigatório (LGPD — Lei 13.709/2018, art. 11).
            </DialogDescription>
          </DialogHeader>
          <div className="text-sm space-y-2 max-h-72 overflow-auto rounded-md border bg-muted/30 p-3">
            <p><strong>Paciente:</strong> {consentFor?.nome}</p>
            <p><strong>Finalidade:</strong> identificação na recepção, totem de auto-atendimento e confirmação de identidade em atendimentos, evitando troca de prontuários.</p>
            <p><strong>O que é armazenado:</strong> apenas um vetor matemático (descritor) do seu rosto — <em>não</em> guardamos a foto. O vetor não permite reconstruir a imagem original.</p>
            <p><strong>Compartilhamento:</strong> os dados ficam restritos à clínica e não são compartilhados com terceiros.</p>
            <p><strong>Direitos do titular:</strong> você pode revogar o consentimento e solicitar a exclusão da biometria a qualquer momento, pela equipe da recepção.</p>
            <p><strong>Base legal:</strong> consentimento específico e destacado (art. 11, I).</p>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConsentFor(null)}>Não concordo</Button>
            <Button onClick={() => { setFaceFor(consentFor); setConsentFor(null); }}>
              Concordo e autorizo a captura
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <FaceCaptureDialog
        open={!!faceFor}
        onClose={() => setFaceFor(null)}
        onCaptured={salvarBiometria}
        titulo={`Biometria — ${faceFor?.nome ?? ""}`}
      />
    </div>
  );
}
