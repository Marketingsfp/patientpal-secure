/**
 * Atendimentos estruturados do catálogo (Fase 2, 12/10/2026).
 *
 * Num item estruturado, `estrutura.atendimentos` é a ÚNICA fonte de horários,
 * preços, modalidade, idade e demais fatos. As colunas antigas (formas de
 * pagamento, executantes, horários, modalidade) passam a ser CALCULADAS daqui
 * ao salvar, para que as regras existentes continuem lendo os mesmos campos
 * sem nunca divergir. O texto livre fica sem fatos.
 *
 * Módulo puro: não lê banco nem chama IA.
 */
import { DIAS_SEMANA, type DiaSemana } from "./catalogo-constantes";
import {
  atendimentosEstruturados,
  formatarPrecoCatalogo,
  textoHorariosCatalogo,
  type AtendimentoCatalogo,
  type AtendimentoPublicado,
  type EstruturaCatalogo,
  type HorarioCatalogo,
  type PrecoCatalogo,
} from "./catalogo-estrutura";
import { tipoDaObservacao, type TipoEscala } from "./horarios-por-atendimento";
import { MODALIDADES_ATENDIMENTO, interpretarModalidade } from "./modalidade-atendimento";
import { idadeNaoInformada } from "./regras-administrativas-confirmadas";

const normal = (v: unknown) =>
  String(v ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

/* ------------------------------------------------------------------ */
/* Texto livre sem fatos                                               */
/* ------------------------------------------------------------------ */

const FATOS_NO_TEXTO: Array<[RegExp, string]> = [
  [/R\$\s*\d/i, "preço"],
  [/\b([01]?\d|2[0-3])\s*(?::|h)\s*[0-5]\d\b|\b(?:das|às|as)\s+([01]?\d|2[0-3])\s*h\b/i, "horário"],
  [
    /\b(?:segunda|ter[cç]a|quarta|quinta|sexta)(?:-feira)?s?\b|\bs[aá]bados?\b|\bdomingos?\b/i,
    "dia da semana",
  ],
  [
    /\bhora\s+marcada\b|\bordem\s+de\s+chegada\b|\bpr[eé][\s-]?agendamento\b|\bpor\s+ficha\b|\bnumera[cç][aã]o\b/i,
    "modalidade",
  ],
  [
    /\b(?:a\s+partir\s+de|acima\s+de|maiores?\s+de|menores?\s+de)\s+\d+\s*(?:anos?|meses|m[eê]s)\b|\bidade\s+m[ií]nima\b/i,
    "idade",
  ],
  [
    /^\s*(?:especialidades?|profissional|dias\s+e\s+hor[aá]rios|dinheiro|pix|cart[aã]o|pix\/cart[aã]o|pode\s+chegar\s+at[eé][^:\n]*|idade\/crit[eé]rio[^:\n]*)\s*(?:cadastradas?\s*)?:/im,
    "rótulo de dado",
  ],
];

/** Fatos escritos no texto livre que devem ficar nos campos estruturados. */
export function fatosNoTextoLivre(texto: string | null | undefined): string[] {
  const t = String(texto ?? "");
  if (!t.trim()) return [];
  return FATOS_NO_TEXTO.filter(([re]) => re.test(t)).map(([, tipo]) => tipo);
}

export function mensagemFatosNoTexto(campo: string, fatos: string[]): string {
  const verbo = fatos.length > 1 ? "devem" : "deve";
  return `${campo}: ${fatos.join(", ")} ${verbo} ficar nos campos do atendimento, não no texto livre.`;
}

/** Todos os textos livres de um item estruturado que precisam estar sem fatos. */
export function textosLivresComFatos(
  descricao: string | null | undefined,
  atendimentos: readonly AtendimentoCatalogo[],
): string[] {
  const problemas: string[] = [];
  const d = fatosNoTextoLivre(descricao);
  if (d.length) problemas.push(mensagemFatosNoTexto("Texto para o paciente", d));
  for (const a of atendimentos) {
    const f = fatosNoTextoLivre(a.observacao);
    if (f.length) problemas.push(mensagemFatosNoTexto(`Observação de “${a.nome}”`, f));
  }
  return problemas;
}

/* ------------------------------------------------------------------ */
/* Colunas antigas calculadas a partir dos atendimentos                */
/* ------------------------------------------------------------------ */

type FormaLegada = {
  forma: string;
  valor: number | null;
  condicao: string | null;
  observacao: string | null;
};

function formasLegadas(atendimentos: readonly AtendimentoCatalogo[]): FormaLegada[] {
  const varios = atendimentos.length > 1;
  return atendimentos.flatMap((a) =>
    a.precos.map((p) => ({
      forma: p.forma,
      valor: p.valor ?? null,
      // Regras antigas usam "condição" como nome do atendimento quando há vários.
      condicao: varios ? a.nome.slice(0, 200) : (p.condicao ?? null),
      observacao: varios
        ? [p.condicao, p.observacao].filter(Boolean).join(" · ") || null
        : (p.observacao ?? null),
    })),
  );
}

/** Colunas do exame/procedimento calculadas dos atendimentos. */
export function derivarServico(atendimentos: readonly AtendimentoCatalogo[]) {
  const executantes = new Map<
    string,
    { medico_id: string | null; nome: string; linhas: HorarioCatalogo[] }
  >();
  for (const a of atendimentos)
    for (const e of a.executantes) {
      const chave = e.medico_id ?? normal(e.nome);
      const atual = executantes.get(chave) ?? {
        medico_id: e.medico_id ?? null,
        nome: e.nome,
        linhas: [],
      };
      for (const h of e.horarios)
        if (!atual.linhas.some((x) => JSON.stringify(x) === JSON.stringify(h)))
          atual.linhas.push(h);
      executantes.set(chave, atual);
    }
  return {
    executantes: [...executantes.values()].map((e) => ({
      tipo_escala: "exame_procedimento" as const,
      medico_id: e.medico_id,
      nome: e.nome,
      horarios: textoHorariosCatalogo(e.linhas),
      observacao: null,
    })),
    formas_pagamento: formasLegadas(atendimentos),
    valor_observacao: null,
  };
}

/** Colunas do profissional calculadas dos atendimentos. */
export function derivarProfissional(atendimentos: readonly AtendimentoCatalogo[]) {
  const horarios: Array<{
    tipo_escala: "consulta";
    dia: DiaSemana;
    inicio: string | null;
    fim: string | null;
    recorrencia: HorarioCatalogo["recorrencia"];
    observacao: string | null;
  }> = [];
  for (const a of atendimentos)
    for (const h of a.horarios) {
      const linha = {
        tipo_escala: "consulta" as const,
        dia: h.dia,
        inicio: h.inicio ?? null,
        fim: h.fim ?? null,
        recorrencia: h.recorrencia,
        observacao: h.observacao ?? null,
      };
      if (!horarios.some((x) => JSON.stringify(x) === JSON.stringify(linha))) horarios.push(linha);
    }
  const modos = new Set(atendimentos.map((a) => a.modalidade ?? null));
  const unica = modos.size === 1 ? [...modos][0] : null;
  return {
    horarios,
    formas_pagamento: formasLegadas(atendimentos),
    tipo_atendimento: unica ? MODALIDADES_ATENDIMENTO[unica] : null,
  };
}

/* ------------------------------------------------------------------ */
/* Conversão de um item antigo                                         */
/* ------------------------------------------------------------------ */

const DIA_CANONICO: Record<string, DiaSemana> = Object.fromEntries(
  DIAS_SEMANA.map((d) => [normal(d).replace(/-feira$/, ""), d]),
);
const RE_LINHA_HORARIO = /(segunda|ter[cç]a|quarta|quinta|sexta)(?:-feira)?|s[aá]bado|domingo/gi;

/** Lê "Segunda-feira 08:00–12:00 · Terça-feira 09:00–11:00" em linhas estruturadas. */
export function lerHorariosTexto(texto: string | null | undefined): {
  linhas: HorarioCatalogo[];
  completo: boolean;
} {
  const t = String(texto ?? "").trim();
  if (!t) return { linhas: [], completo: true };
  const re = new RegExp(
    `(${RE_LINHA_HORARIO.source})\\s+(\\d{1,2}:\\d{2})\\s*[–-]\\s*(\\d{1,2}:\\d{2})`,
    "gi",
  );
  const linhas: HorarioCatalogo[] = [];
  let lido = t;
  for (const m of t.matchAll(re)) {
    const dia = DIA_CANONICO[normal(m[1]).replace(/-feira$/, "")];
    const [inicio, fim] = [m[3]!.padStart(5, "0"), m[4]!.padStart(5, "0")];
    if (!dia || fim <= inicio) continue;
    linhas.push({ dia, inicio, fim, recorrencia: "Toda semana", observacao: null });
    lido = lido.replace(m[0], "");
  }
  // Sobrou algo além de separadores? Então a conversão não foi completa.
  const completo = linhas.length > 0 && !/[a-z0-9]/i.test(normal(lido).replace(/[·|,;e\s]/g, ""));
  return { linhas, completo };
}

/** Anexa observações "Dia hh:mm–hh:mm: texto" (formato da agenda) às linhas certas. */
function anexarObservacoes(linhas: HorarioCatalogo[], observacao: unknown): HorarioCatalogo[] {
  const usadas = new Set<number>();
  const notas = String(observacao ?? "")
    .split(/\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  const resultado = linhas.map((l) => ({ ...l }));
  for (const nota of notas) {
    const m = /^(.+?\d{1,2}:\d{2}\s*[–-]\s*\d{1,2}:\d{2})\s*:\s*(.+)$/.exec(nota);
    if (!m) continue;
    const alvo = lerHorariosTexto(m[1]).linhas[0];
    if (!alvo) continue;
    const i = resultado.findIndex(
      (l, idx) =>
        !usadas.has(idx) && l.dia === alvo.dia && l.inicio === alvo.inicio && l.fim === alvo.fim,
    );
    if (i < 0) continue;
    usadas.add(i);
    resultado[i]!.observacao = m[2]!.slice(0, 200);
  }
  return resultado;
}

/** Mantém só as linhas do tipo de escala pedido (agendas de consulta × exame). */
function linhasDoTipo(linhas: HorarioCatalogo[], tipo: TipoEscala): HorarioCatalogo[] {
  return linhas.filter((l) => {
    const t = tipoDaObservacao(l.observacao);
    return !t || t === tipo;
  });
}

function lerPreco(texto: string | null | undefined): {
  valor: number | null;
  resto: string | null;
} {
  const t = String(texto ?? "").trim();
  const m = /R\$\s*([\d.]+,\d{2}|\d+)/.exec(t);
  if (!m) return { valor: null, resto: t || null };
  const valor = Number(m[1]!.replace(/\./g, "").replace(",", "."));
  const resto = t
    .replace(m[0], "")
    .replace(/^[\s:–-]+|[\s:–-]+$/g, "")
    .replace(/^\((.*)\)$/, "$1");
  return { valor: Number.isFinite(valor) ? valor : null, resto: resto || null };
}

function lerHora(texto: string | null | undefined): string | null {
  const m = /\b([01]?\d|2[0-3])(?::|h)([0-5]\d)?\b/i.exec(String(texto ?? ""));
  return m ? `${m[1]!.padStart(2, "0")}:${m[2] ?? "00"}` : null;
}

type RegistroAntigo = {
  nome: string;
  estrutura?: unknown;
  descricao_publica?: string | null;
  observacao_publica?: string | null;
  valor?: number | string | null;
  valor_observacao?: string | null;
  executantes?: Array<{
    medico_id?: string | null;
    nome?: string;
    horarios?: string | null;
    observacao?: string | null;
  }>;
  formas_pagamento?: Array<{
    forma?: string;
    valor?: number | string | null;
    condicao?: string | null;
    observacao?: string | null;
  }>;
  horarios?: Array<{
    dia?: string;
    inicio?: string | null;
    fim?: string | null;
    recorrencia?: string | null;
    observacao?: string | null;
    tipo_escala?: string;
  }>;
  tipo_atendimento?: string | null;
  especialidades?: Array<{ nome?: string }>;
};

export type ResultadoConversao = {
  atendimentos: AtendimentoCatalogo[];
  /** Texto livre que sobra, já sem os blocos convertidos. */
  descricao: string;
  /** Tudo o que a equipe precisa conferir (inclui os bloqueios). */
  pendencias: string[];
  /** Problemas que perderiam dado: o item não pode ser convertido em lote. */
  bloqueios: string[];
};

function numero(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const t = String(v ?? "").replace(/[^\d,.-]/g, "");
  if (!t) return null;
  const n = Number(t.includes(",") ? t.replace(/\./g, "").replace(",", ".") : t);
  return Number.isFinite(n) ? n : null;
}

function precosDasFormas(
  formas: RegistroAntigo["formas_pagamento"],
  filtro?: (condicao: string) => boolean,
): PrecoCatalogo[] {
  return (formas ?? [])
    .filter((f) => f?.forma && (!filtro || filtro(String(f.condicao ?? ""))))
    .map((f) => ({
      forma: String(f.forma).trim(),
      valor: numero(f.valor),
      condicao: filtro ? null : f.condicao?.trim() || null,
      observacao: f.observacao?.trim() || null,
    }));
}

/** Preços escritos no bloco do texto antigo. */
function precosDoBloco(b: AtendimentoPublicado): PrecoCatalogo[] {
  const campos: Array<[string, string | null | undefined]> = [
    ["Dinheiro", b.dinheiro],
    ["Pix/cartão", b.pix_cartao],
    ["Cartão", b.cartao],
    ["Pix", b.pix],
  ];
  return campos
    .filter(([, t]) => t)
    .map(([forma, t]) => {
      const { valor, resto } = lerPreco(t);
      return { forma, valor, condicao: resto?.slice(0, 200) ?? null, observacao: null };
    });
}

/**
 * Converte um item antigo (texto com blocos + complementos + colunas) em
 * atendimentos estruturados. Nada é descartado em silêncio: o que não puder
 * ser lido com segurança vira pendência para a equipe conferir.
 */
export function converterParaEstruturado(
  tipo: "servico" | "profissional",
  r: RegistroAntigo,
  novoId: () => string = () => crypto.randomUUID(),
): ResultadoConversao {
  const pendencias: string[] = [];
  const bloqueios: string[] = [];
  const bloquear = (m: string) => {
    bloqueios.push(m);
    pendencias.push(m);
  };
  const profissional = tipo === "profissional" ? r.nome : undefined;
  const texto = (tipo === "servico" ? r.descricao_publica : r.observacao_publica) ?? "";
  // Leitura antiga, com os complementos já associados a cada bloco.
  const estruturaAntiga = { ...(r.estrutura as EstruturaCatalogo | undefined), atendimentos: [] };
  const blocos = atendimentosEstruturados(texto, estruturaAntiga, profissional);
  const temBlocos = blocos.length > 0;
  const padrao = atendimentosEstruturados(
    "",
    estruturaAntiga,
    profissional,
    tipo === "servico" ? r.nome : "Consulta",
  )[0];
  const itens = temBlocos ? blocos : padrao ? [padrao] : [];
  const linhasProfissional: HorarioCatalogo[] = linhasDoTipo(
    (r.horarios ?? [])
      .filter((h) => h?.dia && (DIAS_SEMANA as readonly string[]).includes(h.dia))
      .map((h) => ({
        dia: h.dia as DiaSemana,
        inicio: h.inicio || null,
        fim: h.fim || null,
        recorrencia: (["Toda semana", "Quinzenal", "Mensal", "Data específica"].includes(
          h.recorrencia ?? "",
        )
          ? h.recorrencia
          : "Toda semana") as HorarioCatalogo["recorrencia"],
        observacao: h.observacao?.slice(0, 200) || null,
      })),
    "consulta",
  );
  const especialidadesCadastradas = /^\s*Especialidades cadastradas\s*:\s*(.+)$/im.exec(texto)?.[1];

  const atendimentos: AtendimentoCatalogo[] = itens.map((b) => {
    const c = b.complemento;
    const rotulo = b.atendimento;
    // Modalidade: confirmada pela equipe > texto do bloco > classificação antiga.
    let modalidade = c?.modalidade ?? null;
    const candidata =
      b.modalidade ?? (tipo === "profissional" ? interpretarModalidade(r.tipo_atendimento) : null);
    if (!modalidade && candidata && candidata !== "nao_definida") modalidade = candidata;
    if (!modalidade)
      pendencias.push(
        candidata === "nao_definida"
          ? `${rotulo}: modalidade ambígua no cadastro antigo — escolha a modalidade.`
          : `${rotulo}: modalidade não informada.`,
      );

    // Horários.
    let horarios: HorarioCatalogo[] = [];
    let executantes: AtendimentoCatalogo["executantes"] = [];
    if (tipo === "profissional") {
      const doBloco = temBlocos ? lerHorariosTexto(b.horarios_publicados) : null;
      if (doBloco?.linhas.length) {
        horarios = doBloco.linhas;
        if (!doBloco.completo)
          bloquear(`${rotulo}: confira os horários — parte do texto não foi lida.`);
      } else {
        horarios = linhasProfissional;
        if (temBlocos && b.horarios_publicados)
          bloquear(
            `${rotulo}: horários do texto (“${b.horarios_publicados}”) não puderam ser lidos; usados os horários do profissional.`,
          );
      }
    } else {
      const fontes = (r.executantes ?? []).filter(
        (e) => !temBlocos || !b.profissional || normal(e.nome) === normal(b.profissional),
      );
      executantes = fontes
        .filter((e) => e.nome?.trim())
        .map((e) => {
          const lido = lerHorariosTexto(e.horarios);
          if (e.horarios && !lido.completo)
            bloquear(`${rotulo}: confira os horários de ${e.nome} — parte do texto não foi lida.`);
          return {
            medico_id: e.medico_id ?? null,
            nome: e.nome!.trim(),
            horarios: linhasDoTipo(
              anexarObservacoes(lido.linhas, e.observacao),
              "exame_procedimento",
            ),
          };
        });
      if (temBlocos && b.profissional && !executantes.length)
        executantes = [
          {
            medico_id: null,
            nome: b.profissional,
            horarios: lerHorariosTexto(b.horarios_publicados).linhas,
          },
        ];
    }

    // Preços: do bloco; senão das formas associadas a ele; senão de todas (item único).
    let precos = temBlocos ? precosDoBloco(b) : [];
    if (!precos.length)
      precos = precosDasFormas(
        r.formas_pagamento,
        itens.length > 1 ? (cond) => normal(cond) === normal(rotulo) : undefined,
      );
    if (!precos.length && itens.length === 1) {
      const valor = numero(r.valor);
      if (valor !== null)
        precos = [{ forma: "Valor de referência", valor, condicao: null, observacao: null }];
    }
    if (itens.length === 1 && r.valor_observacao) {
      if (precos[0])
        precos[0] = {
          ...precos[0],
          observacao: [precos[0].observacao, r.valor_observacao].filter(Boolean).join(" · "),
        };
      else
        bloquear(`${rotulo}: observação do valor (“${r.valor_observacao}”) sem preço cadastrado.`);
    }

    // Idade e critérios.
    let idade_minima = c?.idade_minima ?? b.idade_minima ?? null;
    let unidade_idade = c?.unidade_idade ?? b.unidade_idade ?? null;
    if ((idade_minima == null) !== (unidade_idade == null)) idade_minima = unidade_idade = null;
    const criterioTexto =
      b.criterio_publicado && b.idade_minima == null && !idadeNaoInformada(b.criterio_publicado)
        ? b.criterio_publicado
        : null;
    const criterio_adicional =
      [c?.criterio_adicional, criterioTexto].filter(Boolean).join(" · ") || null;

    // Limite de chegada.
    let chegada_ate = c?.chegada_ate ?? null;
    if (!chegada_ate && b.chegada_publicada) {
      chegada_ate = lerHora(b.chegada_publicada);
      if (!chegada_ate || !/^\s*(?:at[eé]\s*(?:as|às)?\s*)?\d/i.test(b.chegada_publicada))
        bloquear(`${rotulo}: limite de chegada “${b.chegada_publicada}” precisa ser conferido.`);
    }

    // Referência da recorrência vale para as linhas quinzenais.
    const ref = c?.referencia_recorrencia ?? null;
    const comRef = (ls: HorarioCatalogo[]) =>
      ref
        ? ls.map((h) => (h.recorrencia === "Quinzenal" ? { ...h, referencia_recorrencia: ref } : h))
        : ls;

    // Observação: o que sobra do bloco, sem a modalidade já convertida.
    const obsBloco =
      b.observacoes && interpretarModalidade(b.observacoes) === b.modalidade && b.modalidade
        ? null
        : b.observacoes;
    const observacao =
      [obsBloco, ...(temBlocos ? b.outros : [])].filter(Boolean).join("\n").slice(0, 4000) || null;

    return {
      id: novoId(),
      nome: rotulo,
      // A especialidade do bloco vem primeiro; sem bloco, exame usa "Especialidades cadastradas".
      especialidade:
        b.especialidade ??
        (tipo === "servico" ? (especialidadesCadastradas?.trim() ?? null) : null),
      modalidade,
      horarios: comRef(horarios),
      executantes: executantes.map((e) => ({ ...e, horarios: comRef(e.horarios) })),
      chegada_ate,
      precos,
      situacao_preco: c?.situacao_preco ?? null,
      idade_minima,
      unidade_idade,
      criterio_adicional,
      inclui: c?.inclui ?? null,
      acrescimos: c?.acrescimos ?? null,
      observacao,
    };
  });

  if (tipo === "profissional" && !temBlocos && atendimentos[0] && r.especialidades?.length === 1)
    atendimentos[0].especialidade = r.especialidades[0]?.nome ?? null;

  // Texto que sobra: sem os blocos convertidos e sem a linha de especialidades.
  const descricao = temBlocos
    ? ""
    : texto
        .split("\n")
        .filter((l) => !/^\s*Especialidades cadastradas\s*:/i.test(l))
        .join("\n")
        .trim();
  for (const m of textosLivresComFatos(descricao, atendimentos)) bloquear(m);
  return {
    atendimentos,
    descricao,
    pendencias: [...new Set(pendencias)],
    bloqueios: [...new Set(bloqueios)],
  };
}

/* ------------------------------------------------------------------ */
/* Cópia do formato antigo (desfazer a conversão)                      */
/* ------------------------------------------------------------------ */

const CAMPOS_ANTIGOS = {
  servico: ["descricao_publica", "valor", "valor_observacao", "executantes", "formas_pagamento"],
  profissional: ["observacao_publica", "horarios", "formas_pagamento", "tipo_atendimento"],
} as const;

/** Cópia (JSON) do que a conversão substitui, guardada na própria estrutura do item. */
export function copiaFormatoAntigo(
  tipo: "servico" | "profissional",
  r: Record<string, unknown> & { estrutura?: unknown },
  agoraISO = new Date().toISOString(),
): string {
  const estrutura = (r.estrutura ?? {}) as { complementos?: unknown };
  return JSON.stringify({
    convertido_em: agoraISO,
    ...Object.fromEntries(CAMPOS_ANTIGOS[tipo].map((c) => [c, r[c] ?? null])),
    complementos: estrutura.complementos ?? [],
  });
}

/** Data da conversão registrada na cópia, ou null se a cópia não puder ser lida. */
export function dataDaConversao(copia: string | null | undefined): string | null {
  try {
    const v = JSON.parse(copia ?? "") as { convertido_em?: unknown };
    return typeof v.convertido_em === "string" ? v.convertido_em : null;
  } catch {
    return null;
  }
}

/** Campos para voltar ao formato antigo a partir da cópia guardada. */
export function restaurarFormatoAntigo(
  tipo: "servico" | "profissional",
  copia: string,
): { campos: Record<string, unknown>; complementos: unknown[] } {
  const v = JSON.parse(copia) as Record<string, unknown>;
  return {
    campos: Object.fromEntries(CAMPOS_ANTIGOS[tipo].map((c) => [c, v[c] ?? null])),
    complementos: Array.isArray(v.complementos) ? v.complementos : [],
  };
}

/* ------------------------------------------------------------------ */
/* Sincronização: origem atualiza fatos, equipe mantém regras          */
/* ------------------------------------------------------------------ */

/** Regras da equipe por atendimento, que a origem não conhece. */
const REGRAS_DA_EQUIPE = [
  "idade_minima",
  "unidade_idade",
  "chegada_ate",
  "criterio_adicional",
  "inclui",
  "acrescimos",
  "situacao_preco",
  "observacao",
] as const;

/**
 * Junta os atendimentos convertidos da origem com os atuais. Casamento pelo
 * nome do atendimento (ou pela especialidade, quando única). A origem traz
 * nome, especialidade, quem realiza, horários e preços; a equipe mantém
 * modalidade (quando confirmada), idade, chegada, critérios, inclui,
 * acréscimos, situação do preço, observação e a referência das quinzenas.
 */
export function mesclarComOrigem(
  atuais: readonly AtendimentoCatalogo[],
  daOrigem: readonly AtendimentoCatalogo[],
): { atendimentos: AtendimentoCatalogo[]; removidos: string[] } {
  const usados = new Set<string>();
  const achar = (o: AtendimentoCatalogo) => {
    const livres = atuais.filter((a) => !usados.has(a.id));
    const porNome = livres.find((a) => normal(a.nome) === normal(o.nome));
    if (porNome) return porNome;
    const porEsp = o.especialidade
      ? livres.filter((a) => a.especialidade && normal(a.especialidade) === normal(o.especialidade))
      : [];
    return porEsp.length === 1 ? porEsp[0] : undefined;
  };
  const comReferencia = (novas: HorarioCatalogo[], antigas: HorarioCatalogo[]) =>
    novas.map((h) => {
      const igual = antigas.find(
        (a) =>
          a.dia === h.dia &&
          a.inicio === h.inicio &&
          a.fim === h.fim &&
          a.recorrencia === h.recorrencia &&
          a.referencia_recorrencia,
      );
      return igual ? { ...h, referencia_recorrencia: igual.referencia_recorrencia } : h;
    });
  const atendimentos = daOrigem.map((o) => {
    const atual = achar(o);
    if (!atual) return o;
    usados.add(atual.id);
    const regras = Object.fromEntries(REGRAS_DA_EQUIPE.map((k) => [k, atual[k] ?? null]));
    return {
      ...o,
      ...regras,
      id: atual.id,
      modalidade: atual.modalidade ?? o.modalidade ?? null,
      horarios: comReferencia(o.horarios, atual.horarios),
      executantes: o.executantes.map((e) => {
        const antes = atual.executantes.find(
          (x) => (e.medico_id && x.medico_id === e.medico_id) || normal(x.nome) === normal(e.nome),
        );
        return antes ? { ...e, horarios: comReferencia(e.horarios, antes.horarios) } : e;
      }),
    };
  });
  return {
    atendimentos,
    removidos: atuais.filter((a) => !usados.has(a.id)).map((a) => a.nome),
  };
}

/* ------------------------------------------------------------------ */
/* Comparação antes/depois por atendimento (prévias)                   */
/* ------------------------------------------------------------------ */

const ROTULOS_ATENDIMENTO: Record<string, string> = {
  nome: "Nome",
  especialidade: "Especialidade",
  modalidade: "Modalidade",
  horarios: "Horários",
  executantes: "Quem realiza",
  chegada_ate: "Limite de chegada",
  precos: "Preços",
  situacao_preco: "Situação do preço",
  idade_minima: "Idade mínima",
  unidade_idade: "Unidade da idade",
  criterio_adicional: "Outros critérios",
  inclui: "O que está incluído",
  acrescimos: "Acréscimos",
  observacao: "Observação",
};
const SITUACAO_PRECO: Record<string, string> = {
  definido: "Valor definido no cadastro",
  sob_consulta: "Precisa de orçamento",
  incluido: "Incluído em outro atendimento",
  nao_informado: "Ainda não informado",
};

function apresentarCampoAtendimento(campo: string, v: unknown): string {
  if (v == null || v === "" || (Array.isArray(v) && !v.length)) return "Não informado";
  if (campo === "modalidade")
    return MODALIDADES_ATENDIMENTO[v as keyof typeof MODALIDADES_ATENDIMENTO] ?? String(v);
  if (campo === "situacao_preco") return SITUACAO_PRECO[String(v)] ?? String(v);
  if (campo === "horarios") return textoHorariosCatalogo(v as HorarioCatalogo[]) ?? "Não informado";
  if (campo === "executantes")
    return (v as AtendimentoCatalogo["executantes"])
      .map((e) => `${e.nome}: ${textoHorariosCatalogo(e.horarios) ?? "sem horários"}`)
      .join("\n");
  if (campo === "precos")
    return (v as PrecoCatalogo[])
      .map(
        (p) =>
          `${p.forma}: ${formatarPrecoCatalogo(p.valor) ?? "valor não informado"}${p.condicao ? ` (${p.condicao})` : ""}${p.observacao ? ` — ${p.observacao}` : ""}`,
      )
      .join("\n");
  return String(v);
}

function resumoAtendimento(a: AtendimentoCatalogo): string {
  return ["modalidade", "precos", a.executantes.length ? "executantes" : "horarios"]
    .map(
      (k) =>
        `${ROTULOS_ATENDIMENTO[k]}: ${apresentarCampoAtendimento(k, a[k as keyof AtendimentoCatalogo])}`,
    )
    .join("\n");
}

/** Diferenças por atendimento, casando pelo identificador. */
export function compararAtendimentos(
  antes: readonly AtendimentoCatalogo[],
  depois: readonly AtendimentoCatalogo[],
): Array<{ campo: string; antes: string; depois: string }> {
  const mudancas: Array<{ campo: string; antes: string; depois: string }> = [];
  for (const d of depois) {
    const a = antes.find((x) => x.id === d.id);
    if (!a) {
      mudancas.push({
        campo: `Atendimento “${d.nome}”`,
        antes: "Não existia",
        depois: resumoAtendimento(d),
      });
      continue;
    }
    for (const k of Object.keys(ROTULOS_ATENDIMENTO) as Array<keyof AtendimentoCatalogo>)
      if (JSON.stringify(a[k] ?? null) !== JSON.stringify(d[k] ?? null))
        mudancas.push({
          campo: `“${d.nome}” — ${ROTULOS_ATENDIMENTO[k]}`,
          antes: apresentarCampoAtendimento(k, a[k]),
          depois: apresentarCampoAtendimento(k, d[k]),
        });
  }
  for (const a of antes)
    if (!depois.some((d) => d.id === a.id))
      mudancas.push({
        campo: `Atendimento “${a.nome}”`,
        antes: resumoAtendimento(a),
        depois: "Removido",
      });
  return mudancas;
}
