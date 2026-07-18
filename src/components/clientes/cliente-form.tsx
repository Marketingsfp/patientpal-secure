import { useEffect, useRef, useState, type FormEvent } from "react";
import { Camera, ChevronDown, CreditCard, ExternalLink, FileHeart, History, Loader2, MapPin, Mic, MicOff, ScanFace, Search, UserCheck, Upload, X } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { mostrarErro } from "@/lib/traduzir-erro";
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
import { FaceCaptureDialog } from "@/components/face/FaceCaptureDialog";

import { DateInputBR } from "@/components/ui/date-input-br";
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
  /** Somente leitura — desabilita todos os campos e oculta o rodapé. */
  readOnly?: boolean;
}

export function ClienteForm({ clinicaId, paciente, onSaved, onCancel, stickyFooter, readOnly = false }: ClienteFormProps) {
  const editing = paciente;
  const [form, setForm] = useState<FormState>(EMPTY);
  const [tab, setTab] = useState("dados");
  const [saving, setSaving] = useState(false);
  const [cepLoading, setCepLoading] = useState(false);

  // Aviso: base da unidade ainda não importada (só quando cadastrando novo)
  const [baseImportada, setBaseImportada] = useState<boolean | null>(null);
  useEffect(() => {
    if (editing) { setBaseImportada(null); return; }
    let cancel = false;
    void supabase
      .from("clinicas")
      .select("base_importada")
      .eq("id", clinicaId)
      .maybeSingle()
      .then(({ data }) => {
        if (!cancel) setBaseImportada((data as any)?.base_importada ?? true);
      });
    return () => { cancel = true; };
  }, [clinicaId, editing]);

  // Biometria
  const [hasBiometria, setHasBiometria] = useState(false);
  const [bioLoading, setBioLoading] = useState(false);
  const [consentOpen, setConsentOpen] = useState(false);
  const [faceOpen, setFaceOpen] = useState(false);

  // Prontuário
  type ProntRow = {
    id: string; data: string; medico_nome: string | null;
    especialidade: string | null; procedimento: string | null;
    queixa_principal: string | null; hipotese_diagnostica: string | null;
    conduta: string | null; prescricao: string | null;
    historia_doenca: string | null; exame_fisico: string | null; observacoes: string | null;
  };
  const [prontList, setProntList] = useState<ProntRow[]>([]);
  const [prontLoading, setProntLoading] = useState(false);
  const [prontExpanded, setProntExpanded] = useState<Set<string>>(new Set());
  const [filtroDataDe, setFiltroDataDe] = useState("");
  const [filtroDataAte, setFiltroDataAte] = useState("");
  const [filtroMedico, setFiltroMedico] = useState("");
  const [filtroItem, setFiltroItem] = useState("");
  const [prontFiltered, setProntFiltered] = useState<ProntRow[]>([]);
  const [filtroAtivo, setFiltroAtivo] = useState(false);
  const [procedimentosOpcoes, setProcedimentosOpcoes] = useState<string[]>([]);

  // Histórico de atendimentos
  type HistRow = {
    id: string; inicio: string; procedimento: string | null;
    medico_nome: string | null; especialidade: string | null;
  };
  const [histList, setHistList] = useState<HistRow[]>([]);
  const [histLoading, setHistLoading] = useState(false);

  // Convênio (Cartão Convênio)
  type ConvParcela = {
    id: string; numero_parcela: number; vencimento: string; valor: number;
    status: string; pago_em: string | null; valor_pago: number | null;
  };
  type ConvDependente = {
    id: string; paciente_id: string; paciente_nome: string; parentesco: string | null;
  };
  type ConvContrato = {
    id: string; numero: number; status: string;
    paciente_id: string; paciente_nome: string;
    data_inicio: string; data_fim: string | null;
    dia_vencimento: number; valor_mensal: number; num_parcelas: number;
    forma_pagamento: string | null;
    plano_nome: string | null; vigencia_meses: number | null;
    papel: "titular" | "dependente";
    dependentes: ConvDependente[];
    parcelas: ConvParcela[];
  };
  const [convList, setConvList] = useState<ConvContrato[]>([]);
  const [convLoading, setConvLoading] = useState(false);
  const [histFiltroDataDe, setHistFiltroDataDe] = useState("");
  const [histFiltroDataAte, setHistFiltroDataAte] = useState("");
  const [histFiltroMedico, setHistFiltroMedico] = useState("");
  const [histFiltroItem, setHistFiltroItem] = useState("");
  const [histFiltered, setHistFiltered] = useState<HistRow[]>([]);
  const [histFiltroAtivo, setHistFiltroAtivo] = useState(false);

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
      sexo: (["masculino","feminino","outro","nao_informar"].includes((editing.sexo ?? "") as string)
        ? (editing.sexo as string)
        : "nao_informar"),
      ativo: editing.ativo,
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

  // Carrega biometria do paciente (edição)
  useEffect(() => {
    if (!editing) { setHasBiometria(false); return; }
    (async () => {
      const { data } = await supabase
        .from("paciente_biometria")
        .select("id")
        .eq("paciente_id", editing.id)
        .eq("clinica_id", clinicaId)
        .is("revogado_em", null)
        .limit(1);
      setHasBiometria((data ?? []).length > 0);
    })();
  }, [editing?.id, clinicaId]);

  // Carrega prontuários do paciente
  useEffect(() => {
    if (!editing) { setProntList([]); return; }
    setProntLoading(true);
    void supabase
      .from("prontuarios")
      .select("id, data, medico_id, queixa_principal, hipotese_diagnostica, conduta, prescricao, historia_doenca, exame_fisico, observacoes")
      .eq("paciente_id", editing.id)
      .order("data", { ascending: false })
      .then(async ({ data, error }) => {
        if (error) { toast.error("Não foi possível carregar o prontuário."); setProntLoading(false); return; }
        const rows = data ?? [];
        const medicoIds = Array.from(new Set(rows.map((r: any) => r.medico_id).filter(Boolean)));
        let medicosMap: Record<string, string> = {};
        let medEspMap: Record<string, string | null> = {};
        let espNomeMap: Record<string, string> = {};
        if (medicoIds.length > 0) {
          const { data: meds } = await supabase
            .from("medicos")
            .select("id, nome, especialidade_id")
            .in("id", medicoIds);
          medicosMap = Object.fromEntries((meds ?? []).map((m: any) => [m.id, m.nome]));
          medEspMap = Object.fromEntries((meds ?? []).map((m: any) => [m.id, m.especialidade_id ?? null]));
          const espIds = Array.from(new Set((meds ?? []).map((m: any) => m.especialidade_id).filter(Boolean)));
          if (espIds.length > 0) {
            const { data: esps } = await supabase
              .from("especialidades").select("id, nome").in("id", espIds);
            espNomeMap = Object.fromEntries((esps ?? []).map((e: any) => [e.id, e.nome]));
          }
        }
        // Busca agendamentos do paciente para casar serviço por dia + médico
        const { data: ags } = await supabase
          .from("agendamentos")
          .select("inicio, medico_id, procedimento")
          .eq("paciente_id", editing.id);
        const agList = (ags ?? []) as Array<{ inicio: string; medico_id: string | null; procedimento: string | null }>;
        const findProc = (dataIso: string, medicoId: string | null): string | null => {
          const d = new Date(dataIso);
          const sameDay = agList.filter((a) => {
            const ad = new Date(a.inicio);
            return ad.getFullYear() === d.getFullYear()
              && ad.getMonth() === d.getMonth()
              && ad.getDate() === d.getDate()
              && (medicoId ? a.medico_id === medicoId : true);
          });
          if (sameDay.length === 0) return null;
          sameDay.sort((a, b) => Math.abs(new Date(a.inicio).getTime() - d.getTime()) - Math.abs(new Date(b.inicio).getTime() - d.getTime()));
          return sameDay[0].procedimento ?? null;
        };
        setProntList(rows.map((r: any) => ({
          id: r.id, data: r.data,
          medico_nome: r.medico_id ? medicosMap[r.medico_id] ?? null : null,
          especialidade: r.medico_id && medEspMap[r.medico_id] ? espNomeMap[medEspMap[r.medico_id] as string] ?? null : null,
          procedimento: findProc(r.data, r.medico_id),
          queixa_principal: r.queixa_principal,
          hipotese_diagnostica: r.hipotese_diagnostica,
          conduta: r.conduta, prescricao: r.prescricao,
          historia_doenca: r.historia_doenca,
          exame_fisico: r.exame_fisico,
          observacoes: r.observacoes,
        })));
        setProntLoading(false);
      });
  }, [editing?.id]);

  // Mantém a lista filtrada em sincronia com a lista carregada
  useEffect(() => {
    setProntFiltered(prontList);
    setFiltroAtivo(false);
  }, [prontList]);

  // Carrega histórico de atendimentos realizados do paciente
  useEffect(() => {
    if (!editing) { setHistList([]); return; }
    setHistLoading(true);
    void (async () => {
      const { data, error } = await supabase
        .from("agendamentos")
        .select("id, inicio, procedimento, medico_id, status")
        .eq("paciente_id", editing.id)
        .eq("status", "realizado")
        .order("inicio", { ascending: false });
      if (error) {
        toast.error("Não foi possível carregar o histórico.");
        setHistLoading(false); return;
      }
      const rows = (data ?? []) as Array<{ id: string; inicio: string; procedimento: string | null; medico_id: string | null }>;
      const medicoIds = Array.from(new Set(rows.map((r) => r.medico_id).filter((x): x is string => !!x)));
      let medMap: Record<string, { nome: string; especialidade_id: string | null }> = {};
      let espMap: Record<string, string> = {};
      if (medicoIds.length > 0) {
        const { data: meds } = await supabase
          .from("medicos")
          .select("id, nome, especialidade_id")
          .in("id", medicoIds);
        medMap = Object.fromEntries((meds ?? []).map((m: any) => [m.id, { nome: m.nome, especialidade_id: m.especialidade_id }]));
        const espIds = Array.from(new Set((meds ?? []).map((m: any) => m.especialidade_id).filter(Boolean)));
        if (espIds.length > 0) {
          const { data: esps } = await supabase
            .from("especialidades")
            .select("id, nome")
            .in("id", espIds);
          espMap = Object.fromEntries((esps ?? []).map((e: any) => [e.id, e.nome]));
        }
      }
      setHistList(rows.map((r) => {
        const med = r.medico_id ? medMap[r.medico_id] : null;
        return {
          id: r.id, inicio: r.inicio, procedimento: r.procedimento,
          medico_nome: med?.nome ?? null,
          especialidade: med?.especialidade_id ? espMap[med.especialidade_id] ?? null : null,
        };
      }));
      setHistLoading(false);
    })();
  }, [editing?.id]);

  // Carrega contratos de Cartão Convênio (titular ou dependente)
  useEffect(() => {
    if (!editing) { setConvList([]); return; }
    setConvLoading(true);
    void (async () => {
      // 1) contratos onde paciente é titular
      const { data: tit } = await supabase
        .from("contratos_assinatura")
        .select("id, numero, status, paciente_id, paciente_nome, data_inicio, data_fim, dia_vencimento, valor_mensal, num_parcelas, forma_pagamento, plano_id")
        .eq("paciente_id", editing.id);
      // 2) contratos onde paciente é dependente
      const { data: deps } = await supabase
        .from("contrato_dependentes")
        .select("contrato_id")
        .eq("paciente_id", editing.id)
        .eq("ativo", true);
      const contratoIdsDep = Array.from(new Set((deps ?? []).map((d: any) => d.contrato_id)));
      let depContratos: any[] = [];
      if (contratoIdsDep.length > 0) {
        const { data } = await supabase
          .from("contratos_assinatura")
          .select("id, numero, status, paciente_id, paciente_nome, data_inicio, data_fim, dia_vencimento, valor_mensal, num_parcelas, forma_pagamento, plano_id")
          .in("id", contratoIdsDep);
        depContratos = data ?? [];
      }
      const titularIds = new Set((tit ?? []).map((c: any) => c.id));
      const todos: Array<any & { papel: "titular" | "dependente" }> = [
        ...(tit ?? []).map((c: any) => ({ ...c, papel: "titular" as const })),
        ...depContratos
          .filter((c: any) => !titularIds.has(c.id))
          .map((c: any) => ({ ...c, papel: "dependente" as const })),
      ];
      if (todos.length === 0) {
        setConvList([]); setConvLoading(false); return;
      }
      const allIds = todos.map((c) => c.id);
      const planoIds = Array.from(new Set(todos.map((c) => c.plano_id).filter(Boolean)));
      const [planosRes, depsRes, parcelasRes] = await Promise.all([
        planoIds.length > 0
          ? supabase.from("planos_assinatura").select("id, nome, vigencia_meses").in("id", planoIds)
          : Promise.resolve({ data: [] as any[] }),
        supabase
          .from("contrato_dependentes")
          .select("id, contrato_id, paciente_id, paciente_nome, parentesco, ativo")
          .in("contrato_id", allIds)
          .eq("ativo", true),
        supabase
          .from("contrato_mensalidades")
          .select("id, contrato_id, numero_parcela, vencimento, valor, status, pago_em, valor_pago")
          .in("contrato_id", allIds)
          .order("numero_parcela", { ascending: true }),
      ]);
      const planoMap: Record<string, { nome: string; vigencia_meses: number | null }> = Object.fromEntries(
        ((planosRes.data ?? []) as any[]).map((p) => [p.id, { nome: p.nome, vigencia_meses: p.vigencia_meses }])
      );
      const depMap: Record<string, ConvDependente[]> = {};
      for (const d of (depsRes.data ?? []) as any[]) {
        (depMap[d.contrato_id] ||= []).push({
          id: d.id, paciente_id: d.paciente_id, paciente_nome: d.paciente_nome, parentesco: d.parentesco,
        });
      }
      const parcMap: Record<string, ConvParcela[]> = {};
      for (const p of (parcelasRes.data ?? []) as any[]) {
        (parcMap[p.contrato_id] ||= []).push({
          id: p.id, numero_parcela: p.numero_parcela, vencimento: p.vencimento,
          valor: Number(p.valor) || 0, status: p.status,
          pago_em: p.pago_em, valor_pago: p.valor_pago != null ? Number(p.valor_pago) : null,
        });
      }
      const lista: ConvContrato[] = todos.map((c) => {
        const plano = c.plano_id ? planoMap[c.plano_id] : null;
        return {
          id: c.id, numero: c.numero, status: c.status,
          paciente_id: c.paciente_id, paciente_nome: c.paciente_nome,
          data_inicio: c.data_inicio, data_fim: c.data_fim,
          dia_vencimento: c.dia_vencimento, valor_mensal: Number(c.valor_mensal) || 0,
          num_parcelas: c.num_parcelas, forma_pagamento: c.forma_pagamento,
          plano_nome: plano?.nome ?? null, vigencia_meses: plano?.vigencia_meses ?? null,
          papel: c.papel,
          dependentes: depMap[c.id] ?? [],
          parcelas: parcMap[c.id] ?? [],
        };
      });
      lista.sort((a, b) => (a.data_inicio < b.data_inicio ? 1 : -1));
      setConvList(lista);
      setConvLoading(false);
    })();
  }, [editing?.id]);

  // Carrega procedimentos ativos da clínica para o filtro "Item"
  useEffect(() => {
    if (!clinicaId) return;
    void supabase
      .from("procedimentos")
      .select("nome")
      .eq("clinica_id", clinicaId)
      .eq("ativo", true)
      .order("nome")
      .limit(5000)
      .then(({ data }) => {
        const nomes = Array.from(new Set((data ?? []).map((p: any) => (p.nome ?? "").trim()).filter(Boolean)));
        setProcedimentosOpcoes(nomes);
      });
  }, [clinicaId]);

  function aplicarFiltroProntuario() {
    const de = filtroDataDe ? new Date(filtroDataDe + "T00:00:00") : null;
    const ate = filtroDataAte ? new Date(filtroDataAte + "T23:59:59") : null;
    const med = filtroMedico.trim().toLowerCase();
    const item = filtroItem.trim().toLowerCase();
    const r = prontList.filter((p) => {
      const d = new Date(p.data);
      if (de && d < de) return false;
      if (ate && d > ate) return false;
      if (med && !(p.medico_nome ?? "").toLowerCase().includes(med)) return false;
      if (item) {
        const blob = [
          p.queixa_principal, p.historia_doenca, p.exame_fisico,
          p.hipotese_diagnostica, p.conduta, p.prescricao, p.observacoes,
        ].filter(Boolean).join(" ").toLowerCase();
        if (!blob.includes(item)) return false;
      }
      return true;
    });
    setProntFiltered(r);
    setFiltroAtivo(true);
  }

  function limparFiltroProntuario() {
    setFiltroDataDe(""); setFiltroDataAte("");
    setFiltroMedico(""); setFiltroItem("");
    setProntFiltered(prontList);
    setFiltroAtivo(false);
  }

  // Mantém histórico filtrado em sincronia com a lista carregada
  useEffect(() => {
    setHistFiltered(histList);
    setHistFiltroAtivo(false);
  }, [histList]);

  function aplicarFiltroHistorico() {
    const de = histFiltroDataDe ? new Date(histFiltroDataDe + "T00:00:00") : null;
    const ate = histFiltroDataAte ? new Date(histFiltroDataAte + "T23:59:59") : null;
    const med = histFiltroMedico.trim().toLowerCase();
    const item = histFiltroItem.trim().toLowerCase();
    const r = histList.filter((h) => {
      const d = new Date(h.inicio);
      if (de && d < de) return false;
      if (ate && d > ate) return false;
      if (med && !(h.medico_nome ?? "").toLowerCase().includes(med)) return false;
      if (item && (h.procedimento ?? "").toLowerCase() !== item) return false;
      return true;
    });
    setHistFiltered(r);
    setHistFiltroAtivo(true);
  }

  function limparFiltroHistorico() {
    setHistFiltroDataDe(""); setHistFiltroDataAte("");
    setHistFiltroMedico(""); setHistFiltroItem("");
    setHistFiltered(histList);
    setHistFiltroAtivo(false);
  }

  async function salvarBiometria(descriptor: number[]) {
    if (!editing) return;
    setBioLoading(true);
    await supabase.from("paciente_biometria")
      .update({ revogado_em: new Date().toISOString() })
      .eq("paciente_id", editing.id)
      .eq("clinica_id", clinicaId)
      .is("revogado_em", null);
    const { error } = await supabase.from("paciente_biometria").insert({
      paciente_id: editing.id,
      clinica_id: clinicaId,
      descriptor: descriptor as any,
      consentimento_em: new Date().toISOString(),
    });
    setBioLoading(false);
    if (error) { mostrarErro(error); return; }
    setHasBiometria(true);
    toast.success("Biometria facial cadastrada");
  }

  async function revogarBiometria() {
    if (!editing) return;
    if (!confirm(`Remover a biometria facial de ${editing.nome}? (direito de exclusão — LGPD)`)) return;
    setBioLoading(true);
    const { error } = await supabase.from("paciente_biometria")
      .update({ revogado_em: new Date().toISOString() })
      .eq("paciente_id", editing.id)
      .eq("clinica_id", clinicaId)
      .is("revogado_em", null);
    setBioLoading(false);
    if (error) { mostrarErro(error); return; }
    setHasBiometria(false);
    toast.success("Biometria removida");
  }

  const idade = calcIdade(form.data_nascimento);
  const sugerirResponsavel = idade !== null && (idade < 18 || idade >= 70);

  const fieldProps = (field: keyof FormState) => {
    const active = recording && voiceField === field;
    // Campos que devem aceitar apenas letras (com acentos), espaço, hífen e apóstrofo.
    const somenteLetras = field === "nome" || field === "responsavel_nome";
    const sanitize = (v: string) =>
      somenteLetras
        ? v.replace(/[^\p{L}\s'’\-\.]/gu, "").replace(/\s{2,}/g, " ")
        : v;
    return {
      field: field as string,
      value: form[field] as string,
      onChange: (v: string) => setForm(f => ({ ...f, [field]: sanitize(v) } as FormState)),
      onVoice: () => active ? stopVoice() : startVoice(field),
      voiceActive: active,
      speechSupported,
    };
  };

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const nomeTrim = form.nome.trim();
    if (!nomeTrim) { toast.error("Informe o nome."); return; }
    if (nomeTrim.length > 120) { toast.error("Nome muito longo (máx. 120 caracteres)."); return; }
    // Exige pelo menos uma letra (aceita acentos) — bloqueia nomes só com números/símbolos
    if (!/\p{L}/u.test(nomeTrim)) { toast.error("Nome deve conter letras."); return; }
    // Bloqueia HTML/script embutido
    if (/[<>]/.test(nomeTrim)) { toast.error("Nome contém caracteres inválidos."); return; }
    if (!form.telefone.trim()) { toast.error("Informe o telefone."); return; }
    if (!form.data_nascimento) { toast.error("Informe a data de nascimento."); return; }
    // Faixa plausível da data de nascimento
    const dn = new Date(form.data_nascimento + "T00:00:00");
    if (isNaN(dn.getTime())) { toast.error("Data de nascimento inválida."); return; }
    const hoje = new Date();
    if (dn > hoje) { toast.error("Data de nascimento não pode ser futura."); return; }
    const anosDiff = hoje.getFullYear() - dn.getFullYear();
    if (anosDiff > 120) { toast.error("Data de nascimento inválida (idade acima de 120 anos)."); return; }
    if (dn.getFullYear() < 1900) { toast.error("Data de nascimento inválida (ano anterior a 1900)."); return; }
    // Valida e-mail sem depender do tooltip nativo do HTML5
    if (form.email.trim()) {
      const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim());
      if (!emailOk) { toast.error("E-mail inválido."); return; }
    }
    if (form.cpf.trim() && !isCPFValido(form.cpf)) { toast.error("CPF inválido."); return; }
    if (form.responsavel_cpf.trim() && !isCPFValido(form.responsavel_cpf)) {
      toast.error("CPF do responsável inválido."); return;
    }
    // Impede CPF duplicado na mesma clínica
    if (form.cpf.trim()) {
      const cpfDigits = somenteDigitos(form.cpf);
      const { data: dup } = await supabase
        .from("pacientes")
        .select("id, nome")
        .eq("clinica_id", clinicaId)
        .eq("cpf", cpfDigits)
        .limit(1);
      const existente = (dup ?? [])[0];
      if (existente && existente.id !== editing?.id) {
        toast.error(`CPF já cadastrado para: ${existente.nome}`);
        return;
      }
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
      sexo: (["masculino","feminino","outro","nao_informar"].includes(form.sexo)
        ? form.sexo
        : "nao_informar"),
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
      if (error) { setSaving(false); mostrarErro(error); return; }
    } else {
      const { data: novo, error } = await supabase
        .from("pacientes").insert(payload).select("id").single();
      if (error) { setSaving(false); mostrarErro(error); return; }
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
        mostrarErro(upErr, "cliente salvo, mas a foto falhou");
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
        {!editing && baseImportada === false && (
          <div className="rounded-md border border-amber-300 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-800 px-3 py-2 text-sm text-amber-900 dark:text-amber-200">
            <strong>Atenção:</strong> a base de pacientes desta unidade ainda não foi importada.
            Antes de cadastrar, verifique se o paciente já não existe (CPF, telefone ou nome)
            ou encaminhe para uma atendente. Você pode continuar o cadastro manual mesmo assim.
          </div>
        )}
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="w-full h-auto flex flex-wrap justify-start sm:grid sm:grid-cols-7">
            <TabsTrigger value="dados">Dados</TabsTrigger>
            <TabsTrigger value="endereco">Endereço</TabsTrigger>
            <TabsTrigger value="responsavel">
              Responsável{sugerirResponsavel ? " •" : ""}
            </TabsTrigger>
            <TabsTrigger value="biometria">Biometria</TabsTrigger>
            <TabsTrigger value="prontuario">Prontuário</TabsTrigger>
            <TabsTrigger value="historico">Histórico</TabsTrigger>
            <TabsTrigger value="convenio">Convênio</TabsTrigger>
          </TabsList>
          <fieldset disabled={readOnly} className="contents">
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
            <div className="space-y-1"><Label>Nome *</Label><InputVoz {...fieldProps("nome")} required maxLength={120} /></div>
            <div className="space-y-1"><Label>Número de serviço</Label><InputVoz {...fieldProps("numero_pasta")} placeholder="Ex.: 1234" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1"><Label>CPF</Label><InputVoz {...fieldProps("cpf")} /></div>
              <div className="space-y-1"><Label>Telefone *</Label><InputVoz {...fieldProps("telefone")} /></div>
            </div>
            <div className="space-y-1"><Label>Telefone 2 <span className="text-xs text-muted-foreground">(opcional)</span></Label><InputVoz {...fieldProps("telefone2")} /></div>
            <div className="space-y-1"><Label>E-mail <span className="text-xs text-muted-foreground">(usado em nota fiscal)</span></Label><InputVoz {...fieldProps("email")} type="email" /></div>
            <div className="grid grid-cols-2 gap-3 items-end">
              <div className="space-y-1">
                <Label>Data de nascimento *</Label>
                <DateInputBR required value={form.data_nascimento}
                  min="1900-01-01"
                  max={new Date().toISOString().slice(0, 10)}
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
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="space-y-1"><Label>Número</Label><InputVoz {...fieldProps("numero")} /></div>
              <div className="space-y-1 sm:col-span-2"><Label>Complemento</Label><InputVoz {...fieldProps("complemento")} /></div>
            </div>
            <div className="space-y-1"><Label>Bairro</Label><InputVoz {...fieldProps("bairro")} /></div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="space-y-1 sm:col-span-2"><Label>Cidade</Label><InputVoz {...fieldProps("cidade")} /></div>
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

          <TabsContent value="biometria" className="space-y-4 pt-4 pb-16">
            {!editing ? (
              <p className="text-sm text-muted-foreground">
                Salve o cadastro do paciente antes de cadastrar a biometria facial.
              </p>
            ) : (
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <ScanFace className={`h-6 w-6 ${hasBiometria ? "text-emerald-600" : "text-muted-foreground"}`} />
                  <div>
                    <p className="font-medium">
                      {hasBiometria ? "Biometria cadastrada" : "Biometria não cadastrada"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Usada para identificação na recepção e no totem de auto-atendimento.
                    </p>
                  </div>
                </div>
                <div className="flex gap-2">
                  {hasBiometria ? (
                    <Button type="button" variant="outline" onClick={revogarBiometria} disabled={bioLoading}>
                      Remover biometria
                    </Button>
                  ) : (
                    <Button type="button" onClick={() => setConsentOpen(true)} disabled={bioLoading}>
                      <ScanFace className="h-4 w-4 mr-2" /> Cadastrar biometria
                    </Button>
                  )}
                </div>
              </div>
            )}
          </TabsContent>

          <TabsContent value="prontuario" className="space-y-3 pt-4 pb-16">
            {!editing ? (
              <p className="text-sm text-muted-foreground">
                Salve o cadastro do paciente para visualizar o prontuário.
              </p>
            ) : prontLoading ? (
              <div className="py-10 text-center text-muted-foreground flex items-center justify-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
              </div>
            ) : prontList.length === 0 ? (
              <div className="py-10 text-center text-muted-foreground text-sm">
                <FileHeart className="h-6 w-6 mx-auto mb-2 opacity-50" />
                Nenhum registro de prontuário para este paciente.
              </div>
            ) : (
              <>
                <div className="border rounded-lg p-3 bg-muted/30 grid gap-3 md:grid-cols-[1fr_1fr_1fr_1fr_auto] items-end">
                  <div className="space-y-1">
                    <Label className="text-xs">Data de</Label>
                    <DateInputBR value={filtroDataDe} onChange={(e) => setFiltroDataDe(e.target.value)} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Data até</Label>
                    <DateInputBR value={filtroDataAte} onChange={(e) => setFiltroDataAte(e.target.value)} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Médico</Label>
                    <Input
                      placeholder="Nome do médico"
                      value={filtroMedico}
                      onChange={(e) => setFiltroMedico(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); aplicarFiltroProntuario(); } }}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Serviço</Label>
                    <Select
                      value={filtroItem === "" ? "__all__" : filtroItem}
                      onValueChange={(v) => setFiltroItem(v === "__all__" ? "" : v)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Todos os serviços" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__all__">Todos os serviços</SelectItem>
                        {procedimentosOpcoes.map((nome) => (
                          <SelectItem key={nome} value={nome}>{nome}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex gap-2">
                    <Button type="button" onClick={aplicarFiltroProntuario}>
                      <Search className="h-4 w-4 mr-2" /> Pesquisar
                    </Button>
                    <Button type="button" variant="outline" onClick={limparFiltroProntuario}>
                      Limpar
                    </Button>
                  </div>
                </div>

                {prontFiltered.length === 0 ? (
                  <div className="py-10 text-center text-muted-foreground text-sm">
                    <FileHeart className="h-6 w-6 mx-auto mb-2 opacity-50" />
                    {filtroAtivo
                      ? "Nenhum registro encontrado com esses filtros."
                      : "Nenhum registro de prontuário para este paciente."}
                  </div>
                ) : prontFiltered.map((r) => {
                  const open = prontExpanded.has(r.id);
                  const toggle = () => {
                    setProntExpanded((prev) => {
                      const next = new Set(prev);
                      if (next.has(r.id)) next.delete(r.id); else next.add(r.id);
                      return next;
                    });
                  };
                  return (
                    <div key={r.id} className="border rounded-lg bg-card overflow-hidden">
                      <button
                        type="button"
                        onClick={toggle}
                        aria-expanded={open}
                        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-muted/40 transition-colors"
                      >
                        <ChevronDown
                          className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`}
                        />
                        <div className="flex-1 grid gap-x-4 gap-y-1 md:grid-cols-4 text-sm">
                          <div>
                            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Data</div>
                            <div className="font-semibold text-foreground tabular-nums">
                              {new Date(r.data).toLocaleString("pt-BR")}
                            </div>
                          </div>
                          <div>
                            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Especialidade</div>
                            <div className="font-medium text-foreground truncate">{r.especialidade ?? "—"}</div>
                          </div>
                          <div>
                            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Serviço</div>
                            <div className="font-medium text-foreground truncate">{r.procedimento ?? "—"}</div>
                          </div>
                          <div>
                            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Médico</div>
                            <div className="font-medium text-foreground truncate">{r.medico_nome ?? "—"}</div>
                          </div>
                        </div>
                      </button>
                      {open && (
                        <div className="px-4 pb-4 pt-1 space-y-3 border-t bg-muted/10">
                          {([
                            ["Queixa principal", r.queixa_principal],
                            ["História da doença", r.historia_doenca],
                            ["Exame físico", r.exame_fisico],
                            ["Hipótese diagnóstica", r.hipotese_diagnostica],
                            ["Conduta", r.conduta],
                            ["Prescrição", r.prescricao],
                            ["Observações", r.observacoes],
                          ] as const).filter(([, v]) => v && v.trim()).map(([label, v]) => (
                            <div key={label} className="text-sm border-l-2 border-primary pl-3">
                              <div className="text-sm font-semibold text-foreground uppercase tracking-wide mb-1">
                                {label}
                              </div>
                              <div className="whitespace-pre-wrap text-foreground/90">{v}</div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </>
            )}
          </TabsContent>

          <TabsContent value="historico" className="space-y-3 pt-4 pb-16">
            {!editing ? (
              <p className="text-sm text-muted-foreground">
                Salve o cadastro do paciente para visualizar o histórico de atendimentos.
              </p>
            ) : histLoading ? (
              <div className="py-10 text-center text-muted-foreground flex items-center justify-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
              </div>
            ) : histList.length === 0 ? (
              <div className="py-10 text-center text-muted-foreground text-sm">
                <History className="h-6 w-6 mx-auto mb-2 opacity-50" />
                Nenhuma consulta ou exame realizado para este paciente.
              </div>
            ) : (
              <>
                <div className="border rounded-lg p-3 bg-muted/30 grid gap-3 md:grid-cols-[1fr_1fr_1fr_1fr_auto] items-end">
                  <div className="space-y-1">
                    <Label className="text-xs">Data de</Label>
                    <DateInputBR value={histFiltroDataDe} onChange={(e) => setHistFiltroDataDe(e.target.value)} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Data até</Label>
                    <DateInputBR value={histFiltroDataAte} onChange={(e) => setHistFiltroDataAte(e.target.value)} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Médico</Label>
                    <Input
                      placeholder="Nome do médico"
                      value={histFiltroMedico}
                      onChange={(e) => setHistFiltroMedico(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); aplicarFiltroHistorico(); } }}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Serviço</Label>
                    <Select
                      value={histFiltroItem === "" ? "__all__" : histFiltroItem}
                      onValueChange={(v) => setHistFiltroItem(v === "__all__" ? "" : v)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Todos os serviços" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__all__">Todos os serviços</SelectItem>
                        {procedimentosOpcoes.map((nome) => (
                          <SelectItem key={nome} value={nome}>{nome}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex gap-2">
                    <Button type="button" onClick={aplicarFiltroHistorico}>
                      <Search className="h-4 w-4 mr-2" /> Pesquisar
                    </Button>
                    <Button type="button" variant="outline" onClick={limparFiltroHistorico}>
                      Limpar
                    </Button>
                  </div>
                </div>

                {histFiltered.length === 0 ? (
                  <div className="py-10 text-center text-muted-foreground text-sm">
                    <History className="h-6 w-6 mx-auto mb-2 opacity-50" />
                    {histFiltroAtivo
                      ? "Nenhum registro encontrado com esses filtros."
                      : "Nenhuma consulta ou exame realizado para este paciente."}
                  </div>
                ) : (
                <div className="rounded-lg border border-border bg-card overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/40">
                    <tr className="text-left">
                      <th className="px-3 py-2 w-36">Data</th>
                      <th className="px-3 py-2">Especialidade</th>
                      <th className="px-3 py-2">Serviço</th>
                      <th className="px-3 py-2">Médico</th>
                    </tr>
                  </thead>
                  <tbody>
                    {histFiltered.map((h) => (
                      <tr key={h.id} className="border-t hover:bg-muted/30">
                        <td className="px-3 py-2 tabular-nums">
                          {new Date(h.inicio).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}
                        </td>
                        <td className="px-3 py-2">{h.especialidade ?? "—"}</td>
                        <td className="px-3 py-2 font-medium uppercase">{h.procedimento ?? "CONSULTA"}</td>
                        <td className="px-3 py-2 uppercase">{h.medico_nome ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                </div>
                )}
              </>
            )}
          </TabsContent>

          <TabsContent value="convenio" className="space-y-3 pt-4 pb-16">
            {!editing ? (
              <p className="text-sm text-muted-foreground">
                Salve o cadastro do paciente para visualizar os contratos de convênio.
              </p>
            ) : convLoading ? (
              <div className="py-10 text-center text-muted-foreground flex items-center justify-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
              </div>
            ) : convList.length === 0 ? (
              <div className="py-10 text-center text-muted-foreground text-sm">
                <CreditCard className="h-6 w-6 mx-auto mb-2 opacity-50" />
                Este cliente ainda não possui contratos de convênio.
              </div>
            ) : (
              <div className="space-y-4">
                {convList.map((c) => {
                  const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
                  const isAtraso = (p: ConvParcela) =>
                    ["pendente", "aberto", "atrasado"].includes(p.status) && new Date(p.vencimento + "T00:00:00") < hoje;
                  const isPaga = (p: ConvParcela) => p.status === "pago" || p.status === "paga";
                  const pagas = c.parcelas.filter(isPaga);
                  const atraso = c.parcelas.filter(isAtraso);
                  const pendentes = c.parcelas.filter((p) => !isPaga(p) && !isAtraso(p));
                  const totalContrato = c.parcelas.reduce((s, p) => s + p.valor, 0);
                  const somaPagas = pagas.reduce((s, p) => s + (p.valor_pago ?? p.valor), 0);
                  const somaPendentes = pendentes.reduce((s, p) => s + p.valor, 0);
                  const somaAtraso = atraso.reduce((s, p) => s + p.valor, 0);
                  const dataFimCalc = c.data_fim
                    ? c.data_fim
                    : (() => {
                        const meses = c.vigencia_meses || c.parcelas.length || c.num_parcelas || 12;
                        const d = new Date(c.data_inicio + "T00:00:00");
                        d.setMonth(d.getMonth() + meses);
                        return d.toISOString().slice(0, 10);
                      })();
                  const fmtBRL = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
                  const fmtData = (s: string | null) => s ? new Date(s + "T00:00:00").toLocaleDateString("pt-BR") : "—";
                  const destacar = (nome: string, pid: string) => pid === editing.id ? (
                    <span className="inline-flex items-center gap-1 font-semibold text-primary">
                      <UserCheck className="h-3.5 w-3.5" /> {nome}
                    </span>
                  ) : <span>{nome}</span>;
                  const statusBadge = (() => {
                    const map: Record<string, string> = {
                      ativo: "bg-green-100 text-green-800 border-green-200",
                      pendente_assinatura: "bg-amber-100 text-amber-800 border-amber-200",
                      cancelado: "bg-red-100 text-red-800 border-red-200",
                      encerrado: "bg-muted text-muted-foreground border-border",
                    };
                    return map[c.status] ?? "bg-muted text-muted-foreground border-border";
                  })();
                  return (
                    <div key={c.id} className="border rounded-lg bg-card overflow-hidden">
                      <div className="px-4 py-3 border-b bg-muted/30 flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <CreditCard className="h-4 w-4 text-primary" />
                          <div>
                            <div className="font-semibold text-foreground">
                              {c.plano_nome ?? "Plano"} <span className="text-muted-foreground font-normal">· Contrato #{c.numero}</span>
                            </div>
                            <div className="text-xs text-muted-foreground capitalize">{c.status.replace(/_/g, " ")}</div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className={`text-[10px] px-2 py-0.5 rounded-full border uppercase tracking-wide ${statusBadge}`}>
                            {c.status.replace(/_/g, " ")}
                          </span>
                          <span className="text-[10px] px-2 py-0.5 rounded-full border uppercase tracking-wide bg-primary/10 text-primary border-primary/20">
                            {c.papel}
                          </span>
                        </div>
                      </div>

                      <div className="px-4 py-3 grid gap-3 md:grid-cols-4 text-sm">
                        <div>
                          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Vigência</div>
                          <div className="font-medium tabular-nums">
                            <span className="text-muted-foreground">De:</span> {fmtData(c.data_inicio)}
                            {" "}<span className="text-muted-foreground">Até:</span> {fmtData(dataFimCalc)}
                          </div>
                        </div>
                        <div>
                          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Vencimento</div>
                          <div className="font-medium">Todo dia {c.dia_vencimento}</div>
                        </div>
                        <div>
                          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Valor mensal</div>
                          <div className="font-medium tabular-nums">{fmtBRL(c.valor_mensal)}</div>
                        </div>
                        <div>
                          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Parcelas</div>
                          <div className="font-medium">{c.num_parcelas}×</div>
                        </div>
                      </div>

                      <div className="px-4 pb-3 grid gap-3 md:grid-cols-2 text-sm">
                        <div>
                          <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">Titular</div>
                          <div>{destacar(c.paciente_nome, c.paciente_id)}</div>
                        </div>
                        <div>
                          <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">
                            Dependentes ({c.dependentes.length})
                          </div>
                          {c.dependentes.length === 0 ? (
                            <div className="text-muted-foreground">—</div>
                          ) : (
                            <ul className="space-y-0.5">
                              {c.dependentes.map((d) => (
                                <li key={d.id} className="flex flex-wrap items-center gap-1">
                                  {destacar(d.paciente_nome, d.paciente_id)}
                                  {d.parentesco && <span className="text-xs text-muted-foreground">· {d.parentesco}</span>}
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>
                      </div>

                      <div className="px-4 pb-3 grid gap-2 md:grid-cols-4">
                        <div className="rounded-md border bg-card p-2">
                          <div className="text-[10px] uppercase text-muted-foreground">Pagas</div>
                          <div className="text-base font-semibold text-green-700">{pagas.length}</div>
                          <div className="text-xs tabular-nums text-muted-foreground">{fmtBRL(somaPagas)}</div>
                        </div>
                        <div className="rounded-md border bg-card p-2">
                          <div className="text-[10px] uppercase text-muted-foreground">Pendentes</div>
                          <div className="text-base font-semibold">{pendentes.length}</div>
                          <div className="text-xs tabular-nums text-muted-foreground">{fmtBRL(somaPendentes)}</div>
                        </div>
                        <div className="rounded-md border bg-card p-2">
                          <div className="text-[10px] uppercase text-muted-foreground">Em atraso</div>
                          <div className="text-base font-semibold text-red-700">{atraso.length}</div>
                          <div className="text-xs tabular-nums text-muted-foreground">{fmtBRL(somaAtraso)}</div>
                        </div>
                        <div className="rounded-md border bg-muted/40 p-2">
                          <div className="text-[10px] uppercase text-muted-foreground">Total do contrato</div>
                          <div className="text-base font-semibold">{c.parcelas.length}</div>
                          <div className="text-xs tabular-nums text-muted-foreground">{fmtBRL(totalContrato)}</div>
                        </div>
                      </div>

                      <div className="border-t px-4 py-3 flex flex-wrap items-center justify-between gap-2 bg-muted/10">
                        <div className="text-xs text-muted-foreground">
                          Mensalidades e pagamentos são gerenciados na tela do contrato.
                        </div>
                        <Link
                          to="/app/cartao-beneficios/contratos"
                          search={{ contratoId: c.id }}
                          className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground shadow-sm hover:bg-primary/90 transition-colors"
                          title="Abrir contrato no Cartão Benefícios"
                        >
                          <ExternalLink className="h-3.5 w-3.5" /> Abrir contrato
                        </Link>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </TabsContent>
          </fieldset>
        </Tabs>

        {!readOnly && (
          <div className={footerClass}>
            <Button type="button" variant="outline" onClick={() => { stopVoice(); onCancel(); }}>Cancelar</Button>
            <Button type="submit" disabled={saving}>{saving ? "Salvando…" : "Salvar"}</Button>
          </div>
        )}
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

      {/* Consentimento LGPD para biometria facial */}
      <Dialog open={consentOpen} onOpenChange={setConsentOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Consentimento — Biometria facial</DialogTitle>
            <DialogDescription>
              Termo obrigatório (LGPD — Lei 13.709/2018, art. 11).
            </DialogDescription>
          </DialogHeader>
          <div className="text-sm space-y-2 max-h-72 overflow-auto rounded-md border bg-muted/30 p-3">
            <p><strong>Paciente:</strong> {editing?.nome}</p>
            <p><strong>Finalidade:</strong> identificação na recepção, totem de auto-atendimento e confirmação de identidade em atendimentos, evitando troca de prontuários.</p>
            <p><strong>O que é armazenado:</strong> apenas um vetor matemático (descritor) do seu rosto — <em>não</em> guardamos a foto. O vetor não permite reconstruir a imagem original.</p>
            <p><strong>Compartilhamento:</strong> os dados ficam restritos à clínica e não são compartilhados com terceiros.</p>
            <p><strong>Direitos do titular:</strong> você pode revogar o consentimento e solicitar a exclusão da biometria a qualquer momento, pela equipe da recepção.</p>
            <p><strong>Base legal:</strong> consentimento específico e destacado (art. 11, I).</p>
          </div>
          <DialogFooter className="sticky bottom-0 bg-background border-t -mx-6 -mb-6 px-6 py-3 z-10">
            <Button variant="ghost" onClick={() => setConsentOpen(false)}>Não concordo</Button>
            <Button onClick={() => { setConsentOpen(false); setFaceOpen(true); }}>
              Concordo e autorizo a captura
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <FaceCaptureDialog
        open={faceOpen}
        onClose={() => setFaceOpen(false)}
        onCaptured={async (d) => { await salvarBiometria(d); setFaceOpen(false); }}
        titulo={`Biometria — ${editing?.nome ?? ""}`}
      />
    </>
  );
}