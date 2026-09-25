/**
 * Jev — Fase 4: quando a identificação encontra mais de um cadastro possível,
 * o Jev SÓ SUGERE à recepção qual cadastro parece combinar. Nunca vincula,
 * cria ou altera cadastro. Puro (sem rede). Só homologação (flag nina_jev_fase4).
 */
import type { PerguntaJev, RespostaJev } from "./jev";

export const CONFIANCA_MINIMA_CADASTRO = 0.8;
export const EMPATE = "empate";
const LIMITE_CANDIDATOS = 10;

export type CandidatoCadastro = {
  id: string;
  nome: string | null;
  data_nascimento: string | null;
  telefone: string | null;
  telefone2?: string | null;
  created_at?: string | null;
};

/** Mesma normalização de nome usada pela identificação no banco. */
export function normalizarNome(n: string | null | undefined): string {
  return String(n ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

export function rotulos(candidatos: CandidatoCadastro[]): string[] {
  return candidatos.slice(0, LIMITE_CANDIDATOS).map((_, i) => `cadastro_${i + 1}`);
}

export function estadoCadastro(
  informado: { nome: string; data_nascimento: string; telefone: string },
  candidatos: CandidatoCadastro[],
) {
  const r = rotulos(candidatos);
  return {
    dados_informados_na_conversa: informado,
    cadastros_possiveis: Object.fromEntries(
      r.map((rot, i) => {
        const c = candidatos[i]!;
        return [rot, { nome: c.nome, data_nascimento: c.data_nascimento, telefone: c.telefone,
          telefone2: c.telefone2 ?? null, cadastrado_em: c.created_at?.slice(0, 10) ?? null }];
      }),
    ),
  };
}

export function perguntaCadastro(candidatos: CandidatoCadastro[]): Record<string, PerguntaJev> {
  const criteria: Record<string, unknown> = {};
  for (const rot of rotulos(candidatos))
    criteria[rot] = `\`cadastros_possiveis.${rot}\` é claramente o cadastro da pessoa descrita em \`dados_informados_na_conversa\`.`;
  criteria[EMPATE] = "Os dados não permitem distinguir com segurança qual cadastro é o da pessoa.";
  return {
    cadastro: {
      type: "choice",
      instructions:
        "Qual cadastro em `cadastros_possiveis` pertence à pessoa descrita em `dados_informados_na_conversa`? Escolha um cadastro só quando os dados o distinguirem claramente dos demais; caso contrário, responda empate.",
      criteria,
    },
  };
}

/** Id sugerido para a recepção, ou null (empate, confiança baixa, rótulo inválido). */
export function sugestaoCadastro(r: RespostaJev | undefined, candidatos: CandidatoCadastro[]): string | null {
  if (!r?.choice || r.choice === EMPATE) return null;
  if (typeof r.confidence !== "number" || r.confidence < CONFIANCA_MINIMA_CADASTRO) return null;
  const i = rotulos(candidatos).indexOf(r.choice);
  return i >= 0 ? candidatos[i]!.id : null;
}
