import { describe, expect, test } from "bun:test";
import { baseJaContem, planoParaCausa } from "@/lib/nina/feedback-aplicacao";

describe("plano por causa", () => {
  test("informação oficial errada aponta para o catálogo e exige publicação", () => {
    const p = planoParaCausa("knowledge_error")!;
    expect(p.camada).toBe("catalogo");
    expect(p.exigeEdicaoCatalogo).toBe(true);
  });

  test("falha de busca nunca altera o catálogo", () => {
    const p = planoParaCausa("retrieval_error")!;
    expect(p.camada).toBe("busca");
    expect(p.exigeEdicaoCatalogo).toBe(false);
    expect(p.permiteReindexar).toBe(false);
  });

  test("interpretação e invenção vão para prompt/grounding, sem mexer na Base", () => {
    expect(planoParaCausa("reasoning_error")!.camada).toBe("modelo");
    expect(planoParaCausa("reasoning_error")!.exigeEdicaoCatalogo).toBe(false);
    const h = planoParaCausa("hallucination")!;
    expect(h.tipo).toBe("grounding_fix");
    expect(h.exigeEdicaoCatalogo).toBe(false);
  });

  test("ferramenta e fluxo têm plano próprio", () => {
    expect(planoParaCausa("tool_error")!.camada).toBe("ferramenta");
    expect(planoParaCausa("workflow_error")!.camada).toBe("fluxo");
  });

  test("causa desconhecida não gera plano", () => {
    expect(planoParaCausa(null)).toBeNull();
    expect(planoParaCausa("xpto")).toBeNull();
  });
});

describe("verificação da Base", () => {
  test("reconhece o valor corrigido já presente", () => {
    expect(baseJaContem("Item: Cardiologia\nValor: R$ 180", "R$ 180")).toBe(true);
  });

  test("não confunde valor antigo com o novo", () => {
    expect(baseJaContem("Item: Cardiologia\nValor: R$ 150", "R$ 180")).toBe(false);
  });

  test("ignora acentos e pontuação", () => {
    expect(baseJaContem("Médicos: João Silva", "joao silva")).toBe(true);
  });

  test("vazio nunca conta como aplicado", () => {
    expect(baseJaContem(null, "R$ 180")).toBe(false);
    expect(baseJaContem("Valor: R$ 180", "")).toBe(false);
  });
});
