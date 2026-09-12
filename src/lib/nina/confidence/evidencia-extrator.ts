/**
 * FASE 2 — EXTRAÇÃO DE EVIDÊNCIA DOS RETORNOS REAIS DAS FERRAMENTAS.
 *
 * Roda no servidor, sobre o payload que o Tool Broker devolveu (`dados`), e
 * produz fatos estruturados + o estado real da consulta. Nada aqui pergunta
 * ao modelo: se o campo não veio no retorno, ele não vira fato.
 *
 * Puro: recebe o objeto já lido pelo broker e devolve dados. Sem banco, sem
 * rede. É por isso que dá para testar cada formato de retorno.
 */
import type { ConsultaDoTurno, FatoRecuperado, StatusConsulta } from "./evidencia";
import type { TipoFonte } from "./types";

export type RetornoFerramenta = {
  ferramenta: string;
  capacidade: string | null;
  /** Fonte declarada pelo broker (base_conhecimento, agenda, crm...). */
  fonte: string | null;
  success: boolean;
  erro?: string | null | undefined;
  /** Payload cru devolvido pela ferramenta. */
  dados: unknown;
  clinicaId?: string | null;
  /** Argumentos usados — entram na identidade da consulta (retry). */
  args?: unknown;
};

export type ExtracaoEvidencia = {
  consulta: ConsultaDoTurno;
  fatos: FatoRecuperado[];
};

const FONTE_POR_BROKER: Record<string, TipoFonte> = {
  base_conhecimento: "catalogo_publicado",
  agenda: "agenda",
  crm: "crm",
  atendimento: "atendimento",
};

function tipoFonte(r: RetornoFerramenta): TipoFonte {
  const declarada = typeof (r.dados as Record<string, unknown>)?.["fonte"] === "string"
    ? String((r.dados as Record<string, unknown>)["fonte"])
    : null;
  if (declarada === "catalogo_publicado") return "catalogo_publicado";
  return FONTE_POR_BROKER[r.fonte ?? ""] ?? "desconhecida";
}

function obj(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" ? (v as Record<string, unknown>) : {};
}

function texto(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s === "" ? null : s;
}

// ------------------------------------------------- FASE 2 (preço por condição)

/**
 * Uma referência monetária concreta do retorno: valor + a condição em que
 * aquele valor vale. `forma`/`condicao` só existem quando a ferramenta as
 * informou — nada é suposto.
 */
export type PrecoCondicao = {
  /** dinheiro, cartao, pix... exatamente como o produtor declarou. */
  forma: string | null;
  /** "a partir de", "3x sem juros", "à vista"... */
  condicao: string | null;
  /** Valor como texto, preservando o formato original. */
  valor: string;
  /** Valor em centavos — base de comparação e de deduplicação. */
  centavos: number | null;
};

const FORMAS_POR_CAMPO: Record<string, string> = {
  preco_dinheiro: "dinheiro",
  valor_dinheiro: "dinheiro",
  preco_cartao: "cartao",
  valor_cartao: "cartao",
  preco_pix: "pix",
  valor_pix: "pix",
};

function centavosDe(v: unknown): number | null {
  const n = valorMonetario(v);
  return n === null ? null : Math.round(n * 100);
}

/** Qualificadores que mudam o sentido do valor e não podem ser descartados. */
function qualificador(v: unknown): string | null {
  const s = normalizarTexto(v);
  if (!s) return null;
  if (s.includes("a partir de")) return "a partir de";
  const parcela = s.match(/(\d+)\s*x/);
  if (parcela) return `${parcela[1]}x`;
  if (s.includes("a vista")) return "a vista";
  return null;
}

function precoDe(valor: unknown, forma: string | null, condicao: string | null): PrecoCondicao | null {
  const t = texto(valor);
  if (t === null) return null;
  const centavos = centavosDe(t);
  if (centavos === null) return null;
  return { forma, condicao: condicao ?? qualificador(t), valor: t, centavos };
}

/**
 * Lê todas as referências monetárias de um registro, em qualquer dos formatos
 * usados pelos produtores: campos por forma (`preco_dinheiro`/`preco_cartao`),
 * lista/mapa `formas_pagamento` (inclusive dentro de `precos`/`extras`) e o
 * campo resumido `preco`/`price`.
 */
export function precosDoRegistro(registro: unknown): PrecoCondicao[] {
  const x = obj(registro);
  const achados: PrecoCondicao[] = [];

  for (const [campo, forma] of Object.entries(FORMAS_POR_CAMPO)) {
    const p = precoDe(x[campo], forma, null);
    if (p) achados.push(p);
  }

  const containers = [x, obj(x["precos"]), obj(x["extras"]), obj(obj(x["extras"])["precos"])];
  for (const c of containers) {
    const fp = c["formas_pagamento"] ?? c["formasPagamento"] ?? c["condicoes_pagamento"];
    if (Array.isArray(fp)) {
      for (const item of fp) {
        const o = obj(item);
        const forma = texto(o["forma"]) ?? texto(o["tipo"]) ?? texto(o["nome"]) ?? texto(o["pagamento"]);
        const valor = o["valor"] ?? o["preco"] ?? o["price"];
        const cond = texto(o["condicao"]) ?? texto(o["condicoes"]) ?? texto(o["observacao"]);
        const p = precoDe(valor, forma, cond);
        if (p) achados.push(p);
      }
    } else if (fp && typeof fp === "object") {
      for (const [forma, valor] of Object.entries(fp as Record<string, unknown>)) {
        const p = precoDe(valor, forma, null);
        if (p) achados.push(p);
      }
    }
  }

  // Resumo do próprio registro: entra sem forma, nunca apagando as detalhadas.
  const resumo = precoDe(x["preco"] ?? x["price"] ?? x["valor"], null, null);
  if (resumo) achados.push(resumo);

  return dedupPrecos(achados);
}

/**
 * Mesma condição + mesmo valor = mesma referência (registros/records
 * duplicados, resumo repetindo uma condição detalhada).
 */
function dedupPrecos(precos: PrecoCondicao[]): PrecoCondicao[] {
  const vistos = new Map<string, PrecoCondicao>();
  const semForma: PrecoCondicao[] = [];
  for (const p of precos) {
    const chave = `${normalizarTexto(p.forma)}|${normalizarTexto(p.condicao)}|${p.centavos}`;
    if (p.forma === null) {
      semForma.push(p);
      continue;
    }
    if (!vistos.has(chave)) vistos.set(chave, p);
  }
  const detalhados = [...vistos.values()];
  // O resumo só vira evidência própria quando o valor não é coberto por
  // nenhuma condição detalhada (senão seria o mesmo fato, sem forma).
  for (const p of semForma) {
    const jaCoberto = detalhados.some((d) => d.centavos === p.centavos);
    const repetido = detalhados.some(
      (d) => d.forma === null && d.centavos === p.centavos,
    );
    if (!jaCoberto && !repetido) detalhados.push(p);
  }
  return detalhados;
}

/** Rótulo da condição guardado na chave do fato (`null` quando não informada). */
export function rotuloCondicao(p: PrecoCondicao): string | null {
  const partes = [p.forma, p.condicao].filter((v): v is string => !!v && v.trim() !== "");
  return partes.length > 0 ? partes.join(" ") : null;
}

/** Identidade de um registro, para não duplicar `registros` × `records`. */
function identidadeRegistro(registro: unknown): string {
  const x = obj(registro);
  const id = texto(x["id"]);
  if (id) return `id:${id}`;
  return JSON.stringify([
    normalizarTexto(x["procedimento"]),
    normalizarTexto(x["medico"]),
    normalizarTexto(x["dia"]),
    normalizarTexto(x["horario"]),
    precosDoRegistro(x).map((p) => `${normalizarTexto(rotuloCondicao(p))}=${p.centavos}`),
  ]);
}

/** Une `registros` e `records` sem repetir o mesmo dado. */
export function registrosDoRetorno(d: Record<string, unknown>): unknown[] {
  const brutos = [
    ...(Array.isArray(d["registros"]) ? (d["registros"] as unknown[]) : []),
    ...(Array.isArray(d["records"]) ? (d["records"] as unknown[]) : []),
  ];
  const porIdentidade = new Map<string, unknown>();
  for (const r of brutos) {
    const k = identidadeRegistro(r);
    if (!porIdentidade.has(k)) porIdentidade.set(k, r);
  }
  return [...porIdentidade.values()];
}

/** Identidade da consulta: mesma ferramenta + mesmos argumentos = mesma consulta. */
export function identidadeConsulta(ferramenta: string, args: unknown): string {
  let normalizado = "";
  try {
    const o = typeof args === "string" ? JSON.parse(args || "{}") : (args ?? {});
    normalizado = JSON.stringify(o, Object.keys(obj(o)).sort());
  } catch {
    normalizado = String(args ?? "");
  }
  return `${ferramenta}|${normalizado}`;
}

/**
 * Traduz um retorno de ferramenta em fatos + status da consulta.
 * Formatos desconhecidos NÃO viram fato: viram `nao_verificado`.
 */
export function extrairEvidencia(r: RetornoFerramenta): ExtracaoEvidencia {
  const d = obj(r.dados);
  const fonte = tipoFonte(r);
  const base = {
    consulta: r.ferramenta,
    capacidade: r.capacidade,
    fonte,
    ...(r.clinicaId ? { clinicaId: r.clinicaId } : {}),
  };
  const fatos: FatoRecuperado[] = [];
  let status: StatusConsulta = "nao_verificado";
  let truncado = false;
  let motivo: string | null = texto(d["reason"]) ?? texto(d["motivo"]);

  if (!r.success || r.erro) {
    return {
      consulta: {
        id: identidadeConsulta(r.ferramenta, r.args),
        consulta: r.ferramenta,
        capacidade: r.capacidade,
        status: "falha",
        tentativas: 1,
        falhasAnteriores: [],
        erro: r.erro ?? "sem resposta",
        ...(motivo ? { motivo } : {}),
      },
      fatos: [],
    };
  }

  const versao = texto(d["base_version"]) ?? texto(d["versao_calendario"]);
  const comVersao = versao ? { versao } : {};

  switch (r.capacidade) {
    // -------------------------------------------------- catálogo publicado
    case "searchKnowledgeBase":
    case "listCatalog": {
      const procedimento = texto(d["procedimento"]) ?? texto(d["procedure"]);
      const preco = texto(d["preco"]) ?? texto(d["price"]);
      const registros = Array.isArray(d["registros"]) ? (d["registros"] as unknown[]) : [];
      const profissionais = Array.isArray(d["profissionais"]) ? (d["profissionais"] as unknown[]) : [];
      const especialidades = Array.isArray(d["especialidades"]) ? (d["especialidades"] as unknown[]) : [];
      const dias = Array.isArray(d["dias"]) ? (d["dias"] as unknown[]) : [];
      const observacoes = Array.isArray(d["observacoes"]) ? (d["observacoes"] as unknown[]) : [];
      const clinica = obj(d["clinica"]);

      if (preco) {
        fatos.push({
          ...base,
          entidade: "procedimento",
          campo: "preco",
          valor: preco,
          ...comVersao,
          chave: { procedimento },
          registro: texto((obj(registros[0]))["id"]),
        });
      }
      for (const reg of registros) {
        const x = obj(reg);
        const item = texto(x["procedimento"]) ?? procedimento;
        const precoReg = texto(x["preco_dinheiro"]) ?? texto(x["preco_cartao"]);
        if (precoReg) {
          fatos.push({
            ...base,
            entidade: "procedimento",
            campo: "preco",
            valor: precoReg,
            registro: texto(x["id"]),
            ...comVersao,
            chave: {
              procedimento: item,
              medicoNome: texto(x["medico"]),
              condicoes: texto(x["preco_dinheiro"]) ? "dinheiro" : "cartao",
            },
          });
        }
        if (texto(x["preparo"])) {
          fatos.push({
            ...base,
            entidade: "procedimento",
            campo: "preparo",
            valor: texto(x["preparo"]),
            registro: texto(x["id"]),
            ...comVersao,
            chave: { procedimento: item },
          });
        }
        if (texto(x["dia"])) {
          fatos.push({
            ...base,
            entidade: "escala",
            campo: "dia_atendimento",
            valor: texto(x["dia"]),
            registro: texto(x["id"]),
            ...comVersao,
            chave: { procedimento: item, medicoNome: texto(x["medico"]), hora: texto(x["horario"]) },
          });
        }
      }
      for (const p of profissionais) {
        fatos.push({
          ...base,
          entidade: "profissional",
          campo: "nome",
          valor: texto(p),
          ...comVersao,
          chave: { medicoNome: texto(p), procedimento },
        });
      }
      for (const e of especialidades) {
        fatos.push({
          ...base,
          entidade: "servico",
          campo: "oferecido",
          valor: texto(e),
          ...comVersao,
          chave: { especialidade: texto(e) },
        });
      }
      for (const dia of dias) {
        fatos.push({
          ...base,
          entidade: "escala",
          campo: "dia_atendimento",
          valor: texto(dia),
          ...comVersao,
          chave: { procedimento },
        });
      }
      for (const o of observacoes) {
        fatos.push({
          ...base,
          entidade: "restricao",
          campo: "observacao",
          valor: texto(o),
          ...comVersao,
          chave: { procedimento },
        });
      }
      if (texto(clinica["endereco"])) {
        fatos.push({
          ...base,
          entidade: "endereco",
          campo: "endereco",
          valor: texto(clinica["endereco"]),
          ...comVersao,
        });
      }
      if (texto(clinica["nome"])) {
        fatos.push({ ...base, entidade: "clinica", campo: "nome", valor: texto(clinica["nome"]), ...comVersao });
      }
      const conhecimento = texto(d["knowledge_status"]);
      if (conhecimento === "conflict") motivo = motivo ?? "conflict";
      status = fatos.length > 0 ? "com_itens" : "vazio";
      break;
    }

    // ------------------------------------------------------------- agenda
    case "checkAvailability": {
      const horarios = Array.isArray(d["horarios"]) ? (d["horarios"] as unknown[]) : [];
      const total = typeof d["total"] === "number" ? (d["total"] as number) : horarios.length;
      for (const h of horarios) {
        const x = obj(h);
        fatos.push({
          ...base,
          entidade: "vaga",
          campo: "slot",
          valor: texto(x["inicio"]) ?? `${texto(x["data"])} ${texto(x["hora"])}`,
          ...comVersao,
          chave: {
            medicoId: texto(x["medico_id"]),
            medicoNome: texto(x["medico"]),
            especialidade: texto(x["especialidade"]),
            data: texto(x["data"]),
            hora: texto(x["hora"]),
          },
        });
      }
      if (horarios.length > 0 && total > horarios.length) truncado = true;
      status = horarios.length > 0 ? (truncado ? "parcial" : "com_itens") : "vazio";
      break;
    }

    case "createAppointment": {
      const id = texto(d["appointment_id"]);
      if (id) {
        fatos.push({
          ...base,
          entidade: "agendamento",
          campo: "appointment_id",
          valor: id,
          registro: id,
          chave: { data: texto(d["data"]), hora: texto(d["hora"]), medicoId: texto(d["medico_id"]) },
        });
        status = "com_itens";
      } else {
        status = "vazio";
      }
      break;
    }

    case "getPatient": {
      const agendamentos = Array.isArray(d["agendamentos"]) ? (d["agendamentos"] as unknown[]) : [];
      for (const a of agendamentos) {
        const x = obj(a);
        fatos.push({
          ...base,
          entidade: "agendamento",
          campo: "appointment_id",
          valor: texto(x["id"]) ?? texto(x["appointment_id"]),
          chave: { data: texto(x["data"]), hora: texto(x["hora"]), medicoNome: texto(x["medico"]) },
        });
      }
      status = fatos.length > 0 ? "com_itens" : "vazio";
      break;
    }

    default:
      status = "nao_verificado";
  }

  // Horário de funcionamento é ESCALA, nunca vaga.
  const diaFuncionamento = obj(d["dia"]);
  if (Array.isArray(diaFuncionamento["faixas"])) {
    for (const f of diaFuncionamento["faixas"] as unknown[]) {
      const x = obj(f);
      fatos.push({
        ...base,
        entidade: "escala",
        campo: "funcionamento",
        valor: `${texto(x["inicio"]) ?? "?"}-${texto(x["fim"]) ?? "?"}`,
        ...comVersao,
        chave: { data: texto(d["data"]) },
      });
    }
    status = fatos.length > 0 ? "com_itens" : "vazio";
  }

  return {
    consulta: {
      id: identidadeConsulta(r.ferramenta, r.args),
      consulta: r.ferramenta,
      capacidade: r.capacidade,
      status,
      tentativas: 1,
      falhasAnteriores: [],
      ...(truncado ? { truncado } : {}),
      ...(motivo ? { motivo } : {}),
    },
    fatos,
  };
}
