/**
 * Trava determinística do fluxo de agendamento da Nina (server-only).
 *
 * POR QUE EXISTE: a ordem "confirmou a vaga → pedir nome + CPF + nascimento →
 * identificar → revalidar vaga → gravar → confirmar" é REGRA DE NEGÓCIO. Deixar
 * essa ordem a cargo do modelo produzia dois defeitos reais em produção:
 * 1) ao ouvir "isso", a Nina pulava direto para a criação (ou pedia um dado
 *    isolado, tipo só a data de nascimento) e chamava a identificação com
 *    dados incompletos, devolvendo "erro ao identificar o paciente";
 * 2) na sequência ela transferia para atendimento humano por causa de uma
 *    falha que era do próprio fluxo, não do paciente.
 *
 * Aqui a etapa é decidida em código, ANTES de qualquer chamada ao modelo. O
 * prompt continua existindo, mas não é mais a única garantia.
 *
 * PRIVACIDADE: CPF e data de nascimento ficam apenas no estado da conversa
 * enquanto a coleta está aberta, e são apagados assim que a identificação é
 * concluída. Nada disso vai para log.
 */

import type { EstadoFluxoNina } from "./fluxo-estado.server";
import type {
  CtxNinaPaciente,
  ResultadoFerramenta,
} from "./paciente-tools.server";
import { isCPFValido, somenteDigitos } from "@/lib/cpf";

/* ------------------------------------------------------------ confirmações */

const CONFIRMACAO =
  /^\s*(sim|isso|isso\s*mesmo|esse\s*mesmo|essa\s*mesma|é\s*isso|eh\s*isso|claro|ok|okay|okey|beleza|blz|pode\s*ser|pode\s*marcar|pode\s*agendar|pode\s*sim|quero|quero\s*sim|desejo|confirmo|confirmado|agenda(r|e)?|marca(r|e)?\s*(sim)?|vamos|bora|fechado|perfeito|por\s*favor|sim,?\s*por\s*favor|aceito)\s*[.!]*\s*$/i;

/** O paciente aceitou a vaga oferecida? Comparação tolerante a acento/pontuação. */
export function ehConfirmacaoDeAgendamento(texto: string): boolean {
  const t = (texto ?? "").trim();
  if (!t || t.length > 40) return false;
  return CONFIRMACAO.test(t);
}

const NEGACAO = /^\s*(n[ãa]o|nao|outro|outra|prefiro|ainda\s*n[ãa]o)\b/i;
export function ehNegacao(texto: string): boolean {
  return NEGACAO.test((texto ?? "").trim());
}

/* -------------------------------------------------- extração dos 3 campos */

export type DadosIdentificacao = {
  nome: string | null;
  cpf: string | null;
  /** Sempre normalizada para AAAA-MM-DD. */
  data_nascimento: string | null;
};

function normalizarData(bruto: string): string | null {
  const iso = bruto.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const br = bruto.match(/\b(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})\b/);
  if (!br) return null;
  const d = Number(br[1]);
  const m = Number(br[2]);
  let a = Number(br[3]);
  if (a < 100) a += a > 30 ? 1900 : 2000;
  if (d < 1 || d > 31 || m < 1 || m > 12) return null;
  const hoje = new Date();
  if (a < 1900 || a > hoje.getFullYear()) return null;
  return `${a}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/**
 * Lê nome, CPF e data de nascimento de uma mensagem livre.
 * Aceita "Jean Xavier, 189.471.977-85, 21/10/1999" e também
 * "jean xavier ferreira pinho 18947197785 21/10/1999".
 */
export function extrairDadosIdentificacao(texto: string): DadosIdentificacao {
  const t = (texto ?? "").replace(/\s+/g, " ").trim();
  const data = normalizarData(t);

  // CPF: 11 dígitos, com ou sem pontuação. Remove a data antes para não
  // confundir "21/10/1999" com número.
  let semData = t;
  const alvoData = t.match(/\b\d{1,2}[/\-.]\d{1,2}[/\-.]\d{2,4}\b|\b\d{4}-\d{2}-\d{2}\b/);
  if (alvoData) semData = t.replace(alvoData[0], " ");
  let cpf: string | null = null;
  for (const m of semData.matchAll(/\d[\d.\- ]{9,17}\d/g)) {
    const d = somenteDigitos(m[0]);
    if (d.length === 11 && isCPFValido(d)) {
      cpf = d;
      break;
    }
  }

  // Nome: o que sobra depois de tirar números e separadores, exigindo ao
  // menos duas palavras (nome completo).
  const restante = semData
    .replace(/\d[\d.\- ]{9,17}\d/g, " ")
    .replace(/\d/g, " ")
    .replace(/[,;:|]/g, " ")
    .replace(
      /\b(meu|nome|completo|cpf|é|eh|sou|data|de|nascimento|nasci|em|o|a)\b/gi,
      " ",
    )
    .replace(/\s+/g, " ")
    .trim();
  const palavras = restante.split(" ").filter((p) => /^[A-Za-zÀ-ÿ'´`^~-]{2,}$/.test(p));
  const nome =
    palavras.length >= 2
      ? palavras
          .slice(0, 6)
          .map((p) => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase())
          .join(" ")
      : null;

  return { nome, cpf, data_nascimento: data };
}

/* -------------------------------------------------------------- mensagens */

const PEDIDO_COMPLETO =
  "Perfeito! Para prosseguir com o agendamento, por favor, me informe:\n\n" +
  "• Nome completo\n• CPF\n• Data de nascimento (DD/MM/AAAA)";

function pedidoDoQueFalta(faltando: string[]): string {
  if (faltando.length === 3) return PEDIDO_COMPLETO;
  const rotulos: Record<string, string> = {
    nome: "seu *nome completo*",
    cpf: "seu *CPF*",
    data_nascimento: "sua *data de nascimento* (DD/MM/AAAA)",
  };
  const lista = faltando.map((f) => rotulos[f]!);
  const texto =
    lista.length === 1 ? lista[0]! : `${lista.slice(0, -1).join(", ")} e ${lista.at(-1)!}`;
  return `Obrigada! Só falta ${texto} para eu concluir o agendamento.`;
}

/* ------------------------------------------------------------------- gate */

type Executar = (
  ctx: CtxNinaPaciente,
  nome: string,
  args: unknown,
) => Promise<ResultadoFerramenta>;

function log(etapa: string, extra: Record<string, unknown>) {
  console.log(`[NINA_BOOKING_FLOW] ${etapa}`, JSON.stringify(extra));
}

/**
 * Aplica a regra de ordem do agendamento.
 *
 * Retorna a resposta pronta ao paciente quando a etapa é determinística
 * (pedir os dados, cobrar o que falta, confirmar agendamento gravado) ou
 * `null` quando o fluxo deve seguir normalmente para o modelo.
 */
export async function aplicarGateIdentificacao(params: {
  mensagem: string;
  estado: EstadoFluxoNina;
  ctx: CtxNinaPaciente;
  executar: Executar;
}): Promise<string | null> {
  const { mensagem, estado, ctx, executar } = params;
  const a = estado.appointment;
  const p = estado.patient;
  const temVaga = Boolean(a.slot_inicio && a.slot_fim && (a.doctor_id || a.doctor_name));

  // 1) Confirmou a vaga oferecida → a próxima etapa é SEMPRE a identificação.
  if (
    !p.identified &&
    temVaga &&
    !a.intent_confirmed &&
    (estado.flow.stage === "AWAITING_SLOT_CONFIRMATION" || estado.flow.stage === "CHOOSING_SLOT") &&
    ehConfirmacaoDeAgendamento(mensagem)
  ) {
    a.intent_confirmed = true;
    a.slot_confirmed_by_patient = true;
    estado.flow.stage = "AWAITING_PATIENT_DATA";
    log("intencao_confirmada", {
      conversa: ctx.conversaId,
      medico: a.doctor_name,
      data: a.date,
      hora: a.time,
      stage: estado.flow.stage,
    });
    return PEDIDO_COMPLETO;
  }

  // 2) Coleta em andamento: acumula o que veio e só chama a busca com os três
  //    campos preenchidos. Nunca identificar com dado incompleto.
  if (!p.identified && estado.flow.stage === "AWAITING_PATIENT_DATA") {
    if (ehNegacao(mensagem)) {
      a.intent_confirmed = false;
      estado.flow.stage = "CHOOSING_SLOT";
      return null; // volta para o modelo oferecer outras opções
    }
    const novo = extrairDadosIdentificacao(mensagem);
    p.pending = {
      nome: novo.nome ?? p.pending.nome,
      cpf: novo.cpf ?? p.pending.cpf,
      data_nascimento: novo.data_nascimento ?? p.pending.data_nascimento,
    };
    const faltando = (["nome", "cpf", "data_nascimento"] as const).filter(
      (k) => !p.pending[k],
    );
    if (faltando.length > 0) {
      // CPF digitado mas inválido merece aviso específico — senão o paciente
      // repete o mesmo número.
      const digitos = somenteDigitos(mensagem);
      const cpfInvalido =
        faltando.includes("cpf") && digitos.length >= 11 && !isCPFValido(digitos.slice(0, 11));
      log("dados_incompletos", { conversa: ctx.conversaId, faltando });
      return cpfInvalido
        ? "O CPF informado não confere. Pode conferir e me mandar de novo, por favor?"
        : pedidoDoQueFalta([...faltando]);
    }

    estado.flow.stage = "IDENTIFYING_PATIENT";
    const r = await executar(ctx, "identificar_paciente", {
      nome: p.pending.nome,
      cpf: p.pending.cpf,
      data_nascimento: p.pending.data_nascimento,
    });
    if (!r.ok) {
      const erro = (r as { erro: string }).erro;
      log("identificacao_falhou", { conversa: ctx.conversaId, erro });
      if (erro === "PATIENT_DATA_MISMATCH" || erro === "VALIDATION_ERROR") {
        // Não é erro técnico e não é motivo de handoff: os dados não bateram.
        p.pending = { nome: null, cpf: null, data_nascimento: null };
        estado.flow.stage = "AWAITING_PATIENT_DATA";
        return `${(r as { mensagem: string }).mensagem}\n\nPode me mandar novamente nome completo, CPF e data de nascimento (DD/MM/AAAA)?`;
      }
      estado.flow.stage = "AWAITING_PATIENT_DATA";
      return "Tive uma instabilidade aqui ao consultar o cadastro. Pode me mandar os dados de novo em instantes?";
    }

    // Identificado: apaga os dados pessoais do estado da conversa.
    p.pending = { nome: null, cpf: null, data_nascimento: null };
    p.identified = true;
    p.validated = true;
    if (!p.id) p.id = ctx.pacienteId;
    log("paciente_identificado", { conversa: ctx.conversaId, paciente_id: ctx.pacienteId });

    if (!temVaga) {
      estado.flow.stage = "CHOOSING_SLOT";
      return null; // modelo retoma a escolha do horário
    }

    // 3) Revalida a vaga e grava. `agendar` já revalida o slot e confere a
    //    gravação no banco — é a mesma porta usada pela Agenda.
    estado.flow.stage = "REVALIDATING_SLOT";
    const ag = await executar(ctx, "agendar", {
      medico_id: a.doctor_id ?? a.doctor_name,
      inicio: a.slot_inicio,
      fim: a.slot_fim,
      procedimento: a.procedure ?? a.specialty ?? "Consulta",
    });
    if (ag.ok && (ag as { appointment_id?: string }).appointment_id) {
      const d = ag as { date?: string; time?: string; medico?: string };
      log("agendamento_criado", {
        conversa: ctx.conversaId,
        appointment_id: (ag as { appointment_id: string }).appointment_id,
      });
      return `Prontinho! ✅ Seu agendamento foi realizado com sucesso.\n\n*Profissional:* ${
        d.medico ?? a.doctor_name ?? "-"
      }\n*Data:* ${d.date ?? a.date ?? "-"}\n*Horário:* ${d.time ?? a.time ?? "-"}\n\nChegue com 15 minutos de antecedência e traga um documento com foto.`;
    }

    const erroAg = (ag as { erro?: string }).erro;
    log("agendamento_falhou", { conversa: ctx.conversaId, erro: erroAg });
    if (erroAg === "APPOINTMENT_ALREADY_EXISTS") {
      estado.flow.stage = "BOOKED";
      return "Esse horário já está reservado para você — não precisa marcar de novo 💛";
    }
    // Vaga tomada durante a coleta: limpa e deixa o modelo oferecer outras.
    a.slot_inicio = null;
    a.slot_fim = null;
    a.intent_confirmed = false;
    estado.flow.stage = "CHOOSING_SLOT";
    return null;
  }

  return null;
}
