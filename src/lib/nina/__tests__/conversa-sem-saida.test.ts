import { describe, expect, test } from "bun:test";
import type { ConhecimentoSessao } from "../confidence/conhecimento-sessao";
import { criarPerguntasDoTurno } from "../perguntas-independentes";
import { pedeDadosDoPaciente } from "../dados-transferencia";
import { protegerEfeitosDaResposta } from "../resposta/efeitos-confirmados";

const pendencia = (termo: string): ConhecimentoSessao => ({
  versao: 1,
  clinicaId: "c",
  sessionId: "s",
  consulta: { termo, medico: "", tipo_atendimento: "exame_procedimento" },
  referencias: [],
  esclarecimento: { tipo: "procedimento", opcoes: [], pergunta: `Não encontrei "${termo}".` },
  esclarecimentoTentativas: 1,
});

describe("dúvida de catálogo não fica presa (homologação 14/10, ciclo 1066)", () => {
  test("dúvida herdada é retomada uma vez e depois sai", () => {
    // 1º turno depois da pergunta: o paciente fala de outra coisa → retoma uma vez.
    const segundo = criarPerguntasDoTurno(
      pendencia("refratometria"),
      "Pode ser a consulta com a Marina?",
    );
    expect(segundo.pendentesAtuais).toHaveLength(1);
    const guardada = segundo.estado(null)!;
    expect(guardada.esclarecimentoRetomadas).toBe(1);
    // 2º turno: já retomada, não é perguntada de novo nem fica guardada.
    const terceiro = criarPerguntasDoTurno(guardada, "Segunda de manhã, pago em dinheiro.");
    expect(terceiro.pendentes).toHaveLength(1); // ainda reconhece uma resposta
    expect(terceiro.pendentesAtuais).toHaveLength(0);
    expect(terceiro.estado(null)).toBeNull();
  });

  test("a mesma dúvida recriada por uma busca deste turno volta a ser perguntada", () => {
    const anterior = pendencia("refratometria");
    const turno = criarPerguntasDoTurno(anterior, "refratometria mesmo");
    turno.registrar(
      { termo: "refratometria", tipo_atendimento: "exame_procedimento" },
      pendencia("refratometria"),
      null,
      false,
    );
    expect(turno.pendentesAtuais).toHaveLength(1);
    expect(turno.estado(null)?.esclarecimento?.pergunta).toContain("refratometria");
  });

  test("dúvida nova do turno é perguntada normalmente", () => {
    const turno = criarPerguntasDoTurno(null, "quero fazer o exame de vista");
    turno.registrar(
      { termo: "exame de vista", tipo_atendimento: "exame_procedimento" },
      pendencia("exame de vista"),
      null,
      false,
    );
    expect(turno.pendentesAtuais).toHaveLength(1);
  });
});

describe("pedido de nome e data feito pela IA", () => {
  test("reconhece o pedido da IA", () => {
    expect(
      pedeDadosDoPaciente(
        "Perfeito! Para darmos continuidade ao agendamento, vou solicitar que informe por gentileza:\n• Seu nome completo\n• Sua data de nascimento",
      ),
    ).toBe(true);
    expect(
      pedeDadosDoPaciente("Me envie, por favor, o seu nome completo e a sua data de nascimento."),
    ).toBe(true);
  });
  test("texto sem pedido de dados não conta", () => {
    expect(pedeDadosDoPaciente("A consulta custa R$ 120,00 em dinheiro.")).toBe(false);
    expect(pedeDadosDoPaciente("Nome completo do exame: USG de abdome.")).toBe(false);
  });
});

describe("promessa de transferência sem execução", () => {
  test("não envia aviso interno e sinaliza a promessa", () => {
    const r = protegerEfeitosDaResposta(
      "A consulta com a Dra. Paciente Teste acontece às segundas, das 08:00 às 12:00.\n\nPara verificar as vagas, vou transferir você para a nossa equipe de agendamento. Só um momento, por favor!",
      { handoffConfirmado: false, bloqueioIdentificacao: false },
    );
    expect(r.transferenciaPrometida).toBe(true);
    expect(r.texto).toBe(
      "A consulta com a Dra. Paciente Teste acontece às segundas, das 08:00 às 12:00.",
    );
    expect(r.texto).not.toContain("ainda não foi realizado");
  });
});
