/**
 * Agenda dentro da conversa.
 *
 * Painel lateral que usa a MESMA agenda do sistema: as vagas vêm das linhas
 * "DISPONÍVEL" reais e a gravação passa pelo motor de agendamento existente
 * (`criarAgendamento`), com todas as travas de concorrência dele. Nada aqui é
 * uma agenda paralela.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, CalendarDays, CheckCircle2, Loader2, Search } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Calendar } from "@/components/ui/calendar";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { usePodeEscrever } from "@/hooks/use-permissoes";
import { criarAgendamento } from "@/lib/agenda/criar-agendamento.functions";
import {
  agendamentosFuturosChat,
  buscarPacientesChat,
  catalogoAgendaChat,
  diasComVagaChat,
  proximaVagaChat,
  registrarAgendamentoNaConversa,
  slotsAgendaChat,
  type SlotChat,
} from "@/lib/agenda/chat-agenda.functions";

type Paciente = {
  id: string;
  nome: string;
  cpf: string | null;
  telefone: string | null;
  data_nascimento: string | null;
};

type Catalogo = {
  procedimentos: Array<{ id: string; nome: string; tipo: string | null; duracao_minutos: number | null }>;
  medicos: Array<{ id: string; nome: string; especialidade_id: string | null; ordem_chegada: boolean }>;
  especialidades: Array<{ id: string; nome: string }>;
};

export type SugestaoAgenda = {
  procedimento?: string | null;
  periodo?: "manha" | "tarde" | "noite" | null;
};

function isoDia(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function br(dataISO: string) {
  const [a, m, d] = dataISO.split("-");
  return `${d}/${m}/${a}`;
}
function periodoDe(hora: string): "manha" | "tarde" | "noite" {
  const h = Number(hora.slice(0, 2));
  if (h < 12) return "manha";
  if (h < 18) return "tarde";
  return "noite";
}

export function AgendaConversaDrawer({
  open,
  onOpenChange,
  clinicaId,
  conversaId,
  contatoNome,
  contatoTelefone,
  pacienteIdVinculado,
  sugestao,
  onMensagemPronta,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  clinicaId: string;
  conversaId: string;
  contatoNome: string | null;
  contatoTelefone: string | null;
  pacienteIdVinculado: string | null;
  sugestao?: SugestaoAgenda;
  onMensagemPronta?: (texto: string) => void;
}) {
  const podeAgendar = usePodeEscrever("agenda");
  const fnCatalogo = useServerFn(catalogoAgendaChat);
  const fnSlots = useServerFn(slotsAgendaChat);
  const fnDias = useServerFn(diasComVagaChat);
  const fnProxima = useServerFn(proximaVagaChat);
  const fnPacientes = useServerFn(buscarPacientesChat);
  const fnFuturos = useServerFn(agendamentosFuturosChat);
  const fnCriar = useServerFn(criarAgendamento);
  const fnEvento = useServerFn(registrarAgendamentoNaConversa);

  const [catalogo, setCatalogo] = useState<Catalogo | null>(null);
  const [paciente, setPaciente] = useState<Paciente | null>(null);
  const [buscaPac, setBuscaPac] = useState("");
  const [achados, setAchados] = useState<Paciente[]>([]);
  const [procedimento, setProcedimento] = useState<string>("");
  const [buscaProc, setBuscaProc] = useState("");
  const [medicoId, setMedicoId] = useState<string>("");
  const [buscaMed, setBuscaMed] = useState("");
  const [dia, setDia] = useState<Date>(new Date());
  const [diasComVaga, setDiasComVaga] = useState<Set<string>>(new Set());
  const [slots, setSlots] = useState<SlotChat[]>([]);
  const [carregandoSlots, setCarregandoSlots] = useState(false);
  const [slotSel, setSlotSel] = useState<SlotChat | null>(null);
  const [periodo, setPeriodo] = useState<"todos" | "manha" | "tarde" | "noite">(
    sugestao?.periodo ?? "todos",
  );
  const [futuros, setFuturos] = useState<
    Array<{ id: string; data: string; hora: string; procedimento: string | null; medico_nome: string | null }>
  >([]);
  const [etapa, setEtapa] = useState<"form" | "confirmar" | "ok">("form");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [outros, setOutros] = useState<
    Array<{ medico_id: string; medico_nome: string; data: string; hora: string }>
  >([]);
  const emVoo = useRef(false);

  /* ---------------------------------------------------------- carga inicial */
  useEffect(() => {
    if (!open || !clinicaId) return;
    void (async () => {
      try {
        const c = (await fnCatalogo({ data: { clinicaId } })) as Catalogo;
        setCatalogo(c);
        if (sugestao?.procedimento) {
          const achou = c.procedimentos.find((p) =>
            p.nome.toLowerCase().includes(sugestao.procedimento!.toLowerCase()),
          );
          if (achou) setProcedimento(achou.nome);
        }
      } catch {
        toast.error("Não foi possível carregar o catálogo da agenda.");
      }
    })();
  }, [open, clinicaId, fnCatalogo, sugestao?.procedimento]);

  // Paciente já vinculado à conversa: nunca criar duplicado.
  useEffect(() => {
    if (!open || !clinicaId || !pacienteIdVinculado) return;
    void (async () => {
      const r = (await fnPacientes({
        data: { clinicaId, termo: (contatoNome || contatoTelefone || "").slice(0, 60) || "aa" },
      }).catch(() => [])) as Paciente[];
      const achou = r.find((p) => p.id === pacienteIdVinculado);
      if (achou) setPaciente(achou);
    })();
  }, [open, clinicaId, pacienteIdVinculado, contatoNome, contatoTelefone, fnPacientes]);

  /* --------------------------------------------------------------- buscas */
  useEffect(() => {
    if (!open || buscaPac.trim().length < 2) return setAchados([]);
    const t = setTimeout(() => {
      void fnPacientes({ data: { clinicaId, termo: buscaPac.trim() } })
        .then((r) => setAchados(r as Paciente[]))
        .catch(() => setAchados([]));
    }, 300);
    return () => clearTimeout(t);
  }, [buscaPac, clinicaId, fnPacientes, open]);

  const carregarSlots = useCallback(async () => {
    if (!open || !clinicaId) return;
    setCarregandoSlots(true);
    try {
      const r = (await fnSlots({
        data: { clinicaId, data: isoDia(dia), medicoId: medicoId || null },
      })) as SlotChat[];
      setSlots(r);
      setSlotSel((s) => (s && r.some((x) => x.inicio === s.inicio && x.livre) ? s : null));
    } catch {
      setSlots([]);
    } finally {
      setCarregandoSlots(false);
    }
  }, [clinicaId, dia, fnSlots, medicoId, open]);

  useEffect(() => {
    void carregarSlots();
    // A disponibilidade muda enquanto duas atendentes olham a mesma agenda.
    const t = setInterval(() => void carregarSlots(), 20_000);
    return () => clearInterval(t);
  }, [carregarSlots]);

  useEffect(() => {
    if (!open || !clinicaId) return;
    const de = new Date(dia.getFullYear(), dia.getMonth(), 1);
    const ate = new Date(dia.getFullYear(), dia.getMonth() + 1, 0);
    void fnDias({ data: { clinicaId, de: isoDia(de), ate: isoDia(ate), medicoId: medicoId || null } })
      .then((r) => setDiasComVaga(new Set(r as string[])))
      .catch(() => setDiasComVaga(new Set()));
  }, [open, clinicaId, dia, medicoId, fnDias]);

  useEffect(() => {
    if (!open || !paciente) return setFuturos([]);
    void fnFuturos({ data: { clinicaId, pacienteId: paciente.id } })
      .then((r) => setFuturos(r as typeof futuros))
      .catch(() => setFuturos([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, paciente?.id, clinicaId, fnFuturos]);

  /* -------------------------------------------------------------- derivados */
  const medicosFiltrados = useMemo(() => {
    const lista = catalogo?.medicos ?? [];
    const t = buscaMed.trim().toLowerCase();
    return t ? lista.filter((m) => m.nome.toLowerCase().includes(t)) : lista.slice(0, 40);
  }, [catalogo, buscaMed]);

  const procsFiltrados = useMemo(() => {
    const lista = catalogo?.procedimentos ?? [];
    const t = buscaProc.trim().toLowerCase();
    return t ? lista.filter((p) => p.nome.toLowerCase().includes(t)).slice(0, 30) : [];
  }, [catalogo, buscaProc]);

  const livres = slots.filter((s) => s.livre);
  const ocupados = slots.filter((s) => !s.livre);
  const porPeriodo = (p: "manha" | "tarde" | "noite") =>
    livres.filter((s) => periodoDe(s.hora) === p && (periodo === "todos" || periodo === p));
  const ordemChegada = livres.some((s) => s.ordem_chegada);

  const faltando: string[] = [];
  if (!paciente) faltando.push("paciente");
  if (!procedimento) faltando.push("o que será agendado");
  if (!slotSel) faltando.push("horário");
  if (paciente && !paciente.data_nascimento) faltando.push("data de nascimento do paciente");

  const medicoNome = slotSel?.medico_nome ?? catalogo?.medicos.find((m) => m.id === medicoId)?.nome ?? "";

  /* ------------------------------------------------------------ confirmação */
  async function confirmar() {
    if (emVoo.current || !paciente || !slotSel || !procedimento) return;
    emVoo.current = true;
    setSalvando(true);
    setErro(null);
    try {
      const res = (await fnCriar({
        data: {
          clinica_id: clinicaId,
          editing_id: null,
          payload: {
            clinica_id: clinicaId,
            paciente_nome: paciente.nome,
            paciente_id: paciente.id,
            medico_id: slotSel.medico_id,
            inicio: slotSel.inicio,
            fim: slotSel.fim,
            procedimento,
            status: "agendado",
            observacoes: `Agendado pelo atendimento (conversa ${conversaId.slice(0, 8)})`,
            data_pagamento: null,
            orcamento_id: null,
            tipo_atendimento: "particular",
            forma_pagamento_prevista: null,
          },
          checagens: {
            validar_paciente_completo: true,
            validar_agenda_aberta: true,
            validar_inadimplencia: false,
          },
          pending_orc_item_ids: [],
        },
      })) as
        | { ok: true; id: string }
        | { ok: false; validation_error?: { message: string }; pg_error?: { message?: string } };

      if (!res.ok) {
        const msg =
          res.validation_error?.message ??
          res.pg_error?.message ??
          "Não foi possível concluir o agendamento.";
        // Slot tomado por outra atendente entre a listagem e a confirmação.
        if (/ocupad|disponív|conflito|23505/i.test(msg)) {
          setErro("⚠️ Este horário acabou de ser ocupado. Escolha outro horário.");
          setSlotSel(null);
          await carregarSlots();
          setEtapa("form");
        } else {
          setErro(`⛔ ${msg} Nenhuma reserva foi confirmada.`);
        }
        return;
      }

      const resumo = `${procedimento} — ${medicoNome || "sem profissional"} — ${br(isoDia(dia))} às ${slotSel.hora}`;
      await fnEvento({
        data: { clinicaId, conversaId, agendamentoId: res.id, resumo },
      }).catch(() => undefined);
      setEtapa("ok");
    } catch (e) {
      setErro(
        `⛔ ${e instanceof Error ? e.message : "Falha inesperada"}. Nenhuma reserva foi confirmada.`,
      );
    } finally {
      setSalvando(false);
      emVoo.current = false;
    }
  }

  function mensagemConfirmacao() {
    return `Seu agendamento foi realizado para o dia ${br(isoDia(dia))}, às ${slotSel?.hora}${
      medicoNome ? `, com ${medicoNome}` : ""
    }. Procedimento: ${procedimento}.`;
  }

  /* -------------------------------------------------------------------- UI */
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-md overflow-y-auto bg-atd-surface text-atd-ink"
      >
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <CalendarDays className="h-4 w-4" /> Agendamento
          </SheetTitle>
        </SheetHeader>

        {!podeAgendar && (
          <p className="mt-2 rounded border border-atd-border bg-atd-warn-bg px-3 py-2 text-xs text-atd-warn-ink">
            Você pode consultar a disponibilidade, mas não tem permissão para confirmar
            agendamentos.
          </p>
        )}

        {etapa === "ok" ? (
          <div className="mt-4 space-y-3 text-sm">
            <p className="flex items-center gap-2 font-medium text-atd-go-ink">
              <CheckCircle2 className="h-4 w-4" /> Agendamento realizado com sucesso
            </p>
            <dl className="space-y-1 rounded border border-atd-border p-3 text-xs">
              <div><dt className="inline font-semibold">Paciente: </dt><dd className="inline">{paciente?.nome}</dd></div>
              <div><dt className="inline font-semibold">Procedimento: </dt><dd className="inline">{procedimento}</dd></div>
              {medicoNome && <div><dt className="inline font-semibold">Profissional: </dt><dd className="inline">{medicoNome}</dd></div>}
              <div><dt className="inline font-semibold">Data: </dt><dd className="inline">{br(isoDia(dia))}</dd></div>
              <div><dt className="inline font-semibold">Horário: </dt><dd className="inline">{slotSel?.hora}</dd></div>
            </dl>
            <div className="flex gap-2">
              <Button
                size="sm"
                onClick={() => {
                  onMensagemPronta?.(mensagemConfirmacao());
                  onOpenChange(false);
                }}
              >
                Enviar confirmação
              </Button>
              <Button size="sm" variant="outline" onClick={() => onOpenChange(false)}>
                Voltar à conversa
              </Button>
            </div>
          </div>
        ) : etapa === "confirmar" ? (
          <div className="mt-4 space-y-3 text-sm">
            <p className="font-medium">Confirmar agendamento</p>
            <dl className="space-y-1 rounded border border-atd-border p-3 text-xs">
              <div><dt className="inline font-semibold">Paciente: </dt><dd className="inline">{paciente?.nome}</dd></div>
              <div><dt className="inline font-semibold">Procedimento: </dt><dd className="inline">{procedimento}</dd></div>
              {medicoNome && <div><dt className="inline font-semibold">Profissional: </dt><dd className="inline">{medicoNome}</dd></div>}
              <div><dt className="inline font-semibold">Data: </dt><dd className="inline">{br(isoDia(dia))}</dd></div>
              <div><dt className="inline font-semibold">Horário: </dt><dd className="inline">{slotSel?.hora}</dd></div>
            </dl>
            {erro && <p className="text-xs text-atd-danger-ink">{erro}</p>}
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => setEtapa("form")} disabled={salvando}>
                Voltar
              </Button>
              <Button size="sm" onClick={() => void confirmar()} disabled={salvando || !podeAgendar}>
                {salvando ? (
                  <>
                    <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> Confirmando agendamento…
                  </>
                ) : (
                  "Confirmar agendamento"
                )}
              </Button>
            </div>
          </div>
        ) : (
          <div className="mt-4 space-y-4 text-sm">
            {/* Paciente */}
            <div className="space-y-1">
              <Label className="text-xs">Paciente</Label>
              {paciente ? (
                <div className="rounded border border-atd-border p-2 text-xs">
                  <p className="font-medium">{paciente.nome}</p>
                  <p className="text-atd-ink-soft">
                    {paciente.telefone ?? contatoTelefone ?? "sem telefone"}
                    {paciente.data_nascimento ? ` · ${br(paciente.data_nascimento)}` : ""}
                  </p>
                  {!paciente.data_nascimento && (
                    <p className="mt-1 flex items-center gap-1 text-atd-warn-ink">
                      <AlertTriangle className="h-3 w-3" /> Data de nascimento necessária no cadastro
                    </p>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    className="mt-1 h-6 px-1 text-[11px]"
                    onClick={() => setPaciente(null)}
                  >
                    trocar
                  </Button>
                </div>
              ) : (
                <>
                  <div className="relative">
                    <Search className="absolute left-2 top-2.5 h-3.5 w-3.5 text-atd-ink-soft" />
                    <Input
                      className="pl-7"
                      placeholder="Buscar por nome, telefone ou CPF"
                      value={buscaPac}
                      onChange={(e) => setBuscaPac(e.target.value)}
                    />
                  </div>
                  <div className="max-h-40 overflow-auto">
                    {achados.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        className="block w-full rounded px-2 py-1 text-left text-xs hover:bg-atd-blue-tint"
                        onClick={() => setPaciente(p)}
                      >
                        {p.nome}
                        <span className="text-atd-ink-soft">
                          {p.telefone ? ` · ${p.telefone}` : ""}
                        </span>
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>

            {futuros.length > 0 && (
              <div className="rounded border border-atd-warn/40 bg-atd-warn-bg p-2 text-xs text-atd-warn-ink">
                <p className="flex items-center gap-1 font-medium">
                  <AlertTriangle className="h-3 w-3" /> Este paciente já tem agendamento futuro
                </p>
                {futuros.map((f) => (
                  <p key={f.id}>
                    {f.procedimento ?? "Atendimento"} — {f.data} às {f.hora}
                    {f.medico_nome ? ` — ${f.medico_nome}` : ""}
                  </p>
                ))}
              </div>
            )}

            {/* Procedimento */}
            <div className="space-y-1">
              <Label className="text-xs">O que será agendado?</Label>
              <Input
                placeholder="Digite para buscar (ex.: cardio)"
                value={procedimento || buscaProc}
                onChange={(e) => {
                  setProcedimento("");
                  setBuscaProc(e.target.value);
                }}
              />
              {!procedimento &&
                procsFiltrados.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    className="block w-full rounded px-2 py-1 text-left text-xs hover:bg-atd-blue-tint"
                    onClick={() => {
                      setProcedimento(p.nome);
                      setBuscaProc("");
                    }}
                  >
                    {p.nome} <span className="text-atd-ink-soft">({p.tipo ?? "—"})</span>
                  </button>
                ))}
            </div>

            {/* Profissional */}
            <div className="space-y-1">
              <Label className="text-xs">Profissional</Label>
              <Input
                placeholder="Todos os profissionais — digite para filtrar"
                value={buscaMed}
                onChange={(e) => setBuscaMed(e.target.value)}
              />
              <div className="flex flex-wrap gap-1">
                <Button
                  size="sm"
                  variant={medicoId ? "outline" : "default"}
                  className="h-7 text-xs"
                  onClick={() => setMedicoId("")}
                >
                  Todos
                </Button>
                {medicosFiltrados.slice(0, 12).map((m) => (
                  <Button
                    key={m.id}
                    size="sm"
                    variant={medicoId === m.id ? "default" : "outline"}
                    className="h-7 text-xs"
                    onClick={() => setMedicoId(m.id)}
                  >
                    {m.nome}
                  </Button>
                ))}
              </div>
            </div>

            {/* Calendário */}
            <div className="space-y-1">
              <Label className="text-xs">Data</Label>
              <Calendar
                mode="single"
                selected={dia}
                onSelect={(d) => d && setDia(d)}
                modifiers={{ comVaga: (d: Date) => diasComVaga.has(isoDia(d)) }}
                modifiersClassNames={{ comVaga: "font-bold text-atd-go-ink underline" }}
                className="rounded border border-atd-border p-2"
              />
              <div className="flex flex-wrap gap-1">
                {(["todos", "manha", "tarde", "noite"] as const).map((p) => (
                  <Button
                    key={p}
                    size="sm"
                    variant={periodo === p ? "default" : "outline"}
                    className="h-7 text-xs"
                    onClick={() => setPeriodo(p)}
                  >
                    {p === "todos" ? "Todos" : p === "manha" ? "Manhã" : p === "tarde" ? "Tarde" : "Noite"}
                  </Button>
                ))}
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 text-xs"
                  onClick={async () => {
                    const r = (await fnProxima({
                      data: { clinicaId, medicoId: medicoId || null },
                    })) as { data?: string } | Array<{ data: string }> | null;
                    const alvo = Array.isArray(r) ? r[0]?.data : r?.data;
                    if (!alvo) return toast.info("Nenhuma vaga futura encontrada.");
                    const [a, m, d] = alvo.split("-").map(Number);
                    setDia(new Date(a, m - 1, d));
                  }}
                >
                  Próxima disponibilidade
                </Button>
              </div>
            </div>

            {/* Horários */}
            <div className="space-y-2">
              <Label className="text-xs">Horários</Label>
              {ordemChegada && (
                <p className="text-xs text-atd-ink-soft">Atendimento por ordem de chegada.</p>
              )}
              {carregandoSlots ? (
                <p className="text-xs text-atd-ink-soft">Buscando horários disponíveis…</p>
              ) : livres.length === 0 ? (
                <div className="space-y-2 text-xs">
                  <p>Nenhum horário disponível nesta data.</p>
                  <div className="flex flex-wrap gap-1">
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs"
                      onClick={() => setDia(new Date(dia.getTime() - 86_400_000))}
                    >
                      Dia anterior
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs"
                      onClick={async () => {
                        const r = (await fnProxima({
                          data: { clinicaId, medicoId: null },
                        })) as Array<{ medico_id: string; medico_nome: string; data: string; hora: string }>;
                        setOutros(Array.isArray(r) ? r.slice(0, 6) : []);
                      }}
                    >
                      Ver outros profissionais disponíveis
                    </Button>
                  </div>
                  {outros.map((o) => (
                    <button
                      key={o.medico_id}
                      type="button"
                      className="block w-full rounded px-2 py-1 text-left hover:bg-atd-blue-tint"
                      onClick={() => {
                        setMedicoId(o.medico_id);
                        const [a, m, d] = o.data.split("-").map(Number);
                        setDia(new Date(a, m - 1, d));
                        setOutros([]);
                      }}
                    >
                      {o.medico_nome} — próxima vaga {br(o.data)} às {o.hora}
                    </button>
                  ))}
                </div>
              ) : (
                (["manha", "tarde", "noite"] as const).map((p) =>
                  porPeriodo(p).length === 0 ? null : (
                    <div key={p}>
                      <p className="text-[11px] uppercase text-atd-ink-soft">
                        {p === "manha" ? "Manhã" : p === "tarde" ? "Tarde" : "Noite"}
                      </p>
                      <div className="flex flex-wrap gap-1">
                        {porPeriodo(p).map((s) => (
                          <Button
                            key={s.inicio + s.medico_id}
                            size="sm"
                            variant={slotSel?.inicio === s.inicio && slotSel.medico_id === s.medico_id ? "default" : "outline"}
                            className="h-8 text-xs"
                            title={s.medico_nome}
                            onClick={() => setSlotSel(s)}
                          >
                            {s.hora}
                            {!medicoId && (
                              <span className="ml-1 opacity-70">
                                · {s.medico_nome.split(" ")[0]}
                              </span>
                            )}
                          </Button>
                        ))}
                      </div>
                    </div>
                  ),
                )
              )}
              {ocupados.length > 0 && (
                <p className="text-[11px] text-atd-ink-soft">
                  {ocupados.length} horário(s) já ocupado(s) nesta data.
                </p>
              )}
            </div>

            {erro && <p className="text-xs text-atd-danger-ink">{erro}</p>}
            {faltando.length > 0 && (
              <p className="text-xs text-atd-ink-soft">Para agendar, informe: {faltando.join(", ")}.</p>
            )}

            <Button
              className="w-full"
              disabled={faltando.length > 0 || !podeAgendar}
              onClick={() => {
                setErro(null);
                setEtapa("confirmar");
              }}
            >
              Revisar e confirmar
            </Button>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
