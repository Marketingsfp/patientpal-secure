/**
 * Agenda dentro da conversa, ao lado do chat (16/10/2026).
 *
 * É a MESMA agenda do ClinicaOS: lê `agendamentos` do dia com as permissões da
 * pessoa (como a tela "Escala e Horários") e desenha a mesma grade por médico
 * (`AgendaPorMedicoDia`), em modo compacto. Agendar passa pelo motor do sistema
 * (`criarAgendamento`), que ocupa a própria vaga DISPONÍVEL.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Loader2,
  RefreshCw,
  X,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DateInputBR } from "@/components/ui/date-input-br";
import {
  AgendaPorMedicoDia,
  type AgendaMedicoColuna,
  type AgendaMedicoItem,
} from "@/components/agenda/agenda-por-medico-dia";
import { useAcessoModulo } from "@/hooks/use-permissoes";
import { ehBloqueioAgenda } from "@/lib/agenda/bloqueio";
import { criarAgendamento } from "@/lib/agenda/criar-agendamento.functions";
import {
  agendamentosFuturosChat,
  catalogoAgendaChat,
  registrarAgendamentoNaConversa,
} from "@/lib/agenda/chat-agenda.functions";
import { hojeBR, janelaDiaClinica } from "@/lib/date-utils";
import { deslocarDia } from "@/lib/atendimento/dashboard-oszap-periodos";
import { normalizarNome } from "@/lib/nina/catalogo-ia";
import { AgendarHorarioDialog, type DadosAgendamentoHorario } from "./AgendarHorarioDialog";

export type PacienteDaConversa = {
  id: string;
  nome: string;
  cpf: string | null;
  telefone: string | null;
  data_nascimento: string | null;
};

type Catalogo = {
  procedimentos: Array<{ id: string; nome: string }>;
  medicos: Array<{ id: string; nome: string; ordem_chegada: boolean }>;
};

const fmtHora = (iso: string) =>
  new Intl.DateTimeFormat("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Sao_Paulo",
  }).format(new Date(iso));
const fmtData = (dia: string) => dia.split("-").reverse().join("/");
const ehLivre = (nome: string | null | undefined) =>
  ["disponivel", "bloqueio"].includes(normalizarNome(nome ?? ""));

export function AgendaConversaPainel({
  clinicaId,
  conversaId,
  paciente,
  onFechar,
  onMensagemPronta,
}: {
  clinicaId: string;
  conversaId: string;
  paciente: PacienteDaConversa;
  onFechar: () => void;
  onMensagemPronta: (texto: string) => void;
}) {
  // Nome de outros pacientes só para quem já vê a Agenda do ClinicaOS.
  const ocultarPaciente = useAcessoModulo("agenda") === "none";
  const fnCatalogo = useServerFn(catalogoAgendaChat);
  const fnFuturos = useServerFn(agendamentosFuturosChat);
  const fnCriar = useServerFn(criarAgendamento);
  const fnEvento = useServerFn(registrarAgendamentoNaConversa);

  const [dataRef, setDataRef] = useState(() => hojeBR());
  const [busca, setBusca] = useState("");
  const [medicos, setMedicos] = useState<AgendaMedicoColuna[]>([]);
  const [linhas, setLinhas] = useState<AgendaMedicoItem[]>([]);
  const [carregando, setCarregando] = useState(false);
  const [catalogo, setCatalogo] = useState<Catalogo | null>(null);
  const [futuros, setFuturos] = useState<
    Array<{ data: string; hora: string; procedimento: string | null }>
  >([]);
  const [vaga, setVaga] = useState<AgendaMedicoItem | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [feito, setFeito] = useState<string | null>(null);
  const emVoo = useRef(false);
  const fecharRef = useRef<HTMLButtonElement>(null);

  const carregar = useCallback(async () => {
    setCarregando(true);
    const { inicio, fimExclusivo } = janelaDiaClinica(dataRef);
    const [med, esp, ags] = await Promise.all([
      supabase
        .from("medicos")
        .select("id,nome,especialidade_id")
        .eq("clinica_id", clinicaId)
        .eq("ativo", true)
        .order("nome"),
      supabase.from("especialidades").select("id,nome"),
      supabase
        .from("agendamentos")
        .select("id,paciente_nome,medico_id,inicio,fim,procedimento,status")
        .eq("clinica_id", clinicaId)
        .gte("inicio", inicio)
        .lt("inicio", fimExclusivo)
        .order("inicio", { ascending: true }),
    ]);
    const nomesEsp = new Map(
      ((esp.data ?? []) as Array<{ id: string; nome: string }>).map((e) => [e.id, e.nome]),
    );
    setMedicos(
      (
        (med.data ?? []) as Array<{ id: string; nome: string; especialidade_id: string | null }>
      ).map((m) => ({
        id: m.id,
        nome: m.nome,
        especialidade_nome: m.especialidade_id ? (nomesEsp.get(m.especialidade_id) ?? null) : null,
      })),
    );
    setLinhas(
      (
        (ags.data ?? []) as Array<{
          id: string;
          paciente_nome: string | null;
          medico_id: string | null;
          inicio: string;
          fim: string;
          procedimento: string | null;
          status: string;
        }>
      ).map((a) => ({
        id: a.id,
        paciente_nome: a.paciente_nome ?? "—",
        medico_id: a.medico_id,
        inicio: a.inicio,
        fim: a.fim,
        procedimento: a.procedimento,
        status: a.status,
        // Bloqueio (médico ausente) não é vaga: aparece ocupado.
        livre: ehLivre(a.paciente_nome) && !ehBloqueioAgenda(a),
      })),
    );
    if (ags.error) toast.error("Não foi possível carregar a agenda deste dia.");
    setCarregando(false);
  }, [clinicaId, dataRef]);

  // Mesma agenda do ClinicaOS: recarrega ao abrir, ao trocar o dia e a cada 20 s.
  useEffect(() => {
    void carregar();
    const t = setInterval(() => void carregar(), 20_000);
    return () => clearInterval(t);
  }, [carregar]);

  useEffect(() => {
    fecharRef.current?.focus();
    void fnCatalogo({ data: { clinicaId } })
      .then((c) => setCatalogo(c as Catalogo))
      .catch(() => toast.error("Não foi possível carregar os procedimentos."));
    void fnFuturos({ data: { clinicaId, pacienteId: paciente.id } })
      .then((r) => setFuturos(r as typeof futuros))
      .catch(() => setFuturos([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- uma vez por paciente
  }, [clinicaId, paciente.id]);

  const colunas = useMemo(() => {
    const q = normalizarNome(busca);
    if (!q) return medicos;
    return medicos.filter(
      (m) =>
        normalizarNome(m.nome).includes(q) ||
        normalizarNome(m.especialidade_nome ?? "").includes(q),
    );
  }, [medicos, busca]);
  const itens = useMemo(() => {
    const ids = new Set(colunas.map((m) => m.id));
    return linhas.filter((a) => a.medico_id && ids.has(a.medico_id));
  }, [linhas, colunas]);

  // Mesma regra da grade: sem busca, só quem tem horários no dia (ou todos, se ninguém tiver).
  const totalProfissionais = useMemo(() => {
    if (busca.trim()) return colunas.length;
    const comHorario = new Set(itens.map((a) => a.medico_id));
    const n = colunas.filter((m) => comHorario.has(m.id)).length;
    return n || colunas.length;
  }, [busca, colunas, itens]);
  const dataPorExtenso = useMemo(
    () =>
      new Intl.DateTimeFormat("pt-BR", {
        timeZone: "UTC",
        weekday: "long",
        day: "2-digit",
        month: "long",
      }).format(new Date(`${dataRef}T00:00:00Z`)),
    [dataRef],
  );

  const medicoDaVaga = vaga ? medicos.find((m) => m.id === vaga.medico_id) : undefined;
  const ordemChegada = !!(
    vaga && catalogo?.medicos.find((m) => m.id === vaga.medico_id)?.ordem_chegada
  );
  function escolherVaga(a: AgendaMedicoItem) {
    setVaga(a);
    setErro(null);
    setFeito(null);
  }

  async function confirmar({
    procedimento,
    formaPagamentoPrevista,
    observacoes,
  }: DadosAgendamentoHorario) {
    if (emVoo.current || !vaga || !procedimento || ordemChegada) return;
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
            medico_id: vaga.medico_id,
            inicio: vaga.inicio,
            fim: vaga.fim,
            procedimento,
            status: "agendado",
            observacoes: `${observacoes ? `${observacoes}\n` : ""}Agendado pelo atendimento (conversa ${conversaId.slice(0, 8)})`,
            data_pagamento: null,
            orcamento_id: null,
            tipo_atendimento: "particular",
            forma_pagamento_prevista: formaPagamentoPrevista,
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
        if (/ocupad|disponív|conflito|23505/i.test(msg)) {
          setErro("Este horário acabou de ser ocupado. Escolha outro horário.");
          setVaga(null);
          await carregar();
        } else setErro(`${msg} Nenhuma reserva foi confirmada.`);
        return;
      }
      const quando = `${fmtData(dataRef)} às ${fmtHora(vaga.inicio)}`;
      const resumo = `${procedimento} — ${medicoDaVaga?.nome ?? "sem profissional"} — ${quando}`;
      await fnEvento({ data: { clinicaId, conversaId, agendamentoId: res.id, resumo } }).catch(
        () => undefined,
      );
      setFeito(
        `Seu agendamento foi realizado para o dia ${quando}${
          medicoDaVaga ? `, com ${medicoDaVaga.nome}` : ""
        }. Procedimento: ${procedimento}.`,
      );
      setVaga(null);
      await carregar();
    } catch (e) {
      setErro(
        `${e instanceof Error ? e.message : "Falha inesperada"}. Nenhuma reserva foi confirmada.`,
      );
    } finally {
      setSalvando(false);
      emVoo.current = false;
    }
  }

  return (
    <section
      aria-label="Agenda"
      className="oszap-agenda-painel flex h-full w-full min-w-0 flex-1 flex-col overflow-hidden rounded-xl border bg-card text-foreground"
      onKeyDown={(e) => {
        if (e.key === "Escape" && !e.defaultPrevented) {
          e.preventDefault();
          onFechar();
        }
      }}
    >
      <header className="space-y-2 border-b px-3 py-2">
        <div className="flex items-center gap-2">
          <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
            <CalendarDays className="h-4 w-4" aria-hidden />
          </span>
          <div className="flex min-w-0 flex-1 items-baseline gap-2">
            <h2 className="shrink-0 text-sm font-bold">Agenda</h2>
            <p className="truncate text-xs text-muted-foreground">
              Agendando para <span className="font-semibold text-foreground">{paciente.nome}</span>
            </p>
          </div>
          <Button
            ref={fecharRef}
            size="icon"
            variant="ghost"
            className="h-8 w-8"
            aria-label="Fechar agenda"
            onClick={onFechar}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex h-8 items-center gap-1 rounded-lg border bg-muted/40 px-1 text-xs font-semibold">
            <button
              type="button"
              aria-label="Dia anterior"
              className="grid h-6 w-6 place-items-center rounded-md hover:bg-card"
              onClick={() => setDataRef((d) => deslocarDia(d, -1))}
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              type="button"
              className="rounded-md px-2 py-0.5 hover:bg-card"
              onClick={() => setDataRef(hojeBR())}
            >
              Hoje
            </button>
            <button
              type="button"
              aria-label="Próximo dia"
              className="grid h-6 w-6 place-items-center rounded-md hover:bg-card"
              onClick={() => setDataRef((d) => deslocarDia(d, 1))}
            >
              <ChevronRight className="h-4 w-4" />
            </button>
            <DateInputBR
              aria-label="Data da agenda"
              value={dataRef}
              onChange={(e) => {
                if (e.target.value) setDataRef(e.target.value);
              }}
              className="h-6 w-[110px] border-0 bg-transparent px-1 text-xs font-semibold shadow-none focus-visible:ring-0"
            />
          </div>
          <Input
            aria-label="Buscar profissional ou especialidade"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Médico ou especialidade"
            className="h-8 w-48 min-w-0 shrink text-xs"
          />
          <Button
            size="sm"
            variant="outline"
            className="h-8"
            aria-label="Atualizar agenda"
            disabled={carregando}
            onClick={() => void carregar()}
          >
            {carregando ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5" />
            )}
          </Button>
          <span className="rounded-md bg-muted px-2 py-1 text-xs font-semibold capitalize">
            {dataPorExtenso}
          </span>
          <span className="rounded-md bg-primary/10 px-2 py-1 text-xs font-medium text-primary">
            {totalProfissionais} profissiona{totalProfissionais === 1 ? "l" : "is"}
          </span>
        </div>
        {futuros.length > 0 && (
          <p className="rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-1 text-xs">
            Este paciente já tem{" "}
            {futuros
              .map((f) => `${f.procedimento ?? "atendimento"} em ${fmtData(f.data)} às ${f.hora}`)
              .join("; ")}
            . Confira para não duplicar.
          </p>
        )}
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        <AgendaPorMedicoDia
          compacto
          // Com busca, aparece quem bate com o texto, mesmo sem horários no dia.
          incluirSemHorarios={!!busca.trim()}
          dataRef={dataRef}
          medicos={colunas}
          items={itens}
          fmtHora={fmtHora}
          ocultarPaciente={ocultarPaciente}
          mostrarResumo={false}
          onAgClick={() => {}}
          onSlotClick={escolherVaga}
        />
      </div>

      {(feito || (erro && !vaga)) && (
        <footer className="space-y-2 border-t bg-muted/30 p-3 text-sm" aria-live="polite">
          {feito && (
            <div className="space-y-2">
              <p className="flex items-center gap-2 font-semibold text-emerald-700 dark:text-emerald-400">
                <CheckCircle2 className="h-4 w-4" /> Agendamento realizado
              </p>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" onClick={() => onMensagemPronta(feito)}>
                  Levar confirmação para a mensagem
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setFeito(null)}>
                  Ok
                </Button>
              </div>
            </div>
          )}
          {erro && !vaga && (
            <p role="alert" className="text-xs text-destructive">
              {erro}
            </p>
          )}
        </footer>
      )}

      {/* Clique no horário vago: mesma janela de agendamento da Agenda, por cima. */}
      <AgendarHorarioDialog
        aberto={!!vaga}
        onFechar={() => {
          setVaga(null);
          setErro(null);
        }}
        clinicaId={clinicaId}
        pacienteNome={paciente.nome}
        medicoId={vaga?.medico_id ?? null}
        medicoNome={medicoDaVaga?.nome ?? "Profissional"}
        quando={vaga ? `${fmtData(dataRef)} às ${fmtHora(vaga.inicio)}` : ""}
        ordemChegada={ordemChegada}
        avisoDuplicidade={
          futuros.length
            ? `Este paciente já tem ${futuros
                .map((f) => `${f.procedimento ?? "atendimento"} em ${fmtData(f.data)} às ${f.hora}`)
                .join("; ")}. Confira para não duplicar.`
            : null
        }
        semNascimento={!paciente.data_nascimento}
        salvando={salvando}
        erro={vaga ? erro : null}
        onSalvar={(dados) => void confirmar(dados)}
      />
    </section>
  );
}
