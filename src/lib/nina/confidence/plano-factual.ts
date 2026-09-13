/**
 * Dados para a resposta, preparados pelo servidor antes da geração.
 *
 * O plano não é extraído do texto/modelo: nasce dos registros oficiais que
 * chegaram ao motor neste turno. Uma redação integralmente igual a um item
 * pode conservar a referência sem reinterpretar nomes e números por regex.
 * Texto acrescentado ou reescrito continua sujeito à conferência normal.
 */
import { referenciaDoFato } from "./afirmacao";
import {
  consolidarTentativas,
  normalizarTexto,
  valorMonetario,
  type FatoRecuperado,
} from "./evidencia";
import type { ClaimEstruturado, ContextoConfianca } from "./types";

type ContextoPlano = Pick<
  ContextoConfianca,
  "fatos" | "consultas" | "retrievedSources" | "businessContext"
>;

export type ItemPlanoFactual = {
  claim: ClaimEstruturado;
  /** A proveniência vem do registro recuperado, nunca de uma saída do modelo. */
  referencia: string;
  registro: string;
  consulta: string;
  versao: string | null;
};

export type PlanoFactualResposta = {
  itens: ItemPlanoFactual[];
  /** Limitar a apresentação não comprova ausência dos itens omitidos. */
  truncado: boolean;
};

export type OpcoesPlanoFactual = {
  /** Seleção explícita do runtime. Aceita id da chave ou do registro exatos. */
  medicoId?: string | null;
  maxItens?: number;
  maxCaracteres?: number;
  /** Relógio fornecido pelo chamador; sem ele, dado com validade é omitido. */
  agora?: string;
};

function campoCurto(valor: unknown): string | null {
  const s = String(valor ?? "").trim();
  // Não transforma uma nota livre ou um documento em afirmação pronta.
  if (!s || s.length > 180 || /[<>]/.test(s) || [...s].some((c) => c.charCodeAt(0) < 32))
    return null;
  return s;
}

function naoExpirou(validade: string | null | undefined, agora?: string): boolean {
  if (!validade) return true;
  const fim = Date.parse(validade);
  const atual = agora ? Date.parse(agora) : NaN;
  return Number.isFinite(fim) && Number.isFinite(atual) && fim > atual;
}

function fonteDoFatoAtual(ctx: ContextoPlano, fato: FatoRecuperado, agora?: string): boolean {
  if (fato.fonte !== "catalogo_publicado" || !fato.registro || !fato.consulta) return false;
  if (!naoExpirou(fato.vigenteAte, agora)) return false;
  const clinica = ctx.businessContext.clinicaId;
  if (clinica && fato.clinicaId && clinica !== fato.clinicaId) return false;
  const doTipo = ctx.retrievedSources.filter((s) => s.tipo === fato.fonte);
  const doRegistro = doTipo.filter(
    (s) => s.referencia && [fato.registro, referenciaDoFato(fato)].includes(s.referencia),
  );
  // Uma fonte publicada de OUTRO registro não autoriza este item. O contrato
  // legado sem referência ainda pode informar a publicação do conjunto.
  const fontes = doRegistro.length ? doRegistro : doTipo.filter((s) => !s.referencia);
  if (
    !fontes.some(
      (s) =>
        s.temConteudo &&
        s.publicado === true &&
        s.ativo !== false &&
        !s.interna &&
        !s.substituidoPor &&
        naoExpirou(s.expiraEm, agora),
    )
  )
    return false;
  const consultas = consolidarTentativas(ctx.consultas ?? []);
  const exatas = consultas.filter(
    (c) => c.id === fato.consulta && c.capacidade === fato.capacidade,
  );
  const candidatas = exatas.length
    ? exatas
    : consultas.filter((c) => c.consulta === fato.consulta && c.capacidade === fato.capacidade);
  // Identidade legada sem argumentos não pode escolher a consulta favorável
  // e esconder outra tentativa do mesmo nome que falhou ou ficou incompleta.
  return candidatas.length > 0 && candidatas.every((c) => c.status === "com_itens" && !c.truncado);
}

/** Todos os qualificadores exibíveis ficam na própria linha, sem herança. */
function qualificadores(fato: FatoRecuperado, ignorar: Array<string> = []): string[] | null {
  const chave = fato.chave ?? {};
  const campos: Array<[string, unknown, string]> = [
    ["procedimento", chave.procedimento, "atendimento"],
    ["especialidade", chave.especialidade, "especialidade"],
    ["medicoNome", chave.medicoNome, "profissional"],
    ["unidadeId", chave.unidadeId, "unidade"],
    ["convenio", chave.convenio, "convênio"],
    ["condicoes", chave.condicoes, "condição publicada"],
  ];
  const partes: string[] = [];
  for (const [campo, valor, rotulo] of campos) {
    if (!valor || ignorar.includes(campo)) continue;
    const texto = campoCurto(valor);
    // Ids técnicos não vão para a conversa. Sem o nome da unidade, o registro
    // continua utilizável pela verificação normal, mas não vira linha pronta.
    if (
      !texto ||
      (campo === "unidadeId" && /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(texto))
    )
      return null;
    partes.push(`${rotulo}: ${texto}`);
  }
  return partes;
}

function itemDoFato(fato: FatoRecuperado): ItemPlanoFactual | null {
  const valor = campoCurto(fato.valor);
  const chave = fato.chave ?? {};
  if (!valor) return null;
  let tipo: ClaimEstruturado["tipo"];
  let cabecalho: string;
  let ignorar: string[] = [];
  if (fato.entidade === "profissional" && fato.campo === "nome") {
    if (chave.medicoNome && normalizarTexto(chave.medicoNome) !== normalizarTexto(valor))
      return null;
    tipo = "profissional";
    cabecalho = `Profissional: ${valor}`;
    ignorar = ["medicoNome"];
  } else if (
    ["servico", "procedimento"].includes(fato.entidade) &&
    ["nome", "oferecido"].includes(fato.campo)
  ) {
    tipo = "servico";
    cabecalho = `Atendimento cadastrado: ${valor}`;
    if (normalizarTexto(chave.procedimento) === normalizarTexto(valor))
      ignorar.push("procedimento");
    if (normalizarTexto(chave.especialidade) === normalizarTexto(valor))
      ignorar.push("especialidade");
  } else if (["servico", "procedimento"].includes(fato.entidade) && fato.campo === "preco") {
    // O valor é literal; não converter valor solto em dinheiro, PIX ou outra
    // modalidade. Um preço sem assunto não é suficientemente delimitado.
    if (!chave.procedimento || !/^(?:R\$\s*)?\d[\d.]*(?:,\d{1,2})?$/.test(valor)) return null;
    tipo = "valor";
    const monetario = valorMonetario(valor);
    if (monetario === null) return null;
    cabecalho = `Valor publicado: R$ ${monetario.toFixed(2).replace(".", ",")}`;
  } else if (fato.entidade === "escala" && fato.campo === "dia_atendimento") {
    // Somente o vínculo normalizado médico/dia/hora, sem converter escala em
    // vaga. Condições de recorrência permanecem literais na própria linha.
    if (!chave.medicoNome || !chave.data || !chave.hora) return null;
    if (!/^(domingo|segunda|terca|quarta|quinta|sexta|sabado)$/.test(normalizarTexto(chave.data)))
      return null;
    if (!/^\d{2}:\d{2}$/.test(chave.hora)) return null;
    if (normalizarTexto(valor) !== normalizarTexto(`${chave.data} ${chave.hora}`)) return null;
    tipo = "escala";
    cabecalho = `Horário habitual: ${chave.data} às ${chave.hora}`;
  } else {
    // Reserva, vaga, preparo e restrições livres têm verificação própria.
    // Não promover texto livre ou um dado não interpretado a PASS.
    return null;
  }
  const partes = qualificadores(fato, ignorar);
  if (!partes) return null;
  const texto = [cabecalho, ...partes].join("; ") + ".";
  return {
    claim: {
      tipo,
      texto,
      modalidade: "afirmacao",
      valor,
      chave: { ...chave },
      fonte: { tipo: fato.fonte, referencia: referenciaDoFato(fato) },
    },
    referencia: referenciaDoFato(fato),
    registro: fato.registro!,
    consulta: fato.consulta,
    versao: fato.versao ?? null,
  };
}

function itensFatuaisVigentes(ctx: ContextoPlano, agora?: string): ItemPlanoFactual[] {
  const itens: ItemPlanoFactual[] = [];
  const vistos = new Set<string>();
  const atuais = (ctx.fatos ?? []).filter((fato) => fonteDoFatoAtual(ctx, fato, agora));
  const identidade = (fato: FatoRecuperado) =>
    JSON.stringify([
      fato.entidade,
      fato.campo,
      Object.entries(fato.chave ?? {}).sort(([a], [b]) => a.localeCompare(b)),
    ]);
  const valoresPorChave = new Map<string, Set<string>>();
  for (const fato of atuais) {
    const id = identidade(fato);
    const valores = valoresPorChave.get(id) ?? new Set<string>();
    valores.add(normalizarTexto(fato.valor));
    valoresPorChave.set(id, valores);
  }
  for (const fato of atuais) {
    // A linha pronta não escolhe qual das fontes conflitantes está correta.
    if ((valoresPorChave.get(identidade(fato))?.size ?? 0) > 1) continue;
    const item = itemDoFato(fato);
    if (!item) continue;
    const id = normalizarLinhaFactual(item.claim.texto);
    if (vistos.has(id)) continue;
    vistos.add(id);
    itens.push(item);
  }
  return itens;
}

export function construirPlanoFactual(
  ctx: ContextoPlano,
  opcoes: OpcoesPlanoFactual = {},
): PlanoFactualResposta {
  const maxItens = Math.max(0, Math.min(40, opcoes.maxItens ?? 28));
  const maxCaracteres = Math.max(0, Math.min(12_000, opcoes.maxCaracteres ?? 8_000));
  const itens: ItemPlanoFactual[] = [];
  let caracteres = 0;
  let truncado = false;
  for (const item of itensFatuaisVigentes(ctx, opcoes.agora)) {
    if (
      opcoes.medicoId &&
      item.claim.chave?.medicoId !== opcoes.medicoId &&
      item.registro !== opcoes.medicoId
    )
      continue;
    if (itens.length >= maxItens || caracteres + item.claim.texto.length > maxCaracteres) {
      truncado = true;
      continue;
    }
    itens.push(item);
    caracteres += item.claim.texto.length;
  }
  return { itens, truncado };
}

/** A apresentação pode ser abreviada; a prova usa todos os fatos atuais. */
export function vincularTextoAosFatosAtuais(texto: string, ctx: ContextoPlano, agora: string) {
  return vincularTextoAoPlanoFactual(texto, {
    itens: itensFatuaisVigentes(ctx, agora),
    truncado: false,
  });
}

/** JSON de dados: não inclui instruções que substituam o prompt publicado. */
export function formatarPlanoFactualParaModelo(plano: PlanoFactualResposta): string {
  if (!plano.itens.length) return "";
  return JSON.stringify({
    tipo: "fatos_oficiais_para_resposta",
    cobertura:
      "Somente os registros listados; não comprova ausência de outros registros nem vagas na agenda.",
    truncado: plano.truncado,
    itens: plano.itens.map((item) => ({
      tipo: item.claim.tipo,
      texto_factual: item.claim.texto,
      chave: item.claim.chave,
      valor: item.claim.valor,
      referencia: item.referencia,
    })),
  });
}

function normalizarLinhaFactual(texto: string): string {
  return normalizarTexto(texto.replace(/^\s*(?:[-•]\s+|\d+\.\s+)/, "").replace(/[*_]/g, ""));
}

/**
 * Exige a linha INTEIRA: acrescentar um médico, preço ou qualificador faz a
 * linha voltar à verificação textual. O restante nunca é descartado.
 * O chamador deve construir o plano dos fatos atuais, não aceitar plano/claim
 * devolvido pelo modelo como um objeto confiável.
 */
export function vincularTextoAoPlanoFactual(
  texto: string,
  plano: PlanoFactualResposta,
): { confirmados: ItemPlanoFactual[]; textoRestante: string; linhasNaoVinculadas: string[] } {
  const porTexto = new Map(
    plano.itens.map((item) => [normalizarLinhaFactual(item.claim.texto), item]),
  );
  const confirmados: ItemPlanoFactual[] = [];
  const linhasNaoVinculadas: string[] = [];
  const textoRestante = texto
    .split(/\r?\n/)
    .map((linha) => {
      const normalizada = normalizarLinhaFactual(linha);
      const item = porTexto.get(normalizada);
      if (!item) {
        // Redação no formato do plano, mas com um dado diferente, não pode
        // passar só porque o leitor complementar reconheceu apenas o número.
        if (
          /^(?:valor publicado|profissional|atendimento cadastrado|horario habitual):/.test(
            normalizada,
          )
        ) {
          linhasNaoVinculadas.push(linha);
        }
        return linha;
      }
      confirmados.push(item);
      return "";
    })
    .join("\n");
  return { confirmados, textoRestante, linhasNaoVinculadas };
}
