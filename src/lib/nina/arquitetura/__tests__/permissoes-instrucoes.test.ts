/**
 * FASE 7 — quem pode mexer nas Instruções da Nina.
 *
 * Regras: edição e publicação são separadas, e atendimento comum não recebe
 * nada automaticamente.
 */
import { describe, expect, it } from "bun:test";
import { capacidadesDoPapel, podeArquitetura } from "../permissoes";

const COMUNS = ["recepcao", "caixa", "medico", "enfermeiro", "financeiro"];

describe("permissões das Instruções da Nina", () => {
  it("administrador pode ver, editar, publicar e ver histórico", () => {
    const c = capacidadesDoPapel("admin");
    expect(podeArquitetura(c, "nina.instrucoes.ver")).toBe(true);
    expect(podeArquitetura(c, "nina.instrucoes.editar")).toBe(true);
    expect(podeArquitetura(c, "nina.instrucoes.publicar")).toBe(true);
    expect(podeArquitetura(c, "nina.instrucoes.historico")).toBe(true);
  });

  it("gestor cria rascunho, mas NÃO publica", () => {
    const c = capacidadesDoPapel("gestor");
    expect(podeArquitetura(c, "nina.instrucoes.editar")).toBe(true);
    expect(podeArquitetura(c, "nina.instrucoes.publicar")).toBe(false);
  });

  it("supervisor apenas visualiza e consulta o histórico", () => {
    const c = capacidadesDoPapel("supervisor");
    expect(podeArquitetura(c, "nina.instrucoes.ver")).toBe(true);
    expect(podeArquitetura(c, "nina.instrucoes.historico")).toBe(true);
    expect(podeArquitetura(c, "nina.instrucoes.editar")).toBe(false);
    expect(podeArquitetura(c, "nina.instrucoes.publicar")).toBe(false);
  });

  it("atendimento comum não recebe nenhuma permissão automaticamente", () => {
    for (const papel of COMUNS) {
      const c = capacidadesDoPapel(papel);
      expect(podeArquitetura(c, "nina.instrucoes.ver")).toBe(false);
      expect(podeArquitetura(c, "nina.instrucoes.editar")).toBe(false);
      expect(podeArquitetura(c, "nina.instrucoes.publicar")).toBe(false);
      expect(podeArquitetura(c, "nina.instrucoes.historico")).toBe(false);
    }
  });

  it("sem papel na clínica, nenhuma permissão", () => {
    expect(capacidadesDoPapel(null)).toEqual([]);
    expect(capacidadesDoPapel(undefined)).toEqual([]);
  });
});
