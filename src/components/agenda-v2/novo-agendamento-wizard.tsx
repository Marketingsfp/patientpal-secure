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

type StepKey = (typeof STEPS)[number]["key"];

/**
 * Wizard visual — Fase A. Não cria agendamento real ainda (isso entra na Fase E).
 * Objetivo: validar a experiência de criação em 4 passos, sem formulário tradicional.
 */
export function NovoAgendamentoWizard({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
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

  const reset = () => { setStepIdx(0); setPaciente(null); setServico(null); setHorario(null); setBusca(""); };

  const pacientesMock = ["Ana Beatriz Costa", "Carlos Eduardo Lima", "Marina Souza", "Pedro Henrique Alves"]
    .filter((p) => p.toLowerCase().includes(busca.toLowerCase()));

  const servicosMock = [
    { nome: "Consulta cardiológica", cor: "#4F46E5" },
    { nome: "Ecocardiograma", cor: "#0EA5E9" },
    { nome: "Coleta laboratorial", cor: "#10B981" },
    { nome: "Retorno", cor: "#8B5CF6" },
  ];

  const slotsMock = ["08:30", "09:00", "09:30", "10:00", "10:30", "11:00", "14:00", "14:30", "15:00", "15:30"];

  const canNext =
    (step === "paciente" && !!paciente) ||
    (step === "servico" && !!procedimento) ||
    (step === "profissional" && !!medico) ||
    (step === "horario" && !!slot) ||
    step === "confirmar";

  const finish = () => {
    toast.info("Fase A: wizard visual — a criação real do agendamento entra na Fase E.");
    reset();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) reset(); onOpenChange(v); }}>
      <DialogContent className="w-[calc(100vw-1.5rem)] max-w-[720px] max-h-[90vh] overflow-y-auto p-0 gap-0 rounded-3xl border-slate-200 bg-white">
        <VisuallyHidden.Root>
          <DialogTitle>Novo agendamento</DialogTitle>
          <DialogDescription>Assistente em 4 passos para criar um novo agendamento.</DialogDescription>
        </VisuallyHidden.Root>
        <div className="px-5 md:px-8 pt-6 md:pt-8 pb-4">
          <div className="text-[10px] font-semibold uppercase tracking-widest text-indigo-500">
            Passo {stepIdx + 1} de {STEPS.length}
          </div>
          <h2
            className="mt-1 text-2xl font-semibold text-slate-900"
            style={{ fontFamily: "'Inter Tight', Inter, sans-serif", letterSpacing: "-0.01em" }}
          >
            {step === "paciente" && "Quem é o paciente?"}
            {step === "servico" && "Qual o serviço?"}
            {step === "horario" && "Quando será?"}
            {step === "confirmar" && "Tudo certo?"}
          </h2>

          {/* Progresso */}
          <div className="mt-5 flex items-center gap-1.5">
            {STEPS.map((_, i) => (
              <div
                key={i}
                className={cn(
                  "h-1 rounded-full flex-1 transition-all",
                  i <= stepIdx ? "bg-indigo-500" : "bg-slate-100",
                )}
              />
            ))}
          </div>
        </div>

        <div className="px-5 md:px-8 py-6 min-h-[320px] md:min-h-[380px]">
          {step === "paciente" && (
            <div>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <Input
                  autoFocus
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                  placeholder="Buscar por nome, CPF ou telefone…"
                  className="pl-10 h-11 rounded-xl bg-slate-50 border-slate-200"
                />
              </div>
              <div className="mt-4 space-y-1">
                {pacientesMock.map((p) => (
                  <button
                    type="button"
                    disabled={qcSaving}
                    onClick={handleQuickCreatePaciente}
                    className={cn(
                      "inline-flex items-center gap-1.5 h-9 px-4 rounded-lg text-xs font-semibold transition-colors",
                      qcSaving ? "bg-slate-200 text-slate-400" : "bg-indigo-600 text-white hover:bg-indigo-700",
                    )}
                  >
                    <Avatar className="h-9 w-9 border border-slate-200">
                      <AvatarFallback className="bg-slate-50 text-slate-500 text-xs font-semibold">
                        {p.split(" ").slice(0, 2).map((s) => s[0]).join("")}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-slate-900">{p}</div>
                      <div className="text-[11px] text-slate-500">Cadastro visual · Fase A</div>
                    </div>
                    {paciente === p && <Check className="h-4 w-4 text-indigo-500" />}
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

          {step === "servico" && (
            <div className="grid grid-cols-2 gap-3">
              {servicosMock.map((s) => (
                <button
                  key={s.nome}
                  type="button"
                  onClick={() => setServico(s.nome)}
                  className={cn(
                    "p-4 rounded-2xl border text-left transition-all",
                    servico === s.nome
                      ? "border-indigo-300 bg-indigo-50/50 ring-1 ring-indigo-200"
                      : "border-slate-200 hover:border-slate-300 hover:bg-slate-50",
                  )}
                >
                  <div className="h-2 w-8 rounded-full mb-3" style={{ background: s.cor }} />
                  <div className="text-sm font-semibold text-slate-900">{s.nome}</div>
                  <div className="text-[11px] text-slate-500 mt-1">30 min · padrão</div>
                </button>
              ))}
              <div className="col-span-2 mt-3">
                <div className="text-[10px] font-semibold uppercase tracking-widest text-slate-400 mb-2">Duração</div>
                <div className="flex gap-2">
                  {[15, 30, 45, 60, 90].map((d) => (
                    <button
                      key={d}
                      type="button"
                      onClick={() => setDuracao(d)}
                      className={cn(
                        "px-3 h-8 rounded-lg text-xs font-semibold border transition-colors",
                        duracao === d
                          ? "bg-slate-900 text-white border-slate-900"
                          : "border-slate-200 text-slate-600 hover:bg-slate-50",
                      )}
                    >
                      {d}min
                    </button>
                  ))}
                </div>
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
              <div className="text-[10px] font-semibold uppercase tracking-widest text-slate-400 mb-2">Hoje</div>
              <div className="grid grid-cols-5 gap-2">
                {slotsMock.map((h) => (
                  <button
                    key={h}
                    type="button"
                    onClick={() => setHorario(h)}
                    className={cn(
                      "h-11 rounded-xl border text-sm font-semibold tabular-nums transition-all",
                      horario === h
                        ? "bg-indigo-500 text-white border-indigo-500"
                        : "border-slate-200 text-slate-700 hover:border-slate-300 hover:bg-slate-50",
                    )}
                  >
                    {h}
                  </button>
                ))}
              </div>
              <p className="mt-4 text-[11px] text-slate-400">Slots de exemplo · a integração com a disponibilidade real entra na Fase E.</p>
            </div>
          )}

          {step === "confirmar" && (
            <div className="rounded-2xl border border-slate-200 bg-slate-50/40 p-6 space-y-3">
              <div className="flex justify-between text-sm"><span className="text-slate-500">Paciente</span><span className="font-semibold text-slate-900">{paciente}</span></div>
              <div className="flex justify-between text-sm"><span className="text-slate-500">Serviço</span><span className="font-semibold text-slate-900">{servico}</span></div>
              <div className="flex justify-between text-sm"><span className="text-slate-500">Duração</span><span className="font-semibold text-slate-900 tabular-nums">{duracao} min</span></div>
              <div className="flex justify-between text-sm"><span className="text-slate-500">Horário</span><span className="font-semibold text-slate-900 tabular-nums">{horario}</span></div>
              <p className="text-[11px] text-slate-400 pt-3 border-t border-slate-200">
                Este resumo é apenas visual (Fase A). O agendamento real será criado pela Fase E, reutilizando as funções atuais.
              </p>
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

        <div className="px-5 md:px-8 py-4 md:py-5 border-t border-slate-100 flex items-center justify-between bg-slate-50/40">
          <button
            type="button"
            onClick={() => (stepIdx === 0 ? onOpenChange(false) : setStepIdx((i) => i - 1))}
            className="text-sm text-slate-500 hover:text-slate-900 font-medium"
          >
            {stepIdx === 0 ? "Cancelar" : "Voltar"}
          </button>
          <button
            type="button"
            disabled={!canNext}
            onClick={() => (stepIdx === STEPS.length - 1 ? finish() : setStepIdx((i) => i + 1))}
            className={cn(
              "inline-flex items-center gap-1.5 h-10 px-5 rounded-xl text-sm font-semibold transition-all",
              canNext ? "bg-slate-900 text-white hover:bg-slate-800" : "bg-slate-200 text-slate-400 cursor-not-allowed",
            )}
          >
            {stepIdx === STEPS.length - 1 ? "Confirmar" : "Continuar"}
            {stepIdx < STEPS.length - 1 && <ChevronRight className="h-3.5 w-3.5" />}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
