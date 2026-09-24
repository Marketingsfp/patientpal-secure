/**
 * Trava determinística do fluxo de agendamento da Nina (server-only).
 *
 * POR QUE EXISTE: a ordem "escolheu atendimento e vaga → consultar cadastro →
 * coletar obrigatórios faltantes → identificar → confirmar → revalidar → gravar" é regra. Deixar
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
import { MOTIVO_SFP, resultadoEncaminhamentoSfp } from "./regras-catalogo";
import type { CtxNinaPaciente, ResultadoFerramenta } from "./paciente-tools.server";
import { isCPFValido, somenteDigitos } from "@/lib/cpf";
import { autorizarAcao } from "./acoes/autorizacao";
import { resultadoAgendamentoConfirmado } from "./resposta/agendamento";
import {
  atendimentoDefinido,
  camposCadastroFaltantes,
  EXEMPLOS_CADASTRO,
  ROTULOS_CADASTRO,
  type CampoCadastro,
} from "./cadastro-paciente";
import { criarResultado, type ResultadoRespostaNina } from "./resposta/contrato";
import { textoDaChave, type TextosTemplates } from "./resposta/templates";
import { aceitarResumoEntregue, confirmacaoDaEscolha, consentimentoDaEscolha,
  limparEscolhaAgendamento, lerEscolhaHorario, vagasDaEscolha, vagasDaSessao,
  resumoDaEscolhaEntregue, LEMBRETE_CONFIRMACAO } from "./agendamento-escolha";
import { respostaSemVagas } from "./agenda-sem-vagas";
import { reservaDaSessaoAtual } from "./agendamento-sessao";

/* ------------------------------------------------------------ confirmações */

import { ehConfirmacaoDeAgendamento } from "./confirmacao-agendamento";
import { ehRespostaNegativaCurta } from "./resposta-afirmativa";
export { ehConfirmacaoDeAgendamento } from "./confirmacao-agendamento";

const NEGACAO =
  /^\s*(n[ãa]o\s+(quero|posso|vou|desejo|dá|da|pode|prefiro|é|eh|serve)|n[ãa]o,|nao,|outro\s+(hor[áa]rio|dia|m[ée]dico)|outra\s+(data|hora|op[cç][ãa]o)|prefiro\b|ainda\s*n[ãa]o\b|cancela\w*)\b/i;
export function ehNegacao(texto: string): boolean {
  return ehRespostaNegativaCurta(texto) || NEGACAO.test((texto ?? "").trim());
}

/**
 * A mensagem parece uma pergunta/assunto paralelo (preço, endereço, convênio)?
 * Nesse caso a coleta de dados NÃO deve engolir a mensagem: ela segue para o
 * modelo responder, e a Nina volta a pedir os dados depois.
 */
const PERGUNTA =
  /\?|\b(quanto|qual|quais|quando|onde|como|por\s*que|porque|pode\s+ser|tem\s+|aceita|valor|pre[çc]o|custa|convênio|convenio|endere[çc]o|hor[áa]rio\s+de\s+funcionamento|exame|espera)\b/i;
export function pareceAssuntoParalelo(texto: string): boolean {
  return PERGUNTA.test((texto ?? "").trim());
}

/* -------------------------------------------------- extração dos 3 campos */

export type DadosIdentificacao = {
  nome: string | null;
  cpf: string | null;
  /** Sempre normalizada para AAAA-MM-DD. */
  data_nascimento: string | null;
  telefone: string | null;
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
      /^(?:(?:meu\s+)?nome(?:\s+completo)?(?:\s+(?:é|eh))?|sou|me chamo)\s*|\b(cpf|telefone|celular|whatsapp|data de nascimento|nascimento|nasci em)\b/gi,
      " ",
    )
    .replace(/\s+/g, " ")
    .trim();
  const palavras = restante.split(" ").filter((p) => /^[A-Za-zÀ-ÿ'´`^~-]{2,}$/.test(p));
  const nome =
    palavras.length >= 2
      ? palavras.map((p) => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase()).join(" ")
      : null;

  const numeros = semData.match(/(?:\+?55\s*)?\(?\d{2}\)?[\s.-]*\d{4,5}[\s.-]*\d{4}/g) ?? [];
  const telefone =
    numeros.map(somenteDigitos).find((n) => n !== cpf && n.length >= 10 && n.length <= 13) ?? null;
  return { nome, cpf, data_nascimento: data, telefone };
}

/* -------------------------------------------------------------- mensagens */

/**
 * FASE 5 — o gate não escreve mais texto conversacional por conta própria:
 * ele escolhe a CHAVE do template e as variáveis. O texto sai do template
 * publicado (ou do padrão do código, que é o texto que já existia aqui).
 */
function rotularFaltantes(faltando: string[]): string {
  const rotulos: Record<string, string> = ROTULOS_CADASTRO;
  const lista = faltando.map((f) => rotulos[f]!);
  return lista.length === 1 ? lista[0]! : `${lista.slice(0, -1).join(", ")} e ${lista.at(-1)!}`;
}

/* ------------------------------------------------------------------- gate */

type Executar = (ctx: CtxNinaPaciente, nome: string, args: unknown) => Promise<ResultadoFerramenta>;

/** Monta o resultado determinístico do gate já com o texto do template. */
function resultadoGate(
  textos: TextosTemplates | null | undefined,
  chave: string,
  variaveis: Record<string, string>,
  extra?: Partial<ResultadoRespostaNina>,
): ResultadoRespostaNina {
  const t = textoDaChave(chave, variaveis, textos ?? null);
  return criarResultado({
    origem: "gate",
    texto: t.texto,
    chaveTemplate: chave,
    variaveis,
    ...(extra ?? {}),
  });
}

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
  /** Textos publicados dos templates determinísticos (FASE 5). */
  textos?: TextosTemplates | null;
  /** Nome da clínica que concluiu o agendamento. */
  nomeUnidade?: string;
  /** A ferramenta acabou de validar a escolha neste turno (inclusive via modelo). */
  aposSelecao?: boolean;
  encaminharVagaIndisponivel?: (motivo: string) => Promise<boolean>;
}): Promise<ResultadoRespostaNina | null> {
  const { mensagem, estado, ctx, executar } = params;
  const textos = params.textos ?? null;
  const a = estado.appointment;
  const p = estado.patient;
  if (estado.flow.stage === "HANDOFF") return null;
  if (a.appointment_id) {
    if (reservaDaSessaoAtual(estado) &&
      ehConfirmacaoDeAgendamento(mensagem, confirmacaoDaEscolha(estado, ctx.clinicaId)?.vaga)) {
      return criarResultado({ origem: "gate",
        texto: "Seu agendamento já foi realizado. Não é necessário confirmar novamente.",
        fatosConfirmados: ["agendamento_ja_existente"],
        restricoes: ["nao_criar_nova_reserva", "nao_repetir_conclusao_completa"] });
    }
    return null;
  }
  const { pedidoPreventivo } = await import("./atendimento-consulta");
  const preventivo = pedidoPreventivo(mensagem);
  if (a.procedure && preventivo &&
    (/\bpreventivo\b/i.test(a.procedure) && !/\bsem\s+preventivo\b/i.test(a.procedure)) !== (preventivo === "com")) {
    // Mudança do atendimento exige releitura do catálogo e novo resumo.
    // Não reaproveite uma vaga/aceite da variante anterior na coleta de dados.
    limparEscolhaAgendamento(estado);
    a.slot_options = null;
    estado.flow.stage = "CHOOSING_SLOT";
    return null;
  }
  const encaminharSfp = async () => {
    limparEscolhaAgendamento(estado);
    a.slot_options = null;
    p.pending = { nome: null, cpf: null, data_nascimento: null };
    estado.flow.stage = "HANDOFF";
    const ok = await params.encaminharVagaIndisponivel?.(MOTIVO_SFP).catch(() => false) ?? false;
    return resultadoEncaminhamentoSfp(ok);
  };
  const encaminhar = async (modalidadePendente = false) => {
    const motivo = modalidadePendente ? "MODALIDADE_ALTERADA: conferir a modalidade de atendimento antes de reservar."
      : "VAGA_ESCOLHIDA_INDISPONIVEL: a vaga escolhida pelo paciente não pôde ser reservada; não substituir médico, data ou horário.";
    limparEscolhaAgendamento(estado);
    a.slot_options = null;
    estado.flow.stage = "HANDOFF";
    const ok = await params.encaminharVagaIndisponivel?.(motivo).catch(() => false) ?? false;
    return criarResultado({ origem: ok ? "handoff" : "erro", texto: respostaSemVagas(ok, true, modalidadePendente),
      fatosConfirmados: ok ? ["handoff_confirmado"] : [], restricoes: ["nao_substituir_vaga_escolhida"] });
  };
  let selecionouAgora = params.aposSelecao === true;
  const cadastroProntoNoInicio = Boolean(p.identified && p.validated && p.id);
  const aceiteDaVaga = !selecionouAgora && ehConfirmacaoDeAgendamento(mensagem, confirmacaoDaEscolha(estado, ctx.clinicaId)?.vaga);
  const escolha = selecionouAgora || aceiteDaVaga ? null : lerEscolhaHorario(mensagem);
  const opcoes = vagasDaSessao(estado, ctx.clinicaId);
  // Uma correção/recusa após o aceite suspende a gravação. A Nina não troca
  // a vaga no meio da coleta; a equipe humana deverá tratar a mudança.
  if (a.confirmation?.aceita && (!consentimentoDaEscolha(estado, ctx.clinicaId) || ehNegacao(mensagem) ||
    (escolha && vagasDaEscolha([a.confirmation.vaga], escolha).length === 0))) {
    a.slot_confirmed_by_patient = false;
    a.intent_confirmed = false;
    p.pending = { nome: null, cpf: null, data_nascimento: null };
    estado.flow.stage = "HANDOFF";
    return null;
  }
  if (escolha && opcoes.length && !consentimentoDaEscolha(estado, ctx.clinicaId)) {
    const vagas = vagasDaEscolha(opcoes, escolha);
    // Um horário ainda não consultado precisa de nova leitura da agenda.
    // Não o declare indisponível e não o substitua por uma opção da lista.
    if (vagas.length === 0) {
      limparEscolhaAgendamento(estado);
      return null;
    }
    if (vagas.length !== 1) {
      limparEscolhaAgendamento(estado);
      return resultadoGate(textos, "fluxo.agendamento.escolher", {});
    }
    const vaga = vagas[0]!;
    const r = await executar(ctx, "selecionar_horario", {
      medico_id: vaga.medico_id, inicio: vaga.inicio, fim: vaga.fim,
    });
    if (!r.ok && r.erro === "PROFISSIONAL_SFP") return encaminharSfp();
    if (!r.ok && r.erro === "SLOT_UNAVAILABLE") return encaminhar();
    if (!r.ok && ["MODALIDADE_NAO_DEFINIDA", "MODALIDADE_ALTERADA"].includes(r.erro)) return encaminhar(true);
    if (r.ok && typeof r.orientacao_atendimento === "string")
      return criarResultado({ origem: "gate", texto: r.orientacao_atendimento,
        fatosConfirmados: ["modalidade:chegada_sem_pre_agendamento"] });
    if (r.ok && typeof r.resumo_confirmacao === "string") {
      selecionouAgora = true;
    } else if (r.ok && r.selecao_preservada === true) {
      selecionouAgora = true;
    } else {
      return resultadoGate(textos, r.ok || r.erro === "ACTION_NOT_AUTHORIZED"
        ? "fluxo.agendamento.escolher" : "fluxo.identificacao.instabilidade", {});
    }
  }
  if (ehNegacao(mensagem)) {
    limparEscolhaAgendamento(estado);
    p.pending = { nome: null, cpf: null, data_nascimento: null };
    estado.flow.stage = "CHOOSING_SLOT";
    return null;
  }
  if (!atendimentoDefinido(estado)) {
    if (opcoes.length && ehConfirmacaoDeAgendamento(mensagem))
      return resultadoGate(textos, "fluxo.agendamento.escolher", {});
    return null;
  }
  const resumoEscolhido = confirmacaoDaEscolha(estado, ctx.clinicaId);
  if (!resumoEscolhido) return null;
  // Uma repetição do aceite durante a coleta não é nome de paciente.
  // A própria escolha de horário também nunca é um dado cadastral.
  const ultimaMensagem = ctx.consultaAgenda?.historico.at(-1);
  const coletandoDados = ["AWAITING_PATIENT_DATA", "COLLECTING_PATIENT_DATA", "IDENTIFYING_PATIENT"].includes(estado.flow.stage) ||
    (ultimaMensagem?.role === "assistant" && /nome completo|data de nascimento|telefone com DDD/i.test(ultimaMensagem.content ?? ""));
  const novo = aceiteDaVaga || selecionouAgora || !coletandoDados ? null : extrairDadosIdentificacao(mensagem);
  if (
    !selecionouAgora && !aceiteDaVaga &&
    pareceAssuntoParalelo(mensagem) &&
    !novo?.data_nascimento &&
    !novo?.telefone
  )
    return null;

  // Lê o cadastro confirmado antes de pedir dados. Telefone sozinho não
  // confirma o paciente: nesse caso ainda faltam nome e nascimento.
  const consulta = await executar(ctx, "consultar_cadastro_paciente", {});
  if (!consulta.ok && consulta.erro === "PROFISSIONAL_SFP") return encaminharSfp();
  if (!consulta.ok) return resultadoGate(textos, "fluxo.identificacao.instabilidade", {});
  const faltantesNoCadastro = (consulta.campos_faltantes ?? []) as CampoCadastro[];
  {
    // Dados já informados são candidatos ao cadastro, nunca prova de identidade.
    // Não extraia nomes de pedidos de consulta ou de resumos do assistente.
    const historico = ctx.consultaAgenda?.historico ?? [];
    for (let i = 0; i < historico.length; i++) {
      const item = historico[i]!;
      if (item.role !== "user" || !item.content) continue;
      const declaracao = item.content.match(/\b(?:meu nome(?: completo)? (?:é|eh)|me chamo|sou)\s+.+/i)?.[0];
      const respostaCadastro = historico[i - 1]?.role === "assistant" &&
        /(?:nome completo|data de nascimento|telefone com DDD)/i.test(historico[i - 1]?.content ?? "");
      if (!declaracao && !respostaCadastro) continue;
      const trecho = declaracao ?? item.content;
      if (/\b(?:consulta|agendar|marcar|confirmo|horário|horario|doutor|doutora)\b|\?/i.test(trecho)) continue;
      const recebido = extrairDadosIdentificacao(trecho);
      for (const campo of faltantesNoCadastro) {
        if (recebido[campo] && camposCadastroFaltantes(p.pending).includes(campo) &&
          !camposCadastroFaltantes(recebido).includes(campo)) p.pending[campo] = recebido[campo];
      }
    }
  }
  if (novo) {
    for (const campo of faltantesNoCadastro) {
      if (novo[campo] && camposCadastroFaltantes(p.pending).includes(campo))
        p.pending[campo] = novo[campo];
    }
    if (novo.cpf) p.pending.cpf = novo.cpf;
  }
  const faltando = faltantesNoCadastro.filter((campo) =>
    camposCadastroFaltantes(p.pending).includes(campo),
  );
  if (faltando.length) {
    estado.flow.stage = "AWAITING_PATIENT_DATA";
    return resultadoGate(
      textos,
      "fluxo.cadastro.obrigatorios",
      {
        lista: rotularFaltantes(faltando),
        exemplo: faltando.map((campo) => EXEMPLOS_CADASTRO[campo]).join(" "),
      },
      { camposPendentes: faltando, restricoes: ["nao_afirmar_agendamento_sem_gravacao"] },
    );
  }

  estado.flow.stage = "IDENTIFYING_PATIENT";
  const r = await executar(
    ctx,
    "identificar_paciente",
    Object.fromEntries(
      Object.entries(p.pending).filter(([, valor]) => valor != null && valor !== ""),
    ),
  );
  if (!r.ok) {
    if (r.erro === "PROFISSIONAL_SFP") return encaminharSfp();
    estado.flow.stage = "AWAITING_PATIENT_DATA";
    if (r.erro === "PATIENT_DATA_REQUIRED") {
      const campos = (r.campos_faltantes ?? []) as CampoCadastro[];
      return resultadoGate(
        textos,
        "fluxo.cadastro.obrigatorios",
        {
          lista: rotularFaltantes(campos),
          exemplo: campos.map((campo) => EXEMPLOS_CADASTRO[campo]).join(" "),
        },
        { camposPendentes: campos },
      );
    }
    if (r.erro === "PATIENT_AMBIGUOUS" || r.erro === "PATIENT_DATA_MISMATCH") {
      estado.flow.stage = "HANDOFF";
      p.pending = { nome: null, cpf: null, data_nascimento: null };
      return null;
    }
    return resultadoGate(textos, "fluxo.identificacao.instabilidade", {});
  }
  p.pending = { nome: null, cpf: null, data_nascimento: null };
  p.identified = true;
  p.validated = true;
  p.id = ctx.pacienteId;
  log("paciente_identificado", { conversa: ctx.conversaId, paciente_id: ctx.pacienteId });

  // Dados completos vêm antes da confirmação. Um "sim" anterior à coleta
  // não autoriza a reserva: o paciente precisa responder ao resumo entregue.
  // Aceites de conversas já em andamento continuam preservados.
  if (!consentimentoDaEscolha(estado, ctx.clinicaId) && cadastroProntoNoInicio &&
    !selecionouAgora && aceiteDaVaga) {
    aceitarResumoEntregue(estado, ctx.clinicaId, ctx.consultaAgenda?.historico ?? []);
  }
  const confirmacao = consentimentoDaEscolha(estado, ctx.clinicaId);
  if (!confirmacao) {
    estado.flow.stage = "WAITING_FINAL_CONFIRMATION";
    const resumoJaEntregue = cadastroProntoNoInicio && !selecionouAgora &&
      resumoDaEscolhaEntregue(estado, ctx.clinicaId, ctx.consultaAgenda?.historico ?? []);
    return criarResultado({ origem: "gate", texto: resumoJaEntregue ? LEMBRETE_CONFIRMACAO : resumoEscolhido.resumo,
      fatosConfirmados: ["vaga_escolhida_validada", "paciente_identificado"],
      restricoes: ["aguardar_aceite_do_resumo"] });
  }

  // Revalida a vaga e grava. `agendar` já revalida o slot e confere a
  //    gravação no banco — é a mesma porta usada pela Agenda.
  // FASE 3 — a identificação acabou de ser concluída NESTE turno: o estado
  // atualizado já habilita a operação, sem exigir nova consulta só porque o
  // turno mudou. O que a autorização confere são as pré-condições reais.
  estado.flow.stage = "REVALIDATING_SLOT";
  const autorizacaoAgendar = autorizarAcao({
    operacao: "criar_agendamento",
    clinicaId: ctx.clinicaId,
    paciente: { id: ctx.pacienteId, identificado: true, validado: true, atualizadoNoTurno: true },
    medicoId: a.doctor_id ?? a.doctor_name,
    procedimento: a.procedure ?? a.specialty ?? "Consulta",
    intervalo: { inicio: a.slot_inicio, fim: a.slot_fim },
    disponibilidadeConsultada: true,
    // A vaga oferecida e resumida ao paciente é a única elegível aqui; a
    // revalidação contra a agenda acontece na ferramenta/núcleo.
    vagasConsultadas: [
      {
        medicoId: String(a.doctor_id ?? a.doctor_name ?? ""),
        inicio: String(a.slot_inicio ?? ""),
        fim: String(a.slot_fim ?? ""),
      },
    ],
    consentimento: {
      confirmado: confirmacao.aceita,
      medicoId: confirmacao.vaga.medico_id,
      inicio: confirmacao.vaga.inicio,
      fim: confirmacao.vaga.fim,
    },
    idempotenciaBase: ctx.conversaId ?? ctx.telefone ?? null,
  });
  if (!autorizacaoAgendar.autorizado) {
    log("agendamento_nao_autorizado", {
      conversa: ctx.conversaId,
      motivos: autorizacaoAgendar.motivos,
    });
    estado.flow.stage = "CHOOSING_SLOT";
    return null; // sem efeito: o modelo reconduz a escolha do horário
  }
  const ag = await executar(ctx, "agendar", {
    medico_id: a.doctor_id ?? a.doctor_name,
    inicio: a.slot_inicio,
    fim: a.slot_fim,
    procedimento: a.procedure ?? a.specialty ?? "Consulta",
  });
  if (ag.ok && (ag as unknown as { appointment_id?: string }).appointment_id) {
    log("agendamento_criado", {
      conversa: ctx.conversaId,
      appointment_id: (ag as unknown as { appointment_id: string }).appointment_id,
    });
    return resultadoAgendamentoConfirmado(ag, estado, params.nomeUnidade || "nossa clínica", textos, ctx.conversaId);
  }

  const erroAg = (ag as { erro?: string }).erro;
  if (erroAg === "PROFISSIONAL_SFP") return encaminharSfp();
  if (["MODALIDADE_NAO_DEFINIDA", "MODALIDADE_ALTERADA"].includes(erroAg ?? "")) return encaminhar(true);
  log("agendamento_falhou", { conversa: ctx.conversaId, erro: erroAg });
  // Reserva anterior encontrada pela idempotência: consultada, nunca criada
  // de novo. A prova é o ID lido do registro existente.
  if (ag.ok && (ag as unknown as { duplicado?: boolean }).duplicado === true) {
    const idExistente =
      (ag as unknown as { appointment_id?: string | null }).appointment_id ?? null;
    estado.flow.stage = "BOOKED";
    if (idExistente) a.appointment_id = idExistente;
    return resultadoGate(
      textos,
      "fluxo.agendamento.duplicado",
      {},
      {
        fatosConfirmados: ["agendamento_ja_existente"],
        acoesConcluidas: [
          {
            acao: "agendar",
            idempotencia: `agendar|${ctx.conversaId}|${a.slot_inicio ?? ""}`,
            confirmada: true,
            evidencia: idExistente ?? "duplicado",
          },
        ],
      },
    );
  }
  if (erroAg === "APPOINTMENT_ALREADY_EXISTS") {
    estado.flow.stage = "BOOKED";
    return resultadoGate(
      textos,
      "fluxo.agendamento.duplicado",
      {},
      {
        fatosConfirmados: ["agendamento_ja_existente"],
        acoesConcluidas: [
          {
            acao: "agendar",
            idempotencia: `agendar|${ctx.conversaId}|${a.slot_inicio ?? ""}`,
            confirmada: true,
            evidencia: "duplicado",
          },
        ],
      },
    );
  }
  if (erroAg === "SLOT_UNAVAILABLE" || erroAg === "NO_AVAILABILITY") return encaminhar();
  // Uma falha técnica não autoriza escolher uma nova vaga nem afirmar sucesso.
  return resultadoGate(textos, "fluxo.identificacao.instabilidade", {});
}
