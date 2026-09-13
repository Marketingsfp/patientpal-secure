/**
 * FASE 6 — MATRIZ DE ACEITE INTEGRADO (A–T).
 *
 * Usa a cadeia REAL: prompt de 23 regras → contrato → contexto → avaliação
 * regra a regra → nota/cobertura → decisão final → fila/aviso → auditoria.
 * Nenhuma nota é fabricada: score, nível e decisão vêm das funções do motor.
 * Só as dependências EXTERNAS (fila, aviso, persistência) são substituídas.
 */
import { describe, expect, it } from "bun:test";
import { PROMPT_CANDIDATO_23_REGRAS } from "./fixtures/prompt-23-regras";
import {
  executarTurnoIntegrado,
  type EntradaTurnoIntegrado,
  type ResultadoTurnoIntegrado,
} from "./fase6-cadeia-integrada";
import {
  repositorioEmMemoria,
  type PortasSaida,
  type RegistroEncaminhamento,
  type ResultadoFila,
} from "./saida-final";
import {
  lowSegueFluxoReal,
  planoDeReversao,
  reconciliarEncaminhamentos,
  resolverMotorAtivo,
  type Prontidao,
} from "./fase6-ativacao";
import { AVISO_ENCAMINHAMENTO_HUMANO } from "./baixa-confiabilidade";
import { apurarEfeitoFinal, lerModoHistorico, ordemValida } from "./fase5-eventos";
import { hashDoTexto } from "./hash";

const PROMPT = PROMPT_CANDIDATO_23_REGRAS;

type Chamada = { porta: string; arg: unknown };

function portasReais(
  over: Partial<{
    fila: (e: unknown) => Promise<ResultadoFila>;
    consulta: (e: unknown) => Promise<ResultadoFila>;
    aviso: (e: unknown) => Promise<{ ok: boolean; erro?: string | null }>;
  }> = {},
): { portas: PortasSaida; chamadas: Chamada[] } {
  const chamadas: Chamada[] = [];
  const portas: PortasSaida = {
    entrarNaFilaHumana: async (e) => {
      chamadas.push({ porta: "entrarNaFilaHumana", arg: e });
      return over.fila ? over.fila(e) : { confirmado: true, comprovante: `fila-${e.conversaId}` };
    },
    consultarFila: async (e) => {
      chamadas.push({ porta: "consultarFila", arg: e });
      return over.consulta ? over.consulta(e) : { confirmado: false };
    },
    enviarAviso: async (e) => {
      chamadas.push({ porta: "enviarAviso", arg: e });
      return over.aviso ? over.aviso(e) : { ok: true };
    },
  };
  return { portas, chamadas };
}

type Ajustes = Partial<EntradaTurnoIntegrado> & {
  mensagemPaciente: string;
  candidato: string;
};

async function turno(a: Ajustes): Promise<ResultadoTurnoIntegrado> {
  return executarTurnoIntegrado({
    conversaId: a.conversaId ?? "conv-fase6",
    turnoId: a.turnoId ?? "turno-1",
    promptPublicado: a.promptPublicado ?? PROMPT,
    versaoPrompt: a.versaoPrompt ?? "v-teste-1",
    ambiente: a.ambiente ?? "producao",
    repositorio: a.repositorio ?? repositorioEmMemoria(),
    portas: a.portas === undefined ? portasReais().portas : a.portas,
    ...a,
  } as EntradaTurnoIntegrado);
}

const SAUDACAO_OK = "Olá! Aqui é a Nina, da Menino Jesus. Como posso ajudar você hoje?";

const SESSAO_NOVA = {
  primeiraResposta: true,
  apresentacaoEntregue: false,
  sessaoEmAndamento: false,
};

describe("FASE 6 — A/B/C: saudação, pedido junto e continuidade", () => {
  it("A. 'oi', 'bom dia' e 'oi boa tarde' em sessão nova: apresentação sem falso LOW", async () => {
    for (const msg of ["oi", "bom dia", "oi boa tarde"]) {
      const r = await turno({
        mensagemPaciente: msg,
        candidato: SAUDACAO_OK,
        contexto: SESSAO_NOVA,
      });
      expect(r.pontuacao).not.toBeNull();
      expect(r.pontuacao!.nivel).not.toBe("LOW");
      expect(r.pontuacao!.bloqueadores).toEqual([]);
      expect(r.saida.desfecho).toBe("ENTREGUE");
      expect(r.saida.candidatoEntregue).toBe(true);
      expect(r.saida.apresentacaoConcluida).toBe(true);
      expect(r.saida.encaminhamento).toBeNull();
    }
  });

  it("B. saudação com pergunta de preço: atende o pedido citando a fonte consultada", async () => {
    const r = await turno({
      mensagemPaciente: "Bom dia, qual o valor do ultrassom de abdome?",
      candidato:
        "Bom dia! Aqui é a Nina, da Menino Jesus. O ultrassom de abdome total é R$ 250,00 no particular.",
      contexto: {
        ...SESSAO_NOVA,
        fatosOficiais: [{ fonte: "catalogo", campo: "usg_abdome", valor: "250.00" }],
        ferramentas: [
          { nome: "catalogo_precos", executada: true, ok: true, referencia: "fict-proc-usg-abdome" },
        ],
        afirmacoes: [
          {
            id: "af-1",
            texto: "R$ 250,00",
            tipo: "preco",
            entidade: "ultrassom de abdome total",
            condicao: "particular",
            comFonte: true,
            fonte: "catalogo:fict-proc-usg-abdome",
          },
        ],
      },
    });
    expect(r.contexto.pedido.saudacaoSimples).toBe(false);
    expect(r.pontuacao!.nivel).not.toBe("LOW");
    expect(r.saida.candidatoEntregue).toBe(true);
  });

  it("C. sessão já apresentada: saudação não reinicia a sessão", async () => {
    const r = await turno({
      mensagemPaciente: "oi",
      candidato: "Oi! Em que posso ajudar?",
      contexto: {
        primeiraResposta: false,
        apresentacaoEntregue: true,
        sessaoEmAndamento: true,
      },
    });
    expect(r.contexto.estadoSessao.apresentacaoEntregue).toBe(true);
    expect(r.saida.apresentacaoConcluida).toBe(false);
    expect(r.pontuacao!.nivel).not.toBe("LOW");
  });
});

describe("FASE 6 — D/E/F: identidade, aplicabilidade e linguagem", () => {
  it("D. identidade alterada só na Arquitetura: a identidade nova é a verificada", async () => {
    const outroPrompt = PROMPT.replace("Nome da atendente virtual: Nina", "Nome da atendente virtual: Aurora")
      .replace("Nome do estabelecimento: Menino Jesus", "Nome do estabelecimento: Clínica Vida")
      .replace("Tipo do estabelecimento: Policlínica", "Tipo do estabelecimento: Clínica");

    const nova = await turno({
      promptPublicado: outroPrompt,
      mensagemPaciente: "oi",
      candidato: "Olá! Aqui é a Aurora, da Clínica Vida. Como posso ajudar?",
      contexto: SESSAO_NOVA,
    });
    expect(nova.identidade).toEqual({
      assistente: "Aurora",
      estabelecimento: "Clínica Vida",
      tipoEstabelecimento: "Clínica",
    });
    expect(nova.saida.candidatoEntregue).toBe(true);

    const antiga = await turno({
      promptPublicado: outroPrompt,
      mensagemPaciente: "oi",
      candidato: SAUDACAO_OK,
      contexto: SESSAO_NOVA,
    });
    expect(antiga.saida.candidatoEntregue).toBe(false);
  });

  it("E. condição comprovadamente falsa vira não aplicável; condição não compreendida fica UNKNOWN", async () => {
    const r = await turno({
      mensagemPaciente: "oi",
      candidato: SAUDACAO_OK,
      contexto: SESSAO_NOVA,
    });
    const naoAplicaveis = r.avaliacao!.resultados.filter((x) => x.status === "NOT_APPLICABLE");
    expect(naoAplicaveis.length).toBeGreaterThan(0);
    for (const x of naoAplicaveis) expect(x.aplicabilidade).toBe("falsa");

    // Em produção a condição "em homologação" é comprovadamente falsa.
    const teste01 = r.avaliacao!.resultados.find((x) => x.identificador === "TESTE-01");
    expect(teste01?.status).toBe("NOT_APPLICABLE");

    // Sem ambiente confiável, a mesma condição fica indeterminada (UNKNOWN).
    const semSinal = await turno({
      mensagemPaciente: "",
      candidato: SAUDACAO_OK,
      contexto: { primeiraResposta: null, apresentacaoEntregue: null, sessaoEmAndamento: null },
    });
    const unknowns = semSinal.avaliacao!.resultados.filter((x) => x.status === "UNKNOWN");
    expect(unknowns.length).toBeGreaterThan(0);
    for (const x of unknowns) expect(x.nota).toBeNull();
  });

  it("F. só orientação de linguagem indeterminada não gera LOW com o substantivo verificado", async () => {
    const r = await turno({
      mensagemPaciente: "oi",
      candidato: SAUDACAO_OK,
      contexto: SESSAO_NOVA,
      opcoesAvaliacao: {
        verificadores: {
          "LING-01": () => ({
            status: "UNKNOWN",
            motivo: "ORIENTACAO_NAO_VERIFICAVEL",
            nota: null,
          }),
          "CONV-04": () => ({
            status: "UNKNOWN",
            motivo: "ORIENTACAO_NAO_VERIFICAVEL",
            nota: null,
          }),
        },
      },
    });
    expect(r.avaliacao!.essencialDescumprida).toBe(false);
    expect(r.pontuacao!.nivel).not.toBe("LOW");
    expect(r.saida.candidatoEntregue).toBe(true);
  });
});

describe("FASE 6 — G/H/I/J: bloqueios substantivos", () => {
  it("G. preço sem fonte: bloqueio preservado e encaminhamento real", async () => {
    const { portas, chamadas } = portasReais();
    const r = await turno({
      mensagemPaciente: "qual o valor do ultrassom?",
      candidato: "O ultrassom de abdome custa R$ 180,00.",
      portas,
      contexto: {
        primeiraResposta: false,
        apresentacaoEntregue: true,
        sessaoEmAndamento: true,
        afirmacoes: [
          { id: "af-1", texto: "R$ 180,00", tipo: "preco", comFonte: false, fonte: null },
        ],
      },
    });
    expect(r.pontuacao!.bloqueadores).toContain("AFIRMACAO_SEM_FONTE");
    expect(r.pontuacao!.nivel).toBe("LOW");
    expect(r.saida.desfecho).toBe("BLOQUEADO_ENCAMINHADO");
    expect(r.saida.mensagemEnviada).toBe(AVISO_ENCAMINHAMENTO_HUMANO);
    expect(chamadas.filter((c) => c.porta === "entrarNaFilaHumana")).toHaveLength(1);
    expect(chamadas.filter((c) => c.porta === "enviarAviso")).toHaveLength(1);
  });

  it("H. mesma fonte, preço certo e errado: cobertura completa não aprova fato errado", async () => {
    const base = {
      mensagemPaciente: "quanto custa o ultrassom de abdome?",
      contexto: {
        primeiraResposta: false,
        apresentacaoEntregue: true,
        sessaoEmAndamento: true,
        fatosOficiais: [{ fonte: "catalogo", campo: "usg_abdome", valor: "250.00" }],
      },
    };
    const certo = await turno({
      ...base,
      candidato: "O ultrassom de abdome total é R$ 250,00.",
      contexto: {
        ...base.contexto,
        afirmacoes: [
          { id: "af-1", texto: "R$ 250,00", tipo: "preco", comFonte: true, fonte: "catalogo" },
        ],
      },
    });
    const errado = await turno({
      ...base,
      candidato: "O ultrassom de abdome total é R$ 120,00.",
      contexto: {
        ...base.contexto,
        afirmacoes: [
          { id: "af-1", texto: "R$ 120,00", tipo: "preco", comFonte: false, fonte: "catalogo" },
        ],
      },
    });
    expect(certo.saida.candidatoEntregue).toBe(true);
    expect(errado.saida.candidatoEntregue).toBe(false);
    expect(errado.pontuacao!.bloqueadores).toContain("AFIRMACAO_SEM_FONTE");
  });

  it("I. coleta legítima segue; execução sem requisitos é impedida", async () => {
    const coleta = await turno({
      mensagemPaciente: "quero agendar",
      candidato: "Claro. Pode me informar seu nome completo e a data de nascimento?",
      contexto: {
        primeiraResposta: false,
        apresentacaoEntregue: true,
        sessaoEmAndamento: true,
        operacao: {
          tipo: "agendamento",
          anunciadaNaResposta: false,
          executada: false,
          resultado: null,
          comprovante: null,
          dadosPendentes: ["nome", "nascimento"],
        },
      },
    });
    expect(coleta.pontuacao!.segurancaAcao.estado).toBe("em_coleta");
    expect(coleta.saida.candidatoEntregue).toBe(true);

    const inventada = await turno({
      mensagemPaciente: "quero agendar",
      candidato: "Pronto, seu agendamento está confirmado para quinta-feira às 9h.",
      contexto: {
        primeiraResposta: false,
        apresentacaoEntregue: true,
        sessaoEmAndamento: true,
        operacao: {
          tipo: "agendamento",
          anunciadaNaResposta: true,
          executada: false,
          resultado: null,
          comprovante: null,
          dadosPendentes: ["nome"],
        },
      },
    });
    expect(inventada.pontuacao!.bloqueadores.length).toBeGreaterThan(0);
    expect(inventada.saida.candidatoEntregue).toBe(false);
  });

  it("J. uma afirmação correta não compensa outra sem prova", async () => {
    const r = await turno({
      mensagemPaciente: "quanto custa e qual horário tem?",
      candidato: "O ultrassom é R$ 250,00 e temos vaga amanhã às 14h.",
      contexto: {
        primeiraResposta: false,
        apresentacaoEntregue: true,
        sessaoEmAndamento: true,
        afirmacoes: [
          { id: "af-1", texto: "R$ 250,00", tipo: "preco", comFonte: true, fonte: "catalogo" },
          { id: "af-2", texto: "amanhã às 14h", tipo: "horario", comFonte: false, fonte: null },
        ],
      },
    });
    expect(r.pontuacao!.bloqueadores).toContain("AFIRMACAO_SEM_FONTE");
    expect(r.saida.candidatoEntregue).toBe(false);
  });
});

describe("FASE 6 — K/L/M: reescrita, falha de correção e frase de encaminhamento", () => {
  it("K. LOW produzido depois da reescrita bloqueia e vai para a fila humana", async () => {
    const { portas, chamadas } = portasReais();
    const r = await turno({
      mensagemPaciente: "qual o preço?",
      candidato: "O exame custa R$ 99,00.",
      textoFinal: "O exame custa R$ 99,00.",
      portas,
      contexto: {
        primeiraResposta: false,
        apresentacaoEntregue: true,
        sessaoEmAndamento: true,
        afirmacoes: [
          { id: "af-1", texto: "R$ 99,00", tipo: "preco", comFonte: false, fonte: null },
        ],
      },
    });
    expect(r.pontuacao!.nivel).toBe("LOW");
    expect(r.saida.desfecho).toBe("BLOQUEADO_ENCAMINHADO");
    expect(chamadas.filter((c) => c.porta === "entrarNaFilaHumana")).toHaveLength(1);
  });

  it("L. texto mudou depois da avaliação: nada é entregue sem nova avaliação", async () => {
    const r = await turno({
      mensagemPaciente: "oi",
      candidato: SAUDACAO_OK,
      textoFinal: "Olá! Aqui é a Nina. O exame custa R$ 42,00.",
      contexto: SESSAO_NOVA,
    });
    expect(r.hashAvaliado).not.toBe(r.hashTextoFinal);
    expect(r.saida.desfecho).toBe("REAVALIAR_TEXTO");
    expect(r.saida.candidatoEntregue).toBe(false);
    expect(r.explicacao.identidade.correspondencia.confere).toBe(false);
    expect(r.eventos.some((ev) => ev.tipo === "correcao_de_texto")).toBe(true);
  });

  it("M. frase de encaminhamento escrita pelo modelo não dispensa a entrada na fila", async () => {
    const { portas, chamadas } = portasReais();
    const r = await turno({
      mensagemPaciente: "qual o preço?",
      candidato: "Vou transferir você para um atendente, que já vai assumir. O exame custa R$ 55,00.",
      portas,
      contexto: {
        primeiraResposta: false,
        apresentacaoEntregue: true,
        sessaoEmAndamento: true,
        afirmacoes: [
          { id: "af-1", texto: "R$ 55,00", tipo: "preco", comFonte: false, fonte: null },
        ],
      },
    });
    expect(r.saida.candidatoEntregue).toBe(false);
    expect(chamadas.filter((c) => c.porta === "entrarNaFilaHumana")).toHaveLength(1);
    expect(r.saida.encaminhamento?.comprovanteFila).toBe("fila-conv-fase6");
    expect(r.saida.mensagemEnviada).toBe(AVISO_ENCAMINHAMENTO_HUMANO);
  });
});

describe("FASE 6 — N/O/P/Q: ambiente, idempotência e falhas", () => {
  it("N. pedido explícito de pessoa em homologação: zero efeito operacional", async () => {
    const repo = repositorioEmMemoria();
    const r = await turno({
      ambiente: "homologacao",
      portas: null,
      repositorio: repo,
      mensagemPaciente: "quero falar com um atendente",
      candidato: "Vou verificar com a equipe.",
      pedidoDeHumano: true,
      contexto: {
        primeiraResposta: false,
        apresentacaoEntregue: true,
        sessaoEmAndamento: true,
      },
    });
    expect(r.saida.desfecho).toBe("BLOQUEADO_SIMULADO");
    expect(r.saida.encaminhamento?.simulado).toBe(true);
    expect(r.saida.encaminhamento?.comprovanteFila).toBeNull();
    expect(repo.todos().every((x) => x.simulado)).toBe(true);

    await expect(
      turno({
        ambiente: "homologacao",
        portas: portasReais().portas,
        mensagemPaciente: "quero falar com um atendente",
        candidato: "ok",
      }),
    ).rejects.toThrow("homologacao_nao_pode_receber_portas_reais");
  });

  it("O. LOW em produção sem atendente online: uma entrada em fila e um aviso", async () => {
    const { portas, chamadas } = portasReais({
      fila: async () => ({ confirmado: true, comprovante: "protocolo-7", atendenteId: null }),
    });
    const r = await turno({
      mensagemPaciente: "qual o preço?",
      candidato: "O exame custa R$ 77,00.",
      portas,
      contexto: {
        primeiraResposta: false,
        apresentacaoEntregue: true,
        sessaoEmAndamento: true,
        afirmacoes: [
          { id: "af-1", texto: "R$ 77,00", tipo: "preco", comFonte: false, fonte: null },
        ],
      },
    });
    expect(r.saida.encaminhamento?.etapa).toBe("fila_confirmada");
    expect(r.saida.encaminhamento?.atendenteId).toBeNull();
    expect(chamadas.filter((c) => c.porta === "entrarNaFilaHumana")).toHaveLength(1);
    expect(chamadas.filter((c) => c.porta === "enviarAviso")).toHaveLength(1);
  });

  it("P. mensagem repetida no mesmo turno: sem duplicar fila nem aviso", async () => {
    const { portas, chamadas } = portasReais();
    const repo = repositorioEmMemoria();
    const entrada = {
      mensagemPaciente: "qual o preço?",
      candidato: "O exame custa R$ 88,00.",
      portas,
      repositorio: repo,
      contexto: {
        primeiraResposta: false,
        apresentacaoEntregue: true,
        sessaoEmAndamento: true,
        afirmacoes: [
          { id: "af-1", texto: "R$ 88,00", tipo: "preco", comFonte: false, fonte: null },
        ],
      },
    } satisfies Ajustes;

    await turno(entrada);
    await turno(entrada);

    expect(chamadas.filter((c) => c.porta === "entrarNaFilaHumana")).toHaveLength(1);
    expect(chamadas.filter((c) => c.porta === "enviarAviso")).toHaveLength(1);
    expect(repo.todos()).toHaveLength(1);
  });

  it("P2. falha de fila não vira sucesso e o aviso não é enviado", async () => {
    const { portas, chamadas } = portasReais({
      fila: async () => ({ confirmado: false, erro: "banco_indisponivel" }),
    });
    const r = await turno({
      mensagemPaciente: "qual o preço?",
      candidato: "O exame custa R$ 66,00.",
      portas,
      contexto: {
        primeiraResposta: false,
        apresentacaoEntregue: true,
        sessaoEmAndamento: true,
        afirmacoes: [
          { id: "af-1", texto: "R$ 66,00", tipo: "preco", comFonte: false, fonte: null },
        ],
      },
    });
    expect(r.saida.desfecho).toBe("BLOQUEADO_ENCAMINHAMENTO_PENDENTE");
    expect(r.saida.encaminhamento?.etapa).toBe("falhou");
    expect(r.saida.encaminhamento?.erro).toBe("banco_indisponivel");
    expect(chamadas.filter((c) => c.porta === "enviarAviso")).toHaveLength(0);
  });

  it("Q. falha de verificador vira UNKNOWN sem aprovação, e falha de telemetria não libera LOW", async () => {
    const comFalha = await turno({
      mensagemPaciente: "oi",
      candidato: SAUDACAO_OK,
      contexto: SESSAO_NOVA,
      opcoesAvaliacao: {
        verificadores: {
          "CONF-01": () => {
            throw new Error("verificador_fora_do_ar");
          },
        },
      },
    });
    const conf01 = comFalha.avaliacao!.resultados.find((x) => x.identificador === "CONF-01");
    expect(conf01?.status).toBe("UNKNOWN");
    expect(conf01?.falhaTecnica).toBe(true);
    expect(conf01?.nota).toBeNull();

    const { portas, chamadas } = portasReais();
    const comTelemetriaQuebrada = await turno({
      mensagemPaciente: "qual o preço?",
      candidato: "O exame custa R$ 44,00.",
      portas,
      telemetria: () => {
        throw new Error("telemetria_fora_do_ar");
      },
      contexto: {
        primeiraResposta: false,
        apresentacaoEntregue: true,
        sessaoEmAndamento: true,
        afirmacoes: [
          { id: "af-1", texto: "R$ 44,00", tipo: "preco", comFonte: false, fonte: null },
        ],
      },
    });
    expect(comTelemetriaQuebrada.saida.erroTelemetria).not.toBeNull();
    expect(comTelemetriaQuebrada.saida.candidatoEntregue).toBe(false);
    expect(chamadas.filter((c) => c.porta === "entrarNaFilaHumana")).toHaveLength(1);
  });
});

describe("FASE 6 — R/S/T: versões, marcador literal e histórico", () => {
  it("R. publicação durante o turno não mistura versões", () => {
    const prontidao: Prontidao = {
      contrato: true,
      calculo: true,
      gate: true,
      envio: true,
      auditoria: true,
    };
    const r = resolverMotorAtivo({
      motorConfigurado: "novo",
      modo: "aplicacao",
      ambiente: "producao",
      prontidao,
      versaoPromptDoTurno: "v-10",
      versaoPromptVigenteAgora: "v-11",
      configIdDoTurno: "cfg-a",
      configIdVigenteAgora: "cfg-b",
      etapaLegada: "C",
    });
    expect(r.publicacaoDuranteOTurno).toBe(true);
    expect(r.versaoUsadaNoTurno).toBe("v-10");
    expect(r.configIdUsadoNoTurno).toBe("cfg-a");
    expect(r.motorAtivo).toBe("novo");
    expect(r.etapaLegadaIgnorada).toBe("C");
  });

  it("R2. motor incompleto ou em observação não executa: um único motor decide", () => {
    const incompleto = resolverMotorAtivo({
      motorConfigurado: "novo",
      modo: "aplicacao",
      ambiente: "producao",
      prontidao: { contrato: true, calculo: true, gate: false, envio: true, auditoria: false },
      versaoPromptDoTurno: "v-10",
    });
    expect(incompleto.motorAtivo).toBe("legado");
    expect(incompleto.motorNovoSomenteRegistrado).toBe(true);
    expect(incompleto.faltantes).toEqual(["gate", "auditoria"]);

    const observacao = resolverMotorAtivo({
      motorConfigurado: "novo",
      modo: "observacao",
      ambiente: "producao",
      prontidao: { contrato: true, calculo: true, gate: true, envio: true, auditoria: true },
      versaoPromptDoTurno: "v-10",
    });
    expect(observacao.motorAtivo).toBe("legado");
    expect(observacao.executaEfeitos).toBe(false);
    expect(lowSegueFluxoReal(observacao, "producao")).toBe(false);

    const ativo = resolverMotorAtivo({
      motorConfigurado: "novo",
      modo: "aplicacao",
      ambiente: "producao",
      prontidao: { contrato: true, calculo: true, gate: true, envio: true, auditoria: true },
      versaoPromptDoTurno: "v-10",
    });
    expect(lowSegueFluxoReal(ativo, "producao")).toBe(true);
    expect(lowSegueFluxoReal(ativo, "homologacao")).toBe(false);
  });

  it("S. marcador literal: entrada exata e ambiente correto, sem valor fixo no código", async () => {
    const exato = await turno({
      ambiente: "homologacao",
      portas: null,
      mensagemPaciente: "verificar fonte 9381",
      candidato: "9381",
      contexto: { primeiraResposta: false, apresentacaoEntregue: true, sessaoEmAndamento: true },
    });
    const regraExata = exato.avaliacao!.resultados.find((x) => x.identificador === "TESTE-01");
    expect(regraExata?.status).toBe("PASS");

    const caixaDiferente = await turno({
      ambiente: "homologacao",
      portas: null,
      mensagemPaciente: "Verificar Fonte 9381 por favor",
      candidato: "9381",
      contexto: { primeiraResposta: false, apresentacaoEntregue: true, sessaoEmAndamento: true },
    });
    expect(caixaDiferente.avaliacao!.resultados.find((x) => x.identificador === "TESTE-01")?.status).toBe(
      "NOT_APPLICABLE",
    );

    const emProducao = await turno({
      mensagemPaciente: "verificar fonte 9381",
      candidato: "9381",
      contexto: { primeiraResposta: false, apresentacaoEntregue: true, sessaoEmAndamento: true },
    });
    expect(emProducao.avaliacao!.resultados.find((x) => x.identificador === "TESTE-01")?.status).toBe(
      "NOT_APPLICABLE",
    );

    // Trocar o marcador no prompt prova que 9381 não está fixo no código.
    const outroMarcador = PROMPT.replace(/9381/g, "5127");
    const comOutro = await turno({
      promptPublicado: outroMarcador,
      ambiente: "homologacao",
      portas: null,
      mensagemPaciente: "verificar fonte 5127",
      candidato: "5127",
      contexto: { primeiraResposta: false, apresentacaoEntregue: true, sessaoEmAndamento: true },
    });
    expect(comOutro.avaliacao!.resultados.find((x) => x.identificador === "TESTE-01")?.status).toBe(
      "PASS",
    );
  });

  it("T. histórico: observação e simulação não viram efeito real, e a ordem é preservada", async () => {
    const { portas } = portasReais();
    const r = await turno({
      mensagemPaciente: "qual o preço?",
      candidato: "O exame custa R$ 33,00.",
      portas,
      contexto: {
        primeiraResposta: false,
        apresentacaoEntregue: true,
        sessaoEmAndamento: true,
        afirmacoes: [
          { id: "af-1", texto: "R$ 33,00", tipo: "preco", comFonte: false, fonte: null },
        ],
      },
    });
    expect(ordemValida(r.eventos)).toBe(true);
    expect(r.eventos.map((e) => e.tipo)).toContain("operacao_fila");
    expect(apurarEfeitoFinal(r.eventos)).toBe("fila_confirmada");

    const enviada = r.eventos.find((e) => e.tipo === "saida_enviada");
    expect(enviada?.conteudo).toBe(AVISO_ENCAMINHAMENTO_HUMANO);
    expect(enviada?.dados["notaDaMensagem"]).toBeNull();
    expect(enviada?.dados["notaDoCandidato"]).toBe(r.pontuacao!.notaFinal);
    expect(enviada?.hashConteudo).toBe(hashDoTexto(AVISO_ENCAMINHAMENTO_HUMANO));

    const historicoErrado = lerModoHistorico("shadow", "fila_confirmada", "producao");
    expect(historicoErrado.inconsistente).toBe(true);
    expect(historicoErrado.observacaoTecnica).not.toBeNull();
  });
});

describe("FASE 6 — ativação, reversão e reconciliação", () => {
  it("reconcilia fila e avisos em andamento sem duplicar na troca de versão", () => {
    const base = {
      conversaId: "c1",
      turnoId: "t1",
      ambiente: "producao" as const,
      atendenteId: null,
      erro: null,
      simulado: false,
      atualizadoEm: "2026-01-01T00:00:00.000Z",
    };
    const registros: RegistroEncaminhamento[] = [
      { ...base, chave: "k1", etapa: "fila_confirmada", comprovanteFila: "p1", aviso: "enviado" },
      { ...base, chave: "k1", etapa: "fila_confirmada", comprovanteFila: "p1", aviso: "enviado" },
      { ...base, chave: "k2", etapa: "fila_confirmada", comprovanteFila: "p2", aviso: "pendente" },
      { ...base, chave: "k3", etapa: "encaminhamento_pendente", comprovanteFila: null, aviso: "pendente" },
      { ...base, chave: "k4", etapa: "falhou", comprovanteFila: null, aviso: "pendente" },
    ];
    const r = reconciliarEncaminhamentos(registros);
    expect(r.concluidos).toEqual(["k1"]);
    expect(r.avisosPendentes).toEqual(["k2"]);
    expect(r.retomar).toEqual(["k3"]);
    expect(r.falhados).toEqual(["k4"]);
    expect(r.duplicadasEvitadas).toBe(1);
  });

  it("reversão é rastreável e não desfaz atendimento real", () => {
    const p = planoDeReversao({
      de: { motor: "novo", versaoPrompt: "v-11", configId: "cfg-b" },
      para: { motor: "legado", versaoPrompt: "v-10", configId: "cfg-a" },
      motivo: "regressão observada em produção",
      registradoEm: "2026-02-01T12:00:00.000Z",
    });
    expect(p.preservaHistorico).toBe(true);
    expect(p.desfazAtendimentos).toBe(false);
    expect(p.de.versaoPrompt).toBe("v-11");
    expect(p.para.versaoPrompt).toBe("v-10");
  });
});
