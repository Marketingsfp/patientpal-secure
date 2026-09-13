/**
 * FASE 4 (MOTOR) — IDENTIDADE DECLARADA NA RESPOSTA x IDENTIDADE PUBLICADA.
 *
 * O bloco [IDENTIDADE DO ATENDIMENTO] do prompt publicado é conteúdo
 * CONFIÁVEL: ele diz qual é o nome da atendente e do estabelecimento daquela
 * publicação. Quando a resposta se apresenta com OUTRO nome, isso é um erro
 * essencial de identidade — e só pode ser detectado comparando com a
 * publicação.
 *
 * Nada aqui é fixo: nenhum nome de atendente, de clínica ou identificador está
 * codificado. O critério é a COMPARAÇÃO com o que a publicação declarou. Se a
 * publicação não declara identidade, ou se a resposta não se apresenta, a
 * conferência simplesmente não se aplica (nunca vira aprovação).
 *
 * Módulo puro: sem banco, sem rede, sem modelo.
 */

export type IdentidadePublicada = {
  atendente: string | null;
  estabelecimento: string | null;
  tipo: string | null;
};

export type SituacaoIdentidade =
  /** A resposta se apresenta e bate com a publicação. */
  | "coerente"
  /** A resposta se apresenta com nome diferente do publicado. */
  | "divergente"
  /** A resposta não se apresenta: nada a conferir nesta dimensão. */
  | "nao_declarada";

export type ConferenciaIdentidade = {
  situacao: SituacaoIdentidade;
  declarado: { atendente: string | null; estabelecimento: string | null };
  esperado: { atendente: string | null; estabelecimento: string | null };
  divergencias: Array<"atendente" | "estabelecimento">;
};

function normalizar(v: string | null): string {
  return (v ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const CAMPOS: Array<[keyof IdentidadePublicada, RegExp]> = [
  ["atendente", /nome\s+da\s+atendente[^:\n]*:\s*(.+)/i],
  ["estabelecimento", /nome\s+do\s+estabelecimento[^:\n]*:\s*(.+)/i],
  ["tipo", /tipo\s+do\s+estabelecimento[^:\n]*:\s*(.+)/i],
];

/** Lê o bloco de identidade do texto publicado. `null` se não houver bloco. */
export function extrairIdentidadePublicada(texto: string | null): IdentidadePublicada | null {
  if (!texto || texto.trim() === "") return null;
  const bloco = /\[IDENTIDADE DO ATENDIMENTO\]([\s\S]*?)\[\/IDENTIDADE DO ATENDIMENTO\]/i.exec(
    texto,
  );
  const alvo = bloco?.[1] ?? null;
  if (!alvo) return null;

  const id: IdentidadePublicada = { atendente: null, estabelecimento: null, tipo: null };
  for (const [campo, re] of CAMPOS) {
    const m = re.exec(alvo);
    const valor = m?.[1]?.trim() ?? "";
    if (valor !== "") id[campo] = valor;
  }
  return id.atendente || id.estabelecimento ? id : null;
}

/** Nome com que a resposta se apresenta ("eu sou a X", "aqui é o X"). */
function atendenteDeclarada(resposta: string): string | null {
  const m =
    /\b(?:eu\s+sou|sou|aqui\s+(?:é|e)|me\s+chamo)\s+(?:a|o)?\s*([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ'-]{1,30})/i.exec(
      resposta,
    );
  return m?.[1]?.trim() ?? null;
}

/** Estabelecimento que a resposta diz representar. */
function estabelecimentoDeclarado(resposta: string): string | null {
  const m =
    /\batendente\s+(?:virtual\s+)?d(?:a|o|as|os|e)\s+([^.,!?;\n]{2,60})/i.exec(resposta) ??
    /\b(?:da|do)\s+(?:cl[ií]nica|policl[ií]nica|hospital|laborat[óo]rio|centro)\s+([^.,!?;\n]{2,60})/i.exec(
      resposta,
    );
  return m?.[1]?.trim() ?? null;
}

function contemNome(declarado: string, esperado: string): boolean {
  const d = normalizar(declarado);
  const e = normalizar(esperado);
  if (d === "" || e === "") return true;
  return d.includes(e) || e.includes(d);
}

/**
 * Compara a identidade declarada na resposta com a identidade publicada.
 * Sem publicação de identidade ou sem apresentação na resposta: não se aplica.
 */
export function conferirIdentidadeDaResposta(
  identidade: IdentidadePublicada | null,
  resposta: string,
): ConferenciaIdentidade {
  const esperado = {
    atendente: identidade?.atendente ?? null,
    estabelecimento: identidade?.estabelecimento ?? null,
  };
  const declarado = {
    atendente: atendenteDeclarada(resposta),
    estabelecimento: estabelecimentoDeclarado(resposta),
  };
  if (!identidade || (declarado.atendente === null && declarado.estabelecimento === null)) {
    return { situacao: "nao_declarada", declarado, esperado, divergencias: [] };
  }

  const divergencias: Array<"atendente" | "estabelecimento"> = [];
  if (
    declarado.atendente &&
    esperado.atendente &&
    !contemNome(declarado.atendente, esperado.atendente)
  ) {
    divergencias.push("atendente");
  }
  if (
    declarado.estabelecimento &&
    esperado.estabelecimento &&
    !contemNome(declarado.estabelecimento, esperado.estabelecimento)
  ) {
    divergencias.push("estabelecimento");
  }

  return {
    situacao: divergencias.length > 0 ? "divergente" : "coerente",
    declarado,
    esperado,
    divergencias,
  };
}
