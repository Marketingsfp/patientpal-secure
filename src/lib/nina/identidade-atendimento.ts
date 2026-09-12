/**
 * FASE 1 — Identidade de apresentação do atendimento (bloco do próprio prompt).
 *
 * O bloco `[IDENTIDADE DO ATENDIMENTO]` faz parte do MESMO texto versionado da
 * aba Arquitetura. Não existe cadastro paralelo: o formulário desta tela edita
 * exatamente este bloco, e editar o bloco à mão produz a mesma identidade.
 *
 * Leitura 100% determinística — nunca depende de IA para descobrir os nomes.
 * Módulo puro: sem banco, sem rede, sem estado.
 *
 * Escopo: identidade de APRESENTAÇÃO nas mensagens. Não altera cadastro
 * administrativo, documentos, agenda, endereço nem identificadores técnicos.
 */

export const ABERTURA_IDENTIDADE = "[IDENTIDADE DO ATENDIMENTO]";
export const FECHAMENTO_IDENTIDADE = "[/IDENTIDADE DO ATENDIMENTO]";

export const ROTULO_ASSISTENTE = "Nome da atendente virtual";
export const ROTULO_ESTABELECIMENTO = "Nome do estabelecimento";
export const ROTULO_TIPO = "Tipo do estabelecimento";

export type IdentidadeAtendimento = {
  /** Nome usado pela assistente ao se apresentar. */
  assistente: string;
  /** Nome do estabelecimento usado no atendimento. */
  estabelecimento: string;
  /** Clínica, Policlínica, Hospital ou outro texto informado pelo administrador. */
  tipoEstabelecimento: string;
};

export type MotivoIdentidadeInvalida =
  | "BLOCO_AUSENTE"
  | "BLOCO_DUPLICADO"
  | "FECHAMENTO_AUSENTE"
  | "FECHAMENTO_ANTES_DA_ABERTURA"
  | "CAMPO_AUSENTE"
  | "CAMPO_VAZIO"
  | "CAMPO_DUPLICADO"
  | "LINHA_NAO_RECONHECIDA";

export type LeituraIdentidade =
  | {
      ok: true;
      identidade: IdentidadeAtendimento;
      /** Texto exato do bloco encontrado, incluindo abertura e fechamento. */
      bloco: string;
      inicio: number;
      fim: number;
    }
  | {
      ok: false;
      motivo: MotivoIdentidadeInvalida;
      /** Mensagem pronta para o administrador, em linguagem simples. */
      mensagem: string;
      campo?: keyof IdentidadeAtendimento;
      linha?: string;
    };

const CAMPOS: Array<{ chave: keyof IdentidadeAtendimento; rotulo: string }> = [
  { chave: "assistente", rotulo: ROTULO_ASSISTENTE },
  { chave: "estabelecimento", rotulo: ROTULO_ESTABELECIMENTO },
  { chave: "tipoEstabelecimento", rotulo: ROTULO_TIPO },
];

function ocorrencias(texto: string, alvo: string): number[] {
  const achados: number[] = [];
  let de = texto.indexOf(alvo);
  while (de !== -1) {
    achados.push(de);
    de = texto.indexOf(alvo, de + alvo.length);
  }
  return achados;
}

/** Normaliza o rótulo para comparar sem depender de acento, caixa ou espaço. */
function chaveDoRotulo(rotulo: string): string {
  return rotulo
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

const POR_ROTULO = new Map(CAMPOS.map((c) => [chaveDoRotulo(c.rotulo), c.chave]));

/** Monta o bloco no formato oficial, sempre igual, a partir dos três campos. */
export function montarBlocoIdentidade(identidade: IdentidadeAtendimento): string {
  return [
    ABERTURA_IDENTIDADE,
    `${ROTULO_ASSISTENTE}: ${identidade.assistente.trim()}`,
    `${ROTULO_ESTABELECIMENTO}: ${identidade.estabelecimento.trim()}`,
    `${ROTULO_TIPO}: ${identidade.tipoEstabelecimento.trim()}`,
    FECHAMENTO_IDENTIDADE,
  ].join("\n");
}

/**
 * Lê a identidade do texto publicado/em edição. Determinística: procura o bloco
 * delimitado e converte cada linha `Rótulo: valor`.
 */
export function extrairIdentidade(texto: string): LeituraIdentidade {
  const aberturas = ocorrencias(texto, ABERTURA_IDENTIDADE);
  const fechamentos = ocorrencias(texto, FECHAMENTO_IDENTIDADE).filter(
    // "[/IDENTIDADE..." também contém "[IDENTIDADE..."? Não contém — o "/" difere.
    () => true,
  );

  if (aberturas.length === 0) {
    return {
      ok: false,
      motivo: "BLOCO_AUSENTE",
      mensagem:
        `O texto não tem o bloco ${ABERTURA_IDENTIDADE}. ` +
        "Preencha o nome da atendente virtual, o nome e o tipo do estabelecimento.",
    };
  }
  if (aberturas.length > 1 || fechamentos.length > 1) {
    return {
      ok: false,
      motivo: "BLOCO_DUPLICADO",
      mensagem:
        "O texto tem mais de um bloco de identidade do atendimento. " +
        "Deixe apenas um — dois blocos podem apresentar nomes diferentes ao paciente.",
    };
  }
  if (fechamentos.length === 0) {
    return {
      ok: false,
      motivo: "FECHAMENTO_AUSENTE",
      mensagem: `O bloco de identidade foi aberto, mas falta a linha ${FECHAMENTO_IDENTIDADE}.`,
    };
  }

  const inicio = aberturas[0]!;
  const fimAbertura = fechamentos[0]!;
  if (fimAbertura < inicio) {
    return {
      ok: false,
      motivo: "FECHAMENTO_ANTES_DA_ABERTURA",
      mensagem:
        `A linha ${FECHAMENTO_IDENTIDADE} aparece antes de ${ABERTURA_IDENTIDADE}. ` +
        "Corrija a ordem do bloco.",
    };
  }
  const fim = fimAbertura + FECHAMENTO_IDENTIDADE.length;
  const bloco = texto.slice(inicio, fim);
  const miolo = texto.slice(inicio + ABERTURA_IDENTIDADE.length, fimAbertura);

  const valores = new Map<keyof IdentidadeAtendimento, string>();
  for (const linhaBruta of miolo.split(/\r?\n/)) {
    const linha = linhaBruta.trim();
    if (!linha) continue;
    const separador = linha.indexOf(":");
    if (separador === -1) {
      return {
        ok: false,
        motivo: "LINHA_NAO_RECONHECIDA",
        linha,
        mensagem:
          `A linha "${linha}" não está no formato "Rótulo: valor". ` +
          "Use apenas as três linhas de identidade dentro do bloco.",
      };
    }
    const chave = POR_ROTULO.get(chaveDoRotulo(linha.slice(0, separador)));
    if (!chave) {
      return {
        ok: false,
        motivo: "LINHA_NAO_RECONHECIDA",
        linha,
        mensagem:
          `A linha "${linha}" não é um campo de identidade conhecido. ` +
          `Dentro do bloco use somente: ${CAMPOS.map((c) => c.rotulo).join(", ")}.`,
      };
    }
    if (valores.has(chave)) {
      return {
        ok: false,
        motivo: "CAMPO_DUPLICADO",
        campo: chave,
        mensagem: `O campo "${CAMPOS.find((c) => c.chave === chave)!.rotulo}" aparece duas vezes no bloco.`,
      };
    }
    valores.set(chave, linha.slice(separador + 1).trim());
  }

  for (const campo of CAMPOS) {
    if (!valores.has(campo.chave)) {
      return {
        ok: false,
        motivo: "CAMPO_AUSENTE",
        campo: campo.chave,
        mensagem: `Falta a linha "${campo.rotulo}: ..." dentro do bloco de identidade.`,
      };
    }
    if (!valores.get(campo.chave)) {
      return {
        ok: false,
        motivo: "CAMPO_VAZIO",
        campo: campo.chave,
        mensagem: `O campo "${campo.rotulo}" está sem valor.`,
      };
    }
  }

  return {
    ok: true,
    identidade: {
      assistente: valores.get("assistente")!,
      estabelecimento: valores.get("estabelecimento")!,
      tipoEstabelecimento: valores.get("tipoEstabelecimento")!,
    },
    bloco,
    inicio,
    fim,
  };
}

/**
 * Grava a identidade no texto: substitui o bloco existente ou insere um bloco
 * novo no topo. Fonte única — o texto continua sendo o que será publicado.
 */
export function aplicarIdentidadeNoTexto(
  texto: string,
  identidade: IdentidadeAtendimento,
): string {
  const novo = montarBlocoIdentidade(identidade);
  const aberturas = ocorrencias(texto, ABERTURA_IDENTIDADE);
  const fechamentos = ocorrencias(texto, FECHAMENTO_IDENTIDADE);
  if (aberturas.length === 1 && fechamentos.length === 1 && fechamentos[0]! > aberturas[0]!) {
    const inicio = aberturas[0]!;
    const fim = fechamentos[0]! + FECHAMENTO_IDENTIDADE.length;
    return texto.slice(0, inicio) + novo + texto.slice(fim);
  }
  if (aberturas.length === 0 && fechamentos.length === 0) {
    return texto.trim().length ? `${novo}\n\n${texto}` : novo;
  }
  // Bloco duplicado ou quebrado: não adivinhamos. Quem edita corrige à mão.
  return texto;
}

export type ValidacaoIdentidade =
  | { ok: true; identidade: IdentidadeAtendimento | null; pendente: boolean }
  | { ok: false; motivo: MotivoIdentidadeInvalida; mensagem: string };

/**
 * Regra de publicação:
 *  - bloco presente e correto → publica;
 *  - bloco ausente → publica, mas fica PENDENTE (versões antigas não são
 *    modificadas nem recebem nome inferido automaticamente);
 *  - bloco duplicado, incompleto ou fora de formato → NÃO publica.
 */
export function validarIdentidadeParaPublicacao(texto: string): ValidacaoIdentidade {
  const leitura = extrairIdentidade(texto);
  if (leitura.ok) return { ok: true, identidade: leitura.identidade, pendente: false };
  if (leitura.motivo === "BLOCO_AUSENTE") return { ok: true, identidade: null, pendente: true };
  return { ok: false, motivo: leitura.motivo, mensagem: leitura.mensagem };
}
