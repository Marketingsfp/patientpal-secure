import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useClinica } from "@/hooks/use-clinica";
import { PatientSearchInput, type PatientOption } from "@/components/patient-search-input";
import { PacienteResumoBar } from "@/components/agenda/paciente-resumo-bar";
import { TurboModeToggle } from "@/components/agenda/turbo-mode-toggle";
import { useTurboDisabled } from "@/hooks/use-turbo-disabled";
import { useAgendaExpressDisabled } from "@/hooks/use-agenda-express-disabled";
import { PatientQuickCompleteSheet } from "@/components/patient-quick-complete-sheet";
import { ProcedimentoPicker, type ProcedimentoOption } from "@/components/agenda/procedimento-picker";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { mostrarErro } from "@/lib/traduzir-erro";
import {
  Zap, CheckCircle2, ArrowRight, ArrowLeft, User, Clock, Stethoscope,
  Repeat, AlertTriangle, ShieldCheck, PhoneCall,
} from "lucide-react";
import { somenteDigitos, isCPFValido } from "@/lib/cpf";
import { usePodeEscrever } from "@/hooks/use-permissoes";

import { DateInputBR } from "@/components/ui/date-input-br";
export const Route = createFileRoute("/_authenticated/app/agenda/express")({
  component: AgendaExpressPage,
});

type Especialidade = { id: string; nome: string };
type Slot = {
  medico_id: string;
  medico_nome: string;
  especialidade_id: string | null;
  especialidade_nome: string | null;
  agenda_id: string | null;
  agenda_nome: string | null;
  inicio: string;
  fim: string;
  ocupados: number;
  capacidade: number;
};
type Ultimo = {
  medico_id: string | null;
  medico_nome: string | null;
  especialidade_id: string | null;
  especialidade_nome: string | null;
  procedimento: string | null;
};
type StatusPaciente =
  | { kind: "vazio" }
  | { kind: "particular"; paciente: PatientOption }
  | { kind: "associado"; paciente: PatientOption; convenio: string }
  | { kind: "novo" }
  | { kind: "base_nao_importada" };

function fmtHora(iso: string) {
  const d = new Date(iso);
  return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}
function fmtDia(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit" });
}
function groupByDia(slots: Slot[]) {
  const map = new Map<string, Slot[]>();
  for (const s of slots) {
    const k = new Date(s.inicio).toISOString().slice(0, 10);
    if (!map.has(k)) map.set(k, []);
    map.get(k)!.push(s);
  }
  return Array.from(map.entries());
}

function AgendaExpressPage() {
  const { clinicaAtual, modoTodas } = useClinica();
  const turboDisabled = useTurboDisabled();
  const agendaExpressDisabled = useAgendaExpressDisabled();
  const navigate = useNavigate();
  useEffect(() => {
    if (agendaExpressDisabled) navigate({ to: "/app/agenda", replace: true });
  }, [agendaExpressDisabled, navigate]);
  const podeEscrever = usePodeEscrever("agenda");
  const clinicaId = clinicaAtual?.clinica_id ?? null;

  const [baseImportada, setBaseImportada] = useState<boolean | null>(null);
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);

  // Step 1 — paciente
  const [paciente, setPaciente] = useState<PatientOption | null>(null);
  const [status, setStatus] = useState<StatusPaciente>({ kind: "vazio" });
  const [ultimo, setUltimo] = useState<Ultimo | null>(null);
  const [checkingContato, setCheckingContato] = useState(false);

  // mini-cadastro (paciente novo)
  const [novoNome, setNovoNome] = useState("");
  const [novoTelefone, setNovoTelefone] = useState("");
  const [novoCpf, setNovoCpf] = useState("");
  const [novoNasc, setNovoNasc] = useState("");
  const [criandoPaciente, setCriandoPaciente] = useState(false);

  // Step 2 — especialidade
  const [especialidades, setEspecialidades] = useState<Especialidade[]>([]);
  const [especialidadeId, setEspecialidadeId] = useState<string | null>(null);
  const [especialidadeNome, setEspecialidadeNome] = useState<string | null>(null);

  // Step 3/4 — horários
  const [medicoId, setMedicoId] = useState<string | null>(null);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [carregandoSlots, setCarregandoSlots] = useState(false);
  const [slotSelecionado, setSlotSelecionado] = useState<Slot | null>(null);
  const [confirmando, setConfirmando] = useState(false);

  // Procedimento opcional (útil p/ Ultrassom, Raio-X, Laboratório etc.)
  const [procedimento, setProcedimento] = useState<ProcedimentoOption | null>(null);

  // Sheet de cadastro incompleto
  const [sheetOpen, setSheetOpen] = useState(false);

  // Base importada?
  useEffect(() => {
    if (!clinicaId) { setBaseImportada(null); return; }
    supabase.from("clinicas").select("base_importada").eq("id", clinicaId).maybeSingle()
      .then(({ data }) => setBaseImportada(Boolean(data?.base_importada)));
  }, [clinicaId]);

  // Carrega especialidades da clínica (via médicos ativos)
  useEffect(() => {
    if (!clinicaId) return;
    (async () => {
      const { data } = await supabase
        .from("medicos")
        .select("especialidade_id, especialidades:especialidade_id(id,nome)")
        .eq("clinica_id", clinicaId)
        .eq("ativo", true);
      const map = new Map<string, Especialidade>();
      for (const row of (data ?? []) as any[]) {
        const e = row.especialidades;
        if (e?.id) map.set(e.id, { id: e.id, nome: e.nome });
      }
      setEspecialidades(Array.from(map.values()).sort((a, b) => a.nome.localeCompare(b.nome)));
    })();
  }, [clinicaId]);

  // Ao selecionar paciente do autocomplete: verifica se é associado
  useEffect(() => {
    if (!paciente || !clinicaId) return;
    setCheckingContato(true);
    (async () => {
      const { data } = await supabase.rpc("buscar_paciente_contato", {
        _clinica_id: clinicaId,
        _cpf: paciente.cpf ?? undefined,
        _telefone: paciente.telefone ?? undefined,
        _nome: paciente.nome,
      });
      const row = Array.isArray(data) ? data[0] : null;
      if (row?.associado) {
        setStatus({ kind: "associado", paciente, convenio: row.convenio_nome ?? "Convênio" });
      } else {
        setStatus({ kind: "particular", paciente });
      }
      // último agendamento
      const { data: u } = await supabase.rpc("get_ultimo_agendamento_paciente", {
        _paciente_id: paciente.id,
      });
      const urow = Array.isArray(u) ? u[0] : null;
      setUltimo(urow ? {
        medico_id: urow.medico_id, medico_nome: urow.medico_nome,
        especialidade_id: urow.especialidade_id, especialidade_nome: urow.especialidade_nome,
        procedimento: urow.procedimento,
      } : null);
      setCheckingContato(false);
    })();
  }, [paciente, clinicaId]);

  // Busca slots quando entra no step 3
  async function carregarSlots(opts: { medicoId?: string | null; espId?: string | null } = {}) {
    if (!clinicaId) return;
    setCarregandoSlots(true);
    setSlots([]);
    const { data, error } = await supabase.rpc("get_horarios_disponiveis", {
      _clinica_id: clinicaId,
      _especialidade_id: (opts.espId ?? especialidadeId) ?? undefined,
      _medico_id: (opts.medicoId ?? medicoId) ?? undefined,
      _dias: 7,
      _limite: 80,
    });
    if (error) {
      mostrarErro(error);
    } else {
      setSlots((data ?? []) as Slot[]);
    }
    setCarregandoSlots(false);
  }

  async function criarPacienteRapido() {
    if (!podeEscrever) {
      toast.error("Você não tem permissão de edição neste módulo.");
      return;
    }
    if (!clinicaId) return;
    if (novoNome.trim().length < 3) { toast.error("Informe o nome"); return; }
    if (somenteDigitos(novoTelefone).length < 10) { toast.error("Telefone é obrigatório (DDD + número)"); return; }
    if (novoCpf && !isCPFValido(novoCpf)) { toast.error("CPF inválido"); return; }
    setCriandoPaciente(true);
    try {
      const { data, error } = await supabase.from("pacientes").insert({
        clinica_id: clinicaId,
        nome: novoNome.trim(),
        telefone: novoTelefone ? somenteDigitos(novoTelefone) : null,
        cpf: novoCpf ? somenteDigitos(novoCpf) : null,
        data_nascimento: novoNasc || null,
        ativo: true,
      }).select("id, nome, cpf, telefone, data_nascimento, clinica_id").single();
      if (error) throw error;
      const p: PatientOption = {
        id: data.id, nome: data.nome, cpf: data.cpf, telefone: data.telefone,
        data_nascimento: data.data_nascimento, clinica_id: data.clinica_id,
      };
      setPaciente(p);
      setStatus({ kind: "particular", paciente: p });
      setStep(2);
      toast.success("Paciente cadastrado");
    } catch (e) { mostrarErro(e); }
    finally { setCriandoPaciente(false); }
  }

  async function confirmarAgendamento() {
    if (!podeEscrever) {
      toast.error("Você não tem permissão de edição neste módulo.");
      return;
    }
    if (!clinicaId || !slotSelecionado || !paciente) return;
    setConfirmando(true);
    try {
      const tipo = status.kind === "associado" ? "convenio" : "particular";
      const { error } = await supabase.from("agendamentos").insert({
        clinica_id: clinicaId,
        paciente_id: paciente.id,
        paciente_nome: paciente.nome,
        medico_id: slotSelecionado.medico_id,
        agenda_id: slotSelecionado.agenda_id ?? undefined,
        inicio: slotSelecionado.inicio,
        fim: slotSelecionado.fim,
        procedimento: procedimento?.nome ?? ultimo?.procedimento ?? undefined,
        tipo_atendimento: tipo,
        status: "agendado",
      });
      if (error) throw error;
      toast.success("Agendamento confirmado!");
      navigate({ to: "/app/agenda" });
    } catch (e) { mostrarErro(e); }
    finally { setConfirmando(false); }
  }

  const podeAvancar1 = !!paciente && status.kind !== "vazio" && status.kind !== "novo";
  const podeAvancar2 = !!especialidadeId || !!medicoId;

  return (
    <div className="mx-auto max-w-4xl p-4 space-y-4">
      <header className="flex items-center gap-2">
        <Zap className="h-6 w-6 text-primary" />
        <div className="flex-1">
          <h1 className="text-2xl font-bold">Agendamento Express</h1>
          <p className="text-sm text-muted-foreground">4 passos, poucos cliques.</p>
        </div>
        <div className="inline-flex rounded-full border bg-card p-0.5">
          <Link
            to="/app/agenda"
            className="px-2 py-1 text-[11px] font-medium rounded-full transition-colors text-muted-foreground hover:text-foreground"
          >
            Agenda completa
          </Link>
          <Link
            to="/app/agenda/express"
            preload={false}
            activeProps={{ className: "px-2 py-1 text-[11px] font-medium rounded-full transition-colors bg-primary text-primary-foreground" }}
            inactiveProps={{ className: "px-2 py-1 text-[11px] font-medium rounded-full transition-colors text-muted-foreground hover:text-foreground" }}
            onClick={(e) => {
              // Toggle: se já estiver na Express, clicar novamente volta para a Agenda completa.
              e.preventDefault();
              navigate({ to: "/app/agenda" });
            }}
          >
            Agenda Express
          </Link>
        </div>
        {!turboDisabled && <TurboModeToggle />}
      </header>

      {/* Stepper */}
      <div className="flex items-center gap-2 text-sm">
        {[1, 2, 3, 4].map((n) => (
          <div key={n} className={`flex-1 h-1.5 rounded-full ${step >= n ? "bg-primary" : "bg-muted"}`} />
        ))}
      </div>

      {modoTodas && (
        <Card className="border-amber-300 bg-amber-50 dark:bg-amber-950/20">
          <CardContent className="p-3 text-sm">
            Selecione uma clínica específica (não "Todas") para usar o Express.
          </CardContent>
        </Card>
      )}

      {clinicaId && baseImportada === false && (
        <Card className="border-amber-400 bg-amber-50 dark:bg-amber-950/20">
          <CardContent className="p-3 text-sm flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5" />
            <div>
              Base de dados desta unidade ainda não importada. A busca pode não encontrar pacientes existentes —
              cadastre com atenção para não duplicar.
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 1 — Paciente */}
      {step === 1 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <User className="h-4 w-4" /> 1. Buscar paciente
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <PatientSearchInput
              autoFocus
              clinicaIdsOverride={clinicaId ? [clinicaId] : undefined}
              value={paciente}
              onSelect={(p) => { setPaciente(p); if (!p) setStatus({ kind: "vazio" }); }}
              placeholder="CPF, telefone ou nome"
              enableVoice
            />

            {paciente?.id && clinicaId && paciente.id !== "__pendente__" && (
              <PacienteResumoBar pacienteId={paciente.id} clinicaId={clinicaId} />
            )}
            {paciente && (
              <div className="rounded-md border p-3 text-sm space-y-1">
                <div className="flex items-center gap-2">
                  <span className="font-medium">{paciente.nome}</span>
                  {checkingContato && <span className="text-xs text-muted-foreground">verificando…</span>}
                  {status.kind === "associado" && (
                    <Badge className="bg-emerald-600 hover:bg-emerald-600 gap-1">
                      <ShieldCheck className="h-3 w-3" /> Associado — {status.convenio}
                    </Badge>
                  )}
                  {status.kind === "particular" && (
                    <Badge variant="secondary">Particular</Badge>
                  )}
                </div>
                <div className="text-xs text-muted-foreground">
                  {paciente.telefone ?? "sem telefone"} · {paciente.cpf ?? "sem CPF"}
                </div>

                {paciente.cadastro_incompleto && (
                  <div className="mt-2 flex items-center justify-between gap-2 rounded-md border border-amber-300 bg-amber-50 dark:bg-amber-950/20 p-2">
                    <div className="text-xs text-amber-800 dark:text-amber-300">
                      ⚠ Cadastro incompleto — complete agora para não perder tempo depois.
                    </div>
                    <Button size="sm" variant="outline" onClick={() => setSheetOpen(true)}>
                      Completar
                    </Button>
                  </div>
                )}

                {ultimo?.medico_id && (
                  <div className="pt-2 flex flex-wrap gap-2">
                    <Button size="sm" variant="outline" onClick={() => {
                      setEspecialidadeId(ultimo.especialidade_id);
                      setEspecialidadeNome(ultimo.especialidade_nome);
                      setMedicoId(ultimo.medico_id);
                      setStep(3);
                      carregarSlots({ medicoId: ultimo.medico_id, espId: ultimo.especialidade_id });
                    }}>
                      <Repeat className="h-3 w-3 mr-1" /> Agendar novamente ({ultimo.medico_nome})
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => {
                      setMedicoId(ultimo.medico_id);
                      setEspecialidadeId(null);
                      setStep(3);
                      carregarSlots({ medicoId: ultimo.medico_id, espId: null });
                    }}>
                      Mesmo médico da última consulta
                    </Button>
                  </div>
                )}
              </div>
            )}

            {!paciente && (
              <details className="rounded-md border p-3 text-sm">
                <summary className="cursor-pointer font-medium">Não encontrei — cadastrar novo (rápido)</summary>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <div>
                    <Label>Nome completo *</Label>
                    <Input value={novoNome} onChange={(e) => setNovoNome(e.target.value)} />
                  </div>
                  <div>
                    <Label>Telefone *</Label>
                    <Input value={novoTelefone} onChange={(e) => setNovoTelefone(e.target.value)} />
                  </div>
                  <div>
                    <Label>CPF</Label>
                    <Input value={novoCpf} onChange={(e) => setNovoCpf(e.target.value)} />
                  </div>
                  <div>
                    <Label>Nascimento</Label>
                    <DateInputBR value={novoNasc} onChange={(e) => setNovoNasc(e.target.value)} />
                  </div>
                </div>
                {podeEscrever && (
                  <div className="mt-3">
                    <Button size="sm" onClick={criarPacienteRapido} disabled={criandoPaciente}>
                      {criandoPaciente ? "Cadastrando…" : "Cadastrar e continuar"}
                    </Button>
                  </div>
                )}
              </details>
            )}

            <div className="flex justify-between pt-2">
              <div />
              <Button disabled={!podeAvancar1} onClick={() => setStep(2)}>
                Continuar <ArrowRight className="ml-1 h-4 w-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 2 — Especialidade */}
      {step === 2 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Stethoscope className="h-4 w-4" /> 2. Escolha a especialidade
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap gap-2">
              {especialidades.map((e) => (
                <Button
                  key={e.id}
                  size="sm"
                  variant={especialidadeId === e.id ? "default" : "outline"}
                  onClick={() => { setEspecialidadeId(e.id); setEspecialidadeNome(e.nome); setMedicoId(null); }}
                >
                  {e.nome}
                </Button>
              ))}
              {especialidades.length === 0 && (
                <span className="text-sm text-muted-foreground">Nenhuma especialidade com médico ativo.</span>
              )}
            </div>

            {clinicaId && especialidadeId && (
              <div className="pt-2">
                <div className="text-xs font-semibold uppercase text-muted-foreground mb-1">
                  Procedimento / exame (opcional)
                </div>
                <ProcedimentoPicker
                  clinicaId={clinicaId}
                  especialidadeId={especialidadeId}
                  value={procedimento}
                  onSelect={setProcedimento}
                  placeholder="Buscar exame por nome ou código…"
                />
              </div>
            )}

            <div className="flex justify-between pt-2">
              <Button variant="ghost" onClick={() => setStep(1)}>
                <ArrowLeft className="mr-1 h-4 w-4" /> Voltar
              </Button>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => { setStep(3); carregarSlots({ espId: especialidadeId }); }}
                  disabled={!especialidadeId}>
                  <Clock className="mr-1 h-4 w-4" /> Próximo horário disponível
                </Button>
                <Button disabled={!podeAvancar2} onClick={() => { setStep(3); carregarSlots({ espId: especialidadeId }); }}>
                  Continuar <ArrowRight className="ml-1 h-4 w-4" />
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 3 — Horário */}
      {step === 3 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Clock className="h-4 w-4" /> 3. Escolha o horário
              {especialidadeNome && <Badge variant="secondary">{especialidadeNome}</Badge>}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {carregandoSlots && <div className="text-sm text-muted-foreground">Carregando horários…</div>}
            {!carregandoSlots && slots.length === 0 && (
              <div className="text-sm text-muted-foreground">
                Nenhum horário disponível nos próximos 7 dias.
              </div>
            )}

            <div className="space-y-4 max-h-[420px] overflow-auto">
              {groupByDia(slots).map(([dia, arr]) => (
                <div key={dia}>
                  <div className="text-xs font-semibold uppercase text-muted-foreground mb-1">
                    {fmtDia(arr[0].inicio)}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {arr.map((s) => {
                      const active = slotSelecionado?.medico_id === s.medico_id && slotSelecionado?.inicio === s.inicio;
                      return (
                        <Button
                          key={s.medico_id + s.inicio}
                          size="sm"
                          variant={active ? "default" : "outline"}
                          className="flex-col h-auto py-1.5 px-2"
                          onClick={() => { setSlotSelecionado(s); setStep(4); }}
                        >
                          <span className="font-mono">{fmtHora(s.inicio)}</span>
                          <span className="text-[10px] font-normal opacity-80">{s.medico_nome}</span>
                        </Button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>

            <div className="flex justify-between pt-2">
              <Button variant="ghost" onClick={() => setStep(2)}>
                <ArrowLeft className="mr-1 h-4 w-4" /> Voltar
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 4 — Confirmar */}
      {step === 4 && slotSelecionado && paciente && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4" /> 4. Confirmar
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="rounded-md border p-3 text-sm space-y-1">
              <div><span className="text-muted-foreground">Paciente:</span> <b>{paciente.nome}</b></div>
              {status.kind === "associado" && (
                <div className="text-emerald-700 dark:text-emerald-400">
                  Associado — {status.convenio} · será cobrado como convênio
                </div>
              )}
              {status.kind === "particular" && <div>Particular</div>}
              <div><span className="text-muted-foreground">Médico:</span> {slotSelecionado.medico_nome}</div>
              {especialidadeNome && (
                <div><span className="text-muted-foreground">Especialidade:</span> {especialidadeNome}</div>
              )}
              {procedimento && (
                <div><span className="text-muted-foreground">Procedimento:</span> {procedimento.nome}</div>
              )}
              <div><span className="text-muted-foreground">Quando:</span> {fmtDia(slotSelecionado.inicio)} · {fmtHora(slotSelecionado.inicio)}</div>
            </div>

            {paciente.cadastro_incompleto && (
              <div className="rounded-md border border-amber-300 bg-amber-50 dark:bg-amber-950/20 p-2 text-xs flex items-center justify-between gap-2">
                <span className="text-amber-800 dark:text-amber-300">
                  ⚠ Cadastro incompleto — dados obrigatórios para NFS-e podem estar faltando.
                </span>
                <Button size="sm" variant="outline" onClick={() => setSheetOpen(true)}>
                  Completar
                </Button>
              </div>
            )}

            <div className="flex justify-between pt-2">
              <Button variant="ghost" onClick={() => setStep(3)}>
                <ArrowLeft className="mr-1 h-4 w-4" /> Trocar horário
              </Button>
              {podeEscrever && (
                <Button onClick={confirmarAgendamento} disabled={confirmando}>
                  {confirmando ? "Confirmando…" : "Finalizar agendamento"}
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {baseImportada === false && !paciente && (
        <Card>
          <CardContent className="p-3 text-sm flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <PhoneCall className="h-4 w-4 text-muted-foreground" />
              Prefere encaminhar para uma atendente?
            </div>
            <Button variant="outline" size="sm" asChild>
              <Link to="/app/atendimento-ia">Abrir atendimento</Link>
            </Button>
          </CardContent>
        </Card>
      )}

      <PatientQuickCompleteSheet
        pacienteId={paciente?.id ?? null}
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        requireNfse
        onSaved={() => {
          if (paciente) setPaciente({ ...paciente, cadastro_incompleto: false });
        }}
      />
    </div>
  );
}
