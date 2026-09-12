/**
 * VERIFICAÇÃO PEDIDA APÓS A CORREÇÃO DO CASO "saudação virou encaminhamento".
 *
 * Percorre o caminho real, do texto publicado até a decisão de envio, em
 * AMBIENTE DE HOMOLOGAÇÃO e sem provedor vivo:
 *
 *   texto publicado → extrairRegrasPublicadas → InstructionComplianceValidator
 *   → conformidadeDasInstrucoes → decidirEntregaPorConformidade → desfecho.
 *
 * Dois cenários:
 *
 *  1. nova sessão com APENAS uma saudação ("ola bom dia"): a apresentação com
 *     "Como posso ajudar?" tem de ser ENTREGUE — sem bloqueio, sem pedido de
 *     reescrita e sem desfecho humano;
 *  2. falha da reescrita (provedor indisponível, `correcaoDisponivel: false`):
 *     a saudação válida continua entregue — a falha da reescrita não existe
 *     para ela, porque nada bloqueou. E quando o bloqueio é real (regra de
 *     teste v6, descumprida de fato), a homologação não anuncia transferência
 *     concluída: o aviso é o simulado e `encaminhamentoConfirmado` é `false`.
 */
import { describe, expect, it } from "bun:test";

import { extrairRegrasPublicadas } from "./regras-publicadas";
import { InstructionComplianceValidator } from "./obrigacoes";
import {
  conformidadeDasInstrucoes,
  decidirEntregaPorConformidade,
  VALIDADOR_INSTRUCOES,
} from "./conformidade-entrega";
import {
  saidaControladaBaixaConfianca,
  AVISO_ENCAMINHAMENTO_HUMANO,
  AVISO_ENCAMINHAMENTO_SIMULADO,
} from "./baixa-confiabilidade";
import type { ResultadoConfianca } from "./types";

const TEXTO_APRESENTACAO = `APRESENTAÇÃO

Na primeira resposta de uma nova sessão, cumprimente e apresente-se brevemente usando a identidade configurada.

Se a pessoa já fez uma pergunta, apresente-se e responda à pergunta na mesma mensagem. Não acrescente “Como posso ajudar?” quando ela já explicou o que precisa.

Nas mensagens seguintes, continue o atendimento sem repetir a apresentação.`;

const TEXTO_V6 = `TESTE TEMPORÁRIO DE FONTE DO PROMPT — HOMOLOGAÇÃO

Somente quando a mensagem recebida do paciente for EXATAMENTE:

TESTE-ARQUITETURA-9381

responda EXATAMENTE:

ARQUITETURA_CONFIRMADA_9381

Não acrescente saudação, emoji, explicação, pergunta, despedida ou qualquer
outro texto nessa resposta específica.`;

const APRESENTACAO =
  "Olá! Sou a Nina, assistente virtual da Policlínica Menino Jesus. Como posso ajudar?";

/** Roda o turno em homologação e devolve a decisão de envio. */
function turnoHomologacao(params: {
  publicado: string;
  mensagemPaciente: string;
  resposta: string;
  correcaoDisponivel?: boolean;
}) {
  const { regras } = extrairRegrasPublicadas(params.publicado, {
    escopo: "whatsapp",
    hash: "H",
  });
  const validador = InstructionComplianceValidator({
    mensagemPaciente: params.mensagemPaciente,
    draftText: params.resposta,
    instrucoes: { hash: "H", regras },
    businessContext: { ambiente: "homologacao" },
  } as never);
  const avaliacao = {
    score: 92,
    level: "HIGH",
    decision: "ALLOW",
    validators: [{ ...validador, validator: VALIDADOR_INSTRUCOES }],
  } as unknown as ResultadoConfianca;
  const conformidade = conformidadeDasInstrucoes(avaliacao);
  const decisao = decidirEntregaPorConformidade({
    conformidade,
    tentativa: 0,
    limiteTentativas: 2,
    correcaoDisponivel: params.correcaoDisponivel,
  });
  return { validador, conformidade, decisao };
}

describe("homologação — nova sessão só com saudação", () => {
  it("apresentação com “Como posso ajudar?” é entregue, sem bloqueio nem reescrita", () => {
    const { validador, conformidade, decisao } = turnoHomologacao({
      publicado: TEXTO_APRESENTACAO,
      mensagemPaciente: "ola bom dia",
      resposta: APRESENTACAO,
    });

    expect(validador.status).not.toBe("FAIL");
    expect(conformidade.bloqueante).toBe(false);
    expect(conformidade.violacoes).toEqual([]);
    expect(decisao.entregar).toBe(true);
    expect(decisao.corrigir).toBe(false);
    expect(decisao.desfechoHumano).toBe(false);
  });

  it("com a reescrita indisponível, a saudação válida continua entregue", () => {
    const { decisao } = turnoHomologacao({
      publicado: TEXTO_APRESENTACAO,
      mensagemPaciente: "ola bom dia",
      resposta: APRESENTACAO,
      correcaoDisponivel: false,
    });

    // Nada bloqueou, então a falha da reescrita não muda o desfecho: o texto
    // do modelo vai ao paciente, e não um aviso de encaminhamento.
    expect(decisao.entregar).toBe(true);
    expect(decisao.desfechoHumano).toBe(false);
  });
});

describe("homologação — falha da reescrita em bloqueio real", () => {
  it("bloqueio legítimo sem reescrita vai ao desfecho, sem anunciar transferência concluída", () => {
    const { conformidade, decisao } = turnoHomologacao({
      publicado: TEXTO_V6,
      mensagemPaciente: "TESTE-ARQUITETURA-9381",
      resposta: "Olá! ARQUITETURA_CONFIRMADA_9381",
      correcaoDisponivel: false,
    });

    expect(conformidade.bloqueante).toBe(true);
    expect(decisao.entregar).toBe(false);
    expect(decisao.corrigir).toBe(false);
    expect(decisao.desfechoHumano).toBe(true);

    // Em homologação ninguém é acionado: o aviso diz isso e não afirma
    // encaminhamento concluído.
    const saida = saidaControladaBaixaConfianca({ tipo: "simulado" });
    expect(saida.aviso).toBe(AVISO_ENCAMINHAMENTO_SIMULADO);
    expect(saida.aviso).not.toBe(AVISO_ENCAMINHAMENTO_HUMANO);
    expect(saida.encaminhamentoConfirmado).toBe(false);
  });

  it("encaminhamento real não confirmado também não anuncia transferência feita", () => {
    const saida = saidaControladaBaixaConfianca({
      tipo: "real",
      confirmado: false,
      erro: "handoff_indisponivel",
    });
    expect(saida.aviso).not.toBe(AVISO_ENCAMINHAMENTO_HUMANO);
    expect(saida.encaminhamentoConfirmado).toBe(false);
  });
});
