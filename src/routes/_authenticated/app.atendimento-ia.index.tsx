import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Fragment, useEffect, useMemo, useState } from "react";
import {
  Stethoscope,
  AlertTriangle,
  Users,
  Check,
  X,
  DollarSign,
  Eye,
  FileText,
  Bell,
  RefreshCw,
  CalendarDays,
  Undo2,
} from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { hojeBR } from "@/lib/date-utils";
import { mostrarErro } from "@/lib/traduzir-erro";
import { idadeCompleta, tempoDesde } from "@/lib/prontuario/html";
import { gravarProntuarioDoAgendamento } from "@/lib/medico/finalizar-atendimento";
import { invalidarLinhaDoTempo } from "@/components/prontuario/linha-do-tempo-prontuario";
import { EditorProntuario } from "@/components/medico/editor-prontuario";
import { AlertasAtivosBanner, TriagemResumo } from "@/components/medico/paciente-dialogs";
import {
  BaixaAgendamentoDialog,
  OpcoesPacienteMenu,
  type MedicoFila,
} from "@/components/medico/opcoes-e-baixa";
import { supabase } from "@/integrations/supabase/client";
import { useClinica } from "@/hooks/use-clinica";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { SearchableSelect } from "@/components/ui/searchable-select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { toast } from "sonner";
import { agendamentosStatusPagamento, type StatusPagamento } from "@/lib/pagamento-status";
import { cadastroMedicoDoUsuario, isMedicoOnlyUser } from "@/lib/medico-only";
import { HistoricoProntuarioDrawer } from "@/components/prontuario/historico-prontuario-drawer";
import { numerarFichas, type LinhaParaFicha } from "@/lib/agenda/ficha-numero";

export const Route = createFileRoute("/_authenticated/app/atendimento-ia/")({
  component: AtendimentoIaPage,
  head: () => ({ meta: [{ title: "Atendimento médico — ClinicaOS" }] }),
});

type Medico = {
  id: string;
  nome: string;
  email: string | null;
  user_id: string | null;
  especialidade_id: string | null;
  especialidades?: { nome: string } | null;
  ativo?: boolean;
  tipo_repasse?: string | null;
  valor_repasse_padrao?: number | null;
  percentual_repasse_padrao?: number | null;
};
type FilaItem = {
  id: string;
  paciente_id: string | null;
  paciente_nome: string;
  inicio: string;
  fim: string | null;
  // Momento em que a ficha foi marcada. Serve de desempate quando dois
  // pacientes têm o mesmo horário (encaixe): quem foi marcado antes é
  // chamado antes.
  created_at: string | null;
  procedimento: string | null;
  fluxo_etapa: string;
  // Momento da última mudança de etapa. Para quem está "finalizado", é a hora
  // em que a médica concluiu o atendimento — o carimbo que põe em ordem quem
  // já passou pelo consultório.
  fluxo_atualizado_em: string | null;
  prioridade: "normal" | "prioritario" | "urgente";
};
type TriagemResumo = {
  agendamento_id: string;
  enfermeira_nome: string | null;
  created_at: string;
  queixa_principal: string | null;
  pa_sistolica: number | null;
  pa_diastolica: number | null;
  freq_cardiaca: number | null;
  temperatura: number | null;
  saturacao: number | null;
  glicemia: number | null;
  peso_kg: number | null;
  altura_cm: number | null;
  imc: number | null;
  doencas: string[] | null;
  medicamentos: string | null;
  alergias: string | null;
  observacoes: string | null;
};

/**
 * Data no formato "AAAA-MM-DD" pelo relógio da clínica.
 *
 * `toISOString()` devolve o horário de Greenwich: depois das 21h no Brasil
 * ele já responde o dia seguinte, e a fila do plantão da noite aparecia
 * vazia porque o sistema procurava os pacientes do dia errado.
 */
function diaLocal(d: Date): string {
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

/** Soma dias a uma data "AAAA-MM-DD" e devolve no mesmo formato. */
function somarDias(dia: string, n: number): string {
  const [a, m, d] = dia.split("-").map(Number);
  const base = new Date(a, (m ?? 1) - 1, d ?? 1);
  base.setDate(base.getDate() + n);
  return diaLocal(base);
}

/** "Sábado, 05/09/2026" — o dia da semana ajuda a conferir a escala. */
function dataPorExtenso(dia: string): string {
  const [a, m, d] = dia.split("-").map(Number);
  const data = new Date(a, (m ?? 1) - 1, d ?? 1);
  const semana = data.toLocaleDateString("pt-BR", { weekday: "long" });
  return `${semana.charAt(0).toUpperCase()}${semana.slice(1)}, ${data.toLocaleDateString("pt-BR")}`;
}

function AtendimentoIaPage() {
  const { clinicaAtual } = useClinica();
  const { user } = useAuth();
  const navigate = useNavigate();

  const [medicos, setMedicos] = useState<Medico[]>([]);
  const [fila, setFila] = useState<FilaItem[]>([]);
  const [linhasDoDia, setLinhasDoDia] = useState<LinhaParaFicha[]>([]);
  const [medicoId, setMedicoId] = useState("");
  const [triagens, setTriagens] = useState<Record<string, TriagemResumo>>({});
  const [triagensTick, setTriagensTick] = useState(0);
  const [pagamentos, setPagamentos] = useState<Record<string, StatusPagamento>>({});
  const [pagamentosTick, setPagamentosTick] = useState(0);
  // Paciente cujo histórico de prontuário está aberto na gaveta lateral.
  const [historico, setHistorico] = useState<FilaItem | null>(null);
  // Usuário com perfil só de médico cujo login ainda não foi ligado ao
  // cadastro do profissional na clínica.
  const [semVinculo, setSemVinculo] = useState(false);
  // Conta cujo único papel é "médico": vê apenas a própria fila, sem poder
  // trocar de profissional.
  const [soMedico, setSoMedico] = useState(false);
  // Dia mostrado na fila. Começa em hoje; o médico volta a dias anteriores
  // para reimprimir o que prescreveu num plantão passado.
  const [dia, setDia] = useState<string>(() => diaLocal(new Date()));
  const hojeLocal = diaLocal(new Date());

  useEffect(() => {
    (async () => {
      if (!clinicaAtual) return;
      const cid = clinicaAtual.clinica_id;
      const { data, error } = await supabase
        .from("medicos")
        .select(
          "id, nome, email, user_id, especialidade_id, ativo, tipo_repasse, valor_repasse_padrao, percentual_repasse_padrao, especialidades:especialidades!medicos_especialidade_id_fkey(nome)",
        )
        .eq("clinica_id", cid)
        .eq("ativo", true)
        .order("nome");
      if (error) {
        toast.error("Não foi possível carregar o profissional logado");
        setMedicos([]);
        return;
      }
      const ativos = ((data ?? []) as unknown as Medico[]).map((m) => ({ ...m, ativo: true }));

      // Inclui médicos inativos que ainda têm pacientes na fila do dia,
      // para que nenhum atendimento em andamento fique órfão.
      const hoje = dia;
      const { data: pendAll } = await supabase
        .from("agendamentos")
        .select("medico_id, paciente_id, paciente_nome, fluxo_etapa")
        .eq("clinica_id", cid)
        .in("fluxo_etapa", [
          "aguardando_recepcao",
          "recepcao",
          "caixa",
          "triagem",
          "atendimento",
          "finalizado",
        ])
        // Cancelar não reseta fluxo_etapa — sem este filtro um agendamento
        // cancelado contava como "fila pendente" (CRIT-09).
        .neq("status", "cancelado")
        .gte("inicio", `${hoje}T00:00:00`)
        .lte("inicio", `${hoje}T23:59:59`);
      const idsAtivos = new Set(ativos.map((m) => m.id));
      const idsExtras = Array.from(
        new Set(
          (
            (pendAll ?? []) as Array<{
              medico_id: string | null;
              paciente_id: string | null;
              paciente_nome: string | null;
            }>
          )
            .filter(
              (r) =>
                r.medico_id &&
                r.paciente_id &&
                (r.paciente_nome ?? "").toUpperCase() !== "DISPONIVEL" &&
                (r.paciente_nome ?? "").toUpperCase() !== "DISPONÍVEL",
            )
            .map((r) => r.medico_id as string)
            .filter((id) => !idsAtivos.has(id)),
        ),
      );
      let inativos: Medico[] = [];
      if (idsExtras.length > 0) {
        const { data: extras } = await supabase
          .from("medicos")
          .select(
            "id, nome, email, user_id, especialidade_id, ativo, tipo_repasse, valor_repasse_padrao, percentual_repasse_padrao, especialidades:especialidades!medicos_especialidade_id_fkey(nome)",
          )
          .in("id", idsExtras);
        inativos = ((extras ?? []) as unknown as Medico[]).map((m) => ({ ...m, ativo: false }));
      }
      const meds = [...ativos, ...inativos].sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
      setMedicos(meds);
      const emailLogado = user?.email?.toLowerCase() ?? null;
      const meu = user?.id
        ? (meds.find((x) => x.user_id === user.id) ??
          (emailLogado ? meds.find((x) => x.email?.toLowerCase() === emailLogado) : null))
        : null;
      // Conta que é SÓ médico e não achou o próprio cadastro: em vez de abrir
      // a fila de um colega qualquer (o primeiro da lista), a tela avisa que
      // falta o vínculo. Um médico nunca deve cair na fila de outro por acaso.
      const soMedico = user?.id ? await isMedicoOnlyUser(user.id) : false;
      setSoMedico(soMedico);
      // A lista acima só traz os médicos ativos (mais os inativos com fila
      // hoje). Um profissional cujo cadastro está inativo não se encontraria
      // nela e veria a tela como se não tivesse vínculo nenhum — por isso o
      // cadastro dele é procurado à parte e entra na lista.
      let meuCadastro: { id: string; nome: string } | null = meu
        ? { id: meu.id, nome: meu.nome }
        : null;
      if (!meuCadastro && soMedico) {
        meuCadastro = await cadastroMedicoDoUsuario(cid);
        if (meuCadastro) {
          const eu: Medico = {
            id: meuCadastro.id,
            nome: meuCadastro.nome,
            email: null,
            user_id: user?.id ?? null,
            especialidade_id: null,
            ativo: false,
          };
          setMedicos([...meds, eu].sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR")));
        }
      }
      setSemVinculo(!meuCadastro && soMedico);
      if (meuCadastro) setMedicoId(meuCadastro.id);
      else if (soMedico) setMedicoId("");
      else if (meds.length && !medicoId) {
        const comFila = (
          (pendAll ?? []) as Array<{ medico_id: string | null; fluxo_etapa: string }>
        ).find(
          (r) => r.medico_id && (r.fluxo_etapa === "triagem" || r.fluxo_etapa === "atendimento"),
        )?.medico_id as string | undefined;
        const escolhido = comFila && meds.find((x) => x.id === comFila) ? comFila : meds[0].id;
        setMedicoId(escolhido);
      }
    })();
  }, [clinicaAtual?.clinica_id, user?.id, user?.email, dia]);

  const medicoSelecionado = useMemo(
    () => medicos.find((x) => x.id === medicoId) ?? null,
    [medicos, medicoId],
  );
  const medicoLogado = Boolean(
    medicoSelecionado &&
    user &&
    (medicoSelecionado.user_id === user.id ||
      medicoSelecionado.email?.toLowerCase() === user.email?.toLowerCase()),
  );
  const especialidadeMedico = medicoSelecionado?.especialidades?.nome ?? "";

  const carregarFila = async (medId: string) => {
    if (!clinicaAtual || !medId) {
      setFila([]);
      return;
    }
    const hoje = dia;
    const { data } = await supabase
      .from("agendamentos")
      .select(
        "id, paciente_id, paciente_nome, inicio, fim, created_at, procedimento, fluxo_etapa, fluxo_atualizado_em, prioridade",
      )
      .eq("clinica_id", clinicaAtual.clinica_id)
      .eq("medico_id", medId)
      .gte("inicio", `${hoje}T00:00:00`)
      .lte("inicio", `${hoje}T23:59:59`)
      .in("fluxo_etapa", [
        "aguardando_recepcao",
        "recepcao",
        "caixa",
        "triagem",
        "atendimento",
        "finalizado",
      ])
      // Cancelar não reseta fluxo_etapa — sem este filtro um agendamento
      // cancelado continuava aparecendo na fila do médico (CRIT-09).
      .neq("status", "cancelado")
      .order("inicio");
    setFila(
      ((data ?? []) as unknown as FilaItem[]).filter(
        (item) => item.paciente_id && item.paciente_nome !== "DISPONÍVEL",
      ),
    );

    // Consulta SÓ para numerar a ficha. A ficha da Agenda é POSICIONAL dentro
    // de (dia, profissional, agenda), então precisa de TODAS as linhas do dia
    // do médico — inclusive vagas livres ("DISPONIVEL") e canceladas. A
    // consulta da fila acima não serve: ela filtra status, fluxo_etapa e
    // linhas sem paciente, o que desloca a numeração.
    const { data: todasDoDia } = await supabase
      .from("agendamentos")
      .select("id, inicio, paciente_nome, medico_id, agenda_id")
      .eq("clinica_id", clinicaAtual.clinica_id)
      .eq("medico_id", medId)
      .gte("inicio", `${hoje}T00:00:00`)
      .lte("inicio", `${hoje}T23:59:59`)
      .order("inicio");
    setLinhasDoDia((todasDoDia ?? []) as unknown as LinhaParaFicha[]);
  };

  useEffect(() => {
    void carregarFila(medicoId);
  }, [medicoId, clinicaAtual?.clinica_id, dia]);

  const filaIdsKey = fila.map((f) => f.id).join(",");
  useEffect(() => {
    let cancel = false;
    (async () => {
      const ids = fila.map((f) => f.id);
      if (ids.length === 0) {
        setTriagens({});
        return;
      }
      const { data } = await supabase
        .from("triagens_enfermagem")
        .select(
          "agendamento_id, enfermeira_nome, created_at, queixa_principal, pa_sistolica, pa_diastolica, freq_cardiaca, temperatura, saturacao, glicemia, peso_kg, altura_cm, imc, doencas, medicamentos, alergias, observacoes",
        )
        .in("agendamento_id", ids)
        .order("created_at", { ascending: false });
      if (cancel) return;
      const map: Record<string, TriagemResumo> = {};
      for (const row of (data ?? []) as unknown as TriagemResumo[]) {
        if (!map[row.agendamento_id]) map[row.agendamento_id] = row;
      }
      setTriagens(map);
    })();
    return () => {
      cancel = true;
    };
  }, [filaIdsKey, triagensTick]);

  useEffect(() => {
    let cancel = false;
    (async () => {
      const ids = fila.map((f) => f.id);
      if (ids.length === 0) {
        setPagamentos({});
        return;
      }
      const map = await agendamentosStatusPagamento(ids);
      if (cancel) return;
      const obj: Record<string, StatusPagamento> = {};
      map.forEach((v, k) => {
        obj[k] = v;
      });
      setPagamentos(obj);
    })();
    return () => {
      cancel = true;
    };
  }, [filaIdsKey, pagamentosTick]);

  useEffect(() => {
    if (!clinicaAtual || !medicoId) return;
    const ch = supabase
      .channel(`atend-fila-${medicoId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "agendamentos", filter: `medico_id=eq.${medicoId}` },
        () => {
          void carregarFila(medicoId);
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "triagens_enfermagem" },
        () => {
          setTriagensTick((t) => t + 1);
        },
      )
      .on("postgres_changes", { event: "*", schema: "public", table: "fin_lancamentos" }, () => {
        setPagamentosTick((t) => t + 1);
      })
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "agendamento_orcamento_itens" },
        () => {
          setPagamentosTick((t) => t + 1);
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(ch);
    };
  }, [medicoId, clinicaAtual?.clinica_id, dia]);

  /**
   * Ordem de espera dentro de um mesmo grupo: estritamente o horário marcado.
   *
   * Antes a lista era reordenada por prioridade — um caso marcado como urgente
   * subia para o topo e a coluna "#" aparecia fora de ordem (1, 5, 2…), como se
   * a numeração estivesse se recalculando sozinha. A prioridade continua
   * sinalizada na coluna própria, mas não muda mais o lugar do paciente na fila.
   *
   * Empate de horário (encaixe) é desempatado pela ordem em que a ficha foi
   * marcada, e o `id` fecha o critério para a ordem nunca oscilar entre uma
   * atualização e outra.
   */
  const ordemDeChamada = (a: FilaItem, b: FilaItem) =>
    a.inicio.localeCompare(b.inicio) ||
    (a.created_at ?? "").localeCompare(b.created_at ?? "") ||
    a.id.localeCompare(b.id);

  /**
   * A Agenda é a referência única. A tela do médico é UMA tabela só, em ordem
   * estrita do horário do agendamento. Pagamento não muda ordem nem número:
   * quem está com o caixa pendente fica na posição dele, com o número dele, e
   * só recebe o selo "$ PENDENTE" na coluna de pagamento.
   */
  const listaVisivel = useMemo(() => [...fila].sort(ordemDeChamada), [fila]);

  /**
   * A coluna "#" é a FICHA DA AGENDA — o mesmo número da guia impressa. Não é
   * contagem de linhas da tela: vem de `numerarFichas`, a fonte única usada
   * pela Agenda, alimentada com todas as linhas do dia daquele médico.
   */
  const numeroNoDia = useMemo(() => numerarFichas(linhasDoDia), [linhasDoDia]);

  // Contagens do cabeçalho, só informativas: a tabela é uma só e ninguém é
  // separado por pagamento.
  const atendidos = useMemo(() => fila.filter((it) => it.fluxo_etapa === "finalizado"), [fila]);
  const emEspera = useMemo(() => fila.filter((it) => it.fluxo_etapa !== "finalizado"), [fila]);
  const aguardandoPagamento = useMemo(
    () => fila.filter((it) => it.fluxo_etapa !== "finalizado" && !pagamentos[it.id]?.pago),
    [fila, pagamentos],
  );

  // ---------------- Agenda do Profissional (abas, contadores, ações) ----------------

  const qc = useQueryClient();
  const [aba, setAba] = useState<"atendimento" | "aguardando" | "atendidos">("aguardando");
  const [ordem, setOrdem] = useState<"chegada" | "prioridade">("chegada");
  const [segundos, setSegundos] = useState(60);
  const [agora, setAgora] = useState(() => Date.now());
  const [pacInfo, setPacInfo] = useState<
    Record<string, { data_nascimento: string | null; numero_pasta: string | null }>
  >({});
  const [aberto, setAberto] = useState<string | null>(null);
  const [rascunho, setRascunho] = useState<Record<string, string>>({});
  const [salvandoId, setSalvandoId] = useState<string | null>(null);
  const [baixa, setBaixa] = useState<FilaItem | null>(null);
  const [estorno, setEstorno] = useState<FilaItem | null>(null);
  const [chamandoId, setChamandoId] = useState<string | null>(null);
  const [consultorio, setConsultorio] = useState("");

  useEffect(() => {
    try {
      setConsultorio(localStorage.getItem("medico-consultorio") ?? "");
    } catch {
      /* ok */
    }
  }, []);

  // Atualização automática a cada 60 s, com contador visível.
  useEffect(() => {
    const t = setInterval(() => {
      setAgora(Date.now());
      setSegundos((s) => {
        if (s <= 1) {
          void carregarFila(medicoId);
          setPagamentosTick((x) => x + 1);
          setTriagensTick((x) => x + 1);
          return 60;
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(t);
  }, [medicoId, dia, clinicaAtual?.clinica_id]);

  // Pasta e data de nascimento dos pacientes da fila.
  const pacIdsKey = [...new Set(fila.map((f) => f.paciente_id).filter(Boolean))].sort().join(",");
  useEffect(() => {
    const ids = pacIdsKey ? pacIdsKey.split(",") : [];
    if (!ids.length) return;
    void (async () => {
      const { data } = await supabase
        .from("pacientes")
        .select("id, data_nascimento, numero_pasta")
        .in("id", ids);
      const m: Record<string, { data_nascimento: string | null; numero_pasta: string | null }> = {};
      for (const p of (data ?? []) as Array<{
        id: string;
        data_nascimento: string | null;
        numero_pasta: string | null;
      }>)
        m[p.id] = { data_nascimento: p.data_nascimento, numero_pasta: p.numero_pasta };
      setPacInfo(m);
    })();
  }, [pacIdsKey]);

  const emAtendimento = useMemo(
    () => listaVisivel.filter((it) => it.fluxo_etapa === "atendimento"),
    [listaVisivel],
  );
  const aguardando = useMemo(() => {
    const l = listaVisivel.filter(
      (it) => it.fluxo_etapa !== "atendimento" && it.fluxo_etapa !== "finalizado",
    );
    if (ordem === "prioridade") {
      const peso = { urgente: 0, prioritario: 1, normal: 2 } as const;
      return [...l].sort((a, b) => peso[a.prioridade] - peso[b.prioridade] || ordemDeChamada(a, b));
    }
    return l;
  }, [listaVisivel, ordem]);
  const atendidosLista = useMemo(
    () => listaVisivel.filter((it) => it.fluxo_etapa === "finalizado"),
    [listaVisivel],
  );

  // Rascunho do editor na fila: carrega o prontuário já gravado do agendamento
  // exibido (aberto ou o primeiro da lista) e do que está em baixa, para que
  // salvar/baixar nunca sobrescreva o texto já gravado com um editor vazio.
  const idEditor = (emAtendimento.find((x) => x.id === aberto) ?? emAtendimento[0])?.id ?? null;
  useEffect(() => {
    for (const id of [idEditor, baixa?.id ?? null]) {
      if (!id || rascunho[id] !== undefined) continue;
      void (async () => {
        const { data, error } = await supabase
          .from("prontuarios")
          .select("historia_doenca")
          .eq("agendamento_id", id)
          .order("created_at", { ascending: true })
          .limit(1)
          .maybeSingle();
        if (error) return; // sem confirmar o texto gravado, o editor segue bloqueado
        setRascunho((r) =>
          r[id] !== undefined ? r : { ...r, [id]: (data?.historia_doenca as string | null) ?? "" },
        );
      })();
    }
  }, [idEditor, baixa?.id]);

  async function chamar(item: FilaItem) {
    if (!clinicaAtual || chamandoId) return;
    const pag = pagamentos[item.id];
    if (pag && !pag.pago) {
      toast.error("Pagamento pendente — envie o paciente ao caixa antes de chamar.");
      return;
    }
    setChamandoId(item.id);
    try {
      const hoje = hojeBR();
      const { data: ult } = await supabase
        .from("senhas")
        .select("numero")
        .eq("clinica_id", clinicaAtual.clinica_id)
        .eq("data_dia", hoje)
        .eq("tipo", "C")
        .order("numero", { ascending: false })
        .limit(1)
        .maybeSingle();
      const nomeCurto = item.paciente_nome
        .split(/\s+/)
        .slice(0, 2)
        .join(" ")
        .toUpperCase()
        .slice(0, 24);
      const sala = consultorio.trim()
        ? `Consultório ${consultorio.trim()}`
        : `Consultório · ${medicoSelecionado?.nome ?? ""}`.trim();
      const { error } = await supabase.from("senhas").insert({
        clinica_id: clinicaAtual.clinica_id,
        tipo: "C",
        numero: Math.min(9999, (ult?.numero ?? 0) + 1),
        codigo: nomeCurto,
        status: "chamada",
        paciente_id: item.paciente_id,
        guiche: sala,
        chamada_em: new Date().toISOString(),
      } as never);
      if (error) mostrarErro(error);
      else toast.success(`Chamando ${nomeCurto} · ${sala}`);
    } finally {
      setChamandoId(null);
    }
  }

  async function atenderNaFila(item: FilaItem) {
    const pag = pagamentos[item.id];
    if (pag && !pag.pago) {
      toast.error("Pagamento pendente — envie ao caixa antes do atendimento.");
      return;
    }
    const { error } = await supabase
      .from("agendamentos")
      .update({
        fluxo_etapa: "atendimento",
        fluxo_atualizado_em: new Date().toISOString(),
      } as never)
      .eq("id", item.id);
    if (error) return mostrarErro(error);
    setAba("atendimento");
    setAberto(item.id);
    void carregarFila(medicoId);
  }

  async function salvarRascunho(item: FilaItem) {
    if (!clinicaAtual || !item.paciente_id) return;
    const html = rascunho[item.id] ?? "";
    if (!html.trim()) return toast.error("Escreva o prontuário antes de salvar.");
    setSalvandoId(item.id);
    try {
      await gravarProntuarioDoAgendamento({
        clinicaId: clinicaAtual.clinica_id,
        pacienteId: item.paciente_id,
        medicoId: medicoId || null,
        agendamentoId: item.id,
        html,
      });
      void invalidarLinhaDoTempo(qc, item.paciente_id);
      toast.success("Prontuário salvo");
    } catch (e) {
      mostrarErro(e as Error);
    } finally {
      setSalvandoId(null);
    }
  }

  async function confirmarEstorno() {
    if (!estorno) return;
    // Decisão da clínica: volta para Aguardando, mantém o prontuário e não
    // mexe no financeiro.
    const { error } = await supabase
      .from("agendamentos")
      .update({
        fluxo_etapa: "triagem",
        status: "confirmado",
        fluxo_atualizado_em: new Date().toISOString(),
      } as never)
      .eq("id", estorno.id);
    if (error) mostrarErro(error);
    else toast.success("Atendimento estornado — paciente voltou para Aguardando");
    setEstorno(null);
    void carregarFila(medicoId);
  }

  function atender(item: FilaItem) {
    navigate({ to: "/app/atendimento-ia/$agendamentoId", params: { agendamentoId: item.id } });
  }

  const medicoFila: MedicoFila | null = medicoSelecionado
    ? {
        id: medicoSelecionado.id,
        nome: medicoSelecionado.nome,
        tipo_repasse: medicoSelecionado.tipo_repasse,
        valor_repasse_padrao: medicoSelecionado.valor_repasse_padrao,
        percentual_repasse_padrao: medicoSelecionado.percentual_repasse_padrao,
      }
    : null;

  const celulasBase = (it: FilaItem) => {
    const info = it.paciente_id ? pacInfo[it.paciente_id] : undefined;
    return (
      <>
        <TableCell className="tabular-nums font-semibold">{numeroNoDia.get(it.id) ?? ""}</TableCell>
        <TableCell className="tabular-nums text-xs">
          {new Date(it.inicio).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
        </TableCell>
        <TableCell className="text-xs">{info?.numero_pasta ?? "—"}</TableCell>
        <TableCell>
          <div className="flex items-center gap-1 font-medium uppercase">
            {it.paciente_nome}
            {it.prioridade !== "normal" && (
              <Badge variant="destructive" className="text-[10px]">
                {it.prioridade === "urgente" ? "URGENTE" : "PRIORITÁRIO"}
              </Badge>
            )}
          </div>
          <div className="text-[11px] text-muted-foreground">
            {idadeCompleta(info?.data_nascimento)}
          </div>
        </TableCell>
        <TableCell className="hidden text-xs md:table-cell">{especialidadeMedico || "—"}</TableCell>
        <TableCell className="text-xs">{it.procedimento ?? "—"}</TableCell>
      </>
    );
  };

  const cabecalhoBase = (
    <>
      <TableHead className="w-12">Ficha</TableHead>
      <TableHead className="w-16">Horário</TableHead>
      <TableHead className="w-16">Pasta</TableHead>
      <TableHead>Cliente</TableHead>
      <TableHead className="hidden md:table-cell">Serviço</TableHead>
      <TableHead>Procedimento</TableHead>
    </>
  );

  const vazio = (cols: number, txt: string) => (
    <TableRow>
      <TableCell colSpan={cols} className="py-6 text-center text-sm text-muted-foreground">
        {txt}
      </TableCell>
    </TableRow>
  );

  return (
    <div className="space-y-4 p-1">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Stethoscope className="h-6 w-6 text-primary" />
          <div>
            <h1 className="text-xl font-semibold">Agenda do Profissional</h1>
            <p className="text-sm font-medium uppercase text-muted-foreground">
              {medicoSelecionado?.nome ?? "—"}
              {especialidadeMedico ? ` · ${especialidadeMedico}` : ""}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span
            className="flex items-center gap-1 text-xs text-muted-foreground"
            aria-live="polite"
          >
            <RefreshCw className="h-3.5 w-3.5" /> Atualiza: {segundos} seg.
          </span>
          <Button variant="outline" size="sm" onClick={() => navigate({ to: "/app/agenda" })}>
            <CalendarDays className="h-4 w-4" /> Visualizar agenda geral
          </Button>
        </div>
      </div>

      {semVinculo && (
        <Card className="flex items-start gap-3 border-amber-300 bg-amber-50 p-4 text-sm dark:border-amber-900/60 dark:bg-amber-950/30">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
          <div>
            <div className="font-medium">Seu login ainda não está ligado ao seu cadastro.</div>
            <p className="text-muted-foreground">
              Por isso a fila abre vazia. Peça à clínica para abrir Cadastros → Médicos, editar o
              seu cadastro e ligar o seu usuário do sistema a ele.
            </p>
          </div>
        </Card>
      )}

      <div className="grid grid-cols-3 gap-3">
        <Card className="p-3">
          <div className="text-xs uppercase text-muted-foreground">Agendamentos</div>
          <div className="text-2xl font-bold tabular-nums">{fila.length}</div>
        </Card>
        <Card className="border-amber-300 p-3 dark:border-amber-900/60">
          <div className="text-xs uppercase text-amber-700 dark:text-amber-400">Aguardando</div>
          <div className="text-2xl font-bold tabular-nums text-amber-700 dark:text-amber-400">
            {emEspera.length}
          </div>
        </Card>
        <Card className="border-emerald-300 p-3 dark:border-emerald-900/60">
          <div className="text-xs uppercase text-emerald-700 dark:text-emerald-400">Atendidos</div>
          <div className="text-2xl font-bold tabular-nums text-emerald-700 dark:text-emerald-400">
            {atendidos.length}
          </div>
        </Card>
      </div>

      <Card className="space-y-3 p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-64 space-y-1">
            <Label>Profissional</Label>
            {soMedico || (medicoLogado && medicoSelecionado) ? (
              <div className="rounded-md border bg-muted/30 px-3 py-2 text-sm font-medium uppercase">
                {medicoSelecionado?.nome ?? "—"}
              </div>
            ) : (
              <SearchableSelect
                options={medicos.map((m) => ({
                  value: m.id,
                  label: `${m.nome.toUpperCase()}${m.ativo === false ? " (INATIVO)" : ""}`,
                }))}
                value={medicoId}
                onChange={setMedicoId}
                placeholder="Selecione…"
                searchPlaceholder="Buscar médico…"
                emptyText="Nenhum médico encontrado."
              />
            )}
          </div>
          <div className="flex items-center gap-1">
            <Button size="sm" variant="outline" onClick={() => setDia(somarDias(dia, -1))}>
              Ontem
            </Button>
            <Button
              size="sm"
              variant={dia === hojeLocal ? "default" : "outline"}
              onClick={() => setDia(hojeLocal)}
            >
              Hoje
            </Button>
            <Button size="sm" variant="outline" onClick={() => setDia(somarDias(dia, 1))}>
              Amanhã
            </Button>
          </div>
          <Input
            type="date"
            value={dia}
            onChange={(e) => e.target.value && setDia(e.target.value)}
            className="h-9 w-42"
            aria-label="Data da fila"
          />
          <span className="text-sm font-medium">{dataPorExtenso(dia)}</span>
          <div className="space-y-1">
            <Label htmlFor="consultorio">Consultório (para o painel)</Label>
            <Input
              id="consultorio"
              className="h-9 w-32"
              value={consultorio}
              onChange={(e) => {
                setConsultorio(e.target.value);
                try {
                  localStorage.setItem("medico-consultorio", e.target.value);
                } catch {
                  /* ok */
                }
              }}
              placeholder="Ex.: 3"
            />
          </div>
        </div>

        <Tabs value={aba} onValueChange={(v) => setAba(v as typeof aba)}>
          <TabsList>
            <TabsTrigger value="atendimento">Em Atendimento ({emAtendimento.length})</TabsTrigger>
            <TabsTrigger value="aguardando">Aguardando ({aguardando.length})</TabsTrigger>
            <TabsTrigger value="atendidos">Atendidos ({atendidosLista.length})</TabsTrigger>
          </TabsList>

          {/* ---------------- Em Atendimento ---------------- */}
          <TabsContent value="atendimento" className="space-y-3">
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    {cabecalhoBase}
                    <TableHead className="w-20 text-center">Opções</TableHead>
                    <TableHead className="w-20 text-center">Baixar</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {emAtendimento.length === 0 && vazio(8, "Nenhum paciente em atendimento.")}
                  {emAtendimento.map((it) => (
                    <TableRow
                      key={it.id}
                      className={`cursor-pointer ${aberto === it.id ? "bg-primary/5" : ""}`}
                      onClick={() => setAberto(it.id)}
                    >
                      {celulasBase(it)}
                      <TableCell className="text-center" onClick={(e) => e.stopPropagation()}>
                        {clinicaAtual && it.paciente_id && (
                          <OpcoesPacienteMenu
                            item={{ ...it, paciente_id: it.paciente_id }}
                            clinicaId={clinicaAtual.clinica_id}
                            medico={medicoFila}
                            triagem={triagens[it.id]}
                          />
                        )}
                      </TableCell>
                      <TableCell className="text-center" onClick={(e) => e.stopPropagation()}>
                        <Button
                          size="icon"
                          className="h-8 w-8 bg-emerald-600 text-white hover:bg-emerald-700"
                          onClick={() => setBaixa(it)}
                          aria-label={`Dar baixa em ${it.paciente_nome}`}
                          title="Baixar (finalizar atendimento)"
                        >
                          <Check className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {(() => {
              const it = emAtendimento.find((x) => x.id === aberto) ?? emAtendimento[0];
              if (!it) return null;
              return (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="text-sm font-semibold uppercase">{it.paciente_nome}</div>
                    <Button size="sm" variant="ghost" onClick={() => atender(it)}>
                      <Eye className="h-4 w-4" /> Abrir consulta completa
                    </Button>
                  </div>
                  <AlertasAtivosBanner pacienteId={it.paciente_id} />
                  <Card className="p-3">
                    <div className="mb-1 text-sm font-medium">Triagem</div>
                    <TriagemResumo t={triagens[it.id]} />
                  </Card>
                  <div className="space-y-1">
                    <div className="text-sm font-medium">Prontuário</div>
                    <EditorProntuario
                      value={rascunho[it.id] ?? ""}
                      onChange={(v) => setRascunho((r) => ({ ...r, [it.id]: v }))}
                    />
                    <div className="flex justify-end gap-2">
                      <Button
                        variant="outline"
                        onClick={() => salvarRascunho(it)}
                        disabled={salvandoId === it.id}
                      >
                        Salvar prontuário
                      </Button>
                      <Button
                        onClick={() => setBaixa(it)}
                        className="bg-emerald-600 text-white hover:bg-emerald-700"
                      >
                        <Check className="h-4 w-4" /> Baixar
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })()}
          </TabsContent>

          {/* ---------------- Aguardando ---------------- */}
          <TabsContent value="aguardando" className="space-y-2">
            <div className="flex items-center gap-2 text-sm">
              <span className="text-muted-foreground">Ordenar por:</span>
              <Button
                size="sm"
                variant={ordem === "chegada" ? "default" : "outline"}
                onClick={() => setOrdem("chegada")}
              >
                Chegada
              </Button>
              <Button
                size="sm"
                variant={ordem === "prioridade" ? "default" : "outline"}
                onClick={() => setOrdem("prioridade")}
              >
                Prioridade
              </Button>
            </div>
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    {cabecalhoBase}
                    <TableHead className="hidden lg:table-cell">Profissional</TableHead>
                    <TableHead className="w-20">Espera</TableHead>
                    <TableHead className="w-56 text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {aguardando.length === 0 && vazio(9, "Ninguém aguardando.")}
                  {aguardando.map((it) => {
                    const pag = pagamentos[it.id];
                    const pendente = Boolean(pag && !pag.pago);
                    return (
                      <TableRow
                        key={it.id}
                        className={pendente ? "border-l-4 border-l-amber-400" : ""}
                      >
                        {celulasBase(it)}
                        <TableCell className="hidden text-xs uppercase lg:table-cell">
                          {medicoSelecionado?.nome ?? "—"}
                        </TableCell>
                        <TableCell className="text-xs tabular-nums">
                          {tempoDesde(it.fluxo_atualizado_em ?? it.created_at, agora)}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            {pendente && (
                              <Badge className="border-0 bg-amber-100 text-[11px] text-amber-800 dark:bg-amber-900/40 dark:text-amber-200">
                                <DollarSign className="h-3 w-3" /> PENDENTE
                              </Badge>
                            )}
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => chamar(it)}
                              disabled={pendente || chamandoId === it.id}
                              title="Chamar o paciente no painel/TV"
                            >
                              <Bell className="h-3.5 w-3.5" /> Chamar
                            </Button>
                            <Button
                              size="sm"
                              className="bg-emerald-600 text-white hover:bg-emerald-700"
                              onClick={() => atenderNaFila(it)}
                              disabled={pendente}
                              title={
                                pendente
                                  ? "Pagamento pendente — envie ao caixa antes do atendimento"
                                  : undefined
                              }
                            >
                              <Stethoscope className="h-3.5 w-3.5" /> Atender
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </TabsContent>

          {/* ---------------- Atendidos ---------------- */}
          <TabsContent value="atendidos">
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    {cabecalhoBase}
                    <TableHead className="w-20 text-center">Opções</TableHead>
                    <TableHead className="w-56 text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {atendidosLista.length === 0 && vazio(8, "Nenhum atendimento finalizado.")}
                  {atendidosLista.map((it) => (
                    <TableRow
                      key={it.id}
                      className="border-l-4 border-l-green-600 bg-green-50 dark:bg-green-950/30"
                    >
                      {celulasBase(it)}
                      <TableCell className="text-center">
                        {clinicaAtual && it.paciente_id && (
                          <OpcoesPacienteMenu
                            item={{ ...it, paciente_id: it.paciente_id }}
                            clinicaId={clinicaAtual.clinica_id}
                            medico={medicoFila}
                            triagem={triagens[it.id]}
                          />
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => atender(it)}
                            title="Reabrir para conferir ou imprimir segunda via"
                          >
                            <Eye className="h-3.5 w-3.5" /> Ver
                          </Button>
                          <Button size="sm" variant="destructive" onClick={() => setEstorno(it)}>
                            <Undo2 className="h-3.5 w-3.5" /> Estornar
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </TabsContent>
        </Tabs>
      </Card>

      {baixa && clinicaAtual && baixa.paciente_id && (
        <BaixaAgendamentoDialog
          open
          onOpenChange={(v) => !v && setBaixa(null)}
          item={{ ...baixa, paciente_id: baixa.paciente_id }}
          clinicaId={clinicaAtual.clinica_id}
          filial={clinicaAtual.clinica.nome}
          medico={medicoFila}
          pago={!pagamentos[baixa.id] || Boolean(pagamentos[baixa.id]?.pago)}
          htmlInicial={rascunho[baixa.id] ?? ""}
          onConcluido={() => {
            setRascunho((r) => {
              const n = { ...r };
              delete n[baixa.id];
              return n;
            });
            setAba("atendidos");
            void carregarFila(medicoId);
          }}
        />
      )}

      <AlertDialog open={Boolean(estorno)} onOpenChange={(v) => !v && setEstorno(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Estornar atendimento</AlertDialogTitle>
            <AlertDialogDescription>
              Você tem certeza que deseja estornar o atendimento do(a) paciente{" "}
              {estorno?.paciente_nome}? Ele volta para Aguardando. O prontuário escrito é mantido e
              o financeiro não é alterado.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Não, manter atendimento</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmarEstorno}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Sim, estornar atendimento
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <HistoricoProntuarioDrawer
        aberto={Boolean(historico)}
        onOpenChange={(v) => {
          if (!v) setHistorico(null);
        }}
        pacienteId={historico?.paciente_id ?? null}
        pacienteNome={historico?.paciente_nome ?? ""}
        clinicaId={clinicaAtual?.clinica_id ?? null}
        agendamentoAtualId={historico?.id ?? null}
      />
    </div>
  );
}
