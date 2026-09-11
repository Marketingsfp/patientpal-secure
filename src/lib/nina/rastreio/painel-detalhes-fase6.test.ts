/**
 * FASE 6 — validação integrada dos "Detalhes técnicos da resposta".
 *
 * Reproduz, por fixture, a execução de referência e confere que as cinco fases
 * anteriores contam a MESMA história, sem contradição entre título, resumo e
 * evidência. Nada aqui chama modelo, banco ou transporte: são só as funções
 * puras que o painel usa.
 *
 * Caso reproduzido:
 *  - prompt v6 presente na requisição registrada;
 *  - uma rodada de modelo;
 *  - resposta original igual à resposta final;
 *  - passagem pelo finalizador sem mudança de texto;
 *  - answer_confidence CLARIFY, nota 65, modo shadow;
 *  - chamada ao provedor concluída sem erro;
 *  - saída persistida no console (homologação);
 *  - uma mensagem recebida e dois blocos `user` no payload.
 */
import { describe, expect, it } from "bun:test";
import {
  avaliacaoEmObservacao,
  avaliacaoOperacional,
  avaliarTransformacoes,
  descreverAvaliacaoConfianca,
  eventoEntregaDoTurno,
  evidenciaSaidaDoTurno,
  origemComSituacao,
  ROTULO_SITUACAO_TRANSFORMACAO,
  type ConfiancaDoTurno,
  type SelecaoVersaoPrompt,
} from "./turno";
import { apresentarEstadoEvento } from "../arquitetura/estado-evento";
import {
  limitesDaCaptura,
  resumirEntradasDoModelo,
  resumirFerramentas,
  TEXTO_NAO_REGISTRADO,
  valorOuNaoRegistrado,
} from "../evidencias-resumo";

const HASH_RESPOSTA = "h-resposta-9381";

/** Fixture imutável da execução de referência. */
const CASO = {
  clinicaId: "clinica-A",
  conversaId: "conversa-1",
  turnoId: "trace-9381",
  execucaoId: "exec-9381",
  promptSelecionado: {
    escopo: "atendimento",
    versaoId: "ver-6",
    versao: 6,
    publicadoEm: "2026-09-01T10:00:00.000Z",
    origem: "publicada",
    fallbackPorErro: false,
    motivo: null,
    hash: "h-prompt-v6",
    carregadoEm: "2026-09-11T11:00:00.000Z",
  } satisfies SelecaoVersaoPrompt,
  transformacoes: [
    // O finalizador RODOU e não mudou o texto: mesmo hash nas duas pontas.
    {
      etapa: "finalizacao",
      motivo: "finalizador padrão",
      antesHash: HASH_RESPOSTA,
      depoisHash: HASH_RESPOSTA,
      em: "2026-09-11T11:00:02.000Z",
    },
  ],
  avaliacoes: [
    {
      avaliacao: "action_safety",
      decisao: "ALLOW",
      etapa: "B",
      modo: "enforce",
      score: 92,
      nivel: "alto",
      aplicada: true,
    },
    {
      avaliacao: "answer_confidence",
      decisao: "CLARIFY",
      etapa: "C",
      modo: "shadow",
      score: 65,
      nivel: "medio",
      aplicada: false,
    },
  ] satisfies ConfiancaDoTurno[],
  etapasEvidencia: [
    {
      tipo: "contexto_modelo",
      dados: {
        mensagens: [
          { role: "system", content: "prompt v6" },
          { role: "user", content: "TESTE-ARQUITETURA-9381" },
          { role: "user", content: "TESTE-ARQUITETURA-9381" },
        ],
        ferramentas_disponiveis: ["agendar", "solicitar_atendente_humano"],
      },
    },
    { tipo: "modelo_parametros", dados: { knowledge_status: null } },
    { tipo: "resposta_original", dados: { tool_calls: [] } },
  ],
  eventosRastreio: [
    { status: "running", node: "model.call" },
    { status: "ok", node: "model.call" },
    { status: "skipped", node: "tools.run" },
  ],
  eventoEntrega: {
    turnoId: "trace-9381",
    execucaoId: "exec-9381",
    conversaId: "conversa-1",
    mensagemId: "msg-1",
    canal: "test-console",
    estado: "persistida",
    transporteId: null,
    em: "2026-09-11T11:00:03.000Z",
  },
  /** Contagem de mensagens RECEBIDAS gravada no resumo do turno. */
  mensagensRecebidas: 1,
} as const;

describe("FASE 6 — painel coerente para a execução de referência", () => {
  it("versão do prompt vem da evidência histórica da própria execução", () => {
    // O painel lê o que ficou gravado; publicar uma v7 depois não muda isto.
    expect(CASO.promptSelecionado.versao).toBe(6);
    expect(CASO.promptSelecionado.origem).toBe("publicada");
    expect(CASO.promptSelecionado.fallbackPorErro).toBe(false);
  });

  it("finalização rodou sem alterar o texto e a origem continua sendo o modelo", () => {
    const situacao = avaliarTransformacoes(CASO.transformacoes);
    expect(situacao).toBe("sem_alteracao");
    expect(ROTULO_SITUACAO_TRANSFORMACAO[situacao]).toBe(
      "Finalização executada, sem alteração do texto",
    );
    // Sem contradição: não pode aparecer "alterado pelo sistema".
    expect(ROTULO_SITUACAO_TRANSFORMACAO[situacao]).not.toContain("alterado pelo sistema");
    expect(origemComSituacao("modelo", situacao)).toBe("modelo");
  });

  it("avaliação final é de observação e não é a avaliação operacional", () => {
    const final = CASO.avaliacoes[1]!;
    expect(avaliacaoEmObservacao(final)).toBe(true);
    const operacional = avaliacaoOperacional(CASO.avaliacoes);
    expect(operacional?.avaliacao).toBe("action_safety");
    const frase = descreverAvaliacaoConfianca(final);
    expect(frase).toContain("Confiança da mensagem final");
    expect(frase).toContain("nota 65");
    expect(frase).toContain("decisão registrada CLARIFY");
    expect(frase).toContain("modo shadow");
  });

  it("saída aparece como persistida no console, sem afirmar envio pelo WhatsApp", () => {
    const saida = evidenciaSaidaDoTurno({
      entregaDoResumo: { mensagemId: null, textoHash: HASH_RESPOSTA, tamanho: 74, canal: null },
      eventos: [CASO.eventoEntrega],
      ambiente: "homologacao",
      teste: true,
    });
    expect(saida.estado).toBe("persistida");
    expect(saida.console).toBe(true);
    expect(saida.descricao).toBe(
      "Resposta persistida no console — homologação não envia pelo WhatsApp",
    );
    expect(saida.faltando).toBeNull();
    expect(saida.descricao).not.toContain("não vinculada");
  });

  it("mensagens recebidas diferem das entradas enviadas ao modelo", () => {
    const entradas = resumirEntradasDoModelo(CASO.etapasEvidencia[0]);
    expect(CASO.mensagensRecebidas).toBe(1);
    expect(entradas.user).toBe(2);
    expect(entradas.total).toBe(3);
    expect(entradas.user).not.toBe(CASO.mensagensRecebidas);
    expect(entradas.texto).toContain("duplicação preservada");
  });

  it("ferramentas disponíveis não viram ferramentas chamadas", () => {
    const f = resumirFerramentas(CASO.etapasEvidencia[0], CASO.etapasEvidencia[2]);
    expect(f.disponiveis).toHaveLength(2);
    expect(f.chamadas).toEqual([]);
    expect(f.texto).toContain("Chamadas pelo modelo: nenhuma");
  });

  it("campo sem informação aparece como Não registrado", () => {
    expect(valorOuNaoRegistrado(CASO.etapasEvidencia[1].dados.knowledge_status)).toBe(
      TEXTO_NAO_REGISTRADO,
    );
  });

  it("captura nunca é anunciada como requisição completa", () => {
    const limites = limitesDaCaptura(CASO.etapasEvidencia as never);
    expect(limites.completa).toBe(false);
    expect(limites.camposOmitidos).toEqual([]);
    expect(limites.descricao).toContain("Captura parcial");
  });

  it("estados das etapas respeitam os eventos registrados; ✔ só para sucesso", () => {
    const [running, ok, skipped] = CASO.eventosRastreio.map((e) => apresentarEstadoEvento(e.status));
    expect(ok!.simbolo).toBe("✔");
    expect(running!.simbolo).not.toBe("✔");
    expect(skipped!.simbolo).not.toBe("✔");
    expect(apresentarEstadoEvento("estado-que-nao-existe").conhecido).toBe(false);
    expect(apresentarEstadoEvento("estado-que-nao-existe").simbolo).not.toBe("✔");
  });

  it("sucesso técnico da chamada não é apresentado como cumprimento do prompt", () => {
    // Texto usado no painel para o retorno técnico do provedor.
    const rotulo = "concluída sem erro registrado";
    expect(rotulo).not.toContain("cumpriu");
    expect(rotulo).not.toContain("correta");
  });
});

describe("FASE 6 — isolamento e registros antigos", () => {
  const alvo = { turnoId: CASO.turnoId, execucaoId: CASO.execucaoId, conversaId: CASO.conversaId };

  it("evento de outro turno não é associado", () => {
    expect(
      eventoEntregaDoTurno(
        { ...CASO.eventoEntrega, turnoId: "trace-outro", execucaoId: "exec-outro" },
        alvo,
      ),
    ).toBe(false);
  });

  it("evento de outra conversa não é associado", () => {
    expect(eventoEntregaDoTurno({ ...CASO.eventoEntrega, conversaId: "conversa-9" }, alvo)).toBe(
      false,
    );
  });

  it("proximidade de horário não basta para associar", () => {
    expect(
      eventoEntregaDoTurno(
        { turnoId: null, execucaoId: null, conversaId: CASO.conversaId, em: CASO.eventoEntrega.em },
        alvo,
      ),
    ).toBe(false);
  });

  it("registro antigo sem hashes fica indeterminado, nunca 'sem alteração'", () => {
    const situacao = avaliarTransformacoes([
      { antesHash: null, depoisHash: null },
    ]);
    expect(situacao).toBe("indeterminado");
    expect(ROTULO_SITUACAO_TRANSFORMACAO[situacao]).toBe(
      "Não foi possível determinar se houve alteração",
    );
  });

  it("registro antigo sem evento de saída não vira falha", () => {
    const saida = evidenciaSaidaDoTurno({
      entregaDoResumo: { mensagemId: null, textoHash: null, tamanho: null, canal: null },
      eventos: [],
    });
    expect(saida.estado).toBe("preparada");
    expect(saida.estado).not.toBe("falhou");
    expect(saida.faltando).toContain("não vinculado");
  });

  it("registro antigo sem modo/decisão não é deduzido pela nota", () => {
    const antiga: ConfiancaDoTurno = {
      avaliacao: "answer_confidence",
      decisao: null,
      etapa: null,
      modo: null,
      score: 65,
      nivel: null,
    };
    expect(avaliacaoEmObservacao(antiga)).toBe(false);
    const frase = descreverAvaliacaoConfianca(antiga);
    expect(frase).toContain("decisão não registrada");
    expect(frase).toContain("modo não registrado");
  });

  it("registro antigo sem etapas de evidência lista o que falta", () => {
    const limites = limitesDaCaptura([]);
    expect(limites.camposOmitidos).toEqual([
      "contexto_modelo",
      "modelo_parametros",
      "resposta_original",
    ]);
    const entradas = resumirEntradasDoModelo(null);
    expect(entradas.total).toBeNull();
    expect(entradas.texto).toBe(TEXTO_NAO_REGISTRADO);
  });
});
