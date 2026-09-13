/**
 * FASE 3 — encadeamento real da decisão de envio.
 *
 * A nota NÃO é fornecida: cada cenário roda o motor sobre o texto candidato e
 * o resultado atravessa etapa de ativação, conformidade com as instruções
 * publicadas, regra de baixa confiabilidade e saída controlada.
 *
 * Em homologação, nenhuma porta com efeito real (transferência, atribuição de
 * atendente, fila) pode ser chamada — isso é conferido em todos os cenários.
 */
import { describe, expect, test } from "bun:test";
import {
  executarCadeiaDeEnvio,
  portasSemEfeitoReal,
  type ChamadaRegistrada,
  type EntradaCadeia,
  type ResultadoCadeia,
} from "./fase3-cadeia-real";
import { AVISO_ENCAMINHAMENTO_HUMANO } from "./baixa-confiabilidade";
import type { EtapaAtivacao } from "./etapas";

const PUBLICADO = `APRESENTAÇÃO

Na primeira resposta de uma nova sessão, cumprimente e apresente-se brevemente usando a identidade configurada.

Se a pessoa já fez uma pergunta, apresente-se e responda à pergunta na mesma mensagem. Não acrescente "Como posso ajudar?" quando ela já explicou o que precisa.

Nas mensagens seguintes, continue o atendimento sem repetir a apresentação.

PREÇOS

Informe valores somente com base no catálogo publicado.`;

const APRESENTACAO =
  "Olá! Sou a Nina, assistente virtual da Policlínica Menino Jesus. Como posso ajudar?";

async function cadeia(
  over: Partial<EntradaCadeia> & { registro?: ChamadaRegistrada[] },
): Promise<ResultadoCadeia> {
  const registro = over.registro ?? [];
  return executarCadeiaDeEnvio({
    publicado: PUBLICADO,
    mensagemPaciente: "oi",
    candidata: APRESENTACAO,
    etapa: "B",
    ambiente: "homologacao",
    apresentacaoJaFeita: false,
    portas: portasSemEfeitoReal(registro),
    ...over,
  });
}

/** Homologação nunca aciona pessoa: nenhuma porta com efeito real usada. */
function semEfeitoReal(r: ResultadoCadeia) {
  expect(r.chamadasComEfeitoReal).toEqual([]);
}

describe("FASE 3 — saudação em nova sessão atravessa a cadeia e é entregue", () => {
  for (const mensagem of ["oi", "bom dia", "oi boa tarde"]) {
    test(`"${mensagem}" — nota do motor, sem bloqueio e sem encaminhamento`, async () => {
      const r = await cadeia({ mensagemPaciente: mensagem });

      expect(r.tipoTurno).toBe("SAUDACAO");
      // Nota calculada pelo motor, não fornecida pelo teste.
      expect(r.score).toBe(100);
      expect(r.nivel).toBe("HIGH");
      expect(r.decisaoMotor).toBe("ALLOW");
      expect(r.cobertura).toBe(100);
      expect(r.regrasDesconhecidas).toEqual([]);

      expect(r.conformidade.estado).toBe("nao_aplicavel");
      expect(r.bloqueio.bloquear).toBe(false);
      expect(r.saidaControlada).toBeNull();
      expect(r.entregouCandidata).toBe(true);
      expect(r.mensagemFinal).toBe(APRESENTACAO);
      // A apresentação saiu de fato: só então greeting_completed é marcado.
      expect(r.apresentacaoMarcada).toBe(true);
      semEfeitoReal(r);
    });
  }

  for (const etapa of ["A", "B", "C", "D"] as EtapaAtivacao[]) {
    test(`etapa ${etapa} — "oi boa tarde" continua entregue`, async () => {
      const r = await cadeia({ mensagemPaciente: "oi boa tarde", etapa });
      expect(r.nivel).toBe("HIGH");
      expect(r.entregouCandidata).toBe(true);
      semEfeitoReal(r);
    });
  }
});

describe("FASE 3 — saudação em conversa existente respeita a regra publicada", () => {
  test("repetir a apresentação é descumprimento e não é entregue", async () => {
    const r = await cadeia({ apresentacaoJaFeita: true });

    expect(r.conformidade.estado).toBe("descumprida");
    expect(r.conformidade.bloqueante).toBe(true);
    expect(r.bloqueio.bloquear).toBe(true);
    expect(r.bloqueio.impedimentoSaudacao).toBe("CONFORMIDADE_BLOQUEANTE");
    expect(r.entregouCandidata).toBe(false);
    expect(r.apresentacaoMarcada).toBe(false);
    semEfeitoReal(r);
  });

  test("continuar o atendimento sem repetir a apresentação é entregue", async () => {
    const r = await cadeia({
      apresentacaoJaFeita: true,
      candidata: "Bom dia! Em que posso ajudar hoje?",
    });

    expect(r.conformidade.estado).toBe("cumprida");
    expect(r.bloqueio.bloquear).toBe(false);
    expect(r.entregouCandidata).toBe(true);
    // A apresentação já era feita: nada a marcar neste turno.
    expect(r.apresentacaoMarcada).toBe(false);
    semEfeitoReal(r);
  });
});

describe("FASE 3 — a proteção continua valendo dentro de uma saudação", () => {
  test("saudação que inventa preço não é entregue", async () => {
    const r = await cadeia({
      candidata: "Olá! Sou a Nina. A consulta custa R$ 250,00.",
    });

    expect(r.nivel).toBe("LOW");
    expect(r.bloqueio.bloquear).toBe(true);
    expect(r.bloqueio.impedimentoSaudacao).toBe("AFIRMACAO_SEM_FONTE");
    expect(r.entregouCandidata).toBe(false);
    expect(r.apresentacaoMarcada).toBe(false);
    semEfeitoReal(r);
  });

  test("saudação que confirma ação inexistente não é entregue", async () => {
    const r = await cadeia({
      candidata: "Olá! Sou a Nina. Já confirmei seu agendamento para amanhã às 10h.",
    });

    expect(r.nivel).toBe("LOW");
    // A data relativa com hora agora é reconhecida: sem evidência da agenda,
    // a saudação continua bloqueada e não ganha uma exceção social.
    expect(r.avaliacao.claims?.semEvidencia.some((c) => c.tipo === "disponibilidade")).toBe(true);
    expect(r.bloqueio.bloquear).toBe(true);
    expect(r.bloqueio.impedimentoSaudacao).toBe("AFIRMACAO_SEM_FONTE");
    expect(r.entregouCandidata).toBe(false);
    semEfeitoReal(r);
  });

  test("regra publicada aplicável e não verificável não libera pela exceção social", async () => {
    const r = await cadeia({
      mensagemPaciente: "oi, quanto custa a consulta?",
      candidata: "Olá! Sou a Nina. Sobre a consulta, posso verificar para você.",
    });

    // Turno deixa de ser saudação pura; a conformidade não pôde ser conferida.
    expect(r.tipoTurno).not.toBe("SAUDACAO");
    expect(["nao_verificada", "descumprida", "falha_na_interpretacao"]).toContain(
      r.conformidade.estado,
    );
    if (r.nivel === "LOW") {
      expect(r.bloqueio.bloquear).toBe(true);
      expect(r.bloqueio.impedimentoSaudacao).not.toBeNull();
      expect(r.entregouCandidata).toBe(false);
    }
    semEfeitoReal(r);
  });
});

describe("FASE 3 — pedido de pessoa: homologação simula, produção encaminha", () => {
  const pedido = {
    mensagemPaciente: "oi, quero falar com uma pessoa",
    intencoes: ["falar_humano"] as const,
  };

  test("homologação reconhece o pedido e NÃO executa transferência real", async () => {
    const r = await cadeia({ ...pedido, intencoes: [...pedido.intencoes] });

    expect(r.tipoTurno).toBe("HANDOFF");
    expect(r.bloqueio.bloquear).toBe(true);
    expect(r.saidaControlada?.encaminhamento).toBe("simulado");
    expect(r.saidaControlada?.encaminhamentoConfirmado).toBe(false);
    expect(r.entregouCandidata).toBe(false);
    expect(r.apresentacaoMarcada).toBe(false);
    // Nenhuma atribuição de atendente, nenhuma fila, nenhuma transferência.
    semEfeitoReal(r);
  });

  test("produção encaminha de verdade, com dependências isoladas", async () => {
    const r = await cadeia({
      ...pedido,
      intencoes: [...pedido.intencoes],
      ambiente: "producao",
    });

    expect(r.saidaControlada?.encaminhamento).toBe("real_confirmado");
    expect(r.saidaControlada?.encaminhamentoConfirmado).toBe(true);
    expect(r.mensagemFinal).toBe(AVISO_ENCAMINHAMENTO_HUMANO);
    expect(r.chamadasComEfeitoReal.map((c) => c.porta)).toEqual([
      "solicitarAtendenteHumano",
      "atribuirAtendente",
      "entrarNaFila",
    ]);
  });

  test("produção com transferência indisponível não afirma que alguém assumiu", async () => {
    const registro: ChamadaRegistrada[] = [];
    const r = await executarCadeiaDeEnvio({
      publicado: PUBLICADO,
      mensagemPaciente: pedido.mensagemPaciente,
      intencoes: [...pedido.intencoes],
      candidata: APRESENTACAO,
      etapa: "B",
      ambiente: "producao",
      apresentacaoJaFeita: false,
      portas: {
        ...portasSemEfeitoReal(registro),
        solicitarAtendenteHumano: async () => ({ success: false, erro: "handoff_indisponivel" }),
      },
    });

    expect(r.saidaControlada?.encaminhamento).toBe("real_falhou");
    expect(r.saidaControlada?.encaminhamentoConfirmado).toBe(false);
  });
});

describe("FASE 3 — greeting_completed acompanha o que saiu", () => {
  test("apresentação substituída por saída controlada não marca a apresentação", async () => {
    const r = await cadeia({
      candidata: "Olá! Sou a Nina. A consulta custa R$ 250,00.",
    });

    expect(r.mensagemFinal).not.toBe(r.avaliacao.textoAvaliadoHash);
    expect(r.entregouCandidata).toBe(false);
    expect(r.apresentacaoMarcada).toBe(false);
  });

  test("mensagem final exibida é coerente com o rastreio da decisão", async () => {
    const r = await cadeia({ candidata: "Olá! Sou a Nina. A consulta custa R$ 250,00." });

    expect(r.motivoDecisao).toContain(String(r.bloqueio.motivo ?? ""));
    expect(r.motivoDecisao).toContain("simulado");
    expect(r.mensagemFinal).toBe(r.saidaControlada?.aviso ?? "");
  });
});
