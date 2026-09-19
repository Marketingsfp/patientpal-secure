/**
 * Contas da prova e do treino — feitas SEMPRE no servidor.
 *
 * Antes a nota da prova e a duração do treino eram calculadas no navegador e
 * gravadas direto na tabela: dava para abrir o console e gravar 10, ou ler a
 * alternativa correta antes de responder. Agora o navegador só mostra; quem
 * corrige, pontua e cronometra é o servidor, usando estas funções puras.
 */

export type QuestaoCompleta = {
  pergunta: string;
  alternativas: string[];
  correta: number;
  explicacao: string;
  origem: string;
};

/** O que o navegador pode ver enquanto a prova está em andamento. */
export type QuestaoSegura = {
  pergunta: string;
  alternativas: string[];
  origem: string;
};

/** Tira a resposta certa e a explicação antes de mandar para a tela. */
export function sanitizarQuestoes(questoes: QuestaoCompleta[]): QuestaoSegura[] {
  return questoes.map((q) => ({
    pergunta: q.pergunta,
    alternativas: q.alternativas,
    origem: q.origem,
  }));
}

export type ResultadoProva = { acertos: number; total: number; nota: number };

/** Correção da prova: acertos, total e nota de 0 a 10 com uma casa. */
export function corrigirProva(
  questoes: QuestaoCompleta[],
  respostas: number[],
): ResultadoProva {
  const total = questoes.length;
  const acertos = questoes.reduce(
    (n, q, i) => (Number(respostas[i]) === Number(q.correta) ? n + 1 : n),
    0,
  );
  const nota = total ? Number(((acertos / total) * 10).toFixed(1)) : 0;
  return { acertos, total, nota };
}

/** Guarda a resposta na posição certa, sem deixar o cliente inventar índices. */
export function aplicarResposta(
  respostas: unknown,
  indice: number,
  alternativa: number,
  total: number,
  alternativasDaQuestao: number,
): number[] {
  const base = Array.isArray(respostas) ? (respostas as unknown[]) : [];
  const lista = Array.from({ length: total }, (_, i) => {
    const v = Number(base[i]);
    return Number.isInteger(v) && v >= 0 ? v : -1;
  });
  if (indice < 0 || indice >= total) throw new Error("Questão inválida.");
  if (alternativa < 0 || alternativa >= alternativasDaQuestao) {
    throw new Error("Alternativa inválida.");
  }
  lista[indice] = alternativa;
  return lista;
}

/** Tempo do treino medido pelo servidor (mínimo 1s, teto de 2 horas). */
export function duracaoSegundos(inicio: string | Date, agora: Date = new Date()): number {
  const t = inicio instanceof Date ? inicio.getTime() : Date.parse(inicio);
  if (!Number.isFinite(t)) return 1;
  const seg = Math.round((agora.getTime() - t) / 1000);
  return Math.max(1, Math.min(7200, seg));
}

/** Nota do treino sempre entre 0 e 10, com uma casa decimal. */
export function notaValida(valor: unknown): number {
  const n = Number(valor);
  if (!Number.isFinite(n)) return 0;
  return Number(Math.max(0, Math.min(10, n)).toFixed(1));
}

/** Sessão parada há mais de 2 horas é encerrada sem nota. */
export function treinoExpirado(inicio: string | Date, agora: Date = new Date()): boolean {
  const t = inicio instanceof Date ? inicio.getTime() : Date.parse(inicio);
  if (!Number.isFinite(t)) return false;
  return agora.getTime() - t > 2 * 60 * 60 * 1000;
}
