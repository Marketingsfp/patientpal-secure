import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Check, ChevronRight, User, Stethoscope, UserRound, Clock, CheckCircle2, Loader2, UserPlus, X } from "lucide-react";
import { HhpWizardShell } from "@/design-system/hhp";
import { PatientSearchInput, type PatientOption } from "@/components/patient-search-input";
import { ProcedimentoPicker, type ProcedimentoOption } from "@/components/agenda/procedimento-picker";
import { supabase } from "@/integrations/supabase/client";
import { useClinica } from "@/hooks/use-clinica";
import { criarAgendamento } from "@/lib/agenda/criar-agendamento.functions";
import { mostrarErro } from "@/lib/traduzir-erro";
import { cn } from "@/lib/utils";

// -----------------------------------------------------------------------------
// Fase F — Wizard V2: agendamento SIMPLES (sem orçamento, sem sessão
// laboratorial multi-exame, sem encaixe, sem cobrança). Reutiliza 100% das
// regras de criação/edição através da server fn compartilhada
// `criarAgendamento` — ver `docs/agenda/criar-agendamento-shared.md`.
//
// Regras/limites desta fase:
//   - Somente médicos regulares (recursos de enfermagem ficam para depois).
//   - Somente slots DISPONÍVEL já existentes na agenda do médico no dia.
//   - Sem vínculo com orçamento (`orcamento_id` = null, `pending_orc_item_ids` = []).
//   - Marca `observacoes = "[V2]"` para rastreabilidade do piloto.
// -----------------------------------------------------------------------------

const STEPS = [
  { key: "paciente", label: "Paciente", Icon: User },
  { key: "servico", label: "Serviço", Icon: Stethoscope },
  { key: "profissional", label: "Profissional", Icon: UserRound },
  { key: "horario", label: "Horário", Icon: Clock },
  { key: "confirmar", label: "Confirmação", Icon: CheckCircle2 },
] as const;

type StepKey = typeof STEPS[number]["key"];

type MedicoLite = {
  id: string;
  nome: string;
  especialidade_id: string | null;
  procedimento_padrao_id: string | null;
};

type SlotLivre = { id: string; inicio: string; fim: string };

type TipoAtendimento = "particular" | "convenio";

type EspecialidadeOpt = { id: string; nome: string; isPrincipal: boolean };

function toLocalDateKey(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

function fmtHora(iso: string) {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/**
 * Sprint 1 · S1-A — `initial` (opcional) permite abrir o wizard já com
 * médico + data + hora pré-selecionados a partir de um clique em slot
 * livre da timeline. Não pula passos (paciente/serviço continuam
 * obrigatórios), apenas evita re-selecionar o que o usuário já indicou.
 */
export interface WizardInitial {
  medicoId?: string | null;
  dia?: Date | null;
  hour?: number | null;
}

export function NovoAgendamentoWizard({
  open,
  onOpenChange,
  initial,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  initial?: WizardInitial | null;
}) {
  const { clinicaAtual } = useClinica();
  const clinicaId = clinicaAtual?.clinica_id ?? null;
  const queryClient = useQueryClient();
  const criarAgendamentoFn = useServerFn(criarAgendamento);

  const [stepIdx, setStepIdx] = useState(0);
  const step: StepKey = STEPS[stepIdx].key;

  const [paciente, setPaciente] = useState<PatientOption | null>(null);
  const [procedimento, setProcedimento] = useState<ProcedimentoOption | null>(null);
  const [medico, setMedico] = useState<MedicoLite | null>(null);
  const [dataDia, setDataDia] = useState<string>(toLocalDateKey(new Date()));
  const [slot, setSlot] = useState<SlotLivre | null>(null);
  const [tipoAtendimento, setTipoAtendimento] = useState<TipoAtendimento>("particular");
  const [especialidadeId, setEspecialidadeId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // -------------------------------------------------------------------------
  // Sprint 3 · S3-B — Cadastro rápido de paciente dentro do Wizard.
  // Não cria rota nem função de servidor nova: insere direto em `pacientes`
  // (mesmo INSERT que a tela de clientes usa), reusando as políticas RLS
  // existentes. Ao salvar, o paciente recém-criado já vem selecionado e o
  // usuário avança normalmente no wizard.
  //
  // Campos exigidos são deliberadamente os MESMOS que a `criarAgendamento`
  // valida (telefone + data_nascimento) mais o único NOT NULL sem default
  // no schema (`sexo`). CPF fica opcional para não bloquear casos comuns
  // de walk-in.
  // -------------------------------------------------------------------------
  const [showQuickCreate, setShowQuickCreate] = useState(false);
  const [qcNome, setQcNome] = useState("");
  const [qcSexo, setQcSexo] = useState<"M" | "F">("F");
  const [qcNasc, setQcNasc] = useState("");
  const [qcTel, setQcTel] = useState("");
  const [qcCpf, setQcCpf] = useState("");
  const [qcSaving, setQcSaving] = useState(false);

  const resetQuickCreate = () => {
    setShowQuickCreate(false);
    setQcNome(""); setQcSexo("F"); setQcNasc(""); setQcTel(""); setQcCpf("");
    setQcSaving(false);
  };

  const reset = () => {
    setStepIdx(0);
    setPaciente(null);
    setProcedimento(null);
    setMedico(null);
    setDataDia(toLocalDateKey(new Date()));
    setSlot(null);
    setTipoAtendimento("particular");
    setEspecialidadeId(null);
    setSaving(false);
    resetQuickCreate();
  };

  // ---------- Query: médicos ativos da clínica (mesma da clássica) ----------
  const medicosQuery = useQuery({
    queryKey: ["agenda-v2", "wizard-medicos", clinicaId],
    enabled: !!clinicaId && open,
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<MedicoLite[]> => {
      const { data, error } = await supabase
        .from("medicos")
        .select("id,nome,especialidade_id,procedimento_padrao_id")
        .eq("clinica_id", clinicaId!)
        .eq("ativo", true)
        .order("nome");
      if (error) throw error;
      return (data ?? []) as MedicoLite[];
    },
  });

  // ---------- Query: slots DISPONÍVEL do médico no dia ----------
  const slotsQuery = useQuery({
    queryKey: ["agenda-v2", "wizard-slots", clinicaId, medico?.id, dataDia],
    enabled: !!clinicaId && !!medico && open,
    staleTime: 30 * 1000,
    queryFn: async (): Promise<SlotLivre[]> => {
      const [y, m, d] = dataDia.split("-").map(Number);
      const start = new Date(y, (m ?? 1) - 1, d ?? 1, 0, 0, 0);
      const end = new Date(y, (m ?? 1) - 1, d ?? 1, 23, 59, 59);
      const { data, error } = await supabase
        .from("agendamentos")
        .select("id,paciente_nome,inicio,fim")
        .eq("clinica_id", clinicaId!)
        .eq("medico_id", medico!.id)
        .gte("inicio", start.toISOString())
        .lte("inicio", end.toISOString())
        .order("inicio", { ascending: true });
      if (error) throw error;
      const nomeLivre = (n: string | null | undefined) =>
        (n ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim() === "disponivel";
      return (data ?? [])
        .filter((s) => nomeLivre(s.paciente_nome as string))
        .map((s) => ({ id: s.id as string, inicio: s.inicio as string, fim: s.fim as string }));
    },
  });

  // ---------- Query: especialidades do médico selecionado ----------
  // Junta a principal (medicos.especialidade_id) com as secundárias
  // (medico_especialidades). O usuário escolhe qual especialidade
  // aparece no comprovante DESTE agendamento.
  const especialidadesQuery = useQuery({
    queryKey: ["agenda-v2", "wizard-especialidades", medico?.id],
    enabled: !!medico && open,
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<EspecialidadeOpt[]> => {
      if (!medico) return [];
      const { data: sec, error } = await supabase
        .from("medico_especialidades")
        .select("especialidade_id, especialidade:especialidades!medico_especialidades_especialidade_id_fkey(id,nome)")
        .eq("medico_id", medico.id);
      if (error) throw error;
      const listaSec = ((sec ?? []) as Array<{ especialidade: { id: string; nome: string } | null }>)
        .map((r) => r.especialidade)
        .filter((e): e is { id: string; nome: string } => !!e);
      let principal: { id: string; nome: string } | null = null;
      if (medico.especialidade_id) {
        const { data: pr } = await supabase
          .from("especialidades")
          .select("id,nome")
          .eq("id", medico.especialidade_id)
          .maybeSingle();
        principal = (pr as { id: string; nome: string } | null) ?? null;
      }
      const map = new Map<string, EspecialidadeOpt>();
      if (principal) map.set(principal.id, { ...principal, isPrincipal: true });
      for (const e of listaSec) {
        if (!map.has(e.id)) map.set(e.id, { ...e, isPrincipal: false });
      }
      return Array.from(map.values()).sort((a, b) => {
        if (a.isPrincipal && !b.isPrincipal) return -1;
        if (!a.isPrincipal && b.isPrincipal) return 1;
        return a.nome.localeCompare(b.nome, "pt-BR");
      });
    },
  });

  // Sempre que trocar médico ou a lista de especialidades carregar,
  // define o default como a principal do médico (ou a primeira).
  useEffect(() => {
    if (!medico) { setEspecialidadeId(null); return; }
    const opts = especialidadesQuery.data ?? [];
    if (opts.length === 0) return;
    const jaSelecionadaValida = especialidadeId && opts.some((o) => o.id === especialidadeId);
    if (jaSelecionadaValida) return;
    const principal = opts.find((o) => o.isPrincipal) ?? opts[0];
    setEspecialidadeId(principal.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [medico?.id, especialidadesQuery.data]);

  // Sprint 1 · S1-A — aplica `initial` quando o wizard abre e quando os
  // médicos carregam (necessário porque `medico` precisa vir da lista
  // já carregada). Não pula passos — apenas pré-preenche.
  useEffect(() => {
    if (!open || !initial) return;
    if (initial.dia) setDataDia(toLocalDateKey(initial.dia));
    if (initial.medicoId && medicosQuery.data) {
      const m = medicosQuery.data.find((x) => x.id === initial.medicoId);
      if (m && medico?.id !== m.id) {
        setMedico(m);
        setSlot(null);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initial?.medicoId, initial?.dia, medicosQuery.data]);

  // Pré-seleciona o primeiro slot dentro da hora indicada assim que os
  // slots do médico carregam. Só age se o usuário ainda não escolheu slot.
  useEffect(() => {
    if (!open || !initial || initial.hour == null || slot) return;
    const hit = (slotsQuery.data ?? []).find(
      (s) => new Date(s.inicio).getHours() === initial.hour,
    );
    if (hit) setSlot(hit);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initial?.hour, slotsQuery.data]);

  const canNext =
    (step === "paciente" && !!paciente) ||
    (step === "servico" && !!procedimento) ||
    (step === "profissional" && !!medico) ||
    (step === "horario" && !!slot) ||
    step === "confirmar";

  async function handleQuickCreatePaciente() {
    if (!clinicaId) return;
    const nome = qcNome.trim();
    const nasc = qcNasc.trim();
    const telDigits = qcTel.replace(/\D/g, "");
    const cpfDigits = qcCpf.replace(/\D/g, "");
    if (nome.length < 3) { toast.error("Informe o nome completo"); return; }
    if (!nasc) { toast.error("Data de nascimento é obrigatória"); return; }
    if (telDigits.length < 10) { toast.error("Telefone com DDD é obrigatório"); return; }
    if (cpfDigits && cpfDigits.length !== 11) { toast.error("CPF inválido"); return; }
    setQcSaving(true);
    try {
      const { data, error } = await supabase
        .from("pacientes")
        .insert({
          clinica_id: clinicaId,
          nome,
          sexo: qcSexo,
          data_nascimento: nasc,
          telefone: telDigits,
          cpf: cpfDigits ? cpfDigits : null,
          ativo: true,
        })
        .select("id,nome,cpf,telefone,data_nascimento,clinica_id")
        .single();
      if (error) throw error;
      const novo: PatientOption = {
        id: data.id as string,
        nome: data.nome as string,
        cpf: (data.cpf as string | null) ?? null,
        telefone: (data.telefone as string | null) ?? null,
        data_nascimento: (data.data_nascimento as string | null) ?? null,
        clinica_id: data.clinica_id as string,
      };
      setPaciente(novo);
      resetQuickCreate();
      toast.success("Paciente cadastrado");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Falha ao cadastrar paciente";
      toast.error(msg);
      setQcSaving(false);
    }
  }

  const heading =
    step === "paciente" ? "Quem é o paciente?" :
    step === "servico" ? "Qual o serviço?" :
    step === "profissional" ? "Com qual profissional?" :
    step === "horario" ? "Quando será?" :
    "Confirmar agendamento";

  async function handleConfirmar() {
    if (!clinicaId || !paciente || !procedimento || !medico || !slot) return;
    setSaving(true);
    try {
      // Payload montado nos MESMOS moldes de app.agenda.tsx:2437-2451.
      // orcamento_id/data_pagamento ficam null (Fase F simples).
      const result = await criarAgendamentoFn({
        data: {
          clinica_id: clinicaId,
          editing_id: null,
          payload: {
            clinica_id: clinicaId,
            paciente_nome: paciente.nome.trim(),
            paciente_id: paciente.id,
            medico_id: medico.id,
            enfermagem_recurso_id: null,
            inicio: new Date(slot.inicio).toISOString(),
            fim: new Date(slot.fim).toISOString(),
            procedimento: procedimento.nome || null,
            status: "agendado",
            observacoes: "[V2]",
            data_pagamento: null,
            orcamento_id: null,
            tipo_atendimento: tipoAtendimento,
            forma_pagamento_prevista: null,
            especialidade_id: especialidadeId,
          },
          checagens: {
            validar_paciente_completo: true,
            validar_agenda_aberta: true,
            validar_inadimplencia: tipoAtendimento === "convenio",
          },
          pending_orc_item_ids: [],
        },
      });

      if (!result.ok) {
        setSaving(false);
        if ("validation_error" in result) {
          const opts = result.validation_error.toast_duration
            ? { duration: result.validation_error.toast_duration }
            : undefined;
          toast.error(result.validation_error.message, opts);
        } else {
          mostrarErro(result.pg_error);
        }
        return;
      }

      if (result.vinculo_warning) {
        mostrarErro(result.vinculo_warning.pg_error, "agendamento salvo, mas vínculo com itens do orçamento falhou");
      }

      toast.success("Salvo");
      // Invalida todas as views do dia da Agenda V2 (prefix match).
      await queryClient.invalidateQueries({ queryKey: ["agenda-v2", "ags"] });
      reset();
      onOpenChange(false);
    } catch (e) {
      setSaving(false);
      const msg = e instanceof Error ? e.message : "Erro ao salvar agendamento";
      toast.error(msg);
    }
  }

  // ---------- Steps ----------
  const body = (
    <>
      {step === "paciente" && (
        <div>
          {clinicaId ? (
            <>
              <PatientSearchInput
                autoFocus
                value={paciente}
                onSelect={(p) => { setPaciente(p); if (p) setShowQuickCreate(false); }}
                placeholder="Buscar por nome, CPF ou telefone…"
              />
              {!paciente && !showQuickCreate && (
                <button
                  type="button"
                  onClick={() => setShowQuickCreate(true)}
                  className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-indigo-600 hover:text-indigo-700"
                >
                  <UserPlus className="h-3.5 w-3.5" />
                  Não encontrou? Cadastrar novo paciente
                </button>
              )}
              {!paciente && showQuickCreate && (
                <div className="mt-4 rounded-xl border border-indigo-200 bg-indigo-50/40 p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="text-xs font-semibold uppercase tracking-widest text-indigo-700">Novo paciente</div>
                    <button
                      type="button"
                      onClick={resetQuickCreate}
                      className="text-slate-400 hover:text-slate-700"
                      aria-label="Cancelar cadastro rápido"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                  <div className="grid grid-cols-1 gap-2">
                    <input
                      value={qcNome}
                      onChange={(e) => setQcNome(e.target.value)}
                      placeholder="Nome completo *"
                      className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm"
                    />
                    <div className="grid grid-cols-2 gap-2">
                      <select
                        value={qcSexo}
                        onChange={(e) => setQcSexo(e.target.value as "M" | "F")}
                        className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm"
                      >
                        <option value="F">Feminino</option>
                        <option value="M">Masculino</option>
                      </select>
                      <input
                        type="date"
                        value={qcNasc}
                        onChange={(e) => setQcNasc(e.target.value)}
                        className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm"
                      />
                    </div>
                    <input
                      value={qcTel}
                      onChange={(e) => setQcTel(e.target.value)}
                      placeholder="Telefone com DDD *"
                      inputMode="tel"
                      className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm"
                    />
                    <input
                      value={qcCpf}
                      onChange={(e) => setQcCpf(e.target.value)}
                      placeholder="CPF (opcional)"
                      inputMode="numeric"
                      className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm"
                    />
                  </div>
                  <div className="text-[11px] text-slate-500">
                    Nome, sexo, nascimento e telefone são obrigatórios porque o agendamento
                    exige paciente com cadastro completo.
                  </div>
                  <button
                    type="button"
                    disabled={qcSaving}
                    onClick={handleQuickCreatePaciente}
                    className={cn(
                      "inline-flex items-center gap-1.5 h-9 px-4 rounded-lg text-xs font-semibold transition-colors",
                      qcSaving ? "bg-slate-200 text-slate-400" : "bg-indigo-600 text-white hover:bg-indigo-700",
                    )}
                  >
                    {qcSaving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                    {qcSaving ? "Salvando…" : "Cadastrar e continuar"}
                  </button>
                </div>
              )}
            </>
          ) : (
            <p className="text-sm text-slate-500">Selecione uma clínica antes de criar o agendamento.</p>
          )}
          {paciente && (
            <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50/60 p-3 text-sm">
              <div className="font-semibold text-slate-900">{paciente.nome}</div>
              <div className="text-[11px] text-slate-500">
                {paciente.telefone ?? "sem telefone"} · {paciente.data_nascimento ? paciente.data_nascimento.split("-").reverse().join("/") : "sem nascimento"}
              </div>
              {(!paciente.telefone || !paciente.data_nascimento) && (
                <div className="mt-2 text-[11px] text-amber-700">
                  ⚠ Cadastro incompleto — a criação será bloqueada. Complete o paciente antes de salvar.
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {step === "servico" && (
        <div>
          {clinicaId ? (
            <ProcedimentoPicker
              clinicaId={clinicaId}
              value={procedimento}
              onSelect={setProcedimento}
              placeholder="Buscar procedimento…"
            />
          ) : (
            <p className="text-sm text-slate-500">Sem clínica selecionada.</p>
          )}
          {procedimento && (
            <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50/60 p-3 text-sm">
              <div className="font-semibold text-slate-900">{procedimento.nome}</div>
              <div className="text-[11px] text-slate-500">
                {procedimento.duracao_minutos ? `${procedimento.duracao_minutos} min` : "duração padrão"}
                {procedimento.tipo ? ` · ${procedimento.tipo}` : ""}
              </div>
            </div>
          )}
        </div>
      )}

      {step === "profissional" && (
        <div>
          {medicosQuery.isLoading && (
            <div className="flex items-center gap-2 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" /> Carregando…</div>
          )}
          {medicosQuery.isError && (
            <p className="text-sm text-red-600">Não foi possível carregar os profissionais.</p>
          )}
          {(medicosQuery.data ?? []).length === 0 && !medicosQuery.isLoading && (
            <p className="text-sm text-slate-500">Nenhum profissional ativo nesta clínica.</p>
          )}
          <div className="space-y-1">
            {(medicosQuery.data ?? []).map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => { setMedico(m); setSlot(null); }}
                className={cn(
                  "w-full flex items-center gap-3 p-3 rounded-xl text-left transition-colors",
                  medico?.id === m.id ? "bg-indigo-50 ring-1 ring-indigo-200" : "hover:bg-slate-50",
                )}
              >
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-slate-900">{m.nome}</div>
                </div>
                {medico?.id === m.id && <Check className="h-4 w-4 text-indigo-500" />}
              </button>
            ))}
          </div>
          <p className="mt-4 text-[11px] text-slate-400">
            Fase F: recursos de enfermagem ainda não estão disponíveis pelo wizard V2 — use a Agenda clássica.
          </p>
          {medico && (
            <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50/60 p-3">
              <div className="text-[10px] font-semibold uppercase tracking-widest text-slate-500 mb-2">
                Especialidade deste atendimento
              </div>
              {especialidadesQuery.isLoading ? (
                <div className="flex items-center gap-2 text-xs text-slate-500">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> Carregando…
                </div>
              ) : (especialidadesQuery.data ?? []).length === 0 ? (
                <p className="text-xs text-slate-500">
                  Este profissional não tem especialidade cadastrada. O comprovante sairá sem especialidade.
                </p>
              ) : (
                <>
                  <select
                    value={especialidadeId ?? ""}
                    onChange={(e) => setEspecialidadeId(e.target.value || null)}
                    className="w-full h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm"
                  >
                    {(especialidadesQuery.data ?? []).map((e) => (
                      <option key={e.id} value={e.id}>
                        {e.nome}{e.isPrincipal ? " (principal)" : ""}
                      </option>
                    ))}
                  </select>
                  <p className="mt-2 text-[11px] text-slate-500">
                    Define a especialidade que aparece no comprovante e nas guias deste agendamento.
                  </p>
                </>
              )}
            </div>
          )}
        </div>
      )}

      {step === "horario" && (
        <div>
          <div className="flex items-center gap-3 mb-4">
            <label className="text-[11px] font-semibold uppercase tracking-widest text-slate-400">Data</label>
            <input
              type="date"
              value={dataDia}
              onChange={(e) => { setDataDia(e.target.value); setSlot(null); }}
              className="h-10 rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm"
            />
          </div>
          {slotsQuery.isLoading && (
            <div className="flex items-center gap-2 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" /> Buscando horários…</div>
          )}
          {slotsQuery.isError && (
            <p className="text-sm text-red-600">Não foi possível carregar os horários.</p>
          )}
          {!slotsQuery.isLoading && (slotsQuery.data ?? []).length === 0 && (
            <p className="text-sm text-slate-500">
              Nenhum horário DISPONÍVEL para este médico nessa data. Gere horários em Disponibilidades ou escolha outro dia.
            </p>
          )}
          <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
            {(slotsQuery.data ?? []).map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => setSlot(s)}
                className={cn(
                  "h-11 rounded-xl border text-sm font-semibold tabular-nums transition-all",
                  slot?.id === s.id
                    ? "bg-indigo-500 text-white border-indigo-500"
                    : "border-slate-200 text-slate-700 hover:border-slate-300 hover:bg-slate-50",
                )}
              >
                {fmtHora(s.inicio)}
              </button>
            ))}
          </div>
        </div>
      )}

      {step === "confirmar" && (
        <div className="rounded-2xl border border-slate-200 bg-slate-50/40 p-6 space-y-3">
          <div className="flex justify-between text-sm"><span className="text-slate-500">Paciente</span><span className="font-semibold text-slate-900">{paciente?.nome}</span></div>
          <div className="flex justify-between text-sm"><span className="text-slate-500">Serviço</span><span className="font-semibold text-slate-900">{procedimento?.nome}</span></div>
          <div className="flex justify-between text-sm"><span className="text-slate-500">Profissional</span><span className="font-semibold text-slate-900">{medico?.nome}</span></div>
          {especialidadeId && (
            <div className="flex justify-between text-sm">
              <span className="text-slate-500">Especialidade</span>
              <span className="font-semibold text-slate-900">
                {(especialidadesQuery.data ?? []).find((e) => e.id === especialidadeId)?.nome ?? "—"}
              </span>
            </div>
          )}
          <div className="flex justify-between text-sm">
            <span className="text-slate-500">Data · horário</span>
            <span className="font-semibold text-slate-900 tabular-nums">
              {slot ? `${dataDia.split("-").reverse().join("/")} · ${fmtHora(slot.inicio)}–${fmtHora(slot.fim)}` : "—"}
            </span>
          </div>

          <div className="pt-3 border-t border-slate-200">
            <div className="text-[10px] font-semibold uppercase tracking-widest text-slate-400 mb-2">Tipo de atendimento</div>
            <div className="flex gap-2">
              {(["particular", "convenio"] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTipoAtendimento(t)}
                  className={cn(
                    "h-9 px-4 rounded-lg text-xs font-semibold border transition-colors",
                    tipoAtendimento === t
                      ? "bg-slate-900 text-white border-slate-900"
                      : "border-slate-200 text-slate-600 hover:bg-slate-50",
                  )}
                >
                  {t === "particular" ? "Particular" : "Convênio (cartão benefícios)"}
                </button>
              ))}
            </div>
          </div>

          <p className="text-[11px] text-slate-400 pt-3 border-t border-slate-200">
            Rastreabilidade: o agendamento será gravado com <code>observacoes = &quot;[V2]&quot;</code> durante o piloto da Agenda V2.
          </p>
        </div>
      )}
    </>
  );

  const footer = (
    <>
      <button
        type="button"
        disabled={saving}
        onClick={() => (stepIdx === 0 ? onOpenChange(false) : setStepIdx((i) => i - 1))}
        className="text-sm text-slate-500 hover:text-slate-900 font-medium disabled:opacity-50"
      >
        {stepIdx === 0 ? "Cancelar" : "Voltar"}
      </button>
      <button
        type="button"
        disabled={!canNext || saving}
        onClick={() => (stepIdx === STEPS.length - 1 ? handleConfirmar() : setStepIdx((i) => i + 1))}
        className={cn(
          "inline-flex items-center gap-1.5 h-10 px-5 rounded-xl text-sm font-semibold transition-all",
          (canNext && !saving) ? "bg-slate-900 text-white hover:bg-slate-800" : "bg-slate-200 text-slate-400 cursor-not-allowed",
        )}
      >
        {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
        {stepIdx === STEPS.length - 1 ? (saving ? "Salvando…" : "Confirmar") : "Continuar"}
        {stepIdx < STEPS.length - 1 && <ChevronRight className="h-3.5 w-3.5" />}
      </button>
    </>
  );

  return (
    <HhpWizardShell
      open={open}
      onOpenChange={(v) => { if (!v) reset(); onOpenChange(v); }}
      title="Novo agendamento"
      description="Assistente em 5 passos para criar um agendamento simples."
      stepLabel={`Passo ${stepIdx + 1} de ${STEPS.length}`}
      stepIndex={stepIdx}
      stepsCount={STEPS.length}
      heading={heading}
      footer={footer}
    >
      {body}
    </HhpWizardShell>
  );
}