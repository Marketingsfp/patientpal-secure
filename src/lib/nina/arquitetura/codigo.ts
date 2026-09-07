/**
 * FASE 5 — Extração somente leitura de trechos de código para o painel de
 * detalhes da arquitetura.
 *
 * Este módulo é puro: não lê disco, não executa nada e não conhece banco.
 * Ele apenas recorta o trecho relevante de um arquivo já carregado e remove
 * qualquer valor sensível antes de o texto sair do servidor.
 */
import { NODES_ARQUITETURA } from "./manifesto";

export type TrechoCodigo = {
  arquivo: string;
  funcao?: string;
  linguagem: string;
  linhaInicial: number;
  trecho: string;
  /** true quando alguma linha foi ocultada por conter valor sensível. */
  ocultouSensivel: boolean;
};

/** Só arquivos citados pelo manifesto podem ser lidos. */
export function arquivosPermitidos(): Set<string> {
  const lista = new Set<string>();
  for (const node of NODES_ARQUITETURA) {
    if (node.arquivo) lista.add(node.arquivo);
  }
  return lista;
}

export function arquivoPermitido(arquivo: string): boolean {
  return arquivosPermitidos().has(arquivo);
}

export function linguagemDoArquivo(arquivo: string): string {
  if (arquivo.endsWith(".tsx")) return "tsx";
  if (arquivo.endsWith(".ts")) return "typescript";
  if (arquivo.endsWith(".sql")) return "sql";
  if (arquivo.endsWith(".json")) return "json";
  return "texto";
}

/** Padrões de linha que nunca podem ser exibidos com o valor original. */
const PADROES_SENSIVEIS = [
  /(secret|token|api[_-]?key|apikey|password|senha|authorization|bearer|service[_-]?role|cookie|credential|passphrase|private[_-]?key)/i,
  /process\.env/,
  /import\.meta\.env/,
  /eyJ[A-Za-z0-9_-]{10,}/,
  /sb_(secret|publishable)_/,
];

export function ocultarSensiveis(linhas: string[]): { linhas: string[]; ocultou: boolean } {
  let ocultou = false;
  const saida = linhas.map((linha) => {
    if (!PADROES_SENSIVEIS.some((p) => p.test(linha))) return linha;
    ocultou = true;
    const indentacao = linha.match(/^\s*/)?.[0] ?? "";
    return `${indentacao}// [conteúdo sensível oculto]`;
  });
  return { linhas: saida, ocultou };
}

const LINHAS_ANTES = 6;
const LINHAS_DEPOIS = 45;

/**
 * Recorta o trecho em volta da função informada. Sem função (ou sem
 * correspondência), devolve o começo do arquivo.
 */
export function extrairTrecho(
  arquivo: string,
  conteudo: string,
  funcao?: string,
): TrechoCodigo {
  const todas = conteudo.split("\n");
  const nomeLimpo = funcao?.replace(/\(.*\)$/, "").trim();

  let indice = -1;
  if (nomeLimpo) {
    const alvo = new RegExp(`(function|const|let|var|export|async|\\.)\\s*${escaparRegex(nomeLimpo)}\\b`);
    indice = todas.findIndex((linha) => alvo.test(linha));
    if (indice < 0) indice = todas.findIndex((linha) => linha.includes(nomeLimpo));
  }

  const inicio = indice < 0 ? 0 : Math.max(0, indice - LINHAS_ANTES);
  const fim = Math.min(todas.length, (indice < 0 ? 0 : indice) + LINHAS_DEPOIS);
  const recorte = todas.slice(inicio, fim);
  const { linhas, ocultou } = ocultarSensiveis(recorte);

  return {
    arquivo,
    funcao: nomeLimpo,
    linguagem: linguagemDoArquivo(arquivo),
    linhaInicial: inicio + 1,
    trecho: linhas.join("\n"),
    ocultouSensivel: ocultou,
  };
}

function escaparRegex(texto: string): string {
  return texto.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
