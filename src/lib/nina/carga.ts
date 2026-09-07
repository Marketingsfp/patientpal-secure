/**
 * FASE 6 — Motor de teste de carga da homologação da Nina.
 *
 * Módulo puro: perfis, validação de limites, pacing, percentis e distribuição
 * de cenários. O controle de concorrência é código determinístico (aqui e no
 * backend) — o modelo GPT Luna só gera variações de texto, nunca controla o
 * ritmo do teste.
 */

export const MODELO_LUNA = "openai/gpt-5.6-luna";

/** Teto absoluto do motor: nada acima disso é aceito, nem com confirmação. */
export const LIMITE_ABSOLUTO = {
  leadsAtivos: 10,
  totalMensagens: 500,
  conversasSimultaneas: 10,
  mensagensPorMinuto: 240,
  duracaoMaxS: 1800,
  timeoutS: 120,
  retriesMax: 3,
  maxTokens: 2000000,
  maxCustoCreditos: 5000,
  creditosPorMilTokens: 100,
} as const;

/** Acima deste volume, o operador precisa confirmar explicitamente. */
export const LIMITE_CONFIRMACAO = 50;

export type Perfil = "leve" | "medio" | "alto" | "customizado";

export type ConfigCarga = {
  perfil: Perfil;
  leadsAtivos: number;
  totalMensagens: number;
  conversasSimultaneas: number;
  mensagensPorMinuto: number;
  duracaoMaxS: number;
  intervaloMs: number;
  timeoutS: number;
  retriesMax: number;
  /** Teto de tokens somados (entrada + saída) de todo o teste. */
  maxTokens: number;
  /**
   * Teto de custo estimado em créditos. Só vale quando o operador informa
   * `creditosPorMilTokens`; o provedor não devolve preço por chamada.
   * 0 = sem limite de custo.
   */
  maxCustoCreditos: number;
  creditosPorMilTokens: number;
  /** Cenários e o peso de cada um na distribuição das mensagens. */
  distribuicao: { cenario: string; peso: number }[];
};

export const PERFIS: Record<Exclude<Perfil, "customizado">, ConfigCarga> = {
  leve: {
    perfil: "leve",
    leadsAtivos: 5,
    totalMensagens: 20,
    conversasSimultaneas: 5,
    mensagensPorMinuto: 30,
    duracaoMaxS: 300,
    intervaloMs: 1000,
    timeoutS: 60,
    retriesMax: 1,
    maxTokens: 200000,
    maxCustoCreditos: 0,
    creditosPorMilTokens: 0,
    distribuicao: [],
  },
  medio: {
    perfil: "medio",
    leadsAtivos: 10,
    totalMensagens: 100,
    conversasSimultaneas: 10,
    mensagensPorMinuto: 60,
    duracaoMaxS: 900,
    intervaloMs: 500,
    timeoutS: 60,
    retriesMax: 2,
    maxTokens: 600000,
    maxCustoCreditos: 0,
    creditosPorMilTokens: 0,
    distribuicao: [],
  },
  alto: {
    perfil: "alto",
    leadsAtivos: 10,
    totalMensagens: 300,
    conversasSimultaneas: 10,
    mensagensPorMinuto: 120,
    duracaoMaxS: 1800,
    intervaloMs: 250,
    timeoutS: 90,
    retriesMax: 2,
    maxTokens: 2000000,
    maxCustoCreditos: 0,
    creditosPorMilTokens: 0,
    distribuicao: [],
  },
};

export const ROTULO_PERFIL: Record<Perfil, string> = {
  leve: "Leve — 5 conversas, 20 mensagens",
  medio: "Médio — 10 conversas, 100 mensagens",
  alto: "Alto — 10 conversas simultâneas, volume configurável",
  customizado: "Customizado",
};

function limitar(valor: number, min: number, max: number) {
  if (!Number.isFinite(valor)) return min;
  return Math.min(Math.max(Math.round(valor), min), max);
}

/** Ajusta a configuração aos tetos do motor. Nunca deixa passar valor maior. */
export function normalizarConfig(entrada: Partial<ConfigCarga>): ConfigCarga {
  const base = entrada.perfil && entrada.perfil !== "customizado" ? PERFIS[entrada.perfil] : null;
  const bruto = { ...(base ?? PERFIS.leve), ...entrada } as ConfigCarga;
  return {
    perfil: entrada.perfil ?? "customizado",
    leadsAtivos: limitar(bruto.leadsAtivos, 1, LIMITE_ABSOLUTO.leadsAtivos),
    totalMensagens: limitar(bruto.totalMensagens, 1, LIMITE_ABSOLUTO.totalMensagens),
    conversasSimultaneas: limitar(
      Math.min(bruto.conversasSimultaneas, bruto.leadsAtivos),
      1,
      LIMITE_ABSOLUTO.conversasSimultaneas,
    ),
    mensagensPorMinuto: limitar(bruto.mensagensPorMinuto, 1, LIMITE_ABSOLUTO.mensagensPorMinuto),
    duracaoMaxS: limitar(bruto.duracaoMaxS, 30, LIMITE_ABSOLUTO.duracaoMaxS),
    intervaloMs: limitar(bruto.intervaloMs, 0, 60000),
    timeoutS: limitar(bruto.timeoutS, 10, LIMITE_ABSOLUTO.timeoutS),
    retriesMax: limitar(bruto.retriesMax, 0, LIMITE_ABSOLUTO.retriesMax),
    maxTokens: limitar(bruto.maxTokens ?? LIMITE_ABSOLUTO.maxTokens, 1000, LIMITE_ABSOLUTO.maxTokens),
    maxCustoCreditos: Math.min(
      Math.max(Number(bruto.maxCustoCreditos ?? 0) || 0, 0),
      LIMITE_ABSOLUTO.maxCustoCreditos,
    ),
    creditosPorMilTokens: Math.min(
      Math.max(Number(bruto.creditosPorMilTokens ?? 0) || 0, 0),
      LIMITE_ABSOLUTO.creditosPorMilTokens,
    ),
    distribuicao: (bruto.distribuicao ?? []).filter((d) => d.cenario?.trim() && d.peso > 0),
  };
}

/** Diz se o volume exige confirmação explícita do operador. */
export function exigeConfirmacao(config: ConfigCarga) {
  return config.totalMensagens > LIMITE_CONFIRMACAO;
}

export function validarDisparo(
  config: ConfigCarga,
  confirmado: boolean,
): { ok: boolean; motivo?: string } {
  if (config.totalMensagens > LIMITE_ABSOLUTO.totalMensagens)
    return { ok: false, motivo: `Máximo de ${LIMITE_ABSOLUTO.totalMensagens} mensagens por teste.` };
  if (exigeConfirmacao(config) && !confirmado)
    return {
      ok: false,
      motivo: `Testes acima de ${LIMITE_CONFIRMACAO} mensagens exigem confirmação explícita.`,
    };
  return { ok: true };
}

/** Intervalo mínimo entre disparos para respeitar mensagens/minuto e pacing. */
export function intervaloEfetivoMs(config: ConfigCarga) {
  const porRitmo = Math.ceil((60_000 / config.mensagensPorMinuto) * config.conversasSimultaneas);
  return Math.max(config.intervaloMs, porRitmo);
}

/** Distribui as mensagens entre os cenários conforme o peso de cada um. */
export function planoDeMensagens(
  config: ConfigCarga,
): { indice: number; cenario: string; slot: number }[] {
  const cenarios = config.distribuicao.length
    ? config.distribuicao
    : [{ cenario: "Paciente entra em contato com a clínica.", peso: 1 }];
  const pesoTotal = cenarios.reduce((s, c) => s + c.peso, 0);

  const cotas = cenarios.map((c) => ({
    cenario: c.cenario,
    cota: Math.floor((c.peso / pesoTotal) * config.totalMensagens),
  }));
  let sobra = config.totalMensagens - cotas.reduce((s, c) => s + c.cota, 0);
  for (let i = 0; sobra > 0; i = (i + 1) % cotas.length, sobra--) cotas[i]!.cota += 1;

  const fila: string[] = [];
  // Intercala os cenários para o teste não rodar tudo de um tipo primeiro.
  const restantes = cotas.map((c) => ({ ...c }));
  while (fila.length < config.totalMensagens) {
    let algum = false;
    for (const c of restantes) {
      if (c.cota > 0 && fila.length < config.totalMensagens) {
        fila.push(c.cenario);
        c.cota -= 1;
        algum = true;
      }
    }
    if (!algum) break;
  }

  return fila.map((cenario, indice) => ({
    indice,
    cenario,
    slot: indice % config.conversasSimultaneas,
  }));
}

/** Percentil por interpolação linear (mesma definição usada em observabilidade). */
export function percentil(valores: number[], p: number): number | null {
  const lista = valores.filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
  if (!lista.length) return null;
  if (lista.length === 1) return lista[0]!;
  const pos = (p / 100) * (lista.length - 1);
  const baixo = Math.floor(pos);
  const alto = Math.ceil(pos);
  if (baixo === alto) return lista[baixo]!;
  return lista[baixo]! + (lista[alto]! - lista[baixo]!) * (pos - baixo);
}

export type Metricas = {
  amostras: number;
  media: number | null;
  p50: number | null;
  p95: number | null;
  /** p99 só é calculado com volume suficiente (>= 100 amostras). */
  p99: number | null;
  mensagensPorMinutoReal: number | null;
};

export function calcularMetricas(latenciasMs: number[], duracaoMs: number): Metricas {
  const n = latenciasMs.length;
  return {
    amostras: n,
    media: n ? latenciasMs.reduce((s, v) => s + v, 0) / n : null,
    p50: percentil(latenciasMs, 50),
    p95: n >= 20 ? percentil(latenciasMs, 95) : null,
    p99: n >= 100 ? percentil(latenciasMs, 99) : null,
    mensagensPorMinutoReal: duracaoMs > 0 ? (n / duracaoMs) * 60_000 : null,
  };
}

/** Variações de fallback quando o Luna não estiver disponível. */
export function variacoesFallback(cenario: string): string[] {
  const base = cenario.trim().replace(/\.$/, "");
  return [base, `Oi, ${base.toLowerCase()}`, `Boa tarde! ${base}`, `${base}?`];
}

export const INSTRUCOES_LUNA = [
  "Você gera variações curtas de mensagens que um paciente enviaria por WhatsApp para uma clínica.",
  "Responda APENAS com as mensagens, uma por linha, sem numeração e sem aspas.",
  "Varie o jeito de escrever: formal, informal, com abreviações, com e sem saudação.",
  "Nunca invente dados pessoais reais (nome completo, CPF, telefone, endereço).",
  "Cada mensagem deve ter no máximo 140 caracteres.",
].join(" ");

/** Limpa e limita a lista devolvida pelo modelo. */
export function extrairVariacoes(texto: string, maximo = 12): string[] {
  return [
    ...new Set(
      texto
        .split("\n")
        .map((l) => l.replace(/^\s*[-*\d.)]+\s*/, "").replace(/^["']|["']$/g, "").trim())
        .filter((l) => l.length >= 3 && l.length <= 140),
    ),
  ].slice(0, maximo);
}

/** Custo estimado (créditos) do teste de carga. 0 quando a taxa não foi declarada. */
export function custoEstimadoCarga(tokens: number, creditosPorMilTokens: number): number {
  if (!creditosPorMilTokens || creditosPorMilTokens <= 0) return 0;
  return (Math.max(0, tokens) / 1000) * creditosPorMilTokens;
}

/** Diz se o teste estourou o orçamento de tokens ou de custo estimado. */
export function estourouOrcamento(
  config: ConfigCarga,
  tokens: number,
): { estourou: boolean; motivo?: "limite_tokens" | "limite_custo" } {
  if (tokens >= config.maxTokens) return { estourou: true, motivo: "limite_tokens" };
  if (
    config.maxCustoCreditos > 0 &&
    custoEstimadoCarga(tokens, config.creditosPorMilTokens) >= config.maxCustoCreditos
  )
    return { estourou: true, motivo: "limite_custo" };
  return { estourou: false };
}
