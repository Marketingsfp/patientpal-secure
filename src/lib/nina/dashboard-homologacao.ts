/**
 * FASE 11 — Dashboard da homologação (módulo puro).
 *
 * Sem rede e sem banco. Recebe registros que JÁ existem (execuções da Nina em
 * conversas de teste, ferramentas auditadas, avaliações do Sol e custos
 * registrados) e devolve o resumo, os filtros aplicados e a comparação entre
 * versões do Prompt Principal.
 *
 * Regras:
 * - Só entram conversas de homologação. A separação de produção é feita na
 *   camada de dados (conversas com `is_teste = true`); aqui nada é misturado.
 * - Nada é estimado: custo só aparece quando foi registrado; score médio só
 *   considera avaliações reais do Sol.
 */
import {
  CATEGORIAS_ERRO_RELATORIO,
  classificarErroRelatorio,
  type CategoriaErroRelatorio,
  type ErroRelatorio,
  type TipoRelatorio,
} from "./relatorio-teste";

export type ExecucaoDash = {
  conversaId: string;
  quando: string;
  modelo: string | null;
  promptVersao: number | null;
  sucesso: boolean;
  erroCategoria: string | null;
  handoff: boolean;
  conhecimento: string | null;
  inputTokens: number;
  outputTokens: number;
  latenciaMs: number | null;
};

export type FerramentaDash = {
  conversaId: string;
  nome: string | null;
  ok: boolean;
  erro: string | null;
  quando: string;
};

export type AvaliacaoDash = {
  conversaId: string;
  quando: string;
  resultado: string | null;
  score: number | null;
  achados: Array<{ gravidade?: string | null; componente?: string | null; observado?: string | null; esperado?: string | null }>;
};

export type EntradaDashboard = {
  /** Tipo de teste de cada conversa de homologação (manual, terra, cenários, carga). */
  tipoPorConversa: Record<string, TipoRelatorio>;
  execucoes: ExecucaoDash[];
  ferramentas: FerramentaDash[];
  avaliacoes: AvaliacaoDash[];
  /** Custo já registrado por conversa (cenários/carga). Ausente = desconhecido. */
  custoPorConversa?: Record<string, number>;
};

export type FiltroDashboard = {
  tipos?: TipoRelatorio[];
  promptVersao?: number | null;
  modelo?: string | null;
  /** aprovado | aprovado_observacao | reprovado | sem_avaliacao */
  resultado?: string | null;
};

export type TesteAgregado = {
  conversaId: string;
  tipo: TipoRelatorio;
  inicio: string | null;
  fim: string | null;
  modelos: string[];
  promptVersao: number | null;
  resultado: string;
  score: number | null;
  mensagens: number;
  tools: number;
  rag: number;
  agendamentos: number;
  transferencias: number;
  erros: ErroRelatorio[];
  errosCriticos: number;
  latencias: number[];
  inputTokens: number;
  outputTokens: number;
  custo: number | null;
};

export const RESULTADOS_DASHBOARD = [
  { valor: "aprovado", rotulo: "Aprovado" },
  { valor: "aprovado_observacao", rotulo: "Aprovado com observação" },
  { valor: "reprovado", rotulo: "Reprovado" },
  { valor: "sem_avaliacao", rotulo: "Sem avaliação" },
] as const;

export function rotuloResultadoDashboard(valor: string): string {
  return RESULTADOS_DASHBOARD.find((r) => r.valor === valor)?.rotulo ?? valor;
}

function ultima<T extends { quando: string }>(lista: T[]): T | null {
  if (!lista.length) return null;
  return [...lista].sort((a, b) => String(b.quando).localeCompare(String(a.quando)))[0]!;
}

/** Agrupa tudo por conversa de teste: cada conversa é um teste executado. */
export function agregarPorConversa(entrada: EntradaDashboard): TesteAgregado[] {
  const conversas = Object.keys(entrada.tipoPorConversa);
  return conversas.map((conversaId) => {
    const execs = entrada.execucoes
      .filter((e) => e.conversaId === conversaId)
      .sort((a, b) => String(a.quando).localeCompare(String(b.quando)));
    const tools = entrada.ferramentas.filter((f) => f.conversaId === conversaId);
    const avals = entrada.avaliacoes.filter((a) => a.conversaId === conversaId);
    const aval = ultima(avals);

    const erros: ErroRelatorio[] = [];
    let criticos = 0;
    for (const e of execs) {
      if (!e.sucesso || e.erroCategoria) {
        criticos += 1;
        erros.push({
          categoria: classificarErroRelatorio({ categoria: e.erroCategoria }),
          descricao: `Execução da Nina falhou (${e.erroCategoria ?? "sem categoria registrada"})`,
          origem: "execucao",
          quando: e.quando,
          conversaId,
        });
      }
    }
    for (const t of tools) {
      if (!t.ok) {
        criticos += 1;
        erros.push({
          categoria: classificarErroRelatorio({ ferramenta: t.nome, texto: String(t.erro ?? "") }),
          descricao: `Ferramenta ${t.nome ?? "desconhecida"} retornou erro`,
          origem: "ferramenta",
          quando: t.quando,
          conversaId,
        });
      }
    }
    for (const a of avals) {
      for (const achado of a.achados ?? []) {
        const gravidade = String(achado?.gravidade ?? "").toLowerCase();
        if (gravidade === "informativa") continue;
        if (gravidade === "critica" || gravidade === "crítica" || gravidade === "grave") criticos += 1;
        erros.push({
          categoria: classificarErroRelatorio({
            componente: achado?.componente ?? null,
            texto: `${achado?.observado ?? ""} ${achado?.esperado ?? ""}`,
          }),
          descricao: String(achado?.observado ?? "Achado do avaliador").slice(0, 400),
          origem: "avaliacao",
          quando: a.quando,
          conversaId,
        });
      }
    }

    const promptVersoes = execs.map((e) => e.promptVersao).filter((v): v is number => typeof v === "number");
    const modelos = [...new Set(execs.map((e) => e.modelo).filter((m): m is string => !!m))];
    const custo = entrada.custoPorConversa?.[conversaId];

    return {
      conversaId,
      tipo: entrada.tipoPorConversa[conversaId]!,
      inicio: execs[0]?.quando ?? null,
      fim: execs[execs.length - 1]?.quando ?? null,
      modelos,
      promptVersao: promptVersoes.length ? promptVersoes[promptVersoes.length - 1]! : null,
      resultado: aval?.resultado ?? "sem_avaliacao",
      score: typeof aval?.score === "number" ? aval.score : null,
      mensagens: execs.length,
      tools: tools.length,
      rag: execs.filter((e) => e.conhecimento).length,
      agendamentos: tools.filter((t) => /^agendar/i.test(String(t.nome ?? "")) && t.ok).length,
      transferencias:
        execs.filter((e) => e.handoff).length +
        tools.filter((t) => /atendente_humano/i.test(String(t.nome ?? ""))).length,
      erros,
      errosCriticos: criticos,
      latencias: execs.map((e) => e.latenciaMs).filter((l): l is number => typeof l === "number"),
      inputTokens: execs.reduce((s, e) => s + (e.inputTokens ?? 0), 0),
      outputTokens: execs.reduce((s, e) => s + (e.outputTokens ?? 0), 0),
      custo: typeof custo === "number" ? custo : null,
    };
  });
}

export function filtrarTestes(testes: TesteAgregado[], filtro: FiltroDashboard): TesteAgregado[] {
  return testes.filter((t) => {
    if (filtro.tipos?.length && !filtro.tipos.includes(t.tipo)) return false;
    if (typeof filtro.promptVersao === "number" && t.promptVersao !== filtro.promptVersao) return false;
    if (filtro.modelo && !t.modelos.includes(filtro.modelo)) return false;
    if (filtro.resultado && t.resultado !== filtro.resultado) return false;
    return true;
  });
}

function percentil(valores: number[], p: number): number | null {
  if (!valores.length) return null;
  const ordenado = [...valores].sort((a, b) => a - b);
  const idx = Math.min(ordenado.length - 1, Math.max(0, Math.ceil((p / 100) * ordenado.length) - 1));
  return ordenado[idx]!;
}

export type ResumoDashboard = {
  testes: number;
  avaliados: number;
  aprovados: number;
  aprovadosObservacao: number;
  reprovados: number;
  semAvaliacao: number;
  taxaAprovacao: number | null;
  errosCriticos: number;
  scoreMedio: number | null;
  mensagens: number;
  tools: number;
  rag: number;
  agendamentos: number;
  transferencias: number;
  latenciaMediaMs: number | null;
  latenciaP95Ms: number | null;
  inputTokens: number;
  outputTokens: number;
  /** Nulo quando nenhum custo foi registrado — nada é estimado. */
  custo: number | null;
  errosPorCategoria: Array<{ categoria: CategoriaErroRelatorio; rotulo: string; total: number }>;
};

export function resumirTestes(testes: TesteAgregado[]): ResumoDashboard {
  const scores = testes.map((t) => t.score).filter((s): s is number => typeof s === "number");
  const latencias = testes.flatMap((t) => t.latencias);
  const aprovados = testes.filter((t) => t.resultado === "aprovado").length;
  const aprovadosObservacao = testes.filter((t) => t.resultado === "aprovado_observacao").length;
  const reprovados = testes.filter((t) => t.resultado === "reprovado").length;
  const semAvaliacao = testes.filter((t) => t.resultado === "sem_avaliacao").length;
  const avaliados = testes.length - semAvaliacao;

  const mapa = new Map<CategoriaErroRelatorio, number>();
  for (const t of testes) for (const e of t.erros) mapa.set(e.categoria, (mapa.get(e.categoria) ?? 0) + 1);

  const custos = testes.map((t) => t.custo).filter((c): c is number => typeof c === "number");

  return {
    testes: testes.length,
    avaliados,
    aprovados,
    aprovadosObservacao,
    reprovados,
    semAvaliacao,
    taxaAprovacao: avaliados ? Math.round(((aprovados + aprovadosObservacao) / avaliados) * 100) : null,
    errosCriticos: testes.reduce((s, t) => s + t.errosCriticos, 0),
    scoreMedio: scores.length ? Math.round(scores.reduce((s, v) => s + v, 0) / scores.length) : null,
    mensagens: testes.reduce((s, t) => s + t.mensagens, 0),
    tools: testes.reduce((s, t) => s + t.tools, 0),
    rag: testes.reduce((s, t) => s + t.rag, 0),
    agendamentos: testes.reduce((s, t) => s + t.agendamentos, 0),
    transferencias: testes.reduce((s, t) => s + t.transferencias, 0),
    latenciaMediaMs: latencias.length
      ? Math.round(latencias.reduce((s, v) => s + v, 0) / latencias.length)
      : null,
    latenciaP95Ms: percentil(latencias, 95),
    inputTokens: testes.reduce((s, t) => s + t.inputTokens, 0),
    outputTokens: testes.reduce((s, t) => s + t.outputTokens, 0),
    custo: custos.length ? custos.reduce((s, v) => s + v, 0) : null,
    errosPorCategoria: CATEGORIAS_ERRO_RELATORIO.filter((c) => mapa.has(c.valor)).map((c) => ({
      categoria: c.valor,
      rotulo: c.rotulo,
      total: mapa.get(c.valor) ?? 0,
    })),
  };
}

export type ResumoVersaoPrompt = { versao: number | null; resumo: ResumoDashboard };

/** Um resumo por versão do Prompt Principal, da mais nova para a mais antiga. */
export function resumirPorVersaoPrompt(testes: TesteAgregado[]): ResumoVersaoPrompt[] {
  const mapa = new Map<number | null, TesteAgregado[]>();
  for (const t of testes) mapa.set(t.promptVersao, [...(mapa.get(t.promptVersao) ?? []), t]);
  return [...mapa.entries()]
    .sort((a, b) => (b[0] ?? -1) - (a[0] ?? -1))
    .map(([versao, lista]) => ({ versao, resumo: resumirTestes(lista) }));
}
