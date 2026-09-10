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
