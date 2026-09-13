/**
 * FASE 3 (PONTUAÇÃO) — REPARTIÇÃO DO PESO DAS INSTRUÇÕES NO CAMINHO ATIVO.
 *
 * Problema corrigido aqui: o cumprimento das instruções publicadas entrava na
 * nota como UMA dimensão agregada de peso fixo, com uma nota média
 * (`completude`). Isso misturava três coisas diferentes:
 *
 *   - requisito ESSENCIAL (regra publicada crítica, literal, proibição);
 *   - requisito CONVERSACIONAL (o que o paciente pediu neste turno);
 *   - avaliação de LINGUAGEM (forma, tom, estilo — sem verificador automático).
 *
 * Agora o ORÇAMENTO configurado dessa dimensão (`pesos
 * .InstructionComplianceValidator`) é distribuído, em partes iguais, entre as
 * obrigações SUBSTANTIVAS aplicáveis (ESSENCIAL + CONVERSACIONAL), depois de
 * agrupar obrigações equivalentes. O agregado sai da conta — ele e as parcelas
 * nunca são somados juntos. Linguagem fica FORA da nota e da cobertura, numa
 * dimensão própria que permanece declaradamente indeterminada quando não há
 * verificador — e isso, sozinho, não rebaixa o turno.
 *
 * Regras preservadas: NOT_APPLICABLE e PENDING ficam fora da nota e da
 * cobertura; UNKNOWN relevante reduz a cobertura e nunca recebe nota de
 * aprovação; violação ou falta de prova de requisito ESSENCIAL continua
 * impedindo aprovação (sinalizada para a política, não "compensada" por peso).
 *
 * Módulo puro: sem banco, sem rede, sem modelo.
 */
import { hashDoTexto } from "./hash";
import { POLITICA_PADRAO, type PoliticaConfianca } from "./policy";
import type {
  MemoriaInstrucoes,
  ResultadoValidador,
  StatusValidador,
} from "./types";

/** Versão desta repartição. Sobe quando a interpretação do peso mudar. */
export const VERSAO_PONTUACAO_INSTRUCOES = "instrucoes-parcelas-1";

/** Nome da dimensão agregada cujo orçamento é repartido. */
export const DIMENSAO_INSTRUCOES = "InstructionComplianceValidator";

/** Nome da dimensão separada de linguagem (não pontua, não cobre). */
export const DIMENSAO_LINGUAGEM = "LanguageComplianceDimension";

export type CategoriaObrigacao = "ESSENCIAL" | "CONVERSACIONAL" | "LINGUAGEM";

/** Uma obrigação como sai da evidência do validador de instruções. */
export type ObrigacaoAvaliada = {
  id: string;
  tipo: string;
  origem: string;
  descricao: string;
  status: string;
  motivo: string;
  prioridade: string | null;
  natureza: string | null;
  verificacao: string;
  regraId: string | null;
};

function texto(v: unknown): string {
  return typeof v === "string" ? v : "";
}

/** Lê as obrigações da evidência sem confiar na forma do objeto. */
export function obrigacoesDaEvidencia(
  evidence: Record<string, unknown> | undefined,
): ObrigacaoAvaliada[] {
  const lista = (evidence?.["obrigacoes"] ?? []) as unknown;
  if (!Array.isArray(lista)) return [];
  return lista
    .filter((o): o is Record<string, unknown> => Boolean(o) && typeof o === "object")
    .map((o) => ({
      id: texto(o["id"]),
      tipo: texto(o["tipo"]),
      origem: texto(o["origem"]),
      descricao: texto(o["descricao"]),
      status: texto(o["status"]),
      motivo: texto(o["motivo"]),
      prioridade: typeof o["prioridade"] === "string" ? (o["prioridade"] as string) : null,
      natureza: typeof o["natureza"] === "string" ? (o["natureza"] as string) : null,
      verificacao: texto(o["verificacao"]),
      regraId: typeof o["regraId"] === "string" ? (o["regraId"] as string) : null,
    }));
}

/**
 * Categoria da obrigação. Nada aqui olha o nome da atendente, da clínica ou um
 * identificador específico: o que decide é a FORMA da obrigação publicada
 * (prioridade declarada, tipo de verificação e origem).
 */
export function categoriaDaObrigacao(o: ObrigacaoAvaliada): CategoriaObrigacao {
  // O que o paciente pediu neste turno é conversa, nunca regra interna.
  if (o.origem === "mensagem_paciente") return "CONVERSACIONAL";

  const deterministica = o.verificacao === "deterministica";
  const critica = o.prioridade === "critica";
  const alta = o.prioridade === "alta";

  // Exigência conferível da publicação (texto literal, conteúdo proibido).
  if (deterministica) return critica || alta ? "ESSENCIAL" : "CONVERSACIONAL";

  // Regra publicada que o avaliador não conseguiu interpretar nunca é tratada
  // como "estilo": ela permanece substantiva e indeterminada.
  if (o.tipo === "restricao_nao_interpretada") return critica ? "ESSENCIAL" : "CONVERSACIONAL";

  // Exigência de FORMA em texto aberto, sem verificador automático (tom,
  // cortesia, estilo da saudação). Ela não é conferível por máquina, então vai
  // para a dimensão separada: continua declarada como indeterminada, mas não
  // entra na nota nem na cobertura e, sozinha, não rebaixa o turno.
  // Só escapa disso o que a publicação marcou como crítico.
  if (o.motivo.includes("LINGUAGEM_ABERTA") || o.verificacao === "linguagem_aberta") {
    return critica ? "ESSENCIAL" : "LINGUAGEM";
  }

  if (critica) return "ESSENCIAL";
  if (alta) return "CONVERSACIONAL";
  return "LINGUAGEM";

}

/** Estado padronizado da obrigação. */
export function statusDaObrigacao(status: string): StatusValidador {
  if (status === "cumprida") return "PASS";
  if (status === "descumprida") return "FAIL";
  if (status === "nao_aplicavel") return "NOT_APPLICABLE";
  return "UNKNOWN";
}

/**
 * Chave de equivalência: obrigações que conferem a MESMA coisa caem numa
 * parcela só. Renomear ou duplicar uma regra não aumenta peso nem dilui falha.
 */
function chaveEquivalencia(o: ObrigacaoAvaliada, categoria: CategoriaObrigacao): string {
  const conteudo = o.regraId ?? `${o.tipo}|${o.descricao.trim().toLowerCase()}`;
  return `${categoria}|${hashDoTexto(conteudo) ?? conteudo}`;
}

/** Pior estado prevalece no grupo: falha > indeterminado > cumprido. */
const PIOR: Record<StatusValidador, number> = {
  FAIL: 0,
  BLOCK: 0,
  WARNING: 1,
  UNKNOWN: 2,
  PASS: 3,
  PENDING: 4,
  NOT_APPLICABLE: 5,
};

type Grupo = {
  chave: string;
  categoria: CategoriaObrigacao;
  itens: ObrigacaoAvaliada[];
  status: StatusValidador;
};

function agrupar(obrigacoes: ObrigacaoAvaliada[]): Grupo[] {
  const mapa = new Map<string, Grupo>();
  for (const o of obrigacoes) {
    const categoria = categoriaDaObrigacao(o);
    const chave = chaveEquivalencia(o, categoria);
    const status = statusDaObrigacao(o.status);
    const atual = mapa.get(chave);
    if (!atual) {
      mapa.set(chave, { chave, categoria, itens: [o], status });
      continue;
    }
    atual.itens.push(o);
    if (PIOR[status] < PIOR[atual.status]) atual.status = status;
  }
  return [...mapa.values()];
}

export type ReparticaoInstrucoes = {
  /** Parcelas que substituem a dimensão agregada na nota e na cobertura. */
  parcelas: ResultadoValidador[];
  /** Dimensão separada de linguagem (peso zero, fora da nota e da cobertura). */
  linguagem: ResultadoValidador | null;
  memoria: MemoriaInstrucoes;
};

/**
 * Reparte o orçamento de instruções entre as obrigações substantivas.
 * Devolve `null` quando não há obrigação conferível — nesse caso o agregado
 * continua valendo exatamente como antes.
 */
export function repartirInstrucoes(
  agregado: ResultadoValidador,
  politica: PoliticaConfianca = POLITICA_PADRAO,
): ReparticaoInstrucoes | null {
  const obrigacoes = obrigacoesDaEvidencia(agregado.evidence);
  if (obrigacoes.length === 0) return null;

  const orcamento = politica.pesos[DIMENSAO_INSTRUCOES] ?? 0;
  const grupos = agrupar(obrigacoes);

  const substantivos = grupos.filter(
    (g) =>
      g.categoria !== "LINGUAGEM" &&
      g.status !== "NOT_APPLICABLE" &&
      g.status !== "PENDING",
  );
  const linguagem = grupos.filter((g) => g.categoria === "LINGUAGEM");

  // Nenhuma obrigação substantiva aplicável: o orçamento não é distribuído e
  // a dimensão sai da nota. Linguagem sozinha nunca vira nota nem cobertura.
  const peso = substantivos.length === 0 ? 0 : orcamento / substantivos.length;

  const limitacoes = (agregado.evidence?.["limitacoes"] ?? []) as unknown;
  const limitacoesLinguagem = Array.isArray(limitacoes)
    ? limitacoes.filter((l): l is string => typeof l === "string")
    : [];

  const parcelas: ResultadoValidador[] = substantivos.map((g) => {
    const rep = g.itens.find((i) => statusDaObrigacao(i.status) === g.status) ?? g.itens[0]!;
    const concluida = g.status === "PASS" || g.status === "FAIL";
    return {
      validator: `Instrucao:${g.categoria}:${g.chave}`,
      status: g.status,
      score: g.status === "PASS" ? 100 : 0,
      reasonCode: rep.motivo,
      evidence: {
        categoria: g.categoria,
        descricao: rep.descricao,
        identificadores: g.itens.map((i) => i.regraId ?? i.id),
        peso,
        contaNaNota: concluida,
        contaNaCobertura: true,
      },
      blocker: null,
      peso: 0,
      pesoParcela: peso,
    };
  });

  const lingConcluidas = linguagem.filter((g) => g.status === "PASS" || g.status === "FAIL");
  const lingIndeterminadas = linguagem.filter((g) => g.status === "UNKNOWN");
  const dimensaoLinguagem: ResultadoValidador | null =
    linguagem.length === 0
      ? null
      : {
          validator: DIMENSAO_LINGUAGEM,
          // Sem verificador automático a linguagem permanece indeterminada —
          // declarada, jamais presumida como cumprida.
          status:
            lingConcluidas.some((g) => g.status === "FAIL")
              ? "FAIL"
              : lingIndeterminadas.length > 0
                ? "UNKNOWN"
                : "PASS",
          score: lingConcluidas.length === 0 ? 0 : lingConcluidas.every((g) => g.status === "PASS") ? 100 : 0,
          reasonCode:
            lingIndeterminadas.length > 0
              ? "LINGUAGEM_SEM_VERIFICADOR_AUTOMATICO"
              : "LINGUAGEM_CONFERIDA",
          evidence: {
            dimensaoSeparada: true,
            avaliadas: lingConcluidas.length,
            indeterminadas: lingIndeterminadas.length,
            obrigacoes: linguagem.map((g) => ({
              chave: g.chave,
              status: g.status,
              descricao: g.itens[0]?.descricao ?? "",
            })),
            limitacoes: limitacoesLinguagem,
          },
          blocker: null,
          peso: 0,
          // Peso zero e fora da nota/cobertura: por definição, não gera LOW.
          pesoParcela: 0,
        };

  const essenciais = grupos.filter((g) => g.categoria === "ESSENCIAL");
  const violado = essenciais.some((g) => g.status === "FAIL");
  const semProva = essenciais.some((g) => g.status === "UNKNOWN");

  const memoria: MemoriaInstrucoes = {
    versao: VERSAO_PONTUACAO_INSTRUCOES,
    orcamento,
    parcelas: grupos.map((g) => {
      const rep = g.itens.find((i) => statusDaObrigacao(i.status) === g.status) ?? g.itens[0]!;
      const substantiva = substantivos.includes(g);
      const concluida = g.status === "PASS" || g.status === "FAIL";
      return {
        chave: g.chave,
        categoria: g.categoria,
        identificadores: g.itens.map((i) => i.regraId ?? i.id),
        descricao: rep.descricao,
        peso: substantiva ? peso : 0,
        status: g.status,
        nota: concluida ? (g.status === "PASS" ? 100 : 0) : null,
        motivo: rep.motivo,
        contaNaNota: substantiva && concluida,
        contaNaCobertura: substantiva,
      };
    }),
    linguagem: {
      dimensao: DIMENSAO_LINGUAGEM,
      status: dimensaoLinguagem?.status ?? "NOT_APPLICABLE",
      avaliadas: lingConcluidas.length,
      indeterminadas: lingIndeterminadas.length,
      nota:
        lingConcluidas.length === 0
          ? null
          : Math.round(
              (lingConcluidas.filter((g) => g.status === "PASS").length / lingConcluidas.length) *
                100,
            ),
      limitacoes: limitacoesLinguagem,
    },
    essencial: {
      violado,
      semProva,
      identificadores: essenciais
        .filter((g) => g.status === "FAIL" || g.status === "UNKNOWN")
        .flatMap((g) => g.itens.map((i) => i.regraId ?? i.id)),
    },
  };

  return { parcelas, linguagem: dimensaoLinguagem, memoria };
}

/** Linha auditável da memória de cálculo (mesma ordem do relatório). */
export function explicarInstrucoes(m: MemoriaInstrucoes): string {
  const parcelas = m.parcelas
    .map(
      (p) =>
        `${p.categoria}/${p.identificadores.join("+") || p.chave}=${p.status}` +
        `(peso ${Number(p.peso.toFixed(2))}${p.contaNaNota ? "" : ", fora da nota"})`,
    )
    .join(" | ");
  return [
    `orcamento=${m.orcamento}`,
    `parcelas: ${parcelas || "-"}`,
    `linguagem=${m.linguagem.status} (indeterminadas=${m.linguagem.indeterminadas}, dimensao separada)`,
    `essencial: violado=${m.essencial.violado} semProva=${m.essencial.semProva}`,
    `versao=${m.versao}`,
  ].join(" | ");
}
