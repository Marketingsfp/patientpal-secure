/**
 * FASE 5 — CATÁLOGO COMO FONTE DE CONHECIMENTO DA NINA (regras puras).
 *
 * Converte registros PUBLICADOS do catálogo estruturado no mesmo contrato já
 * usado pelas ferramentas da Nina (`ResultadoConhecimento`), sem criar um
 * segundo fluxo de atendimento.
 *
 * Princípios preservados:
 *  - Só entra aqui o que é público: nota interna, rascunho e registro
 *    arquivado NÃO chegam a este módulo (a exclusão é feita na consulta).
 *  - Campo vazio = informação desconhecida. Nunca vira preço zero, "não
 *    atende" ou dia fechado.
 *  - Horário cadastrado é escala habitual, não vaga: disponibilidade real
 *    continua vindo da Agenda.
 */
import {
  detectarConflitos,
  type RegistroConhecimento,
  type ResultadoConhecimento,
} from "./knowledge-contract";
import { paraNumero, resumoHorarios, valorResumo } from "./catalogo";

/** Serviço publicado, já sem colunas internas. */
export type ServicoPublicado = {
  id: string;
  nome: string;
  valor: number | string | null;
  valor_observacao: string | null;
  descricao_publica: string | null;
  preparo: string | null;
  restricoes: string | null;
  executantes: unknown;
  formas_pagamento: unknown;
};

/** Profissional publicado, já sem colunas internas. */
export type ProfissionalPublicado = {
  id: string;
  nome: string;
  especialidades: unknown;
  atende_consultorio: boolean | null;
  formas_pagamento: unknown;
  convenios: unknown;
  horarios: unknown;
  tipo_atendimento: string | null;
  observacao_publica: string | null;
  aviso_dia: string | null;
  aviso_valido_de: string | null;
  aviso_valido_ate: string | null;
  /** Unidade vinculada (nome público), quando cadastrada. */
  unidades?: { nome?: string | null } | null;
};

/** Nome da unidade do profissional, quando houver. */
export function unidadeDoProfissional(p: ProfissionalPublicado): string | null {
  const nome = String(p.unidades?.nome ?? "").trim();
  return nome ? nome : null;
}

function lista(v: unknown): Array<Record<string, unknown>> {
  return Array.isArray(v) ? (v.filter((i) => i && typeof i === "object") as Array<Record<string, unknown>>) : [];
}

function texto(v: unknown): string | null {
  const t = String(v ?? "").trim();
  return t ? t : null;
}

function nomesVinculos(v: unknown): string[] {
  return lista(v)
    .map((i) => texto(i["nome"]))
    .filter((n): n is string => Boolean(n));
}

function precoPorForma(formas: unknown, alvo: RegExp): number | null {
  for (const f of lista(formas)) {
    if (alvo.test(String(f["forma"] ?? ""))) {
      const n = paraNumero(f["valor"]);
      if (n !== null) return n;
    }
  }
  return null;
}

function descricaoPagamentos(formas: unknown): string | null {
  const partes = lista(formas)
    .map((f) => {
      const forma = texto(f["forma"]);
      if (!forma) return null;
      const valor = paraNumero(f["valor"]);
      const cond = texto(f["condicao"]);
      const obs = texto(f["observacao"]);
      return [
        cond ? `${cond} — ${forma}` : forma,
        valor !== null ? `R$ ${valor.toFixed(2).replace(".", ",")}` : "valor não informado",
        obs,
      ]
        .filter(Boolean)
        .join(": ");
    })
    .filter((p): p is string => Boolean(p));
  return partes.length ? `Formas de pagamento — ${partes.join(" | ")}` : null;
}

/**
 * Aviso do dia só vale dentro da vigência informada. Fora da vigência, o
 * aviso simplesmente não é enviado ao modelo.
 */
export function avisoVigente(
  p: Pick<ProfissionalPublicado, "aviso_dia" | "aviso_valido_de" | "aviso_valido_ate">,
  hojeISO: string,
): string | null {
  const aviso = texto(p.aviso_dia);
  if (!aviso) return null;
  if (p.aviso_valido_de && hojeISO < p.aviso_valido_de) return null;
  if (p.aviso_valido_ate && hojeISO > p.aviso_valido_ate) return null;
  return aviso;
}

/** Serviço publicado → registro no formato que as ferramentas já consomem. */
export function servicoParaRegistro(s: ServicoPublicado): RegistroConhecimento {
  const executantes = lista(s.executantes);
  const dinheiro = precoPorForma(s.formas_pagamento, /dinheiro|vista|pix/i);
  const cartao = precoPorForma(s.formas_pagamento, /cart/i);
  const resumo = valorResumo({
    valor: paraNumero(s.valor),
    formas_pagamento: lista(s.formas_pagamento).map((f) => ({ valor: paraNumero(f["valor"]) })),
  });

  return {
    id: s.id,
    categoria: "EXAME_PROCEDIMENTO",
    tipo: "servico",
    procedimento: s.nome,
    medico: executantes.map((e) => texto(e["nome"])).filter(Boolean).join(", ") || null,
    dia: executantes.map((e) => texto(e["horarios"])).filter(Boolean).join(" | ") || null,
    horario: null,
    preco_dinheiro: dinheiro ?? resumo,
    preco_cartao: cartao,
    observacoes:
      [
        texto(s.descricao_publica),
        texto(s.valor_observacao),
        texto(s.restricoes) ? `Requisitos: ${texto(s.restricoes)}` : null,
        descricaoPagamentos(s.formas_pagamento),
      ]
        .filter(Boolean)
        .join(" | ") || null,
    preparo: texto(s.preparo),
    linha_origem: null,
    aba_origem: "Catálogo — exames e procedimentos",
    extras: {
      catalogo_tipo: "servico",
      executantes: executantes.map((e) => ({
        nome: texto(e["nome"]),
        horarios: texto(e["horarios"]),
        observacao: texto(e["observacao"]),
      })),
      formas_pagamento: lista(s.formas_pagamento),
    },
  };
}

/** Profissional publicado → registro no formato que as ferramentas já consomem. */
export function profissionalParaRegistro(
  p: ProfissionalPublicado,
  hojeISO: string,
): RegistroConhecimento {
  const especialidades = nomesVinculos(p.especialidades);
  const convenios = nomesVinculos(p.convenios);
  const horarios = lista(p.horarios) as Array<Record<string, unknown>>;
  const dinheiro = precoPorForma(p.formas_pagamento, /dinheiro|vista|pix/i);
  const cartao = precoPorForma(p.formas_pagamento, /cart/i);
  const aviso = avisoVigente(p, hojeISO);

  return {
    id: p.id,
    categoria: "CONSULTA",
    tipo: "profissional",
    procedimento: especialidades.length
      ? `Consulta — ${especialidades.join(", ")}`
      : "Consulta",
    medico: p.nome,
    dia: horarios.length
      ? resumoHorarios(horarios as never)
      : texto(p.observacao_publica),
    horario: null,
    preco_dinheiro: dinheiro,
    preco_cartao: cartao,
    observacoes:
      [
        texto(p.tipo_atendimento) ? `Modalidade: ${texto(p.tipo_atendimento)}` : null,
        p.atende_consultorio === null
          ? null
          : p.atende_consultorio
            ? "Atende no consultório."
            : "Não atende no consultório.",
        convenios.length ? `Convênios: ${convenios.join(", ")}` : null,
        unidadeDoProfissional(p) ? `Unidade: ${unidadeDoProfissional(p)}` : null,
        texto(p.observacao_publica),
        aviso ? `Aviso vigente: ${aviso}` : null,
        descricaoPagamentos(p.formas_pagamento),
      ]
        .filter(Boolean)
        .join(" | ") || null,
    preparo: null,
    linha_origem: null,
    aba_origem: "Catálogo — consultas e profissionais",
    extras: {
      catalogo_tipo: "profissional",
      especialidades,
      convenios,
      horarios,
      atende_consultorio: p.atende_consultorio,
      formas_pagamento: lista(p.formas_pagamento),
    },
  };
}

const INSTRUCAO_FOUND =
  "Responda usando SOMENTE os fatos deste retorno (catálogo publicado da clínica). " +
  "Campo ausente = informação desconhecida: não complete com a planilha, conhecimento geral, " +
  "valor médio, estimativa ou internet. Horário aqui é escala habitual, não vaga: " +
  "disponibilidade real e confirmação de agendamento vêm das ferramentas de agenda.";

const INSTRUCAO_NOT_FOUND =
  "O catálogo publicado NÃO tem essa informação. É proibido deduzir, estimar ou usar conhecimento " +
  "pré-treinado. Peça o esclarecimento necessário quando fizer sentido, ou diga que vai verificar " +
  "com a equipe e siga o fluxo de atendimento humano.";

const INSTRUCAO_CONFLICT =
  "O catálogo publicado tem informações incompatíveis para este item. NÃO escolha nenhuma delas e " +
  "NÃO invente. Diga que precisa confirmar com a equipe e siga o fluxo de atendimento humano (handoff).";

/** Monta o contrato estruturado a partir do catálogo publicado. */
export function montarResultadoCatalogo(entrada: {
  servicos: readonly ServicoPublicado[];
  profissionais: readonly ProfissionalPublicado[];
  hojeISO: string;
  ambiguo?: boolean;
}): ResultadoConhecimento {
  const registros: RegistroConhecimento[] = [
    ...entrada.servicos.map(servicoParaRegistro),
    ...entrada.profissionais.map((p) => profissionalParaRegistro(p, entrada.hojeISO)),
  ];

  const traces = registros.map((r) => ({
    record_id: r.id ?? null,
    sheet: r.aba_origem ?? null,
    row: null,
    item: r.procedimento ?? null,
  }));

  const base = {
    found: false,
    knowledge_status: "not_found" as const,
    source: "nina_catalogo" as const,
    source_type: "catalog" as const,
    base_version: null,
    base_file: null,
    procedure: null as string | null,
    price: null as string | null,
    doctors: [] as string[],
    units: [] as string[],
    days: [] as string[],
    notes: [] as string[],
    records: registros,
    trace: traces,
    instrucao: INSTRUCAO_NOT_FOUND,
  };

  if (registros.length === 0) return base;

  const conflitos = detectarConflitos(registros);
  const primeiro = registros[0]!;
  const preco = paraNumero(primeiro.preco_dinheiro) ?? paraNumero(primeiro.preco_cartao);

  const comum = {
    ...base,
    found: true,
    procedure: primeiro.procedimento ?? null,
    price: preco === null ? null : `R$ ${preco.toFixed(2).replace(".", ",")}`,
    doctors: [
      ...new Set(
        registros
          .flatMap((r) => String(r.medico ?? "").split(","))
          .map((m) => m.trim())
          .filter(Boolean),
      ),
    ],
    units: [] as string[],
    days: [...new Set(registros.map((r) => String(r.dia ?? "").trim()).filter(Boolean))],
    notes: [
      ...new Set(
        [
          ...registros.map((r) => r.observacoes),
          ...registros.map((r) => (r.preparo ? `Preparo: ${r.preparo}` : null)),
        ]
          .map((n) => String(n ?? "").trim())
          .filter(Boolean),
      ),
    ],
  };

  if (conflitos.length > 0) {
    return {
      ...comum,
      found: false,
      knowledge_status: "conflict",
      price: null,
      conflicts: conflitos,
      instrucao: INSTRUCAO_CONFLICT,
    };
  }

  return {
    ...comum,
    knowledge_status: "found",
    instrucao: entrada.ambiguo
      ? `${INSTRUCAO_FOUND} Há mais de uma opção parecida: pergunte ao paciente qual item está no pedido médico antes de afirmar preço ou preparo.`
      : INSTRUCAO_FOUND,
  };
}
