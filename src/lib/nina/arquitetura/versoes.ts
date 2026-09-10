/**
 * FASE 6 — HISTÓRICO DE VERSÕES DA ARQUITETURA E COMPARAÇÃO ENTRE ELAS.
 *
 * Módulo PURO: só descreve versões já registradas do Architecture Manifest e
 * calcula o que mudou de uma para outra (nodes e conexões). Não executa nada do
 * fluxo da Nina, não lê banco e não é importado pelo atendimento.
 *
 * Regra: mudança puramente visual do canvas (arrastar node, reorganizar,
 * salvar posição) NÃO gera versão nova — o registro só avança quando a
 * assinatura estrutural (categoria, função, conexões, nodes) muda.
 */
import { MANIFESTO_ARQUITETURA, NODES_ARQUITETURA, nodePorId } from "./manifesto";
import {
  SNAPSHOT_ANTERIOR,
  assinaturaAtual,
  calcularDiffArquitetura,
  type AssinaturaNode,
  type DiffArquitetura,
} from "./sync";

export type Conexao = { de: string; para: string };

export type DiffConexoes = {
  adicionadas: Conexao[];
  removidas: Conexao[];
};

export type VersaoArquitetura = {
  versao: number;
  /** Data em que a versão foi registrada (ISO, somente data). */
  data: string;
  /** Publicação correspondente, quando houve. `null` = não publicada. */
  deploy: string | null;
  /** Commit do repositório, quando conhecido. */
  commit: string | null;
  /** Versão do prompt principal. `null` = o backend não registra esse dado hoje. */
  versaoPrompt: string | null;
  /** Modelo registrado para o atendimento de texto/WhatsApp nesta versão. */
  modelo: string | null;
  quantidadeNodes: number;
  quantidadeTools: number;
  /** Resumo em linguagem simples do que mudou nesta versão. */
  alteracoes: string[];
  /** Foto estrutural usada para comparar versões. */
  snapshot: AssinaturaNode[];
};

const contarTools = (snapshot: AssinaturaNode[]) =>
  snapshot.filter((n) => n.categoria === "TOOLS").length;

const SNAPSHOT_ATUAL = assinaturaAtual();

/** IDs acrescentados na versão 5 (finalização única das respostas — Fase 5). */
const IDS_FINALIZACAO = new Set(["response.templates", "response.finalize"]);

/** Foto estrutural da versão 4 (antes da finalização única entrar no mapa). */
const SNAPSHOT_V4: AssinaturaNode[] = SNAPSHOT_ATUAL.filter(
  (n) => !IDS_FINALIZACAO.has(n.id),
).map((n) =>
  n.id === "llm.generate"
    ? {
        ...n,
        anteriores: n.anteriores.filter((a) => !IDS_FINALIZACAO.has(a)),
        seguintes: n.seguintes
          .filter((sg) => !IDS_FINALIZACAO.has(sg))
          .concat("response.validate"),
      }
    : n.id === "response.validate"
      ? { ...n, anteriores: ["llm.generate"] }
      : {
          ...n,
          anteriores: n.anteriores.filter((a) => !IDS_FINALIZACAO.has(a)),
          seguintes: n.seguintes.filter((sg) => !IDS_FINALIZACAO.has(sg)),
        },
);

/** IDs acrescentados na versão 4 (infraestrutura de homologação). */
const IDS_HOMOLOGACAO = new Set([
  "test.cycle",
  "test.inbound",
  "test.patient.terra",
  "test.scenario.run",
  "test.load.luna",
  "test.evaluate.sol",
  "test.report",
  "test.review",
  "test.regression",
]);

/** Foto estrutural da versão 3 (antes de a homologação entrar no mapa). */
const SNAPSHOT_V3: AssinaturaNode[] = SNAPSHOT_V4.filter(
  (n) => !IDS_HOMOLOGACAO.has(n.id),
).map((n) => ({
  ...n,
  anteriores: n.anteriores.filter((a) => !IDS_HOMOLOGACAO.has(a)),
  seguintes: n.seguintes.filter((s) => !IDS_HOMOLOGACAO.has(s)),
}));

/**
 * Foto estrutural da versão 2 (antes de a montagem do prompt passar a ler as
 * Instruções da Nina publicadas). Derivada da atual, removendo apenas o que a
 * versão 3 acrescentou.
 */
const SNAPSHOT_V2: AssinaturaNode[] = SNAPSHOT_V3.filter(
  (n) => n.id !== "instructions.published",
).map((n) =>
  n.id === "prompt.compose"
    ? {
        ...n,
        funcao: "systemPromptNina",
        anteriores: n.anteriores.filter((a) => a !== "instructions.published"),
      }
    : n.id === "context.load"
      ? { ...n, seguintes: n.seguintes.filter((s) => s !== "instructions.published") }
      : n,
);


/**
 * Versões já registradas, da mais antiga para a mais recente.
 * Só entra aqui versão com mudança estrutural real do manifesto.
 */
export const HISTORICO_ARQUITETURA: VersaoArquitetura[] = [
  {
    versao: 1,
    data: "2026-09-07",
    deploy: null,
    commit: "4eb2634a1",
    versaoPrompt: null,
    modelo: "google/gemini-2.5-flash",
    quantidadeNodes: SNAPSHOT_ANTERIOR.length,
    quantidadeTools: contarTools(SNAPSHOT_ANTERIOR),
    alteracoes: ["Primeiro mapeamento estruturado do backend da Nina (Fase 1)."],
    snapshot: SNAPSHOT_ANTERIOR,
  },
  {
    versao: 2,
    data: "2026-09-07",
    deploy: null,
    commit: null,
    versaoPrompt: null,
    modelo: "google/gemini-2.5-flash",
    quantidadeNodes: SNAPSHOT_V2.length,
    quantidadeTools: contarTools(SNAPSHOT_V2),
    alteracoes: [
      "Ferramentas e componentes que existiam no código mas não apareciam no mapa foram incluídos.",
      "Ligações imprecisas de catálogo, conhecimento e métricas foram corrigidas.",
      "Sincronização registrada em docs/nina/arquitetura-diff-2026-09-07.md.",
    ],
    snapshot: SNAPSHOT_V2,
  },
  {
    versao: 3,
    data: "2026-09-07",
    deploy: null,
    commit: null,
    versaoPrompt: "Instruções da Nina (versão publicada)",
    modelo: "google/gemini-2.5-flash",
    quantidadeNodes: SNAPSHOT_V3.length,
    quantidadeTools: contarTools(SNAPSHOT_V3),
    alteracoes: [
      "Novo componente: Instruções da Nina (versão publicada), lido pelo backend antes da montagem do prompt.",
      "A montagem do prompt passou a apontar para a função real do atendimento por WhatsApp.",
      "Publicar novas instruções muda só a configuração do componente, sem reorganizar o mapa.",
    ],
    snapshot: SNAPSHOT_V3,
  },
  {
    versao: 4,
    data: "2026-09-08",
    deploy: null,
    commit: null,
    versaoPrompt: "Instruções da Nina (versão publicada)",
    modelo: "google/gemini-2.5-flash",
    quantidadeNodes: SNAPSHOT_V4.length,
    quantidadeTools: contarTools(SNAPSHOT_V4),
    alteracoes: [
      "A homologação entrou no mapa: entrada de teste, ciclo dos leads, paciente simulado (Terra), cenários e teste de carga (Luna).",
      "A avaliação do Sol aparece como etapa posterior à resposta, fora do caminho de geração.",
      "Relatório, envio para Revisão de Aprendizados e teste de regressão passaram a ser componentes visíveis.",
    ],
    snapshot: SNAPSHOT_V4,
  },
  {
    versao: MANIFESTO_ARQUITETURA.versao,
    data: "2026-09-10",
    deploy: null,
    commit: null,
    versaoPrompt: "Instruções da Nina (versão publicada)",
    modelo: "google/gemini-2.5-flash",
    quantidadeNodes: SNAPSHOT_ATUAL.length,
    quantidadeTools: contarTools(SNAPSHOT_ATUAL),
    alteracoes: [
      "Novo componente: Templates das mensagens automáticas, com versão publicada por clínica e texto padrão como reserva.",
      "Novo componente: Finalização da resposta — ponto único por onde passam as respostas do modelo e as mensagens automáticas antes da validação e do envio.",
      "A geração do modelo passou a apontar para a finalização, e não mais direto para a validação da resposta.",
    ],
    snapshot: SNAPSHOT_ATUAL,
  },
];


export function versaoPorNumero(versao: number): VersaoArquitetura | undefined {
  return HISTORICO_ARQUITETURA.find((v) => v.versao === versao);
}

export function versaoAtual(): VersaoArquitetura {
  return HISTORICO_ARQUITETURA[HISTORICO_ARQUITETURA.length - 1]!;
}

export function versaoAnterior(): VersaoArquitetura | null {
  return HISTORICO_ARQUITETURA.length > 1
    ? HISTORICO_ARQUITETURA[HISTORICO_ARQUITETURA.length - 2]!
    : null;
}

/** Conexões (de → para) de uma foto estrutural, sem repetição. */
export function conexoesDe(snapshot: AssinaturaNode[]): Conexao[] {
  const vistas = new Set<string>();
  const saida: Conexao[] = [];
  for (const node of snapshot) {
    for (const destino of node.seguintes) {
      const chave = `${node.id}→${destino}`;
      if (vistas.has(chave)) continue;
      vistas.add(chave);
      saida.push({ de: node.id, para: destino });
    }
  }
  return saida;
}

export function diffConexoes(
  anterior: AssinaturaNode[],
  atual: AssinaturaNode[],
): DiffConexoes {
  const antes = new Set(conexoesDe(anterior).map((c) => `${c.de}→${c.para}`));
  const depois = new Set(conexoesDe(atual).map((c) => `${c.de}→${c.para}`));
  const parse = (chave: string): Conexao => {
    const [de, para] = chave.split("→");
    return { de: de!, para: para! };
  };
  return {
    adicionadas: [...depois].filter((c) => !antes.has(c)).map(parse),
    removidas: [...antes].filter((c) => !depois.has(c)).map(parse),
  };
}

export type ComparacaoVersoes = {
  de: VersaoArquitetura;
  para: VersaoArquitetura;
  nodes: DiffArquitetura;
  conexoes: DiffConexoes;
  /** Nome legível de cada node citado (inclui removidos, só na comparação). */
  nomes: Record<string, string>;
  semMudanca: boolean;
  resumo: string;
};

/** Nome amigável: usa o manifesto atual e cai no id quando o node não existe mais. */
function nomeDe(id: string): string {
  return nodePorId(id)?.nome ?? id;
}

export function compararVersoes(
  de: VersaoArquitetura,
  para: VersaoArquitetura,
): ComparacaoVersoes {
  const nodes = calcularDiffArquitetura(de.snapshot, para.snapshot);
  const conexoes = diffConexoes(de.snapshot, para.snapshot);
  const ids = new Set<string>([
    ...nodes.adicionados,
    ...nodes.alterados.map((m) => m.id),
    ...nodes.removidos,
    ...conexoes.adicionadas.flatMap((c) => [c.de, c.para]),
    ...conexoes.removidas.flatMap((c) => [c.de, c.para]),
  ]);
  const nomes: Record<string, string> = {};
  for (const id of ids) nomes[id] = nomeDe(id);

  const semMudanca =
    nodes.adicionados.length === 0 &&
    nodes.alterados.length === 0 &&
    nodes.removidos.length === 0 &&
    conexoes.adicionadas.length === 0 &&
    conexoes.removidas.length === 0;

  return {
    de,
    para,
    nodes,
    conexoes,
    nomes,
    semMudanca,
    resumo: semMudanca
      ? "Arquitetura sincronizada — nenhuma alteração estrutural detectada."
      : `+${nodes.adicionados.length} componente(s), ~${nodes.alterados.length} alterado(s), -${nodes.removidos.length} removido(s), +${conexoes.adicionadas.length} / -${conexoes.removidas.length} conexão(ões).`,
  };
}

/** Comparação padrão da tela: penúltima versão → versão atual. */
export function comparacaoRecente(): ComparacaoVersoes | null {
  const anterior = versaoAnterior();
  if (!anterior) return null;
  return compararVersoes(anterior, versaoAtual());
}

export type MarcaAlteracao = "adicionado" | "alterado" | "removido";

/**
 * Marcas para o modo "Mostrar alterações" do canvas. Nodes removidos entram no
 * mapa apenas para a listagem histórica — o canvas não desenha node inexistente.
 */
export function destaquesDaComparacao(
  comparacao: ComparacaoVersoes | null,
): Record<string, MarcaAlteracao> {
  if (!comparacao) return {};
  const marcas: Record<string, MarcaAlteracao> = {};
  for (const id of comparacao.nodes.adicionados) marcas[id] = "adicionado";
  for (const m of comparacao.nodes.alterados) marcas[m.id] = "alterado";
  for (const id of comparacao.nodes.removidos) marcas[id] = "removido";
  return marcas;
}

/**
 * Mudança puramente visual não vira versão: comparar só a assinatura estrutural,
 * nunca as posições x/y do canvas.
 */
export function precisaNovaVersao(
  snapshot: AssinaturaNode[] = assinaturaAtual(NODES_ARQUITETURA),
): boolean {
  return !compararVersoes(versaoAtual(), {
    ...versaoAtual(),
    snapshot,
  }).semMudanca;
}
