/**
 * FASE 4 — DUAS VERIFICAÇÕES DISTINTAS DA HOMOLOGAÇÃO.
 *
 *  A. "Validar fonte e aderência do prompt" — prova que a regra PUBLICADA
 *     chegou ao payload e que a PRIMEIRA resposta do modelo a cumpriu.
 *     NÃO é aprovação do pipeline: nenhuma política de confiança, nenhuma
 *     ferramenta e nenhuma finalização participam dela.
 *
 *  B. "Validar atendimento completo" — roda o pipeline normal (mesmas
 *     políticas da produção) e mostra, separadamente, o texto que o modelo
 *     produziu e o que foi entregue depois de confiança/finalização,
 *     identificando qualquer intervenção.
 *
 * Módulo PURO: sem banco, sem rede. Nenhuma resposta é escrita aqui — o que
 * a configuração define é o MARCADOR esperado, não o texto do modelo.
 */
import { alteracaoDaTransformacao } from "@/lib/nina/rastreio/turno";


/** Par de teste: uma regra publicável e o marcador que ela exige. */
export type ParMarcador = {
  id: string;
  /** Frase enviada como mensagem do paciente para exercitar a regra. */
  gatilho: string;
  /** Marcador exato que a resposta deve conter. */
  marcador: string;
};

/**
 * Configuração de teste. Dois pares DISTINTOS: trocar o par muda o que o
 * modelo precisa dizer, então uma resposta fixa no código nunca passaria nos
 * dois. Editável pela chamada — estes são apenas os valores padrão.
 */
export const PARES_MARCADOR_PADRAO: readonly ParMarcador[] = [
  { id: "par-a", gatilho: "Qual é o código de verificação da unidade?", marcador: "NINA-VERIF-ALFA-7731" },
  { id: "par-b", gatilho: "Me confirme o selo interno desta verificação.", marcador: "NINA-VERIF-BETA-4902" },
];

/**
 * Texto da regra publicada no escopo isolado de homologação. Não contém
 * marcador `${...}`: é validado pela mesma allowlist da publicação real.
 */
export function regraPublicavelDoPar(par: ParMarcador): string {
  return [
    "Você é a Nina em verificação técnica de homologação.",
    `REGRA DE VERIFICAÇÃO: quando a mensagem for "${par.gatilho}", responda exatamente com o texto ${par.marcador} e nada mais.`,
    "Esta verificação não executa nenhuma operação e não atende paciente real.",
  ].join("\n");
}

export type ResultadoVerificacaoFonte = {
  parId: string;
  marcador: string;
  /** Versão realmente publicada e resolvida pelo caminho oficial. */
  versao: number | null;
  versaoId: string | null;
  origemVersao: string;
  fallbackPorErro: boolean;
  /** A regra publicada apareceu no payload enviado ao modelo. */
  regraChegouAoPayload: boolean;
  /** A PRIMEIRA resposta do modelo cumpriu a regra (igualdade literal). */
  primeiraRespostaCumpriu: boolean;
  /** O sistema alterou o texto do modelo antes de considerar a resposta. */
  sistemaAlterouTexto: boolean;
  /** O texto FINAL desta verificação cumpriu a regra. */
  entregaCumpriu: boolean;
  /** Impressão digital do texto enviado (auditoria, sem expor o prompt). */
  hashPayload: string | null;
  modelo: string | null;
  erro: string | null;
  /** Aviso permanente: escopo desta verificação. */
  escopoDaProva: string;
  /** Partes do atendimento normal que este caminho isolado NÃO percorre. */
  partesNaoPercorridas: readonly string[];
};

export const ESCOPO_DA_PROVA_FONTE =
  "Caminho ISOLADO de verificação: prova apenas que a regra publicada chegou ao payload do modelo e que a primeira resposta a cumpriu. Não aprova o atendimento completo.";

/**
 * O que este caminho isolado NÃO percorre. Fica visível no resultado para
 * que a aprovação da fonte nunca seja lida como aprovação do atendimento.
 */
export const PARTES_NAO_PERCORRIDAS_FONTE: readonly string[] = [
  "ferramentas da Nina (agenda, paciente, catálogo)",
  "motor de confiabilidade e políticas de confiança",
  "bloqueio por baixa confiança e encaminhamento humano",
  "finalização, templates e transformações da resposta",
  "persistência da conversa e envio da mensagem",
];

/**
 * Desfechos que NÃO cumprem a regra publicada. Encaminhar para atendimento
 * humano ou cair em texto de contingência resolve o atendimento, mas não é a
 * resposta exigida: no teste de aderência isso é "não atendido".
 */
const DESFECHOS_QUE_NAO_CUMPREM =
  /(chamar uma pessoa da nossa equipe|pessoa da nossa equipe retome|n[ãa]o consegui concluir|vou verificar novamente|encaminh(ar|ei|ando) (voc[êe] )?para (o|um) atendimento)/i;

/**
 * Avalia a aderência sem julgar o resto do atendimento.
 *
 * A regra publicada exige responder EXATAMENTE o marcador e nada mais: a
 * conferência é de IGUALDADE LITERAL do texto, preservando caixa e
 * acentuação. `includes` aprovaria resposta com saudação ou texto extra —
 * exatamente o que a regra proíbe.
 *
 * Os resultados ficam SEPARADOS: o que o modelo produziu, se o sistema
 * alterou o texto e o que a entrega final cumpriu. Marcador produzido por
 * código nunca prova obediência do modelo.
 */
export function avaliarAderenciaFonte(entrada: {
  par: ParMarcador;
  payload: string;
  primeiraResposta: string;
  /** Texto final desta verificação, quando o sistema alterou o do modelo. */
  textoEntregue?: string | null;
  /** Origem registrada do texto entregue, quando conhecida. */
  origemResposta?: string | null;
}): {
  regraChegouAoPayload: boolean;
  primeiraRespostaCumpriu: boolean;
  sistemaAlterouTexto: boolean;
  entregaCumpriu: boolean;
  desfechoSubstituiuResposta: boolean;
  motivo: string | null;
} {
  const payload = entrada.payload ?? "";
  const original = (entrada.primeiraResposta ?? "").trim();
  const entregue = (entrada.textoEntregue ?? entrada.primeiraResposta ?? "").trim();
  const origem = String(entrada.origemResposta ?? "");
  const desfechoSubstituiuResposta =
    DESFECHOS_QUE_NAO_CUMPREM.test(entregue) ||
    ["transferencia", "fallback", "fallback_erro", "limite_rodadas"].includes(origem);
  // Igualdade literal: nada antes, nada depois, sem trocar caixa/acentuação.
  const exato = (t: string) => t === entrada.par.marcador;
  const modeloCumpriu = exato(original);
  const sistemaAlterouTexto = entregue !== original;
  const entregaCumpriu = exato(entregue) && !desfechoSubstituiuResposta;
  return {
    regraChegouAoPayload: payload.includes(entrada.par.marcador),
    primeiraRespostaCumpriu: modeloCumpriu && !desfechoSubstituiuResposta,
    sistemaAlterouTexto,
    entregaCumpriu,
    desfechoSubstituiuResposta,
    motivo: desfechoSubstituiuResposta
      ? "ENCAMINHAMENTO_OU_FALLBACK_NAO_CUMPRE_A_REGRA"
      : modeloCumpriu
        ? null
        : original.toUpperCase().includes(entrada.par.marcador.toUpperCase())
          ? "RESPOSTA_COM_TEXTO_ALEM_DO_MARCADOR_EXIGIDO"
          : "MARCADOR_EXIGIDO_AUSENTE",
  };
}

/** Uma intervenção do pipeline sobre o texto do modelo. */
export type IntervencaoDetectada = {
  etapa: string;
  motivo: string;
};

export type ResultadoAtendimentoCompleto = {
  /** O modelo chegou a ser chamado neste turno. */
  modeloChamado: boolean;
  /** Origem do texto entregue: modelo, modelo_transformado, fallback... */
  origemResposta: string | null;
  /** Etapas que alteraram o texto depois do modelo. */
  intervencoes: IntervencaoDetectada[];
  /** Decisão/score da política de confiança aplicada. */
  confianca: {
    avaliacao: string | null;
    decisao: string | null;
    etapa: string | null;
    score: number | null;
    nivel: string | null;
  } | null;
  /** Mensagem realmente entregue nesta conversa de teste. */
  mensagemEntregueId: string | null;
  /** O que NÃO pôde ser comprovado neste turno. */
  lacunas: string[];
  /** Resultado do turno, sem esconder etapa. */
  resultado: "APROVADO" | "APROVADO_COM_INTERVENCAO" | "REPROVADO" | "SEM_EVIDENCIA";
};

type ResumoTurnoBruto = Record<string, unknown> | null | undefined;

function texto(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v : null;
}

/**
 * Lê o resumo do turno (evento `turn.summary`, Fase 1) e separa o que o
 * modelo produziu do que sobrou depois de confiança/finalização.
 * Sem resumo, o resultado é SEM_EVIDENCIA — nunca "aprovado".
 */
export function resumirAtendimentoCompleto(
  resumo: ResumoTurnoBruto,
): ResultadoAtendimentoCompleto {
  if (!resumo) {
    return {
      modeloChamado: false,
      origemResposta: null,
      intervencoes: [],
      confianca: null,
      mensagemEntregueId: null,
      lacunas: ["registro_do_turno"],
      resultado: "SEM_EVIDENCIA",
    };
  }
  const conf = (resumo["confianca"] ?? null) as Record<string, unknown> | null;
  const transformacoes = Array.isArray(resumo["transformacoes"])
    ? (resumo["transformacoes"] as Record<string, unknown>[])
    : [];
  // Passar por uma etapa não é intervir: quando os hashes provam que o texto
  // não mudou, aquela etapa não conta como intervenção.
  const intervencoes = transformacoes
    .filter(
      (t) =>
        alteracaoDaTransformacao({
          antesHash: (t["antes_hash"] ?? t["antesHash"] ?? null) as string | null,
          depoisHash: (t["depois_hash"] ?? t["depoisHash"] ?? null) as string | null,
        }) !== false,
    )
    .map((t) => ({
      etapa: texto(t["etapa"]) ?? "desconhecida",
      motivo: texto(t["motivo"]) ?? "sem motivo registrado",
    }));
  const entrega = (resumo["entrega"] ?? null) as Record<string, unknown> | null;
  const lacunas = Array.isArray(resumo["lacunas"]) ? (resumo["lacunas"] as string[]) : [];
  const decisao = texto(conf?.["decisao"]);
  const mensagemEntregueId = texto(entrega?.["mensagemId"]) ?? texto(entrega?.["mensagem_id"]);

  // Encaminhamento, bloqueio por regra publicada ou contingência resolvem o
  // atendimento, mas NÃO são a resposta exigida: nunca contam como aprovação.
  const origem = texto(resumo["origem_resposta"]) ?? "";
  const houveDesfechoSubstituto =
    ["transferencia", "fallback", "fallback_erro", "limite_rodadas"].includes(origem) ||
    intervencoes.some((i) =>
      /confianca\.(baixa|regras\.bloqueio)|handoff|encaminh/i.test(i.etapa),
    );

  let resultado: ResultadoAtendimentoCompleto["resultado"];
  if (!mensagemEntregueId) resultado = "SEM_EVIDENCIA";
  else if (decisao && decisao !== "ALLOW" && decisao !== "CONTINUE") resultado = "REPROVADO";
  else if (houveDesfechoSubstituto) resultado = "REPROVADO";
  else if (intervencoes.length > 0) resultado = "APROVADO_COM_INTERVENCAO";
  else resultado = "APROVADO";

  return {
    modeloChamado: resumo["modelo_chamado"] === true,
    origemResposta: texto(resumo["origem_resposta"]),
    intervencoes,
    confianca: conf
      ? {
          avaliacao: texto(conf["avaliacao"]),
          decisao,
          etapa: texto(conf["etapa"]),
          score: typeof conf["score"] === "number" ? (conf["score"] as number) : null,
          nivel: texto(conf["nivel"]),
        }
      : null,
    mensagemEntregueId,
    lacunas,
    resultado,
  };
}
