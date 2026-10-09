/**
 * Modo treinamento — "Dia real": conversas de teste espalhadas no tempo.
 *
 * Em vez de disparar tudo de uma vez, o teste sorteia um horário de chegada
 * para cada conversa dentro da duração escolhida (com picos e intervalos
 * irregulares). Cada conversa usa um lead de teste, é conduzida pela Luna como
 * paciente (cenários e perfis da bateria por profissional, mais o perfil que
 * pede atendente) e pode terminar em transferência para humano.
 *
 * Módulo puro: sorteio, cenários, plano por lead e resumo de progresso. Nada
 * aqui toca banco, rede ou modelo. O envio continua pelo console de
 * homologação (`test-console`): nenhuma mensagem sai para o WhatsApp.
 */
import {
  LIMITES_BATERIA,
  VARIACOES_BATERIA,
  esperadoDaConsulta,
  pacienteDoCenario,
  tituloCenario,
  type CenarioBateria,
  type ConfigBateria,
  type ConsultaCatalogo,
  type ItemBateria,
  type VariacaoBateria,
} from "./carga-bateria";

export const VERSAO_DIA_REAL = 1 as const;

export const LIMITES_DIA_REAL = {
  conversasMin: 1,
  conversasMax: 60,
  duracaoMinMin: 1,
  duracaoMaxMin: 120,
  turnosPadrao: 8,
  manterTransferidasMinPadrao: 10,
  manterTransferidasMinMax: 180,
  /** Leads de homologação reaproveitados em rodízio. */
  leads: 10,
  /** Uma em cada N conversas pede para falar com uma atendente. */
  umaPedeAtendenteACada: 5,
  /** Folga do prazo total além da duração escolhida (conversas longas e transferidas). */
  folgaMin: 30,
} as const;

export type PerfilPico = "uniforme" | "pico_inicio" | "dois_picos" | "aleatorio";

export const ROTULO_PERFIL_PICO: Record<PerfilPico, string> = {
  uniforme: "Ritmo constante",
  pico_inicio: "Pico no início (abertura da clínica)",
  dois_picos: "Dois picos (manhã e tarde)",
  aleatorio: "Rajadas aleatórias",
};

export type ConfigDiaReal = {
  versao: typeof VERSAO_DIA_REAL;
  conversas: number;
  duracaoMin: number;
  perfilPico: PerfilPico;
  turnos: number;
  /** Conversa transferida fica na fila por este tempo antes de o lead ser reaproveitado. */
  manterTransferidasMin: number;
  seed: number;
};

/** Perfil extra deste modo: a conversa termina em transferência para humano. */
export const VARIACAO_PEDE_ATENDENTE: VariacaoBateria = {
  id: "pede_atendente",
  rotulo: "Quer falar com uma atendente",
  instrucao:
    "Depois da primeira resposta da atendente virtual, diga que prefere falar com uma atendente de verdade (uma pessoa) e insista educadamente até ser encaminhado. Não aceite marcar pelo robô.",
};

export const VARIACOES_DIA_REAL: VariacaoBateria[] = [
  ...VARIACOES_BATERIA,
  VARIACAO_PEDE_ATENDENTE,
];

/** Gerador determinístico (mulberry32) para o plano ser reproduzível a partir do seed. */
export function criarRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Aproximação de normal padrão (soma de uniformes), suficiente para espalhar chegadas. */
function normalAprox(rng: () => number): number {
  return (rng() + rng() + rng() + rng() - 2) * Math.sqrt(3);
}

const limitarFracao = (v: number) => Math.min(0.999, Math.max(0, v));

/**
 * Sorteia os instantes de chegada (ms desde o início) de cada conversa.
 * Sempre devolve `n` valores crescentes dentro de `[0, duracaoMs)`.
 */
export function gerarChegadasMs(
  n: number,
  duracaoMs: number,
  perfil: PerfilPico,
  rng: () => number,
): number[] {
  const fracoes: number[] = [];
  const centrosRajadas = Array.from({ length: 2 + Math.floor(rng() * 3) }, () => rng());
  for (let i = 0; i < n; i++) {
    let f: number;
    switch (perfil) {
      case "pico_inicio":
        f = rng() ** 2;
        break;
      case "dois_picos":
        f = i % 2 === 0 ? 0.2 + normalAprox(rng) * 0.08 : 0.65 + normalAprox(rng) * 0.1;
        break;
      case "aleatorio": {
        const emRajada = rng() < 0.6;
        f = emRajada
          ? centrosRajadas[Math.floor(rng() * centrosRajadas.length)]! + normalAprox(rng) * 0.04
          : rng();
        break;
      }
      default:
        f = rng();
    }
    fracoes.push(limitarFracao(f));
  }
  return fracoes.map((f) => Math.floor(f * duracaoMs)).sort((a, b) => a - b);
}

function embaralhar<T>(lista: T[], rng: () => number): T[] {
  const copia = [...lista];
  for (let i = copia.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [copia[i], copia[j]] = [copia[j]!, copia[i]!];
  }
  return copia;
}

const normal = (v: string) =>
  v.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();

/**
 * Uma conversa por chegada: consulta publicada em rodízio embaralhado e perfil de
 * paciente sorteado; a cada N conversas uma pede atendente (termina em transferência).
 */
export function montarCenariosDiaReal(entrada: {
  consultas: ConsultaCatalogo[];
  vagasPorMedico: Record<string, number | null>;
  chegadasMs: number[];
  rng: () => number;
  hoje?: Date;
}): CenarioBateria[] {
  if (!entrada.consultas.length) return [];
  const consultas = embaralhar(entrada.consultas, entrada.rng);
  return entrada.chegadasMs.map((chegadaMs, k) => {
    const c = consultas[k % consultas.length]!;
    const vagas = c.medicoId ? (entrada.vagasPorMedico[c.medicoId] ?? null) : null;
    const pedeAtendente = (k + 1) % LIMITES_DIA_REAL.umaPedeAtendenteACada === 0;
    const variacao = pedeAtendente
      ? VARIACAO_PEDE_ATENDENTE
      : VARIACOES_BATERIA[Math.floor(entrada.rng() * VARIACOES_BATERIA.length)]!;
    const ordem = k + 1;
    const cenario: CenarioBateria = {
      ...c,
      id: `${ordem}:${c.profissionalId}:${normal(c.consulta).replace(/[^a-z0-9]+/g, "-")}:${variacao.id}`,
      ordem,
      titulo: "",
      variacao,
      esperado: pedeAtendente ? "encaminhar" : esperadoDaConsulta(c, vagas),
      vagasPrevistas: vagas,
      paciente: pacienteDoCenario(c, variacao, ordem, entrada.hoje),
      chegadaMs,
    };
    cenario.titulo = tituloCenario(cenario);
    return cenario;
  });
}

/**
 * Plano por lead com reaproveitamento: a conversa k usa o lead k % 10. Entre duas
 * conversas do mesmo lead entra o passo "reiniciar" (reset do lead, respeitando o
 * tempo em que uma transferida fica na fila). A última conversa de cada lead não é
 * reiniciada: os cards ficam na tela até o operador resolver.
 */
export function montarItensDiaReal(
  cenarios: CenarioBateria[],
  leads: { id: string; indice: number }[],
  turnos: number,
): ItemBateria[] {
  if (!cenarios.length) throw new Error("Nenhuma conversa para simular.");
  if (!leads.length) throw new Error("Os leads de homologação não estão disponíveis.");
  const porLead: ItemBateria[][] = leads.map(() => []);
  cenarios.forEach((c, k) => {
    const slot = k % leads.length;
    const lead = leads[slot]!;
    const base = {
      leadId: lead.id,
      leadIndice: lead.indice,
      slot,
      cenario: c.titulo,
      cenarioId: c.id,
    };
    const lista = porLead[slot]!;
    if (lista.length) {
      // Reinício pertence à conversa anterior deste lead (é o seu fechamento).
      const anterior = lista.at(-1)!;
      lista.push({
        ...base,
        cenario: anterior.cenario,
        cenarioId: anterior.cenarioId,
        tipo: "reiniciar",
        ordemNoCenario: turnos + 2,
        mensagem: "Reinício do lead para a próxima conversa",
        indice: -1,
      });
    }
    for (let t = 0; t < turnos; t++)
      lista.push({
        ...base,
        tipo: "turno",
        ordemNoCenario: t,
        mensagem: "Mensagem escrita pela Luna durante a conversa",
        indice: -1,
      });
    lista.push(
      {
        ...base,
        tipo: "verificar",
        ordemNoCenario: turnos,
        mensagem: "Verificação do resultado",
        indice: -1,
      },
      {
        ...base,
        tipo: "devolver",
        ordemNoCenario: turnos + 1,
        mensagem: "Devolução da vaga",
        indice: -1,
      },
    );
  });
  const fila: ItemBateria[] = [];
  const maior = Math.max(...porLead.map((l) => l.length));
  for (let posicao = 0; posicao < maior; posicao++)
    for (const lista of porLead) {
      const item = lista[posicao];
      if (item) fila.push({ ...item, indice: fila.length });
    }
  return fila;
}

export function normalizarConfigDiaReal(entrada: {
  conversas: number;
  duracaoMin: number;
  perfilPico: PerfilPico;
  turnos?: number;
  manterTransferidasMin?: number;
  seed?: number;
}): ConfigDiaReal {
  const limitar = (v: number, min: number, max: number) =>
    Math.min(max, Math.max(min, Number.isFinite(v) ? Math.trunc(v) : min));
  return {
    versao: VERSAO_DIA_REAL,
    conversas: limitar(
      entrada.conversas,
      LIMITES_DIA_REAL.conversasMin,
      LIMITES_DIA_REAL.conversasMax,
    ),
    duracaoMin: limitar(
      entrada.duracaoMin,
      LIMITES_DIA_REAL.duracaoMinMin,
      LIMITES_DIA_REAL.duracaoMaxMin,
    ),
    perfilPico: (Object.keys(ROTULO_PERFIL_PICO) as PerfilPico[]).includes(entrada.perfilPico)
      ? entrada.perfilPico
      : "uniforme",
    turnos: limitar(
      entrada.turnos ?? LIMITES_DIA_REAL.turnosPadrao,
      LIMITES_BATERIA.turnosMin,
      LIMITES_BATERIA.turnosMax,
    ),
    manterTransferidasMin: limitar(
      entrada.manterTransferidasMin ?? LIMITES_DIA_REAL.manterTransferidasMinPadrao,
      0,
      LIMITES_DIA_REAL.manterTransferidasMinMax,
    ),
    seed: Number.isInteger(entrada.seed) ? (entrada.seed as number) : Date.now() % 2147483647,
  };
}

/** Prazo total do teste: duração escolhida mais folga para as conversas terminarem. */
export function duracaoDiaRealS(c: ConfigDiaReal): number {
  return Math.min(
    LIMITES_BATERIA.duracaoMaxS,
    (c.duracaoMin + LIMITES_DIA_REAL.folgaMin + c.manterTransferidasMin) * 60,
  );
}

export function configDiaReal(config: unknown): ConfigDiaReal | null {
  const d = (config as { _diaReal?: ConfigDiaReal } | null)?._diaReal;
  return d?.versao === VERSAO_DIA_REAL && Number.isInteger(d.conversas) ? d : null;
}

export type ResumoDiaReal = {
  conversas: number;
  aguardando: number;
  /** Chegada já passou, mas o lead ainda está ocupado com a conversa anterior. */
  aguardandoLead: number;
  iniciadas: number;
  emAndamento: number;
  transferidas: number;
  concluidas: number;
  proximaChegadaEm: string | null;
  fimPrevistoEm: string | null;
};

/** Progresso do dia real a partir dos passos gravados (enviadas, em andamento, transferidas). */
export function resumoDiaReal(
  diaReal: ConfigDiaReal,
  bateria: ConfigBateria,
  plano: unknown[],
  passos: { indice: number; status: string; resultado?: any }[],
  inicio: string | null | undefined,
  agora = Date.now(),
): ResumoDiaReal {
  const itens = plano.filter(
    (p): p is ItemBateria => Boolean(p) && typeof (p as ItemBateria).cenarioId === "string",
  );
  const porIndice = new Map(passos.map((p) => [p.indice, p]));
  const inicioMs = inicio ? Date.parse(inicio) : NaN;
  let iniciadas = 0;
  let transferidas = 0;
  let concluidas = 0;
  let aguardandoLead = 0;
  let proxima: number | null = null;
  for (const c of bateria.cenarios) {
    const doCenario = itens.filter((i) => i.cenarioId === c.id);
    const turnos = doCenario
      .filter((i) => i.tipo === "turno")
      .map((i) => porIndice.get(i.indice))
      .filter((p): p is NonNullable<typeof p> => Boolean(p));
    const verificacao = porIndice.get(doCenario.find((i) => i.tipo === "verificar")?.indice ?? -1);
    const enviou = turnos.some((t) => t.status !== "dispensado");
    const iniciou = enviou || Boolean(verificacao);
    if (iniciou) iniciadas++;
    if (verificacao) concluidas++;
    const transferida =
      turnos.some((t) => t.status === "cancelado" || t.resultado?.transferida === true) ||
      verificacao?.resultado?.encaminhada === true;
    if (transferida) transferidas++;
    if (!iniciou && Number.isFinite(inicioMs) && c.chegadaMs != null) {
      const chegada = inicioMs + c.chegadaMs;
      if (chegada <= agora) aguardandoLead++;
      else proxima = proxima === null ? chegada : Math.min(proxima, chegada);
    }
  }
  const fim = Number.isFinite(inicioMs) ? inicioMs + diaReal.duracaoMin * 60_000 : null;
  return {
    conversas: bateria.cenarios.length,
    aguardando: bateria.cenarios.length - iniciadas,
    aguardandoLead,
    iniciadas,
    emAndamento: iniciadas - concluidas,
    transferidas,
    concluidas,
    proximaChegadaEm: proxima === null ? null : new Date(proxima).toISOString(),
    fimPrevistoEm: fim === null ? null : new Date(fim).toISOString(),
  };
}
