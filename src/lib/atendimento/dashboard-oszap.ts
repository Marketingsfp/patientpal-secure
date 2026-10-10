import { janelaDiaClinica } from "@/lib/date-utils";
import {
  diasDoPeriodo,
  periodoComparacao,
  type PeriodoDashboard,
} from "./dashboard-oszap-periodos";

export type ConversaDashboard = {
  id: string;
  created_at: string;
  status: string;
  departamento_id: string | null;
  atribuida_user_id: string | null;
  awaiting_patient_since: string | null;
  aguardando_desde: string | null;
  inbox_entrada_em: string | null;
  assigned_at: string | null;
  ultima_msg_em: string | null;
  unread_count: number | null;
  sentimento: string | null;
};
export type MensagemDashboard = {
  id: string;
  created_at: string;
  conversa_id: string | null;
  direction: string;
  enviada_por: string | null;
  enviada_por_user_id: string | null;
  status: string | null;
};
export type EventoDashboard = {
  id: string;
  created_at: string;
  conversa_id: string;
  evento: string;
  user_id: string | null;
};
export type ExecucaoNinaDashboard = {
  created_at: string;
  conversation_id: string | null;
  success: boolean;
  handoff: boolean;
  latency_ms: number | null;
  input_tokens: number | null;
  output_tokens: number | null;
  model: string | null;
  perfil: string | null;
  error_category: string | null;
};
export type EntradaDashboard = {
  periodo: PeriodoDashboard;
  agora: Date;
  /** Conversas reais abertas agora (Nina, fila ou atendimento humano). */
  abertas: ConversaDashboard[];
  /** Conversas reais criadas no período ou no período anterior. */
  criadas: ConversaDashboard[];
  /** Mensagens reais do período anterior até o fim do período. */
  mensagens: MensagemDashboard[];
  /** Eventos de conversas reais do período anterior até o fim do período. */
  eventos: EventoDashboard[];
  /** Eventos e respostas posteriores, só das conversas que entraram na fila ou foram assumidas. */
  seguintes: { eventos: EventoDashboard[]; mensagens: MensagemDashboard[] };
  avaliacoes: {
    respondida_em: string | null;
    nota: number | null;
    atendente_user_id: string | null;
  }[];
  transferencias: { created_at: string; para_departamento_id: string | null }[];
  departamentos: { id: string; nome: string }[];
  presencas: { user_id: string; status: string; estado_manual: string | null }[];
  pausas: {
    user_id: string;
    reason_id: string | null;
    iniciada_em: string;
    finalizada_em: string | null;
  }[];
  motivosPausa: { id: string; nome: string }[];
  nomes: Map<string, string>;
  /** Atendentes: perfil telefonia ativo na clínica (admin em vínculo duplo fica fora). */
  telefonia: Set<string>;
  nina: ExecucaoNinaDashboard[] | null;
  francisco: { etapa: string; status: string; respondido_em: string | null }[] | null;
  webhook: { recebido_em: string; resultado: string | null }[] | null;
};

export const METRICAS_DASHBOARD = [
  "conversasNovas",
  "mensagensRecebidas",
  "respostasEquipe",
  "respostasNina",
  "encaminhadas",
  "assumidas",
  "finalizadas",
  "transferencias",
  "conversasRespondidas",
  "esperaFilaMin",
  "primeiraRespostaMin",
  "tempoAteEncerrarMin",
  "avaliacoes",
  "notaMedia",
] as const;
export type MetricaDashboard = (typeof METRICAS_DASHBOARD)[number];

export const CAMPOS_DIA = [
  "recebidas",
  "respostasEquipe",
  "respostasNina",
  "conversasNovas",
  "encaminhadas",
  "finalizadas",
  "transferencias",
  "ninaExecucoes",
  "ninaFalhas",
  "ninaEncaminhamentos",
  "ninaLatenciaSomaMs",
  "ninaLatenciaMedidas",
  "avisosProcessados",
  "avisosAssinatura",
  "avisosPendentes",
  "avisosErros",
  "enviosOk",
  "enviosFalha",
] as const;
export type CampoDia = (typeof CAMPOS_DIA)[number];
export const diaVazio = () =>
  Object.fromEntries(CAMPOS_DIA.map((c) => [c, 0])) as Record<CampoDia, number>;

const TZ = "America/Sao_Paulo";
const fmtDia = new Intl.DateTimeFormat("en-CA", {
  timeZone: TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});
const fmtHora = new Intl.DateTimeFormat("en-US", {
  timeZone: TZ,
  weekday: "short",
  hour: "2-digit",
  hourCycle: "h23",
});
const SEMANA = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const diaBR = (iso: string) => fmtDia.format(new Date(iso));
function semanaHoraBR(iso: string) {
  const partes = fmtHora.formatToParts(new Date(iso));
  return {
    diaSemana: SEMANA.indexOf(partes.find((p) => p.type === "weekday")?.value ?? ""),
    hora: Number(partes.find((p) => p.type === "hour")?.value ?? 0) % 24,
  };
}
const CONFIRMADO = new Set(["sent", "delivered", "read"]);
/** Resposta de uma pessoa da equipe com envio confirmado pela Meta. */
export function respostaEquipe(m: MensagemDashboard) {
  const autor = (m.enviada_por ?? "").toLowerCase();
  return (
    m.direction === "out" &&
    CONFIRMADO.has(m.status ?? "") &&
    !["nina", "sistema", "system", "automatico"].includes(autor) &&
    (autor === "humano" || !!m.enviada_por_user_id)
  );
}
export const respostaNina = (m: MensagemDashboard) =>
  m.direction === "out" && CONFIRMADO.has(m.status ?? "") && m.enviada_por === "nina";
const media = (v: number[], casas = 1) =>
  v.length ? Number((v.reduce((a, b) => a + b, 0) / v.length).toFixed(casas)) : null;
const minutos = (de: string, ate: string) => (Date.parse(ate) - Date.parse(de)) / 60000;

/** Monta todos os números do dashboard a partir de registros já filtrados por clínica e sem testes. */
export function montarDashboardOsZap(e: EntradaDashboard) {
  const anterior = periodoComparacao(e.periodo);
  const ini = Date.parse(janelaDiaClinica(e.periodo.de).inicio);
  const iniAnt = Date.parse(janelaDiaClinica(anterior.de).inicio);
  const fim = Math.min(Date.parse(janelaDiaClinica(e.periodo.ate).fimExclusivo), +e.agora);
  const janela = (iso: string): "atual" | "anterior" | null => {
    const t = Date.parse(iso);
    return t >= ini && t < fim ? "atual" : t >= iniAnt && t < ini ? "anterior" : null;
  };
  const noPeriodo = (iso: string) => janela(iso) === "atual";
  // Ações de pessoas só contam quando feitas por atendentes (perfil telefonia).
  const daTelefonia = (id: string | null) => !!id && e.telefonia.has(id);
  const respostaTelefonia = (m: MensagemDashboard) =>
    respostaEquipe(m) && daTelefonia(m.enviada_por_user_id);

  const ind = Object.fromEntries(
    METRICAS_DASHBOARD.map((m) => [m, { atual: 0 as number | null, anterior: 0 as number | null }]),
  ) as Record<MetricaDashboard, { atual: number | null; anterior: number | null }>;
  const contar = (m: MetricaDashboard, iso: string) => {
    const j = janela(iso);
    if (j) ind[m][j] = (ind[m][j] ?? 0) + 1;
  };

  const dias = new Map(diasDoPeriodo(e.periodo).map((d) => [d, { dia: d, ...diaVazio() }]));
  const somarDia = (iso: string, campo: CampoDia, valor = 1) => {
    const d = dias.get(diaBR(iso));
    if (d && noPeriodo(iso)) d[campo] += valor;
  };
  const horas = Array.from({ length: 7 * 24 }, (_, i) => ({
    diaSemana: Math.floor(i / 24),
    hora: i % 24,
    recebidas: 0,
  }));

  // Conversas criadas
  const sentimento = { positivo: 0, neutro: 0, negativo: 0, frustrado: 0, semRegistro: 0 };
  const conversasNoPeriodo = new Map<string | null, number>();
  for (const c of e.criadas) {
    contar("conversasNovas", c.created_at);
    somarDia(c.created_at, "conversasNovas");
    if (!noPeriodo(c.created_at)) continue;
    const s = (c.sentimento ?? "semRegistro") as keyof typeof sentimento;
    sentimento[s in sentimento ? s : "semRegistro"]++;
    conversasNoPeriodo.set(c.departamento_id, (conversasNoPeriodo.get(c.departamento_id) ?? 0) + 1);
  }

  // Mensagens
  const respondidas = { atual: new Set<string>(), anterior: new Set<string>() };
  const msgPorPessoa = new Map<string, number>();
  for (const m of e.mensagens) {
    const j = janela(m.created_at);
    if (!j) continue;
    if (m.direction === "in") {
      contar("mensagensRecebidas", m.created_at);
      somarDia(m.created_at, "recebidas");
      if (j === "atual") {
        const { diaSemana, hora } = semanaHoraBR(m.created_at);
        horas[diaSemana * 24 + hora].recebidas++;
      }
    }
    if (respostaTelefonia(m)) {
      contar("respostasEquipe", m.created_at);
      somarDia(m.created_at, "respostasEquipe");
      if (m.conversa_id) respondidas[j].add(m.conversa_id);
      if (j === "atual" && m.enviada_por_user_id)
        msgPorPessoa.set(m.enviada_por_user_id, (msgPorPessoa.get(m.enviada_por_user_id) ?? 0) + 1);
    }
    if (respostaNina(m)) {
      contar("respostasNina", m.created_at);
      somarDia(m.created_at, "respostasNina");
    }
    if (m.direction === "out" && CONFIRMADO.has(m.status ?? "")) somarDia(m.created_at, "enviosOk");
    if (m.direction === "out" && m.status === "failed") somarDia(m.created_at, "enviosFalha");
  }
  ind.conversasRespondidas = {
    atual: respondidas.atual.size,
    anterior: respondidas.anterior.size,
  };

  // Eventos
  type Pessoa = { assumidas: number; finalizadas: number; transferencias: number };
  const acoes = new Map<string, Pessoa>();
  const pessoa = (id: string) => {
    const p = acoes.get(id) ?? { assumidas: 0, finalizadas: 0, transferencias: 0 };
    acoes.set(id, p);
    return p;
  };
  const porConversa = new Map<string, EventoDashboard[]>();
  const vistos = new Set<string>();
  for (const ev of [...e.eventos, ...e.seguintes.eventos]) {
    if (vistos.has(ev.id)) continue;
    vistos.add(ev.id);
    const lista = porConversa.get(ev.conversa_id) ?? [];
    lista.push(ev);
    porConversa.set(ev.conversa_id, lista);
  }
  for (const lista of porConversa.values())
    lista.sort((a, b) => a.created_at.localeCompare(b.created_at));
  const respostasPorConversa = new Map<string, string[]>();
  for (const m of [...e.mensagens, ...e.seguintes.mensagens])
    if (m.conversa_id && respostaTelefonia(m))
      respostasPorConversa.set(m.conversa_id, [
        ...(respostasPorConversa.get(m.conversa_id) ?? []),
        m.created_at,
      ]);
  for (const l of respostasPorConversa.values()) l.sort();
  const proximo = (conversa: string, tipo: string, desde: string, porTelefonia = false) =>
    porConversa
      .get(conversa)
      ?.find(
        (x) =>
          x.evento === tipo && x.created_at >= desde && (!porTelefonia || daTelefonia(x.user_id)),
      )?.created_at;
  const PESSOAIS = new Set(["ASSUMIDA", "FINALIZADA", "TRANSFERIDA"]);
  const tempos = {
    esperaFilaMin: { atual: [] as number[], anterior: [] as number[] },
    primeiraRespostaMin: { atual: [] as number[], anterior: [] as number[] },
    tempoAteEncerrarMin: { atual: [] as number[], anterior: [] as number[] },
  };
  const metricaEvento: Record<string, MetricaDashboard> = {
    HANDOFF_SOLICITADO: "encaminhadas",
    ASSUMIDA: "assumidas",
    FINALIZADA: "finalizadas",
    TRANSFERIDA: "transferencias",
  };
  const campoEvento: Record<string, CampoDia> = {
    HANDOFF_SOLICITADO: "encaminhadas",
    FINALIZADA: "finalizadas",
    TRANSFERIDA: "transferencias",
  };
  for (const ev of e.eventos) {
    const j = janela(ev.created_at);
    if (!j || (PESSOAIS.has(ev.evento) && !daTelefonia(ev.user_id))) continue;
    if (metricaEvento[ev.evento]) contar(metricaEvento[ev.evento], ev.created_at);
    if (campoEvento[ev.evento]) somarDia(ev.created_at, campoEvento[ev.evento]);
    if (j === "atual" && ev.user_id) {
      if (ev.evento === "ASSUMIDA") pessoa(ev.user_id).assumidas++;
      if (ev.evento === "FINALIZADA") pessoa(ev.user_id).finalizadas++;
      if (ev.evento === "TRANSFERIDA") pessoa(ev.user_id).transferencias++;
    }
    if (ev.evento === "ENTROU_NA_FILA") {
      const assumida = proximo(ev.conversa_id, "ASSUMIDA", ev.created_at, true);
      if (assumida) tempos.esperaFilaMin[j].push(minutos(ev.created_at, assumida));
      const resposta = respostasPorConversa.get(ev.conversa_id)?.find((t) => t >= ev.created_at);
      if (resposta) tempos.primeiraRespostaMin[j].push(minutos(ev.created_at, resposta));
    }
    if (ev.evento === "ASSUMIDA") {
      const fimAtendimento = proximo(ev.conversa_id, "FINALIZADA", ev.created_at);
      if (fimAtendimento)
        tempos.tempoAteEncerrarMin[j].push(minutos(ev.created_at, fimAtendimento));
    }
  }
  for (const [m, t] of Object.entries(tempos) as [MetricaDashboard, typeof tempos.esperaFilaMin][])
    ind[m] = { atual: media(t.atual), anterior: media(t.anterior) };

  // Avaliações
  const notas = [0, 0, 0, 0, 0];
  const somaNotas = { atual: [] as number[], anterior: [] as number[] };
  const avaliacoesPorPessoa = new Map<string, number[]>();
  for (const a of e.avaliacoes) {
    if (a.nota == null || !a.respondida_em) continue;
    const j = janela(a.respondida_em);
    if (!j) continue;
    contar("avaliacoes", a.respondida_em);
    somaNotas[j].push(a.nota);
    if (j === "atual" && a.nota >= 1 && a.nota <= 5) notas[a.nota - 1]++;
    if (j === "atual" && a.atendente_user_id)
      avaliacoesPorPessoa.set(a.atendente_user_id, [
        ...(avaliacoesPorPessoa.get(a.atendente_user_id) ?? []),
        a.nota,
      ]);
  }
  ind.notaMedia = { atual: media(somaNotas.atual, 2), anterior: media(somaNotas.anterior, 2) };

  // Agora
  const agoraIso = e.agora.toISOString();
  const grupoAgora = () => ({ conversas: 0, naoLidas: 0, esperaMaxMin: null as number | null });
  const agora = {
    nina: grupoAgora(),
    fila: grupoAgora(),
    emAtendimento: grupoAgora(),
    aguardandoPaciente: grupoAgora(),
  };
  const abertasPorPessoa = new Map<string, number>();
  const filaPorDep = new Map<string | null, number>();
  const atendPorDep = new Map<string | null, number>();
  for (const c of e.abertas) {
    const [grupo, desde] =
      c.status === "bot_attending"
        ? (["nina", c.ultima_msg_em ?? c.created_at] as const)
        : c.status === "waiting"
          ? (["fila", c.aguardando_desde ?? c.inbox_entrada_em ?? c.created_at] as const)
          : c.awaiting_patient_since
            ? (["aguardandoPaciente", c.awaiting_patient_since] as const)
            : (["emAtendimento", c.assigned_at ?? c.created_at] as const);
    const g = agora[grupo];
    g.conversas++;
    g.naoLidas += c.unread_count ?? 0;
    g.esperaMaxMin = Math.max(g.esperaMaxMin ?? 0, Math.round(minutos(desde, agoraIso)));
    if (c.status === "waiting")
      filaPorDep.set(c.departamento_id, (filaPorDep.get(c.departamento_id) ?? 0) + 1);
    if (c.status === "active") {
      atendPorDep.set(c.departamento_id, (atendPorDep.get(c.departamento_id) ?? 0) + 1);
      if (c.atribuida_user_id)
        abertasPorPessoa.set(
          c.atribuida_user_id,
          (abertasPorPessoa.get(c.atribuida_user_id) ?? 0) + 1,
        );
    }
  }

  // Pausas
  const fimPausa = (p: { finalizada_em: string | null }) =>
    Math.min(p.finalizada_em ? Date.parse(p.finalizada_em) : +e.agora, fim);
  const pausasPessoa = new Map<string, { pausas: number; minutos: number }>();
  const pausasMotivo = new Map<string, { pausas: number; minutos: number }>();
  const nomeMotivo = new Map(e.motivosPausa.map((m) => [m.id, m.nome]));
  for (const p of e.pausas) {
    if (!daTelefonia(p.user_id)) continue;
    const dur = (fimPausa(p) - Math.max(Date.parse(p.iniciada_em), ini)) / 60000;
    if (dur <= 0) continue;
    for (const [mapa, chave] of [
      [pausasPessoa, p.user_id],
      [pausasMotivo, (p.reason_id && nomeMotivo.get(p.reason_id)) || "Sem motivo"],
    ] as const) {
      const v = mapa.get(chave) ?? { pausas: 0, minutos: 0 };
      v.pausas++;
      v.minutos += dur;
      mapa.set(chave, v);
    }
  }

  // Equipe
  const presenca = new Map<string, "Online" | "Em pausa" | "Offline">();
  for (const p of e.presencas) {
    if (!daTelefonia(p.user_id)) continue;
    const estado = p.estado_manual ?? p.status;
    const atual = presenca.get(p.user_id);
    const novo =
      estado === "PAUSA" || estado === "PAUSA_SAIDA"
        ? "Em pausa"
        : estado === "ONLINE"
          ? "Online"
          : "Offline";
    if (!atual || atual === "Offline" || novo === "Em pausa") presenca.set(p.user_id, novo);
  }
  const ids = e.telefonia;
  const equipe = [...ids]
    .map((id) => ({
      id,
      nome: e.nomes.get(id) ?? "Nome não disponível",
      presenca: presenca.get(id) ?? "Offline",
      mensagens: msgPorPessoa.get(id) ?? 0,
      assumidas: acoes.get(id)?.assumidas ?? 0,
      finalizadas: acoes.get(id)?.finalizadas ?? 0,
      transferencias: acoes.get(id)?.transferencias ?? 0,
      avaliacoes: avaliacoesPorPessoa.get(id)?.length ?? 0,
      notaMedia: media(avaliacoesPorPessoa.get(id) ?? [], 2),
      abertasAgora: abertasPorPessoa.get(id) ?? 0,
      pausas: pausasPessoa.get(id)?.pausas ?? 0,
      minutosPausa: Math.round(pausasPessoa.get(id)?.minutos ?? 0),
    }))
    .sort(
      (a, b) =>
        b.mensagens - a.mensagens || b.assumidas - a.assumidas || a.nome.localeCompare(b.nome),
    );

  // Departamentos
  const transfDep = new Map<string, number>();
  for (const t of e.transferencias)
    if (t.para_departamento_id && noPeriodo(t.created_at))
      transfDep.set(t.para_departamento_id, (transfDep.get(t.para_departamento_id) ?? 0) + 1);
  const departamentos = [
    ...e.departamentos.map((d) => ({ id: d.id as string | null, nome: d.nome })),
    { id: null, nome: "Sem departamento" },
  ].map((d) => ({
    id: d.id ?? "sem",
    nome: d.nome,
    naFila: filaPorDep.get(d.id) ?? 0,
    emAtendimento: atendPorDep.get(d.id) ?? 0,
    conversas: conversasNoPeriodo.get(d.id) ?? 0,
    transferenciasRecebidas: d.id ? (transfDep.get(d.id) ?? 0) : 0,
  }));

  // Nina
  let nina = null;
  if (e.nina) {
    const ex = e.nina.filter((x) => noPeriodo(x.created_at));
    const modelos = new Map<string, ExecucaoNinaDashboard[]>();
    const erros = new Map<string, number>();
    for (const x of ex) {
      const chave = `${x.model ?? "Não informado"}|${x.perfil ?? "—"}`;
      modelos.set(chave, [...(modelos.get(chave) ?? []), x]);
      if (!x.success)
        erros.set(
          x.error_category ?? "sem_categoria",
          (erros.get(x.error_category ?? "sem_categoria") ?? 0) + 1,
        );
      somarDia(x.created_at, "ninaExecucoes");
      if (!x.success) somarDia(x.created_at, "ninaFalhas");
      if (x.handoff) somarDia(x.created_at, "ninaEncaminhamentos");
      if (x.latency_ms != null) {
        somarDia(x.created_at, "ninaLatenciaSomaMs", x.latency_ms);
        somarDia(x.created_at, "ninaLatenciaMedidas");
      }
    }
    const resumo = (lista: ExecucaoNinaDashboard[]) => ({
      execucoes: lista.length,
      falhas: lista.filter((x) => !x.success).length,
      encaminhamentos: lista.filter((x) => x.handoff).length,
      latenciaMediaS: media(
        lista.flatMap((x) => (x.latency_ms == null ? [] : [x.latency_ms / 1000])),
      ),
      tokensEntradaMedia: media(
        lista.flatMap((x) => (x.input_tokens == null ? [] : [x.input_tokens])),
        0,
      ),
      tokensSaidaMedia: media(
        lista.flatMap((x) => (x.output_tokens == null ? [] : [x.output_tokens])),
        0,
      ),
    });
    nina = {
      ...resumo(ex),
      conversas: new Set(ex.map((x) => x.conversation_id)).size,
      modelos: [...modelos.entries()]
        .map(([chave, lista]) => {
          const [modelo, canal] = chave.split("|");
          return { modelo, canal, ...resumo(lista) };
        })
        .sort((a, b) => b.execucoes - a.execucoes),
      erros: [...erros.entries()]
        .map(([categoria, falhas]) => ({ categoria, falhas }))
        .sort((a, b) => b.falhas - a.falhas),
    };
  }

  // Francisco
  const francisco = e.francisco
    ? (["d1", "d4"] as const).map((etapa) => {
        const l = e.francisco!.filter((f) => f.etapa === etapa);
        const enviados = l.filter((f) => f.status === "enviado").length;
        const respondidos = l.filter((f) => f.respondido_em).length;
        return {
          etapa,
          total: l.length,
          enviados,
          reservados: l.filter((f) => f.status === "reservado").length,
          incertos: l.filter((f) => f.status === "incerto").length,
          bloqueados: l.filter((f) => f.status === "bloqueado").length,
          respondidos,
          taxaResposta: enviados ? respondidos / enviados : null,
        };
      })
    : null;

  // Avisos da Meta (webhook)
  if (e.webhook)
    for (const w of e.webhook) {
      const r = (w.resultado ?? "").toLowerCase();
      somarDia(
        w.recebido_em,
        r.startsWith("processado")
          ? "avisosProcessados"
          : r.includes("assinatura")
            ? "avisosAssinatura"
            : r.startsWith("pendente")
              ? "avisosPendentes"
              : "avisosErros",
      );
    }
  const porDia = [...dias.values()];
  const total = (c: CampoDia) => porDia.reduce((n, d) => n + d[c], 0);

  return {
    periodo: e.periodo,
    anterior,
    indicadores: ind,
    agora,
    porDia,
    porHora: horas,
    equipe,
    departamentos,
    pausas: [...pausasMotivo.entries()]
      .map(([motivo, v]) => ({ motivo, pausas: v.pausas, minutos: Math.round(v.minutos) }))
      .sort((a, b) => b.minutos - a.minutos),
    notas,
    sentimento,
    nina,
    francisco,
    whatsapp: {
      avisosDisponiveis: !!e.webhook,
      processados: total("avisosProcessados"),
      assinaturaInvalida: total("avisosAssinatura"),
      pendentes: total("avisosPendentes"),
      outrosErros: total("avisosErros"),
      enviosOk: total("enviosOk"),
      enviosFalha: total("enviosFalha"),
    },
  };
}
