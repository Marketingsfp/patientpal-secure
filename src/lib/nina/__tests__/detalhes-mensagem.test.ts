import { describe, expect, it } from "bun:test";
import { montarLeituraDetalhesMensagem, consolidarPassosDetalhes } from "../detalhes-mensagem";
import { pacoteMJ55 } from "./fixtures/detalhes-mj55";
import { hashDoTexto } from "../confidence/hash";

describe("leitura da mensagem persistida — MJ55", () => {
  it("exibe a bolha real e não o retorno vazio ou o desfecho do backend", () => {
    const r = montarLeituraDetalhesMensagem(pacoteMJ55);
    expect(r.mensagem?.texto).toBe(pacoteMJ55.mensagem?.body as string);
    expect(r.respostaOriginal).toContain("Sim, temos atendimento em Cardiologia");
    expect(r.respostaOriginal).not.toContain("HANDOFF_CONFIRMADO");
    expect(r.protocolo).toBe("MJ-55");
    expect(r.resultado).toContain("bloqueou uma resposta candidata");
    expect(r.mensagem?.entrega).toBe("registrada");
    expect(r.avaliacoes.find((a) => a.nota === 63)?.titulo).toBe("Confiança do texto bloqueado");
    expect(r.avaliacoes.some((a) => a.titulo === "Confiança desta mensagem")).toBe(false);
    expect(r.avaliacoes.flatMap((a) => a.motivos).join(" ")).not.toContain("INTENCAO_AMBIGUA");
    expect(r.passos.some((p) => p.estado === "em_andamento")).toBe(false);
    expect(r.passos.filter((p) => p.titulo === "Resposta do modelo")).toHaveLength(1);
    expect(r.passos.some((p) => p.titulo === "turn.summary")).toBe(false);
  });

  it("não inventa entrega na leitura legada por execução", () => {
    const r = montarLeituraDetalhesMensagem({
      ...pacoteMJ55,
      mensagem: null,
      avisos: [],
      vinculos: [],
    });
    expect(r.mensagem).toBeNull();
    expect(r.protocolo).toBeNull();
    expect(r.avaliacoes.some((a) => a.titulo === "Confiança desta mensagem")).toBe(false);
    expect(r.alertas.join(" ")).toContain("Mensagem não selecionada");
  });

  it("nota só pertence ao texto cuja representação e hash conferem", () => {
    const p = structuredClone(pacoteMJ55);
    p.avisos = [];
    p.eventos = [];
    p.decisoes = [
      { ...p.decisoes[1], score: 89, texto_final_hash: hashDoTexto(String(p.mensagem!.body)) },
    ];
    expect(montarLeituraDetalhesMensagem(p).avaliacoes[0]?.titulo).toBe("Confiança desta mensagem");
    p.decisoes[0]!.texto_final_hash = null;
    expect(montarLeituraDetalhesMensagem(p).avaliacoes[0]?.titulo).not.toBe(
      "Confiança desta mensagem",
    );
    p.decisoes[0]!.texto_final_hash = hashDoTexto(String(p.mensagem!.body));
    p.decisoes[0]!.representacao = "audio_resumo";
    expect(montarLeituraDetalhesMensagem(p).avaliacoes[0]?.titulo).not.toBe(
      "Confiança desta mensagem",
    );
  });

  it("filtra avaliações e avisos de outras clínicas e mensagens", () => {
    const p = structuredClone(pacoteMJ55);
    p.avisos = [{ ...p.avisos[0], mensagem_id: "outra-mensagem", protocolo: "NÃO MOSTRAR" }];
    p.eventos = [];
    p.decisoes = [{ ...p.decisoes[1], clinica_id: "outra-clinica", score: 100 }];
    const r = montarLeituraDetalhesMensagem(p);
    expect(r.protocolo).toBeNull();
    expect(r.avaliacoes).toHaveLength(0);
  });

  it("falha de entrega continua visível mesmo quando a mensagem é um aviso", () => {
    const p = structuredClone(pacoteMJ55);
    p.mensagem!.status = "failed";
    const r = montarLeituraDetalhesMensagem(p);
    expect(r.resultado).toBe("Falha registrada na entrega desta mensagem.");
    expect(r.mensagem?.entrega).toBe("falhou");
  });

  it("última revisão do gateway é identificada sem usar o desfecho como resposta", () => {
    const p = structuredClone(pacoteMJ55);
    p.etapas.push({
      tipo: "resposta_original",
      codigo: { funcao: "ninaAIGateway" },
      em: "2026-09-13T17:12:00Z",
      dados: { texto: "Texto revisado pelo modelo." },
    });
    const r = montarLeituraDetalhesMensagem(p);
    expect(r.respostaOriginal).toBe("Texto revisado pelo modelo.");
    expect(r.alertas.join(" ")).toContain("última registrada no gateway");
  });

  it("vínculo de outro conteúdo não transforma leitura confirmada em falha de entrega", () => {
    const p = structuredClone(pacoteMJ55);
    p.mensagem = {
      ...p.mensagem,
      is_teste: false,
      canal: "whatsapp",
      status: "read",
      body: "Mensagem que o paciente leu.",
    };
    p.vinculos[0] = { ...p.vinculos[0], estado: "falhou", texto_hash: "outro-conteudo" };
    const r = montarLeituraDetalhesMensagem(p);
    expect(r.mensagem?.entrega).toBe("confirmada");
    expect(r.resultado).not.toContain("Falha registrada");
    expect(r.alertas.join(" ")).toContain("diverge da mensagem persistida");
  });
});

describe("consolidação histórica de etapas", () => {
  it("omite etapas do motor retirado da visualização atual", () => {
    const passos = consolidarPassosDetalhes(
      [
        {
          node_id: "answer.low_confidence_handoff",
          event_type: "failed",
          status: "error",
          metadata: {
            candidato_descartado: true,
            aviso_mensagem_id: "mensagem",
            erro: "Falha ao finalizar",
          },
        },
      ],
      "mensagem",
    );
    expect(passos).toEqual([]);
  });

  it("não une ferramentas diferentes que começaram no mesmo instante", () => {
    const inicio = {
      node_id: "tool.execute",
      cycle_id: 1,
      started_at: "2026-09-13T17:11:42Z",
      event_type: "started",
      status: "running",
    };
    const passos = consolidarPassosDetalhes(
      [
        { ...inicio, metadata: { ferramenta: "buscar_medicos" } },
        {
          ...inicio,
          event_type: "completed",
          status: "ok",
          metadata: { ferramenta: "consultar_base_conhecimento" },
        },
      ],
      null,
    );
    expect(passos).toHaveLength(2);
    expect(passos.find((p) => p.titulo.includes("buscar_medicos"))?.estado).toBe("nao_confirmado");
  });

  it("registro abandonado sem fim não é tratado como execução ainda ativa", () => {
    const passos = consolidarPassosDetalhes(
      [
        {
          node_id: "llm.generate",
          cycle_id: 1,
          started_at: "2026-09-01T10:00:00Z",
          event_type: "started",
          status: "running",
        },
      ],
      null,
    );
    expect(passos[0]?.estado).toBe("nao_confirmado");
  });

  it("não junta duas conclusões ambíguas em um sucesso presumido", () => {
    const ev = {
      node_id: "llm.generate",
      cycle_id: 1,
      started_at: "2026-09-13T17:11:42Z",
      event_type: "completed",
      status: "ok",
    };
    expect(consolidarPassosDetalhes([ev, ev], null)[0]?.estado).toBe("nao_confirmado");
  });
});
