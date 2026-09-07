import { describe, expect, test } from "bun:test";
import {
  RESTRITO,
  lerDetalheConhecimento,
  lerDetalheEspecifico,
  lerDetalheIA,
  lerDetalhePrompt,
  lerDetalheTool,
  metadataSegura,
  removerRaciocinio,
} from "../detalhes-ia";

describe("proteção de raciocínio interno e segredos", () => {
  test("remove chain-of-thought em qualquer profundidade", () => {
    const bruto = {
      texto: "resposta",
      reasoning: "penso que...",
      chain_of_thought: "passo 1",
      interno: { thinking: "oculto", raciocinio: "oculto", ok: 1 },
      lista: [{ thought: "x", mantem: true }],
    };
    const limpo = removerRaciocinio(bruto) as Record<string, unknown>;
    const serial = JSON.stringify(limpo);
    expect(serial).not.toContain("penso que");
    expect(serial).not.toContain("passo 1");
    expect(serial).not.toContain("oculto");
    expect(serial).not.toContain('"thought"');
    expect(limpo["texto"]).toBe("resposta");
  });

  test("metadata segura remove segredo e mascara dado pessoal", () => {
    const m = metadataSegura({
      api_key: "sk-123",
      telefone: "5511999998888",
      reasoning: "interno",
      modelo: "google/gemini",
    });
    expect(m["api_key"]).toBe("[removido]");
    expect(String(m["telefone"])).not.toContain("999998888");
    expect(m["reasoning"]).toBeUndefined();
    expect(m["modelo"]).toBe("google/gemini");
  });
});

describe("prompt", () => {
  test("mostra versão, publicação, status e módulos", () => {
    const d = lerDetalhePrompt(
      {
        prompt_versao: "v14",
        publicado_em: "2026-09-01T12:00:00Z",
        prompt_status: "publicado",
        modulos: ["Agendamento", "Política de conhecimento", "Transferência humana"],
        instrucoes: "Você é a Nina...",
      },
      "admin",
    );
    expect(d.versao).toBe("v14");
    expect(d.modulos).toHaveLength(3);
    expect(d.instrucoes).toContain("Nina");
  });

  test("perfil sem acesso técnico não vê o texto das instruções", () => {
    const d = lerDetalhePrompt({ instrucoes: "Você é a Nina..." }, "operacional");
    expect(d.instrucoes).toBe(RESTRITO);
  });
});

describe("conhecimento / RAG", () => {
  const fontes = [
    { id: "a", titulo: "Preparo de exame", versao: "3", score: 0.91 },
    { id: "b", titulo: "Convênios", versao: "1", score: 0.42 },
  ];

  test("RAG com múltiplas fontes marca a selecionada e traz score", () => {
    const d = lerDetalheConhecimento(
      { consulta: "preciso de jejum?", recuperacao: "semantica", fontes, fonte_selecionada: "a" },
      "admin",
    );
    expect(d.semResultados).toBe(false);
    expect(d.fontes).toHaveLength(2);
    expect(d.fonteSelecionada?.titulo).toBe("Preparo de exame");
    expect(d.fontes[0]?.score).toBe(0.91);
    expect(d.recuperacao).toBe("semantica");
  });

  test("RAG sem resultados", () => {
    const d = lerDetalheConhecimento({ consulta: "xyz", recuperacao: "rag", fontes: [] }, "admin");
    expect(d.semResultados).toBe(true);
    expect(d.fonteSelecionada).toBeNull();
  });

  test("descarta fonte de outro paciente", () => {
    const d = lerDetalheConhecimento(
      {
        fontes: [
          { id: "a", titulo: "Minha ficha", paciente_id: "p1" },
          { id: "b", titulo: "Ficha de outro", paciente_id: "p2" },
        ],
      },
      "admin",
      "p1",
    );
    expect(d.fontes.map((f) => f.id)).toEqual(["a"]);
    expect(d.fontesDeOutroPaciente).toBe(1);
    expect(JSON.stringify(d)).not.toContain("Ficha de outro");
  });

  test("conteúdo utilizado é restrito fora do perfil técnico", () => {
    const d = lerDetalheConhecimento({ conteudo_utilizado: "texto da fonte" }, "operacional");
    expect(d.conteudoUtilizado).toBe(RESTRITO);
  });

  test("tipo de recuperação desconhecido não quebra", () => {
    expect(lerDetalheConhecimento({ recuperacao: "outra" }, "admin").recuperacao).toBe(
      "desconhecida",
    );
  });
});

describe("node de IA", () => {
  test("IA sem tool: métricas completas e nenhuma tool call", () => {
    const d = lerDetalheIA(
      {
        provedor: "Lovable AI",
        modelo: "google/gemini-3.6-flash",
        latencia_ms: 820,
        tokens_entrada: 1200,
        tokens_saida: 180,
        custo_estimado: 0.004,
        chamadas: 1,
        status: "ok",
        reasoning: "não pode aparecer",
      },
      "admin",
    );
    expect(d.tokensTotais).toBe(1380);
    expect(d.toolCalls).toEqual([]);
    expect(d.chamadas).toBe(1);
    expect(JSON.stringify(d)).not.toContain("não pode aparecer");
  });

  test("IA com uma tool", () => {
    const d = lerDetalheIA({ tool_calls: ["consultar_agenda"], chamadas: 2 }, "admin");
    expect(d.toolCalls).toEqual(["consultar_agenda"]);
  });

  test("IA com múltiplas tool calls", () => {
    const d = lerDetalheIA(
      { tool_calls: ["buscar_paciente", "consultar_agenda", "criar_agendamento"], chamadas: 3 },
      "admin",
    );
    expect(d.toolCalls).toHaveLength(3);
    expect(d.chamadas).toBe(3);
  });

  test("contexto e instruções são restritos fora do perfil técnico", () => {
    const d = lerDetalheIA({ contexto: "histórico", instrucoes: "prompt" }, "operacional");
    expect(d.contextoEnviado).toBe(RESTRITO);
    expect(d.instrucoes).toBe(RESTRITO);
  });
});

describe("tools", () => {
  test("tool bem-sucedida mostra argumentos, validações e operação", () => {
    const d = lerDetalheTool(
      {
        ferramenta: "consultar_agenda",
        argumentos: { procedimento: "limpeza", data: "2026-09-10" },
        resultado: "3 disponibilidades encontradas",
        validacoes: ["data futura", "profissional ativo"],
        status: "ok",
        latencia_ms: 172,
        operacao_id: "op_123",
      },
      "admin",
    );
    expect(d.argumentos?.["procedimento"]).toBe("limpeza");
    expect(d.latenciaMs).toBe(172);
    expect(d.validacoes).toHaveLength(2);
    expect(d.operacaoId).toBe("op_123");
  });

  test("erro de tool", () => {
    const d = lerDetalheTool(
      { ferramenta: "criar_agendamento", status: "error", erro: "horário indisponível" },
      "admin",
    );
    expect(d.status).toBe("error");
    expect(d.erro).toBe("horário indisponível");
  });

  test("argumentos com dado pessoal são mascarados e restritos", () => {
    const admin = lerDetalheTool(
      { ferramenta: "buscar_paciente", argumentos: { telefone: "5511988887777" } },
      "admin",
    );
    expect(JSON.stringify(admin.argumentos)).not.toContain("988887777");

    const operacional = lerDetalheTool(
      { ferramenta: "buscar_paciente", argumentos: { telefone: "5511988887777" } },
      "operacional",
    );
    expect(operacional.argumentos).toEqual({ aviso: RESTRITO });
  });
});

describe("seleção por componente", () => {
  test("cada componente recebe a leitura correta", () => {
    expect(lerDetalheEspecifico("prompt.compose", {}, "admin")?.tipo).toBe("prompt");
    expect(lerDetalheEspecifico("tool.knowledge.lookup", {}, "admin")?.tipo).toBe("conhecimento");
    expect(lerDetalheEspecifico("llm.generate", {}, "admin")?.tipo).toBe("ia");
    expect(lerDetalheEspecifico("tool.schedule.book", {}, "admin")?.tipo).toBe("tool");
    expect(lerDetalheEspecifico("message.outbound", {}, "admin")).toBeNull();
  });
});
