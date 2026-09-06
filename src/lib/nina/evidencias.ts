/**
 * FASE 2 — EVIDÊNCIAS DA EXECUÇÃO DA NINA (parte pura, testável).
 *
 * Objetivo: permitir INVESTIGAR uma resposta já enviada, sem nunca executar a
 * Nina de novo. Tudo aqui é registro do que aconteceu no momento da resposta.
 *
 * Fontes distintas, nunca misturadas:
 *   catalogo     → informações oficiais cadastradas (única base de conhecimento)
 *   agenda       → disponibilidade e resultado real de agendamento
 *   crm          → dados cadastrais do paciente
 *   atendimento  → sessão, atribuição, handoff, resolução e demais estados
 *   modelo       → o que foi enviado/recebido do modelo
 *   sistema      → validações e ajustes aplicados pelo próprio código
 *
 * O que NÃO existe aqui: reconstrução, reexecução, preenchimento de lacunas
 * por IA. Falta de dado é declarada como lacuna, nunca adivinhada.
 */

export const FONTES = ["catalogo", "agenda", "crm", "atendimento", "modelo", "sistema"] as const;
export type FonteEvidencia = (typeof FONTES)[number];

export type TipoEtapa =
  | "estado_sessao"
  | "regras_instrucoes"
  | "mensagens_entrada"
  | "consulta"
  | "contexto_modelo"
  | "modelo_parametros"
  | "ferramenta"
  | "validacao"
  | "resposta_original"
  | "alteracao_posterior"
  | "mensagem_final";

/** Referência ao código responsável pela etapa — informada por quem instrumenta. */
export type ReferenciaCodigo = {
  arquivo: string;
  funcao: string;
  regra?: string | null;
  versao?: string | null;
};

export type Etapa = {
  tipo: TipoEtapa;
  fonte: FonteEvidencia;
  titulo: string;
  em: string;
  // `any` proposital: o conteúdo varia por etapa e precisa trafegar como JSON.
  dados: Record<string, any>;
  codigo?: ReferenciaCodigo;
};

/** Snapshot de uma consulta ao catálogo, preservado como estava na ocasião. */
export type ConsultaCatalogo = {
  /** "Exames e procedimentos" ou "Consultas e profissionais". */
  secao: string;
  filtros: Record<string, unknown>;
  cache: boolean;
  /** Tudo que a consulta devolveu do banco. */
  encontrados: RegistroCatalogo[];
  /** O subconjunto que passou pelo ranking/limite. */
  selecionados: string[];
  /** Campos que efetivamente foram para o texto entregue ao modelo. */
  camposEnviados: string[];
  knowledgeStatus?: string | null;
};

export type RegistroCatalogo = {
  id: string;
  nome: string;
  /** Versão do registro na ocasião (data da última alteração). */
  versao: string | null;
  publicacao: string | null;
  camposEncontrados: string[];
};

const LIMITE_TEXTO = 8000;

function corta(v: unknown, max = LIMITE_TEXTO): string {
  const s = typeof v === "string" ? v : JSON.stringify(v ?? null);
  return s.length > max ? `${s.slice(0, max)}…[truncado]` : s;
}

function clonar<T>(v: T): T {
  if (v === null || typeof v !== "object") return v;
  try {
    return JSON.parse(JSON.stringify(v)) as T;
  } catch {
    return v;
  }
}

export type Coletor = {
  etapa: (e: Omit<Etapa, "em"> & { em?: string }) => void;
  mensagensEntrada: (ids: string[]) => void;
  pacote: () => PacoteEvidencias;
};

export type PacoteEvidencias = {
  etapas: Etapa[];
  mensagensEntrada: string[];
  lacunas: string[];
};

/**
 * Coletor de uma execução. Acumula em memória e não grava nada sozinho:
 * observabilidade jamais pode derrubar um atendimento.
 */
export function criarColetor(agora: () => string = () => new Date().toISOString()): Coletor {
  const etapas: Etapa[] = [];
  let entrada: string[] = [];
  return {
    etapa(e) {
      // Cópia profunda no ato: a evidência é um snapshot do momento. Uma
      // alteração posterior no objeto de origem não pode reescrevê-la.
      const dados = Object.fromEntries(
        Object.entries(e.dados).map(([k, v]) => [
          k,
          typeof v === "string" ? corta(v) : clonar(v),
        ]),
      );
      etapas.push({ ...e, em: e.em ?? agora(), dados });
    },
    mensagensEntrada(ids) {
      entrada = [...new Set(ids.filter(Boolean))];
    },
    pacote() {
      return { etapas, mensagensEntrada: entrada, lacunas: lacunas(etapas, entrada) };
    },
  };
}

/**
 * O que NÃO pôde ser comprovado nesta execução. A tela mostra a lacuna em vez
 * de sugerir que a evidência existe.
 */
export function lacunas(etapas: readonly Etapa[], mensagensEntrada: readonly string[]): string[] {
  const tem = (t: TipoEtapa) => etapas.some((e) => e.tipo === t);
  const faltas: string[] = [];
  if (!mensagensEntrada.length) faltas.push("mensagens_entrada");
  if (!tem("estado_sessao")) faltas.push("estado_sessao");
  if (!tem("regras_instrucoes")) faltas.push("regras_instrucoes");
  if (!tem("consulta")) faltas.push("consulta_catalogo");
  if (!tem("contexto_modelo")) faltas.push("contexto_modelo");
  if (!tem("modelo_parametros")) faltas.push("modelo_parametros");
  if (!tem("resposta_original")) faltas.push("resposta_original");
  if (!tem("mensagem_final")) faltas.push("mensagem_final");
  return faltas;
}

export const ROTULO_LACUNA: Record<string, string> = {
  mensagens_entrada: "Mensagens de entrada não vinculadas",
  estado_sessao: "Estado e sessão não registrados",
  regras_instrucoes: "Regras e versão das instruções não registradas",
  consulta_catalogo: "Nenhuma consulta ao catálogo registrada",
  contexto_modelo: "Conteúdo enviado ao modelo não registrado",
  modelo_parametros: "Modelo e parâmetros não registrados",
  resposta_original: "Resposta original não registrada",
  mensagem_final: "Mensagem final não registrada",
};

export const ROTULO_FONTE: Record<FonteEvidencia, string> = {
  catalogo: "Catálogo",
  agenda: "Agenda",
  crm: "Cadastro do paciente",
  atendimento: "Atendimento",
  modelo: "Modelo",
  sistema: "Sistema",
};

export const ROTULO_ETAPA: Record<TipoEtapa, string> = {
  estado_sessao: "Estado e sessão no momento da resposta",
  regras_instrucoes: "Regras e versão das instruções",
  mensagens_entrada: "Mensagens de entrada usadas",
  consulta: "Consulta realizada",
  contexto_modelo: "Conteúdo enviado ao modelo",
  modelo_parametros: "Modelo e parâmetros",
  ferramenta: "Ferramenta executada",
  validacao: "Validação executada",
  resposta_original: "Resposta original do modelo",
  alteracao_posterior: "Alteração aplicada depois da resposta",
  mensagem_final: "Mensagem final enviada",
};

/**
 * "Pergunta do paciente" da investigação: SOMENTE as mensagens vinculadas à
 * execução, em ordem cronológica. Uma resposta pode ter nascido de várias
 * mensagens fragmentadas — todas aparecem. Sem vínculo, devolve `null` para a
 * tela declarar a limitação, nunca a última mensagem atual da conversa.
 */
export function perguntaDaExecucao(
  mensagensVinculadas: readonly { id: string; texto: string | null; em: string | null }[],
): { fragmentos: { id: string; texto: string; em: string | null }[]; texto: string } | null {
  const validas = mensagensVinculadas
    .filter((m) => (m.texto ?? "").trim() !== "")
    .map((m) => ({ id: m.id, texto: (m.texto ?? "").trim(), em: m.em ?? null }))
    .sort((a, b) => (a.em ?? "").localeCompare(b.em ?? ""));
  if (!validas.length) return null;
  return { fragmentos: validas, texto: validas.map((m) => m.texto).join("\n") };
}

/** Ordena as etapas como aconteceram, para a leitura da investigação. */
export function ordenarEtapas(etapas: readonly Etapa[]): Etapa[] {
  return [...etapas].sort((a, b) => a.em.localeCompare(b.em));
}
