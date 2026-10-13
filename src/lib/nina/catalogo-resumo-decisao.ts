/**
 * Resumo, no cartão da lista do catálogo, só dos campos que decidem se a Nina
 * agenda, informa e encaminha ou só informa (regra de 13/10/2026). Mudança
 * visual: nada aqui altera o que a Nina recebe.
 *
 * Módulo puro: sem banco e sem rede.
 */
import {
  atendimentosDaEstrutura,
  lerEstrutura,
  type AtendimentoCatalogo,
} from "./catalogo-estrutura";
import { formatarBRL, resumoHorarios } from "./catalogo";
import { fluxoDoRegistro } from "./fluxo-agendamento-item";
import { interpretarModalidade, MODALIDADES_ATENDIMENTO } from "./modalidade-atendimento";

export type LinhaResumoDecisao = {
  campo:
    | "decisao"
    | "nina_pode_agendar"
    | "encaminhamento"
    | "modalidade"
    | "horarios"
    | "valores"
    | "pedido_medico"
    | "agenda";
  rotulo: string;
  valor: string;
  /** false = campo que decide a conduta da Nina e ainda não foi preenchido. */
  preenchido: boolean;
};

export type ItemResumoDecisao = {
  estrutura?: unknown;
  tipo_atendimento?: string | null;
  nome?: string | null;
  medico_id?: string | null;
  procedimento_id?: string | null;
  horarios?: Parameters<typeof resumoHorarios>[0] | null;
  formas_pagamento?: Array<{ forma: string; valor?: number | null }> | null;
  valor?: number | null;
};

const SITUACAO_PRECO: Record<string, string> = {
  sob_consulta: "sob consulta",
  incluido: "incluído",
};

function nomeAtendimento(a: AtendimentoCatalogo) {
  return a.nome.trim() || "Atendimento";
}

function precosDoAtendimento(a: AtendimentoCatalogo): string | null {
  const comValor = a.precos.filter((p) => p.forma.trim());
  if (comValor.length)
    return comValor
      .map((p) => `${p.forma} ${p.valor == null ? "sem valor" : formatarBRL(p.valor)}`)
      .join(", ");
  return a.situacao_preco ? (SITUACAO_PRECO[a.situacao_preco] ?? null) : null;
}

function temHorario(a: AtendimentoCatalogo) {
  return a.horarios.length > 0 || a.executantes.some((e) => e.horarios.length > 0);
}

/** Valor comum a todos os atendimentos, ou a lista "Atendimento: valor". */
function porAtendimento(
  atendimentos: AtendimentoCatalogo[],
  valorDe: (a: AtendimentoCatalogo) => string | null,
  ausente: string,
): { valor: string; preenchido: boolean } {
  const valores = atendimentos.map((a) => valorDe(a));
  const preenchido = valores.every(Boolean);
  if (atendimentos.length === 1 || new Set(valores).size === 1)
    return { valor: valores[0] ?? ausente, preenchido };
  return {
    valor: atendimentos
      .map((a, i) => `${nomeAtendimento(a)}: ${valores[i] ?? ausente}`)
      .join(" · "),
    preenchido,
  };
}

export function resumoDecisaoNina(
  item: ItemResumoDecisao,
  tipo: "servico" | "profissional",
): LinhaResumoDecisao[] {
  const estrutura = lerEstrutura(item.estrutura);
  const atendimentos = atendimentosDaEstrutura(item.estrutura);
  const linhas: LinhaResumoDecisao[] = [];

  const fluxo = fluxoDoRegistro({
    estrutura: item.estrutura,
    tipo_atendimento: item.tipo_atendimento ?? null,
    nome: item.nome ?? null,
  });
  linhas.push({
    campo: "decisao",
    rotulo: "Conduta da Nina",
    valor:
      estrutura.encaminhamento_humano === true
        ? "Encaminha à equipe (encaminhamento obrigatório)"
        : fluxo === "agendar"
          ? "Agenda"
          : fluxo === "somente_informar"
            ? "Só informa (ordem de chegada, sem agendar)"
            : "Informa e encaminha à equipe",
    preenchido: true,
  });

  linhas.push({
    campo: "nina_pode_agendar",
    rotulo: "Nina pode agendar",
    valor:
      estrutura.nina_pode_agendar === true
        ? "Sim"
        : estrutura.nina_pode_agendar === false
          ? "Não"
          : "Não informado",
    preenchido: estrutura.nina_pode_agendar != null,
  });

  linhas.push({
    campo: "encaminhamento",
    rotulo: "Encaminhamento obrigatório",
    valor:
      estrutura.encaminhamento_humano === true
        ? "Sim"
        : estrutura.encaminhamento_humano === false
          ? "Não"
          : "Não informado",
    preenchido: estrutura.encaminhamento_humano != null,
  });

  if (atendimentos?.length) {
    linhas.push({
      campo: "modalidade",
      rotulo: "Modalidade",
      ...porAtendimento(
        atendimentos,
        (a) => (a.modalidade ? MODALIDADES_ATENDIMENTO[a.modalidade] : null),
        "não informada",
      ),
    });
    const semHorario = atendimentos.filter((a) => !temHorario(a)).map(nomeAtendimento);
    // Horários dos próprios atendimentos (profissional) ou de quem realiza (exame).
    const vistos = new Set<string>();
    const horarios = atendimentos
      .flatMap((a) => [...a.horarios, ...a.executantes.flatMap((e) => e.horarios)])
      .filter((h) => {
        const chave = [h.dia, h.inicio, h.fim, h.recorrencia].join("|");
        if (vistos.has(chave)) return false;
        vistos.add(chave);
        return true;
      });
    const resumo = resumoHorarios(horarios);
    linhas.push({
      campo: "horarios",
      rotulo: "Horários",
      valor: semHorario.length
        ? semHorario.length === atendimentos.length
          ? "Não informados"
          : `${resumo} · sem horário: ${semHorario.join(", ")}`
        : resumo,
      preenchido: semHorario.length === 0,
    });
    linhas.push({
      campo: "valores",
      rotulo: "Valores",
      ...porAtendimento(atendimentos, precosDoAtendimento, "não informados"),
    });
  } else {
    // Cadastro ainda no formato antigo: lê as colunas de sempre.
    const modalidade = interpretarModalidade(item.tipo_atendimento ?? null);
    linhas.push({
      campo: "modalidade",
      rotulo: "Modalidade",
      valor:
        modalidade && modalidade !== "nao_definida"
          ? MODALIDADES_ATENDIMENTO[modalidade]
          : "Não informada",
      preenchido: Boolean(modalidade && modalidade !== "nao_definida"),
    });
    linhas.push({
      campo: "horarios",
      rotulo: "Horários",
      valor: item.horarios?.length ? resumoHorarios(item.horarios) : "Não informados",
      preenchido: Boolean(item.horarios?.length),
    });
    const formas = (item.formas_pagamento ?? []).filter((p) => p.forma);
    linhas.push({
      campo: "valores",
      rotulo: "Valores",
      valor: formas.length
        ? formas
            .map((p) => `${p.forma} ${p.valor == null ? "sem valor" : formatarBRL(p.valor)}`)
            .join(", ")
        : item.valor != null
          ? formatarBRL(item.valor)
          : "Não informados",
      preenchido: formas.length > 0 || item.valor != null,
    });
  }

  linhas.push({
    campo: "pedido_medico",
    rotulo: "Pedido médico",
    valor:
      estrutura.pedido_medico === "obrigatorio"
        ? "Obrigatório"
        : estrutura.pedido_medico === "dispensado"
          ? "Dispensado"
          : "Não informado",
    preenchido: estrutura.pedido_medico !== "nao_informado",
  });

  // O vínculo com a agenda só é necessário quando a Nina agenda o item.
  const vinculo = tipo === "profissional" ? item.medico_id : item.procedimento_id;
  linhas.push({
    campo: "agenda",
    rotulo: "Agenda do sistema",
    valor: vinculo
      ? "Vinculada"
      : estrutura.nina_pode_agendar === true
        ? "Sem vínculo (necessário para a Nina agendar)"
        : "Sem vínculo",
    preenchido: Boolean(vinculo) || estrutura.nina_pode_agendar !== true,
  });

  return linhas;
}
