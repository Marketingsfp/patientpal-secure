/**
 * Parser da Base de Conhecimentos da Nina (planilha TAP e similares).
 *
 * Regras que este módulo garante (ver AGENTS.md — nada aqui inventa dado):
 * - Célula vazia NÃO significa "não existe": colunas de agrupamento
 *   (seção / especialidade / procedimento) herdam o valor das linhas anteriores.
 * - O conteúdo ORIGINAL da linha é sempre preservado em `bruto`.
 * - Preço nunca é lido de uma coluna de horário e vice-versa; se isso acontecer
 *   o registro entra no relatório de validação em vez de ser "corrigido".
 *
 * É um módulo puro (sem Supabase, sem env) para poder ser testado isoladamente.
 */

export interface LinhaPlanilha {
  aba: string;
  linha: number;
  celulas: string[];
}

export interface RegistroKb {
  secao: string | null;
  categoria: string | null;
  tipo: string | null;
  procedimento: string | null;
  medico: string | null;
  dia: string | null;
  horario: string | null;
  preco_dinheiro: number | null;
  preco_cartao: number | null;
  observacoes: string | null;
  preparo: string | null;
  extras: Record<string, unknown>;
  bruto: Record<string, string>;
  linha_origem: number;
  aba_origem: string;
  texto_busca: string;
}

export interface ResultadoParse {
  registros: RegistroKb[];
  linhasLidas: number;
  avisos: string[];
  erros: string[];
}

/* ------------------------------------------------------------------ */
/* Normalização                                                        */
/* ------------------------------------------------------------------ */

export function semAcento(t: string): string {
  return t
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

export function normalizarTexto(t: string): string {
  return semAcento(t).replace(/[^a-z0-9\s/]/g, " ").replace(/\s{2,}/g, " ").trim();
}

/**
 * Sinônimos/abreviações SEGUROS. Só entram equivalências que não mudam o
 * significado clínico do procedimento (ex.: "usg" = "ultrassonografia").
 */
export const SINONIMOS: Record<string, string> = {
  cardio: "cardiologia",
  cardiologista: "cardiologia",
  neuro: "neurologia",
  neurologista: "neurologia",
  dermato: "dermatologia",
  dermatologista: "dermatologia",
  gineco: "ginecologia",
  ginecologista: "ginecologia",
  ortopedista: "ortopedia",
  pediatra: "pediatria",
  uro: "urologia",
  urologista: "urologia",
  endocrino: "endocrinologia",
  endocrinologista: "endocrinologia",
  gastro: "gastroenterologia",
  otorrino: "otorrinolaringologia",
  oftalmo: "oftalmologia",
  oftalmologista: "oftalmologia",
  psiquiatra: "psiquiatria",
  reumato: "reumatologia",
  pneumo: "pneumologia",
  nefro: "nefrologia",
  angio: "angiologia",
  usg: "ultrassonografia",
  us: "ultrassonografia",
  ultra: "ultrassonografia",
  ultrassom: "ultrassonografia",
  eco: "ecocardiograma",
  ecg: "eletrocardiograma",
  eeg: "eletroencefalograma",
  rx: "raio x",
  raiox: "raio x",
  tc: "tomografia",
  rm: "ressonancia magnetica",
  ressonancia: "ressonancia magnetica",
  endo: "endoscopia",
  colono: "colonoscopia",
  mamo: "mamografia",
  densito: "densitometria",
};

/** Expande sinônimos de um texto livre, mantendo também os termos originais. */
export function expandirTermos(texto: string): string[] {
  const base = normalizarTexto(texto)
    .split(/[\s/]+/)
    .filter((t) => t.length >= 2);
  const saida = new Set<string>();
  for (const t of base) {
    saida.add(t);
    const s = SINONIMOS[t];
    if (s) for (const parte of s.split(" ")) saida.add(parte);
  }
  return [...saida];
}

const DIAS_MAP: Record<string, string> = {
  seg: "Segunda-feira",
  segunda: "Segunda-feira",
  "segunda-feira": "Segunda-feira",
  "2a": "Segunda-feira",
  ter: "Terça-feira",
  terca: "Terça-feira",
  "terca-feira": "Terça-feira",
  "3a": "Terça-feira",
  qua: "Quarta-feira",
  quarta: "Quarta-feira",
  "quarta-feira": "Quarta-feira",
  "4a": "Quarta-feira",
  qui: "Quinta-feira",
  quinta: "Quinta-feira",
  "quinta-feira": "Quinta-feira",
  "5a": "Quinta-feira",
  sex: "Sexta-feira",
  sexta: "Sexta-feira",
  "sexta-feira": "Sexta-feira",
  "6a": "Sexta-feira",
  sab: "Sábado",
  sabado: "Sábado",
  "7a": "Sábado",
  dom: "Domingo",
  domingo: "Domingo",
  "1a": "Domingo",
};

/** Ordem da semana usada para expandir intervalos ("SEG À SEX"). */
export const ORDEM_SEMANA = [
  "Domingo",
  "Segunda-feira",
  "Terça-feira",
  "Quarta-feira",
  "Quinta-feira",
  "Sexta-feira",
  "Sábado",
];

export interface DiaInterpretado {
  dia: string;
  regra: string | null;
  horario?: string | null;
}

export interface DiasInterpretados {
  dias_original: string;
  dias: DiaInterpretado[];
  texto: string | null;
}

/** Reconhece um token isolado de dia ("seg", "2ª", "segunda-feira", "sáb."). */
export function tokenDia(bruto: string): string | null {
  const t = semAcento(bruto)
    .replace(/[\u00aa\u00ba\u00b0]/g, "a")
    .replace(/[.:]+$/g, "")
    .replace(/^[.:]+/g, "")
    .trim();
  if (!t) return null;
  if (DIAS_MAP[t]) return DIAS_MAP[t]!;
  const semFeira = t.replace(/\s*[-\s]\s*feira$/, "");
  if (DIAS_MAP[semFeira]) return DIAS_MAP[semFeira]!;
  return null;
}

/**
 * Interpreta uma célula de dias que pode conter VÁRIOS dias, intervalos e
 * regras adicionais na mesma string. Nunca descarta o valor original.
 *
 * "SEG / QUA"                     -> segunda + quarta
 * "SEG À SEX"                     -> segunda..sexta
 * "SEG DE 15 EM 15 DIAS / QUI"    -> segunda (regra: de 15 em 15 dias) + quinta
 */
export function interpretarDias(valor: string): DiasInterpretados {
  const original = String(valor ?? "").replace(/\s+/g, " ").trim();
  const dias: DiaInterpretado[] = [];
  if (!original) return { dias_original: original, dias, texto: null };

  // Separadores explícitos entre dias. " e " só separa como PALAVRA inteira —
  // nunca como letra dentro de "seg", "ter", "sex".
  const segmentos = semAcento(original)
    .split(/\s*[\/,;+|]\s*|\s+e\s+|\s+ou\s+/)
    .map((s) => s.trim())
    .filter(Boolean);

  const adicionar = (dia: string, regra: string | null, horario: string | null = null) => {
    const existente = dias.find((d) => d.dia === dia);
    if (existente) {
      if (regra && !existente.regra) existente.regra = regra;
      if (horario && !existente.horario) existente.horario = horario;
      return;
    }
    dias.push({ dia, regra, horario });
  };

  for (const segmento of segmentos) {
    const palavras = segmento.split(/\s+/).filter(Boolean);
    if (!palavras.length) continue;

    // Intervalo: "seg a sex", "seg ate sab".
    const iLig = palavras.findIndex((p) => p === "a" || p === "ate" || p === "as");
    if (iLig > 0) {
      const ini = tokenDia(palavras.slice(0, iLig).join(" ")) ?? tokenDia(palavras[iLig - 1]!);
      const fim = tokenDia(palavras[iLig + 1] ?? "");
      if (ini && fim) {
        const a = ORDEM_SEMANA.indexOf(ini);
        const b = ORDEM_SEMANA.indexOf(fim);
        const regra = palavras.slice(iLig + 2).join(" ").trim() || null;
        if (a <= b) for (let k = a; k <= b; k++) adicionar(ORDEM_SEMANA[k]!, regra);
        else {
          for (let k = a; k < ORDEM_SEMANA.length; k++) adicionar(ORDEM_SEMANA[k]!, regra);
          for (let k = 0; k <= b; k++) adicionar(ORDEM_SEMANA[k]!, regra);
        }
        continue;
      }
    }

    // Dia simples (podendo ser "segunda feira") + regra restante.
    let dia: string | null = null;
    let consumidas = 0;
    for (const tamanho of [3, 2, 1]) {
      if (palavras.length < tamanho) continue;
      const t = tokenDia(palavras.slice(0, tamanho).join(" "));
      if (t) {
        dia = t;
        consumidas = tamanho;
        break;
      }
    }
    if (!dia) {
      // Dia pode não estar no início ("atende toda SEG").
      const idx = palavras.findIndex((p) => tokenDia(p));
      if (idx >= 0) {
        dia = tokenDia(palavras[idx]!);
        consumidas = idx + 1;
      }
    }
    if (!dia) continue;

    const resto = palavras.slice(consumidas);
    const restoTexto = resto.join(" ").replace(/^[-–—:]+\s*/, "").trim();
    // O horário pode vir dentro da própria célula de dias ("QUA 07:00h").
    const horaNoDia = restoTexto ? normalizarHorario(restoTexto) : null;
    const regra =
      restoTexto
        .replace(/\b([01]?\d|2[0-3])\s*[:h]\s*([0-5]\d)?h?\b/g, " ")
        .replace(/\s{2,}/g, " ")
        .replace(/^[\s-–—:,]+|[\s-–—:,]+$/g, "")
        .replace(/^\((.*)\)$/, "$1")
        .trim() || null;
    adicionar(dia, regra, horaNoDia);
  }

  // Horário/regra escritos uma única vez no FIM da célula valem para todos os
  // dias listados ("Seg e Qua 07:00h (Ordem de Chegada)").
  const comHora = dias.filter((d) => d.horario);
  if (dias.length > 1 && comHora.length === 1 && dias[dias.length - 1]!.horario) {
    const ultimo = dias[dias.length - 1]!;
    for (const d of dias) {
      if (!d.horario) d.horario = ultimo.horario ?? null;
      if (!d.regra) d.regra = ultimo.regra ?? null;
    }
  }

  const regraComum =
    dias.length > 1 && dias.every((d) => d.regra && d.regra === dias[0]!.regra)
      ? dias[0]!.regra
      : null;
  const texto = dias.length
    ? regraComum
      ? `${dias.map((d) => d.dia).join(" e ")} (${regraComum})`
      : dias.map((d) => (d.regra ? `${d.dia} (${d.regra})` : d.dia)).join(" e ")
    : null;
  return { dias_original: original, dias, texto };
}

/** Compatibilidade: texto consolidado dos dias ("Segunda-feira e Quarta-feira"). */
export function normalizarDia(valor: string): string | null {
  return interpretarDias(valor).texto;
}


export const RE_HORA = /\b([01]?\d|2[0-3])\s*[:h]\s*([0-5]\d)?\b/;

export function pareceHorario(valor: string): boolean {
  return RE_HORA.test(valor.trim());
}

export function pareceDinheiro(valor: string): boolean {
  const v = valor.trim();
  if (!v) return false;
  if (pareceHorario(v) && !/r\$/i.test(v)) return false;
  return /r\$|^\d{1,3}([.,]\d{3})*([.,]\d{1,2})?$/i.test(v);
}

/** "R$ 1.200,50" | "120" | "120,00" -> number. Retorna null quando não é valor. */
export function parseDinheiro(valor: string): number | null {
  if (!valor) return null;
  const v = valor.trim();
  if (!pareceDinheiro(v)) return null;
  let limpo = v.replace(/r\$/i, "").replace(/\s/g, "");
  if (limpo.includes(",")) limpo = limpo.replace(/\./g, "").replace(",", ".");
  else if ((limpo.match(/\./g) ?? []).length > 1) limpo = limpo.replace(/\./g, "");
  const n = Number(limpo);
  if (!Number.isFinite(n) || n < 0 || n > 1_000_000) return null;
  return Math.round(n * 100) / 100;
}

/** Normaliza horários para "HH:MM" mantendo intervalos ("07:00 às 11:00"). */
export function normalizarHorario(valor: string): string | null {
  const v = valor.trim();
  if (!v) return null;
  const achados = [...v.matchAll(/\b([01]?\d|2[0-3])\s*[:h]\s*([0-5]\d)?/g)].map(
    (m) => `${String(Number(m[1])).padStart(2, "0")}:${m[2] ?? "00"}`,
  );
  if (!achados.length) return null;
  return achados.length > 1 ? `${achados[0]} às ${achados[achados.length - 1]}` : achados[0]!;
}

/**
 * Relaciona horários aos dias preservando a estrutura da planilha.
 *
 * - "2ª 13:00 / 5ª 07:00"  -> o horário vai para o dia citado no próprio trecho.
 * - "13:00 / 07:00"        -> pareamento POSICIONAL com os dias da célula de dias.
 * - "07:00 às 11:00"       -> mesmo horário para todos os dias.
 */
export function relacionarDiasHorarios(
  dias: DiaInterpretado[],
  horarioBruto: string,
): DiaInterpretado[] {
  const v = String(horarioBruto ?? "").trim();
  if (!dias.length) return dias;
  if (!v) return dias.map((d) => ({ ...d, horario: d.horario ?? null }));

  const trechos = v
    .split(/\s*[\/;|]\s*/)
    .map((t) => t.trim())
    .filter(Boolean);

  // 1) Trechos que citam o próprio dia.
  const porDia = new Map<string, string>();
  let algumComDia = false;
  for (const trecho of trechos) {
    const palavras = semAcento(trecho).split(/\s+/).filter(Boolean);
    const encontrado = palavras.map((p) => tokenDia(p)).find(Boolean);
    const hora = normalizarHorario(trecho);
    if (encontrado && hora) {
      porDia.set(encontrado, hora);
      algumComDia = true;
    }
  }
  if (algumComDia)
    return dias.map((d) => ({ ...d, horario: porDia.get(d.dia) ?? normalizarHorario(v) }));

  // 2) Pareamento posicional quando a quantidade bate.
  const horas = trechos.map((t) => normalizarHorario(t)).filter(Boolean) as string[];
  if (horas.length === dias.length && horas.length > 1)
    return dias.map((d, i) => ({ ...d, horario: horas[i] ?? null }));

  // 3) Um horário (ou intervalo) para todos.
  const unico = normalizarHorario(v);
  return dias.map((d) => ({ ...d, horario: d.horario ?? unico }));
}



/* ------------------------------------------------------------------ */
/* Detecção de colunas                                                 */
/* ------------------------------------------------------------------ */

export type Campo =
  | "categoria"
  | "procedimento"
  | "medico"
  | "dia"
  | "horario"
  | "preco_dinheiro"
  | "preco_cartao"
  | "observacoes"
  | "preparo";

const CABECALHOS: Array<{ campo: Campo; termos: string[] }> = [
  { campo: "categoria", termos: ["especialidade", "categoria", "setor", "grupo", "secao"] },
  {
    campo: "procedimento",
    termos: ["procedimento", "exame", "servico", "descricao", "consulta", "item"],
  },
  { campo: "medico", termos: ["medico", "profissional", "doutor", "dra", "dr", "executante"] },
  { campo: "dia", termos: ["dia", "dias", "data", "escala"] },
  { campo: "horario", termos: ["horario", "hora", "horarios"] },
  {
    campo: "preco_dinheiro",
    termos: ["dinheiro", "pix", "avista", "a vista", "valor", "particular", "preco"],
  },
  { campo: "preco_cartao", termos: ["cartao", "credito", "debito", "parcelado"] },
  { campo: "preparo", termos: ["preparo", "preparos", "orientacao", "orientacoes", "requisito"] },
  { campo: "observacoes", termos: ["observacao", "observacoes", "obs", "informacoes", "nota"] },
];

export function detectarColunas(linha: string[]): Partial<Record<Campo, number>> {
  const mapa: Partial<Record<Campo, number>> = {};
  linha.forEach((celula, idx) => {
    const v = normalizarTexto(celula ?? "");
    if (!v) return;
    for (const { campo, termos } of CABECALHOS) {
      if (mapa[campo] !== undefined) continue;
      if (termos.some((t) => v === t || v.startsWith(`${t} `) || v.includes(t))) {
        mapa[campo] = idx;
        return;
      }
    }
  });
  return mapa;
}

function contarCampos(mapa: Partial<Record<Campo, number>>) {
  return Object.keys(mapa).length;
}

/* ------------------------------------------------------------------ */
/* Parse                                                               */
/* ------------------------------------------------------------------ */

function limpar(v: unknown): string {
  return String(v ?? "").replace(/\s+/g, " ").trim();
}

/**
 * Interpreta uma aba já lida como matriz de strings.
 * Linhas com uma única célula preenchida viram SEÇÃO/CATEGORIA e passam a
 * contextualizar as linhas seguintes.
 */
export function parseAba(aba: string, matriz: string[][]): ResultadoParse {
  const avisos: string[] = [];
  const erros: string[] = [];
  const registros: RegistroKb[] = [];

  // 1) Cabeçalho: primeira linha que reconhece pelo menos 2 campos.
  let idxCabecalho = -1;
  let colunas: Partial<Record<Campo, number>> = {};
  for (let i = 0; i < Math.min(matriz.length, 40); i++) {
    const tentativa = detectarColunas((matriz[i] ?? []).map(limpar));
    if (contarCampos(tentativa) >= 2) {
      idxCabecalho = i;
      colunas = tentativa;
      break;
    }
  }
  if (idxCabecalho === -1) {
    erros.push(`Aba "${aba}": não foi possível reconhecer o cabeçalho da tabela.`);
    return { registros, linhasLidas: matriz.length, avisos, erros };
  }

  let secao: string | null = null;
  let categoria: string | null = null;
  let procedimento: string | null = null;
  let tipo: string | null = null;
  let ultimoMedico: string | null = null;
  let ultimoDinheiro: number | null = null;

  let ultimoCartao: number | null = null;

  for (let i = idxCabecalho + 1; i < matriz.length; i++) {
    const bruta = (matriz[i] ?? []).map(limpar);
    const preenchidas = bruta.filter(Boolean);
    if (!preenchidas.length) continue;

    const bruto: Record<string, string> = {};
    bruta.forEach((v, idx) => {
      if (v) bruto[`col_${idx}`] = v;
    });

    // Linha de seção: só um texto, sem valor nem hora.
    if (
      preenchidas.length === 1 &&
      !pareceDinheiro(preenchidas[0]!) &&
      !pareceHorario(preenchidas[0]!)
    ) {
      secao = preenchidas[0]!;
      categoria = secao;
      procedimento = null;
      tipo = null;
      ultimoDinheiro = null;
      ultimoCartao = null;
      continue;
    }

    const pega = (campo: Campo) => {
      const idx = colunas[campo];
      return idx === undefined ? "" : (bruta[idx] ?? "");
    };

    const catCelula = pega("categoria");
    if (catCelula) {
      categoria = catCelula;
      procedimento = null;
      ultimoDinheiro = null;
      ultimoCartao = null;
    }

    const procCelula = pega("procedimento");
    if (procCelula) {
      procedimento = procCelula;
      ultimoDinheiro = null;
      ultimoCartao = null;
      const p = normalizarTexto(procCelula);
      tipo = p.includes("consulta")
        ? "Consulta"
        : /exame|ultrass|raio|tomograf|ressonan|endoscop|colonoscop|mamograf|densitom|eletro|eco/.test(
              p,
            )
          ? "Exame"
          : "Procedimento";
    }

    const diaBruto = pega("dia");
    const horaBruta = pega("horario");
    const dinheiroBruto = pega("preco_dinheiro");
    const cartaoBruto = pega("preco_cartao");

    // Integridade: valor na coluna de horário ou hora na coluna de valor.
    if (horaBruta && pareceDinheiro(horaBruta) && !pareceHorario(horaBruta))
      avisos.push(`Aba "${aba}", linha ${i + 1}: valor monetário na coluna de horário ("${horaBruta}").`);
    if (dinheiroBruto && pareceHorario(dinheiroBruto) && !/r\$/i.test(dinheiroBruto))
      avisos.push(`Aba "${aba}", linha ${i + 1}: horário na coluna de preço ("${dinheiroBruto}").`);

    let dinheiro = parseDinheiro(dinheiroBruto);
    let cartao = parseDinheiro(cartaoBruto);
    const herdouPreco = { dinheiro: false, cartao: false };
    if (dinheiro === null && ultimoDinheiro !== null && procedimento) {
      dinheiro = ultimoDinheiro;
      herdouPreco.dinheiro = true;
    }
    if (cartao === null && ultimoCartao !== null && procedimento) {
      cartao = ultimoCartao;
      herdouPreco.cartao = true;
    }
    if (!herdouPreco.dinheiro && dinheiro !== null) ultimoDinheiro = dinheiro;
    if (!herdouPreco.cartao && cartao !== null) ultimoCartao = cartao;

    // O médico também é herdado: na planilha, as linhas seguintes do mesmo
    // profissional só repetem o dia/horário e deixam o nome em branco.
    const medicoCelula = pega("medico") || null;
    if (catCelula || procCelula) ultimoMedico = null;
    if (medicoCelula) ultimoMedico = medicoCelula;
    const medico = medicoCelula ?? ultimoMedico;

    const interpretacao = interpretarDias(diaBruto);
    const diasEstruturados = relacionarDiasHorarios(interpretacao.dias, horaBruta);
    const dia = diaBruto ? (interpretacao.texto ?? diaBruto) : null;
    const horario = horaBruta ? normalizarHorario(horaBruta) : null;
    const observacoes = pega("observacoes") || null;
    const preparo = pega("preparo") || null;

    // Sem nenhum conteúdo útil além do contexto herdado → ignora.
    if (!medicoCelula && !dia && !horario && dinheiro === null && cartao === null && !observacoes && !preparo && !procCelula)
      continue;

    const horarioPorDia = diasEstruturados
      .filter((d) => d.horario)
      .map((d) => `${d.dia} ${d.horario}`)
      .join(" | ");

    const rotulo = [
      categoria,
      procedimento,
      medico,
      dia,
      diaBruto,
      horario,
      horarioPorDia,
      observacoes,
      preparo,
    ]
      .filter(Boolean)
      .join(" ");

    registros.push({
      secao,
      categoria,
      tipo,
      procedimento: procedimento ?? categoria,
      medico,
      dia,
      horario,
      preco_dinheiro: dinheiro,
      preco_cartao: cartao,
      observacoes,
      preparo,
      extras: {
        preco_dinheiro_herdado: herdouPreco.dinheiro,
        preco_cartao_herdado: herdouPreco.cartao,
        dia_original: diaBruto || null,
        dias: diasEstruturados,
        horario_original: horaBruta || null,
        preco_dinheiro_original: dinheiroBruto || null,
        preco_cartao_original: cartaoBruto || null,
      },
      bruto,
      linha_origem: i + 1,
      aba_origem: aba,
      texto_busca: [...new Set([...expandirTermos(rotulo), ...normalizarTexto(rotulo).split(" ")])]
        .filter(Boolean)
        .join(" "),
    });

  }

  if (!registros.length) erros.push(`Aba "${aba}": nenhum registro válido encontrado.`);
  return { registros, linhasLidas: matriz.length, avisos, erros };
}

/** Interpreta várias abas e consolida o relatório. */
export function parsePlanilha(abas: Array<{ nome: string; matriz: string[][] }>): ResultadoParse {
  const out: ResultadoParse = { registros: [], linhasLidas: 0, avisos: [], erros: [] };
  const comDados = abas.filter((a) => a.matriz.some((l) => l.some((c) => limpar(c))));
  for (const aba of comDados) {
    const r = parseAba(aba.nome, aba.matriz);
    out.registros.push(...r.registros);
    out.linhasLidas += r.linhasLidas;
    out.avisos.push(...r.avisos);
    // Erro de uma aba isolada vira aviso quando outra aba trouxe registros.
    out.erros.push(...r.erros);
  }
  if (out.registros.length) {
    out.avisos.push(...out.erros);
    out.erros = [];
  }
  if (!comDados.length) out.erros.push("Arquivo sem nenhuma aba com conteúdo.");
  return out;
}

/* ------------------------------------------------------------------ */
/* Validação de integridade antes de ativar                            */
/* ------------------------------------------------------------------ */

export interface Validacao {
  ok: boolean;
  motivos: string[];
  avisos: string[];
  totais: {
    registros: number;
    com_preco: number;
    com_medico: number;
    com_horario: number;
    conflitos: number;
  };
}

/** Dois registros iguais em chave e divergentes em preço = conflito. */
export function detectarConflitos(registros: RegistroKb[]): Array<{ chave: string; linhas: number[] }> {
  const mapa = new Map<string, RegistroKb[]>();
  for (const r of registros) {
    const chave = normalizarTexto(
      `${r.categoria ?? ""}|${r.procedimento ?? ""}|${r.medico ?? ""}|${r.dia ?? ""}|${r.horario ?? ""}`,
    );
    mapa.set(chave, [...(mapa.get(chave) ?? []), r]);
  }
  const conflitos: Array<{ chave: string; linhas: number[] }> = [];
  for (const [chave, itens] of mapa) {
    if (itens.length < 2) continue;
    const precos = new Set(itens.map((i) => `${i.preco_dinheiro}/${i.preco_cartao}`));
    if (precos.size > 1) conflitos.push({ chave, linhas: itens.map((i) => i.linha_origem) });
  }
  return conflitos;
}

export function validarRegistros(resultado: ResultadoParse): Validacao {
  const { registros } = resultado;
  const motivos: string[] = [...resultado.erros];
  const avisos: string[] = [...resultado.avisos];

  if (!registros.length) motivos.push("Nenhum registro válido foi extraído da planilha.");

  const comPreco = registros.filter((r) => r.preco_dinheiro !== null || r.preco_cartao !== null).length;
  const comMedico = registros.filter((r) => r.medico).length;
  const comHorario = registros.filter((r) => r.horario).length;
  const conflitos = detectarConflitos(registros);

  if (registros.length && comPreco === 0 && comMedico === 0)
    motivos.push("A planilha não trouxe nem preços nem médicos — provável erro de leitura.");

  // Duplicação massiva: mesma linha repetida muitas vezes.
  const assinaturas = new Set(
    registros.map((r) => `${r.aba_origem}|${r.linha_origem}|${r.procedimento}|${r.medico}`),
  );
  if (registros.length > 20 && assinaturas.size < registros.length * 0.5)
    motivos.push("Duplicação massiva de registros detectada no processamento.");

  if (conflitos.length)
    avisos.push(
      `${conflitos.length} conflito(s) de preço entre registros equivalentes (linhas ${conflitos
        .slice(0, 5)
        .map((c) => c.linhas.join("/"))
        .join(", ")}).`,
    );

  return {
    ok: motivos.length === 0,
    motivos,
    avisos,
    totais: {
      registros: registros.length,
      com_preco: comPreco,
      com_medico: comMedico,
      com_horario: comHorario,
      conflitos: conflitos.length,
    },
  };
}
