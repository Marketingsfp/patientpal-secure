import type { ResumoHandoff } from "./handoff-resumo";

const VERBOS = {
  informacao: "Buscou informações sobre",
  agendamento: "Solicitou agendamento de",
  cancelamento: "Solicitou cancelamento de",
  remarcacao: "Solicitou remarcação de",
  atendente: "Pediu para falar com uma atendente",
  outro: "Entrou em contato sobre",
} as const;

/** A IA identifica assuntos e pedidos; não atesta ações concluídas. */
export interface AtividadePaciente {
  tipo: keyof typeof VERBOS;
  assunto: string;
}

export function normalizarAtividades(bruto: unknown): AtividadePaciente[] {
  if (!Array.isArray(bruto)) return [];
  const atividades: AtividadePaciente[] = [];
  for (const item of bruto) {
    if (!item || typeof item !== "object" || !Object.hasOwn(VERBOS, item.tipo)) continue;
    const tipo = item.tipo as AtividadePaciente["tipo"];
    const assunto =
      tipo === "atendente"
        ? ""
        : typeof item.assunto === "string"
          ? item.assunto.replace(/\s+/g, " ").trim().slice(0, 120)
          : "";
    if (tipo !== "atendente" && !assunto) continue;
    if (!atividades.some((a) => a.tipo === tipo && chave(a.assunto) === chave(assunto)))
      atividades.push({ tipo, assunto });
    if (atividades.length === 6) break;
  }
  return atividades;
}

function chave(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function frase(texto: string): string {
  return `${texto.trim().replace(/[.!?]+$/, "")}.`;
}

/** Compatibilidade com resumos já salvos, sem reler mensagens nem chamar a IA. */
function pedidoLegado(motivo: string): string {
  const pedido = motivo
    .replace(/^(?:(?:o|a) )?paciente\s+/i, "")
    .replace(/^(?:deseja|quer|pretende|solicita|solicitou|pediu|busca|gostaria de)\s+/i, "")
    .replace(/\s+e (?:agendar|marcar)\s+/gi, " e solicitou agendamento de ");
  if (/^(?:informa[çc][õo]es|orienta[çc][õo]es|detalhes)\b/i.test(pedido))
    return frase(`Buscou ${pedido}`);
  if (/^(?:saber|entender)\b/i.test(pedido)) return frase(`Buscou ${pedido}`);
  const agendar = pedido.match(/^(?:agendar|marcar)\s+(.+)/i);
  if (agendar) return frase(`Solicitou agendamento de ${agendar[1]}`);
  const remarcar = pedido.match(/^(?:remarcar|reagendar)\s+(.+)/i);
  if (remarcar) return frase(`Solicitou remarcação de ${remarcar[1]}`);
  const cancelar = pedido.match(/^cancelar\s+(.+)/i);
  if (cancelar) return frase(`Solicitou cancelamento de ${cancelar[1]}`);
  if (/^(?:falar|conversar)\s+com\b/i.test(pedido)) return frase(`Pediu para ${pedido}`);
  if (!pedido || /não identificado pela conversa/i.test(pedido))
    return "Entrou em contato com a clínica.";
  return frase(`Entrou em contato sobre: ${pedido}`);
}

/** O desfecho é gravado pelo sistema, não lido de uma resposta da Nina. */
export function acaoConcluida(r: ResumoHandoff, desfecho: string | null): string | null {
  if (desfecho === "cancelamento") return "Cancelou um agendamento.";
  if (desfecho !== "agendamento_concluido" && desfecho !== "remarcacao") return null;
  const a = r.agendamento_confirmado;
  const verbo = desfecho === "remarcacao" ? "Remarcou" : "Agendou";
  return frase(
    `${verbo} ${a?.servico || "um atendimento"}` +
      (a?.medico ? ` com ${a.medico}` : "") +
      (a?.data ? ` para ${a.data}${a.hora ? ` às ${a.hora}` : ""}` : ""),
  );
}

export function acoesSolicitadas(
  r: ResumoHandoff,
  concluidos: Array<{ resumo: ResumoHandoff; desfecho: string | null }>,
): string[] {
  const atividades = normalizarAtividades(r.atividades_paciente);
  if (!atividades.length) {
    const pedido = pedidoLegado(r.motivo_contato);
    const realizado = concluidos.some(
      (c) =>
        c.desfecho === "agendamento_concluido" &&
        c.resumo.agendamento_confirmado?.servico &&
        chave(pedido) ===
          chave(frase(`Solicitou agendamento de ${c.resumo.agendamento_confirmado.servico}`)),
    );
    return realizado ? [] : [pedido];
  }
  return atividades
    .filter((atividade) => {
      // Não repete "solicitou agendamento" quando o mesmo serviço foi agendado.
      // Outros pedidos (incluindo outro procedimento) continuam visíveis.
      if (atividade.tipo !== "agendamento") return true;
      return !concluidos.some(
        (c) =>
          c.desfecho === "agendamento_concluido" &&
          c.resumo.agendamento_confirmado?.servico &&
          chave(c.resumo.agendamento_confirmado.servico) === chave(atividade.assunto),
      );
    })
    .map((a) => frase(`${VERBOS[a.tipo]}${a.assunto ? ` ${a.assunto}` : ""}`));
}
