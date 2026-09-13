/**
 * FASE 4 — aceite da decisão final única e do encaminhamento de LOW.
 *
 * Usa a avaliação (Fase 2) e a pontuação (Fase 3) reais; só os adaptadores
 * externos (fila, aviso, telemetria) são isolados. Nenhum paciente ou
 * atendente real é usado.
 */
import { describe, expect, it } from "bun:test";
import { PROMPT_CANDIDATO_23_REGRAS } from "./fixtures/prompt-23-regras";
import { compilarContratoRegras } from "./contrato-regras";
import { montarContextoCanonico, type EntradaContextoCanonico } from "./contexto-canonico";
import { avaliarContrato } from "./avaliacao-regras";
import { configuracaoPadrao } from "./configuracao";
import { pontuarContrato } from "./pontuacao-contrato";
import {
  AVISO_ENCAMINHAMENTO_HUMANO,
  AVISO_ENCAMINHAMENTO_SIMULADO,
} from "./baixa-confiabilidade";
import {
  chaveIdempotente,
  decidirSaidaFinal,
  explicarSaidaFinal,
  repositorioEmMemoria,
  type PortasSaida,
  type ResultadoFila,
} from "./saida-final";

const contrato = compilarContratoRegras(PROMPT_CANDIDATO_23_REGRAS, {
  escopo: "homologacao",
  versao: "candidato-1",
  versaoId: "v1",
});
const CFG = configuracaoPadrao();

function pontuar(e: EntradaContextoCanonico) {
  const avaliacao = avaliarContrato(
    contrato,
    montarContextoCanonico({ identidadePublicada: contrato.identidade, ...e }),
  );
  return pontuarContrato({ avaliacao, configuracao: CFG });
}

const SAUDACAO_BOA: EntradaContextoCanonico = {
  mensagemRecebida: "oi",
  candidato: "Oi! Sou a Nina, da Policlínica Menino Jesus. Como posso ajudar?",
  ambiente: "homologacao",
  primeiraResposta: true,
  apresentacaoEntregue: false,
};

const SAUDACAO_LOW: EntradaContextoCanonico = {
  ...SAUDACAO_BOA,
  candidato: "Oi! Sou a Carla, da Clínica Vida Nova. Como posso ajudar?",
};

type Registro = { porta: string; chave: string }[];

function portasReais(
  registro: Registro,
  opcoes: { fila?: ResultadoFila[]; avisoOk?: boolean; consulta?: ResultadoFila } = {},
): PortasSaida {
  const fila = [...(opcoes.fila ?? [{ confirmado: true, comprovante: "fila-1" }])];
  return {
    entrarNaFilaHumana: async ({ chave }) => {
      registro.push({ porta: "entrarNaFilaHumana", chave });
      return fila.shift() ?? { confirmado: true, comprovante: "fila-1" };
    },
    consultarFila: async ({ chave }) => {
      registro.push({ porta: "consultarFila", chave });
      return opcoes.consulta ?? { confirmado: false };
    },
    enviarAviso: async ({ chave }) => {
      registro.push({ porta: "enviarAviso", chave });
      return opcoes.avisoOk === false
        ? { ok: false, erro: "transporte_indisponivel" }
        : { ok: true };
    },
  };
}

const BASE = {
  conversaId: "conv-teste",
  turnoId: "turno-1",
  hashAvaliado: "h1",
  hashTextoFinal: "h1",
};

describe("1. LOW final em produção: uma entrada na fila e um aviso", () => {
  it("encaminha uma única vez e avisa sem prometer atendente", async () => {
    const reg: Registro = [];
    const s = await decidirSaidaFinal({
      ...BASE,
      ambiente: "producao",
      textoFinal: SAUDACAO_LOW.candidato!,
      pontuacao: pontuar(SAUDACAO_LOW),
      repositorio: repositorioEmMemoria(),
      portas: portasReais(reg),
    });
    expect(s.nivelCandidato).toBe("LOW");
    expect(s.desfecho).toBe("BLOQUEADO_ENCAMINHADO");
    expect(s.candidatoEntregue).toBe(false);
    expect(reg.filter((r) => r.porta === "entrarNaFilaHumana")).toHaveLength(1);
    expect(reg.filter((r) => r.porta === "enviarAviso")).toHaveLength(1);
    expect(s.mensagemEnviada).toBe(AVISO_ENCAMINHAMENTO_HUMANO);
    expect(s.mensagemEnviada).not.toMatch(/assumiu|j[áa] est[áa] com voc[êe]|em \d+ minutos/i);
    expect(s.encaminhamento?.etapa).toBe("fila_confirmada");
    expect(s.avisoHerdaNota).toBe(false);
    expect(s.iaPausada).toBe(true);
  });

  it("não marca apresentação concluída quando o candidato foi descartado", async () => {
    const s = await decidirSaidaFinal({
      ...BASE,
      ambiente: "producao",
      textoFinal: SAUDACAO_LOW.candidato!,
      pontuacao: pontuar(SAUDACAO_LOW),
      candidatoTemApresentacao: true,
      repositorio: repositorioEmMemoria(),
      portas: portasReais([]),
    });
    expect(s.apresentacaoConcluida).toBe(false);
  });
});

describe("2. decisão final prevalece sobre recomendações intermediárias", () => {
  it("recomendação de continuar saudação não entrega um LOW", async () => {
    const s = await decidirSaidaFinal({
      ...BASE,
      ambiente: "producao",
      textoFinal: SAUDACAO_LOW.candidato!,
      pontuacao: pontuar(SAUDACAO_LOW),
      recomendacoesIntermediarias: ["GREETING", "ALLOW"],
      repositorio: repositorioEmMemoria(),
      portas: portasReais([]),
    });
    expect(s.candidatoEntregue).toBe(false);
    expect(s.divergenciaComRecomendacao).toBe(true);
    expect(explicarSaidaFinal(s)).toContain("recomendacoes=GREETING|ALLOW");
  });
});

describe("3. texto reescrito é reavaliado antes da entrega", () => {
  it("hash diferente não entrega nem encaminha às cegas", async () => {
    const s = await decidirSaidaFinal({
      ...BASE,
      hashTextoFinal: "h2",
      ambiente: "producao",
      textoFinal: "texto reescrito",
      pontuacao: pontuar(SAUDACAO_BOA),
      repositorio: repositorioEmMemoria(),
      portas: portasReais([]),
    });
    expect(s.desfecho).toBe("REAVALIAR_TEXTO");
    expect(s.candidatoEntregue).toBe(false);
  });

  it("LOW depois da reescrita tem o mesmo destino obrigatório", async () => {
    const reg: Registro = [];
    const s = await decidirSaidaFinal({
      ...BASE,
      hashAvaliado: "h2",
      hashTextoFinal: "h2",
      ambiente: "producao",
      textoFinal: SAUDACAO_LOW.candidato!,
      pontuacao: pontuar(SAUDACAO_LOW),
      repositorio: repositorioEmMemoria(),
      portas: portasReais(reg),
    });
    expect(s.desfecho).toBe("BLOQUEADO_ENCAMINHADO");
    expect(reg.some((r) => r.porta === "entrarNaFilaHumana")).toBe(true);
  });
});

describe("4. texto do modelo nunca comprova encaminhamento", () => {
  it("frase de aviso gerada pelo modelo não dispensa a operação", async () => {
    const reg: Registro = [];
    const s = await decidirSaidaFinal({
      ...BASE,
      ambiente: "producao",
      textoFinal: `${AVISO_ENCAMINHAMENTO_HUMANO} Enquanto isso, o hemograma custa R$ 90,00.`,
      pontuacao: pontuar({
        ...SAUDACAO_LOW,
        candidato: `${AVISO_ENCAMINHAMENTO_HUMANO} Enquanto isso, o hemograma custa R$ 90,00.`,
      }),
      repositorio: repositorioEmMemoria(),
      portas: portasReais(reg),
    });
    expect(reg.filter((r) => r.porta === "entrarNaFilaHumana")).toHaveLength(1);
    expect(s.encaminhamento?.comprovanteFila).toBe("fila-1");
  });

  it("aviso de homologação dentro do candidato não simula comprovação", async () => {
    const s = await decidirSaidaFinal({
      ...BASE,
      ambiente: "homologacao",
      textoFinal: `${AVISO_ENCAMINHAMENTO_SIMULADO} e mais um texto qualquer`,
      pontuacao: pontuar({
        ...SAUDACAO_LOW,
        candidato: `${AVISO_ENCAMINHAMENTO_SIMULADO} e mais um texto qualquer`,
      }),
      repositorio: repositorioEmMemoria(),
      portas: null,
    });
    expect(s.encaminhamento?.simulado).toBe(true);
    expect(s.encaminhamento?.etapa).toBe("encaminhamento_pendente");
    expect(s.encaminhamento?.comprovanteFila ?? null).toBeNull();
  });
});

describe("5. concorrência, retry, timeout e falhas de infraestrutura", () => {
  it("mensagens concorrentes do mesmo turno geram uma fila só", async () => {
    const reg: Registro = [];
    const repositorio = repositorioEmMemoria();
    const portas = portasReais(reg);
    const pontuacao = pontuar(SAUDACAO_LOW);
    const entrada = {
      ...BASE,
      ambiente: "producao" as const,
      textoFinal: SAUDACAO_LOW.candidato!,
      pontuacao,
      repositorio,
      portas,
    };
    await decidirSaidaFinal(entrada);
    await decidirSaidaFinal(entrada);
    expect(reg.filter((r) => r.porta === "entrarNaFilaHumana")).toHaveLength(1);
    expect(reg.filter((r) => r.porta === "enviarAviso")).toHaveLength(1);
  });

  it("timeout consulta o estado antes de repetir e não duplica", async () => {
    const reg: Registro = [];
    const s = await decidirSaidaFinal({
      ...BASE,
      ambiente: "producao",
      textoFinal: SAUDACAO_LOW.candidato!,
      pontuacao: pontuar(SAUDACAO_LOW),
      repositorio: repositorioEmMemoria(),
      portas: portasReais(reg, {
        fila: [{ confirmado: false, timeout: true }],
        consulta: { confirmado: true, comprovante: "fila-existente" },
      }),
    });
    expect(reg.map((r) => r.porta)).toEqual([
      "entrarNaFilaHumana",
      "consultarFila",
      "enviarAviso",
    ]);
    expect(s.encaminhamento?.comprovanteFila).toBe("fila-existente");
  });

  it("falha de fila não é registrada como sucesso", async () => {
    const repositorio = repositorioEmMemoria();
    const reg: Registro = [];
    const s = await decidirSaidaFinal({
      ...BASE,
      ambiente: "producao",
      textoFinal: SAUDACAO_LOW.candidato!,
      pontuacao: pontuar(SAUDACAO_LOW),
      repositorio,
      portas: portasReais(reg, { fila: [{ confirmado: false, erro: "banco_indisponivel" }] }),
    });
    expect(s.desfecho).toBe("BLOQUEADO_ENCAMINHAMENTO_PENDENTE");
    expect(s.encaminhamento?.etapa).toBe("falhou");
    expect(s.encaminhamento?.erro).toBe("banco_indisponivel");
    expect(s.candidatoEntregue).toBe(false);
    expect(reg.some((r) => r.porta === "enviarAviso")).toBe(false);
  });

  it("falha no envio do aviso não duplica a transferência", async () => {
    const reg: Registro = [];
    const repositorio = repositorioEmMemoria();
    const entrada = {
      ...BASE,
      ambiente: "producao" as const,
      textoFinal: SAUDACAO_LOW.candidato!,
      pontuacao: pontuar(SAUDACAO_LOW),
      repositorio,
      portas: portasReais(reg, { avisoOk: false }),
    };
    await decidirSaidaFinal(entrada);
    const s = await decidirSaidaFinal(entrada);
    expect(reg.filter((r) => r.porta === "entrarNaFilaHumana")).toHaveLength(1);
    expect(s.encaminhamento?.aviso).toBe("falhou");
    expect(s.encaminhamento?.etapa).toBe("fila_confirmada");
  });

  it("falha de telemetria não libera o LOW nem impede a fila", async () => {
    const reg: Registro = [];
    const s = await decidirSaidaFinal({
      ...BASE,
      ambiente: "producao",
      textoFinal: SAUDACAO_LOW.candidato!,
      pontuacao: pontuar(SAUDACAO_LOW),
      repositorio: repositorioEmMemoria(),
      portas: portasReais(reg),
      telemetria: () => {
        throw new Error("telemetria_fora");
      },
    });
    expect(s.candidatoEntregue).toBe(false);
    expect(s.erroTelemetria).toBe("telemetria_fora");
    expect(reg.some((r) => r.porta === "entrarNaFilaHumana")).toBe(true);
  });

  it("falha total de avaliação é estado técnico próprio, não HIGH nem LOW calculado", async () => {
    const s = await decidirSaidaFinal({
      ...BASE,
      ambiente: "producao",
      textoFinal: "qualquer texto",
      pontuacao: null,
      falhaDeAvaliacao: { ocorreu: true, detalhe: "motor_indisponivel" },
      repositorio: repositorioEmMemoria(),
      portas: portasReais([]),
    });
    expect(s.desfecho).toBe("BLOQUEADO_FALHA_DE_AVALIACAO");
    expect(s.nivelCandidato).toBeNull();
    expect(s.candidatoEntregue).toBe(false);
    expect(s.encaminhamento?.chave).toContain("falha_tecnica_de_avaliacao");
  });
});

describe("6. conversa já com humano", () => {
  it("não duplica encaminhamento nem reativa a IA", async () => {
    const reg: Registro = [];
    const s = await decidirSaidaFinal({
      ...BASE,
      ambiente: "producao",
      textoFinal: SAUDACAO_LOW.candidato!,
      pontuacao: pontuar(SAUDACAO_LOW),
      jaComHumano: true,
      repositorio: repositorioEmMemoria(),
      portas: portasReais(reg),
    });
    expect(reg).toHaveLength(0);
    expect(s.mensagemEnviada).toBeNull();
    expect(s.iaPausada).toBe(true);
  });
});

describe("7. HIGH/MEDIUM sem motivo de humano não são transferidos", () => {
  it("saudação adequada é entregue e marca a apresentação", async () => {
    const reg: Registro = [];
    const s = await decidirSaidaFinal({
      ...BASE,
      ambiente: "producao",
      textoFinal: SAUDACAO_BOA.candidato!,
      pontuacao: pontuar(SAUDACAO_BOA),
      candidatoTemApresentacao: true,
      repositorio: repositorioEmMemoria(),
      portas: portasReais(reg),
    });
    expect(s.desfecho).toBe("ENTREGUE");
    expect(s.mensagemEnviada).toBe(SAUDACAO_BOA.candidato!);
    expect(s.apresentacaoConcluida).toBe(true);
    expect(reg).toHaveLength(0);
  });

  it("pedido explícito de pessoa entra na fila mesmo com nota alta", async () => {
    const reg: Registro = [];
    const s = await decidirSaidaFinal({
      ...BASE,
      ambiente: "producao",
      textoFinal: SAUDACAO_BOA.candidato!,
      pontuacao: pontuar(SAUDACAO_BOA),
      pedidoDeHumano: true,
      repositorio: repositorioEmMemoria(),
      portas: portasReais(reg),
    });
    expect(s.desfecho).toBe("BLOQUEADO_ENCAMINHADO");
    expect(s.encaminhamento?.chave).toBe(
      chaveIdempotente({
        conversaId: BASE.conversaId,
        turnoId: BASE.turnoId,
        solicitacao: "pedido_explicito_de_pessoa",
      }),
    );
  });
});

describe("8. homologação: zero chamadas com efeito real", () => {
  it("LOW em homologação só registra simulação", async () => {
    const s = await decidirSaidaFinal({
      ...BASE,
      ambiente: "homologacao",
      textoFinal: SAUDACAO_LOW.candidato!,
      pontuacao: pontuar(SAUDACAO_LOW),
      repositorio: repositorioEmMemoria(),
      portas: null,
    });
    expect(s.desfecho).toBe("BLOQUEADO_SIMULADO");
    expect(s.mensagemEnviada).toBe(AVISO_ENCAMINHAMENTO_SIMULADO);
    expect(s.encaminhamento?.simulado).toBe(true);
    expect(s.iaPausada).toBe(false);
  });

  it("pedido explícito de pessoa em homologação também não transfere", async () => {
    const s = await decidirSaidaFinal({
      ...BASE,
      ambiente: "homologacao",
      textoFinal: SAUDACAO_BOA.candidato!,
      pontuacao: pontuar(SAUDACAO_BOA),
      pedidoDeHumano: true,
      repositorio: repositorioEmMemoria(),
      portas: null,
    });
    expect(s.encaminhamento?.simulado).toBe(true);
    expect(s.encaminhamento?.comprovanteFila ?? null).toBeNull();
  });

  it("adaptador real oferecido em homologação é recusado", async () => {
    await expect(
      decidirSaidaFinal({
        ...BASE,
        ambiente: "homologacao",
        textoFinal: SAUDACAO_LOW.candidato!,
        pontuacao: pontuar(SAUDACAO_LOW),
        repositorio: repositorioEmMemoria(),
        portas: portasReais([]),
      }),
    ).rejects.toThrow("homologacao_nao_pode_receber_portas_reais");
  });
});
