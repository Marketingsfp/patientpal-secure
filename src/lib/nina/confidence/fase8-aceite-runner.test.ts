/**
 * FASE 8 — ACEITE DE INTEGRAÇÃO DO RUNNER E DA MATRIZ OBRIGATÓRIA.
 *
 * Dois blocos:
 *  1) o runner de cenários — nenhum cenário pode ser aprovado sem avaliação
 *     correspondente às saídas reais da Nina;
 *  2) a matriz obrigatória — comportamento determinístico do motor por família
 *     de caso, usando os módulos reais (nada é recalculado por atalho).
 *
 * Fora do alcance deste arquivo (declarado, não simulado): LLM real, entrega
 * real no WhatsApp e banco isolado com migrations/triggers.
 */
import { describe, expect, it } from "bun:test";
import {
  criteriosDeConfianca,
  verificarConfiancaRunner,
  type SaidaEsperadaRunner,
  type SnapshotItemRunner,
} from "./gate-v2";
import { montarContextoDoTurno, decidirNoTurno, type EstadoDoTurno } from "./runtime";
import { verificarRespostaFinal } from "./final-answer";
import { hashDoTexto } from "./hash";
import { desfechoDeHandoff, desfechoLimiteRodadas } from "./desfecho";
import { abrirPendencia, reavaliarPendencia, pendenciaVazia } from "./esclarecimento";
import { verificarResultadoAgendamento } from "../acoes/resultado";

/* ------------------------------------------------------------------ *
 * 1) RUNNER — ausência de avaliação reprova
 * ------------------------------------------------------------------ */

const snapOk = (over: Partial<SnapshotItemRunner> = {}): SnapshotItemRunner => ({
  score: 88,
  nivel: "MEDIUM",
  evidence_coverage: 95,
  bloqueadores: [],
  outgoing_message_id: "out-1",
  policy_version: "v5",
  avaliacao: "answer_confidence",
  clinica_id: "cli-1",
  conversation_id: "conv-1",
  execucao_id: "ex-1",
  texto_final_hash: hashDoTexto("Sim, atendemos cardiologia."),
  ...over,
});

const saida = (over: Partial<SaidaEsperadaRunner> = {}): SaidaEsperadaRunner => ({
  id: "out-1",
  execucao_id: "ex-1",
  texto_hash: hashDoTexto("Sim, atendemos cardiologia."),
  ...over,
});

const ctx = { clinicaId: "cli-1", conversaId: "conv-1" };

describe("runner — critérios executam mesmo sem snapshot", () => {
  it("saída sem nenhuma avaliação reprova o cenário", () => {
    const v = verificarConfiancaRunner([], [saida()], ctx);
    expect(v.confidence_snapshot_present).toBe(false);
    expect(v.all_outputs_evaluated).toBe(false);
    const criterios = criteriosDeConfianca(v);
    expect(criterios.every((c) => c.ok)).toBe(false);
    expect(criterios.find((c) => c.valor === "confidence_snapshot_present")?.detalhe).toContain(
      "Não avaliada",
    );
  });

  it("segunda saída sem snapshot é detectada", () => {
    const v = verificarConfiancaRunner(
      [snapOk()],
      [saida(), saida({ id: "out-2", texto_hash: null })],
      ctx,
    );
    expect(v.confidence_snapshot_present).toBe(true);
    expect(v.all_outputs_evaluated).toBe(false);
  });

  it("id da mensagem de entrada não substitui a saída avaliada", () => {
    const v = verificarConfiancaRunner(
      [snapOk({ outgoing_message_id: null, message_id: "in-1" })],
      [saida()],
      ctx,
    );
    expect(v.no_input_id_as_output).toBe(false);
    expect(v.confidence_linked_to_message).toBe(false);
    expect(v.all_outputs_evaluated).toBe(false);
  });

  it("distingue ausência de avaliação de ausência de bloqueador", () => {
    const semAvaliacao = criteriosDeConfianca(verificarConfiancaRunner([], [saida()], ctx));
    const comAvaliacaoLimpa = criteriosDeConfianca(
      verificarConfiancaRunner([snapOk()], [saida()], ctx),
    );
    expect(semAvaliacao.find((c) => c.valor === "confidence_snapshot_present")?.ok).toBe(false);
    expect(comAvaliacaoLimpa.find((c) => c.valor === "no_high_with_blocker")?.ok).toBe(true);
    expect(comAvaliacaoLimpa.find((c) => c.valor === "confidence_snapshot_present")?.ok).toBe(true);
  });

  it("reprova tipo de avaliação, nota e nível inválidos", () => {
    expect(
      verificarConfiancaRunner([snapOk({ avaliacao: "chute" })], [saida()], ctx)
        .evaluation_type_valid,
    ).toBe(false);
    expect(
      verificarConfiancaRunner([snapOk({ score: 140 })], [saida()], ctx).score_and_level_valid,
    ).toBe(false);
    expect(
      verificarConfiancaRunner([snapOk({ nivel: "OTIMO" })], [saida()], ctx).score_and_level_valid,
    ).toBe(false);
  });

  it("reprova versão de política ausente", () => {
    expect(
      verificarConfiancaRunner([snapOk({ policy_version: null })], [saida()], ctx)
        .policy_version_present,
    ).toBe(false);
  });

  it("reprova avaliação de outra clínica ou de outra conversa", () => {
    expect(
      verificarConfiancaRunner([snapOk({ clinica_id: "cli-2" })], [saida()], ctx).scope_matches,
    ).toBe(false);
    expect(
      verificarConfiancaRunner([snapOk({ conversation_id: "conv-9" })], [saida()], ctx)
        .scope_matches,
    ).toBe(false);
  });

  it("reprova execução divergente e hash de texto divergente", () => {
    expect(
      verificarConfiancaRunner([snapOk({ execucao_id: "ex-9" })], [saida()], ctx)
        .execution_matches,
    ).toBe(false);
    expect(
      verificarConfiancaRunner(
        [snapOk({ texto_final_hash: hashDoTexto("outro texto") })],
        [saida()],
        ctx,
      ).text_hash_matches,
    ).toBe(false);
  });

  it("avaliação de ação sem hash não invalida o texto entregue", () => {
    const v = verificarConfiancaRunner(
      [snapOk(), snapOk({ avaliacao: "action_safety", texto_final_hash: null })],
      [saida()],
      ctx,
    );
    expect(v.text_hash_matches).toBe(true);
    expect(criteriosDeConfianca(v).every((c) => c.ok)).toBe(true);
  });
});

/* ------------------------------------------------------------------ *
 * 2) MATRIZ OBRIGATÓRIA
 * ------------------------------------------------------------------ */

const base = {
  ambiente: "homologacao" as const,
  catalogoEncontrou: false,
  agendamentoConfirmado: false,
  pacienteIdentificado: false,
  esclarecimentoUsado: false,
  handoffSolicitado: false,
};
const catalogoOk = {
  nome: "buscar_procedimentos",
  capacidade: "searchKnowledgeBase",
  fonte: "catalogo_publicado",
  success: true,
};
const agendaOk = {
  nome: "consultar_disponibilidade",
  capacidade: "checkAvailability",
  fonte: "agenda",
  success: true,
};
const fonteCatalogo = {
  tipo: "catalogo_publicado" as const,
  temConteudo: true,
  publicado: true,
  ativo: true,
};
const fonteAgenda = { tipo: "agenda" as const, temConteudo: true, publicado: true, ativo: true };

const fatoPreco = (valor: string) => ({
  consulta: "buscar_procedimentos",
  capacidade: "searchKnowledgeBase",
  entidade: "procedimento" as const,
  campo: "preco",
  valor,
  fonte: "catalogo_publicado" as const,
  chave: { procedimento: "consulta de cardiologia" },
});

function avaliar(estado: Omit<EstadoDoTurno, "mensagemPaciente">, mensagem: string) {
  const completo: EstadoDoTurno = { ...estado, mensagemPaciente: mensagem };
  const texto = estado.texto ?? null;
  return texto
    ? verificarRespostaFinal({ ctx: montarContextoDoTurno(completo), textoFinal: texto })
    : decidirNoTurno(completo);
}

const alta = (r: { level: string; decision: string }) =>
  r.level === "HIGH" && r.decision === "ALLOW";
const bloqueado = (r: { decision: string; hardBlockers?: string[] }) =>
  r.decision === "BLOCK_ACTION" || r.decision === "HANDOFF" || (r.hardBlockers ?? []).length > 0;

describe("matriz — preço e fonte", () => {
  const estadoPreco = (texto: string, valorFonte: string) => ({
    ...base,
    intent: "preco",
    acao: "informar_valor" as const,
    texto,
    catalogoEncontrou: true,
    ferramentas: [catalogoOk],
    retrievedSources: [fonteCatalogo],
    fatos: [fatoPreco(valorFonte)],
    claims: [
      {
        tipo: "valor" as const,
        texto,
        fonte: { tipo: "catalogo_publicado" as const },
      },
    ],
  });

  it("preço correto com a mesma fonte: alta confiança", () => {
    const r = avaliar(estadoPreco("A consulta custa R$ 150,00.", "R$ 150,00"), "Quanto custa?");
    expect(alta(r)).toBe(true);
  });

  it("preço alterado mantendo a mesma fonte e metadados: nunca alta confiança", () => {
    const r = avaliar(estadoPreco("A consulta custa R$ 250,00.", "R$ 150,00"), "Quanto custa?");
    expect(alta(r)).toBe(false);
  });

  it("informação sem fonte é bloqueada", () => {
    const r = avaliar(
      {
        ...base,
        intent: "preco",
        acao: "informar_valor",
        texto: "A ressonância custa R$ 900,00.",
        ferramentas: [],
        retrievedSources: [],
      },
      "Quanto custa a ressonância?",
    );
    expect(bloqueado(r)).toBe(true);
    expect(alta(r)).toBe(false);
  });

  it("fonte não publicada não sustenta o fato", () => {
    const r = avaliar(
      {
        ...base,
        intent: "preco",
        acao: "informar_valor",
        texto: "A consulta custa R$ 150,00.",
        catalogoEncontrou: true,
        ferramentas: [catalogoOk],
        retrievedSources: [{ ...fonteCatalogo, publicado: false, ativo: false }],
        claims: [
          { tipo: "valor", texto: "R$ 150,00", fonte: { tipo: "catalogo_publicado" as const } },
        ],
      },
      "Quanto custa?",
    );
    expect(alta(r)).toBe(false);
  });

  it("extração incompleta (ferramenta sem sucesso) não vira alta confiança", () => {
    const r = avaliar(
      {
        ...base,
        intent: "preco",
        acao: "informar_valor",
        texto: "A consulta custa R$ 150,00.",
        catalogoEncontrou: true,
        ferramentas: [{ ...catalogoOk, success: false }],
        retrievedSources: [],
      },
      "Quanto custa?",
    );
    expect(alta(r)).toBe(false);
  });
});

describe("matriz — outro serviço, unidade, profissional e slot", () => {
  const casos: Array<[string, string]> = [
    ["outro serviço", "O ultrassom custa R$ 150,00."],
    ["outro profissional", "A consulta com a Dra. Marta custa R$ 150,00."],
    ["outra unidade", "A consulta na unidade norte custa R$ 150,00."],
    ["outro slot", "Temos vaga na terça às 8h."],
  ];
  for (const [nome, texto] of casos) {
    it(`${nome} sem evidência correspondente não é alta confiança`, () => {
      const r = avaliar(
        {
          ...base,
          intent: "informacao",
          acao: "responder_informacao",
          texto,
          catalogoEncontrou: true,
          ferramentas: [catalogoOk],
          retrievedSources: [fonteCatalogo],
          fatos: [fatoPreco("R$ 150,00")],
        },
        "Tem esse serviço?",
      );
      expect(alta(r)).toBe(false);
    });
  }
});

describe("matriz — negação, pergunta, recusa prudente e vaga", () => {
  it("negação com fonte é permitida", () => {
    const r = avaliar(
      {
        ...base,
        intent: "informacao",
        acao: "responder_informacao",
        texto: "Não realizamos esse exame nesta unidade.",
        catalogoEncontrou: true,
        ferramentas: [catalogoOk],
        retrievedSources: [fonteCatalogo],
      },
      "Vocês fazem tomografia?",
    );
    expect(bloqueado(r)).toBe(false);
  });

  it("recusa prudente não pontua como afirmação factual", () => {
    const r = avaliar(
      {
        ...base,
        intent: "informacao",
        acao: "responder_informacao",
        texto: "Não tenho essa informação confirmada aqui. Vou verificar com a equipe.",
        ferramentas: [],
      },
      "Qual o valor do implante?",
    );
    expect(r.score).toBeLessThan(100);
    expect(bloqueado(r)).toBe(false);
  });

  it("resposta vaga não vira 100", () => {
    const r = avaliar(
      { ...base, intent: null, texto: "Claro, posso ajudar com isso.", ferramentas: [] },
      "?",
    );
    expect(r.score).toBeLessThan(100);
  });

  it("disponibilidade vazia não permite afirmar vaga", () => {
    const r = avaliar(
      {
        ...base,
        intent: "agendamento",
        acao: "responder_informacao",
        texto: "Temos vaga quinta às 10h.",
        ferramentas: [{ ...agendaOk, success: true, vazio: true } as any],
        retrievedSources: [fonteAgenda],
      },
      "Tem vaga quinta?",
    );
    expect(alta(r)).toBe(false);
  });
});

describe("matriz — ações: identificação, consentimento e prova", () => {
  it("agendamento afirmado sem id é bloqueado", () => {
    const r = avaliar(
      {
        ...base,
        intent: "agendamento",
        acao: "criar_agendamento",
        texto: "Pronto, seu agendamento foi confirmado para quinta às 10h.",
        pacienteIdentificado: true,
        ferramentas: [agendaOk],
        retrievedSources: [fonteAgenda],
        estadoOperacional: {
          bookingIntentConfirmed: true,
          appointmentFlowActive: true,
          appointmentAttempted: true,
          appointmentToolCalled: false,
          appointmentCreated: false,
          appointmentId: null,
          workflowState: "SLOT_SELECTED",
        },
      },
      "Pode marcar quinta às 10h.",
    );
    expect(r.decision).toBe("BLOCK_ACTION");
    expect((r.hardBlockers ?? []).length).toBeGreaterThan(0);
  });

  it("paciente não identificado no turno não libera ação de escrita", () => {
    const r = avaliar(
      {
        ...base,
        intent: "agendamento",
        acao: "criar_agendamento",
        texto: "Vou marcar para você agora.",
        pacienteIdentificado: false,
        ferramentas: [agendaOk],
        retrievedSources: [fonteAgenda],
        estadoOperacional: {
          bookingIntentConfirmed: false,
          appointmentFlowActive: true,
          appointmentAttempted: true,
          appointmentToolCalled: false,
          appointmentCreated: false,
          workflowState: "SLOT_SELECTED",
        },
      },
      "Marca aí",
    );
    expect(bloqueado(r)).toBe(true);
  });

  it("reserva anterior é reconhecida como existente, não como nova", () => {
    const r = verificarResultadoAgendamento(
      { clinicaId: "cli-1", pacienteId: "pac-1", inicio: "2026-09-11T10:00:00Z" },
      {
        id: "ag-1",
        clinica_id: "cli-1",
        paciente_id: "pac-1",
        inicio: "2026-09-11T10:00:00Z",
        status: "agendado",
      },
      { jaExistia: true },
    );
    expect(r.estado).toBe("EXISTING");
    expect(r.agendamentoId).toBe("ag-1");
  });

  it("duplicidade idempotente não vira segunda criação", () => {
    const primeira = verificarResultadoAgendamento(
      { pacienteId: "pac-1", inicio: "2026-09-11T10:00:00Z" },
      { id: "ag-1", paciente_id: "pac-1", inicio: "2026-09-11T10:00:00Z", status: "agendado" },
    );
    const repeticao = verificarResultadoAgendamento(
      { pacienteId: "pac-1", inicio: "2026-09-11T10:00:00Z" },
      { id: "ag-1", paciente_id: "pac-1", inicio: "2026-09-11T10:00:00Z", status: "agendado" },
      { jaExistia: true },
    );
    expect(primeira.estado).toBe("CREATED");
    expect(repeticao.estado).toBe("EXISTING");
    expect(repeticao.agendamentoId).toBe(primeira.agendamentoId);
  });

  it("retry recuperado só confirma com registro lido", () => {
    const falhou = verificarResultadoAgendamento(
      { pacienteId: "pac-1" },
      null,
      { erro: "timeout" },
    );
    const recuperado = verificarResultadoAgendamento(
      { pacienteId: "pac-1" },
      { id: "ag-2", paciente_id: "pac-1", status: "agendado" },
    );
    expect(falhou.estado).toBe("FAILED");
    expect(recuperado.estado).toBe("CREATED");
  });

  it("sem registro comprovado o resultado é incerto, nunca criado", () => {
    const r = verificarResultadoAgendamento({ pacienteId: "pac-1" }, null);
    expect(r.estado).toBe("UNCERTAIN");
    expect(r.agendamentoId).toBeNull();
  });
});

describe("matriz — esclarecimento, handoff e limite de rodadas", () => {
  const resultadoFake = {
    evidence: { motivos: ["procedimento_ambiguo"] },
  } as any;

  it("emitir pergunta não consome tentativa", () => {
    const p = abrirPendencia({
      resultado: resultadoFake,
      intent: "preco",
      messageId: "in-1",
      tentativasConsumidas: 0,
    });
    expect(p.pendente).toBe(true);
    expect(p.tentativas).toBe(0);
  });

  it("nova resposta do paciente no mesmo assunto consome uma tentativa", () => {
    const p = abrirPendencia({
      resultado: resultadoFake,
      intent: "preco",
      messageId: "in-1",
      tentativasConsumidas: 0,
    });
    const r = reavaliarPendencia({ anterior: p, intentAtual: "preco", messageIdAtual: "in-2" });
    expect(r.tentativas).toBe(1);
    expect(r.mudouDeAssunto).toBe(false);
  });

  it("reprocessar a MESMA mensagem não consome tentativa", () => {
    const p = abrirPendencia({
      resultado: resultadoFake,
      intent: "preco",
      messageId: "in-1",
      tentativasConsumidas: 1,
    });
    const r = reavaliarPendencia({ anterior: p, intentAtual: "preco", messageIdAtual: "in-1" });
    expect(r.tentativas).toBe(1);
  });

  it("mudança de assunto descarta a pendência antiga", () => {
    const p = abrirPendencia({
      resultado: resultadoFake,
      intent: "preco",
      messageId: "in-1",
      tentativasConsumidas: 1,
    });
    const r = reavaliarPendencia({
      anterior: p,
      intentAtual: "agendamento",
      messageIdAtual: "in-2",
    });
    expect(r.mudouDeAssunto).toBe(true);
    expect(r.pendencia).toEqual(pendenciaVazia());
  });

  it("handoff falho é declarado como falha, não como transferência", () => {
    const ok = desfechoDeHandoff({ confirmado: true, motivo: "fonte_ausente" });
    const falho = desfechoDeHandoff({ confirmado: false, motivo: "fonte_ausente", erro: "503" });
    expect(ok.estado).toBe("HANDOFF_CONFIRMADO");
    expect(ok.handoffConfirmado).toBe(true);
    expect(falho.estado).toBe("HANDOFF_FALHOU");
    expect(falho.handoffConfirmado).toBe(false);
    expect(falho.resposta).not.toBe(ok.resposta);
  });

  it("limite de rodadas tem desfecho próprio e não reaproveita rascunho", () => {
    const d = desfechoLimiteRodadas({ handoffConfirmado: false, rodadas: 3 });
    expect(d.estado).toBe("LIMITE_RODADAS");
    expect(d.origem).toBe("codigo");
    expect(d.requerRetomadaHumana).toBe(true);
  });
});

describe("matriz — saídas sem LLM, múltiplas saídas e ambiente", () => {
  it("gate sem texto do modelo avalia segurança da ação, não a resposta", () => {
    const r = decidirNoTurno({
      ...base,
      intent: "agendamento",
      acao: "criar_agendamento",
      texto: null,
      mensagemPaciente: "quero marcar",
      ferramentas: [],
    } as EstadoDoTurno);
    expect(r.score).toBeLessThan(100);
  });

  it("duas saídas exigem duas avaliações vinculadas", () => {
    const v = verificarConfiancaRunner(
      [snapOk(), snapOk({ outgoing_message_id: "out-2", texto_final_hash: null })],
      [saida(), saida({ id: "out-2", texto_hash: null })],
      ctx,
    );
    expect(v.all_outputs_evaluated).toBe(true);
    expect(v.confidence_linked_to_message).toBe(true);
  });

  it("avaliação de outro ambiente/conversa não cobre a saída deste cenário", () => {
    const v = verificarConfiancaRunner(
      [snapOk({ conversation_id: "conv-outra", outgoing_message_id: "out-x" })],
      [saida()],
      ctx,
    );
    expect(v.all_outputs_evaluated).toBe(false);
    expect(v.scope_matches).toBe(false);
  });
});
