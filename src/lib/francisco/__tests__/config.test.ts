import { describe, it, expect } from "bun:test";
import {
  configPadraoFrancisco,
  franciscoConfigSchema,
  naJanelaFrancisco,
  pediuSaidaFrancisco,
  textoTemplateFrancisco,
} from "../config";
import { moduloDaRota, moduloPermitido } from "@/lib/permissoes-rotas";
import { mensagemDoFrancisco } from "../autoria";

describe("configuração independente do Francisco", () => {
  it("reconhece autoria sem confundir avisos internos", () => {
    expect(mensagemDoFrancisco({ agente: "francisco" })).toBe(true);
    expect(mensagemDoFrancisco({ agente: "nina" })).toBe(false);
    expect(mensagemDoFrancisco(null)).toBe(false);
  });
  it("começa desativado, em simulação e com temperatura 1", () => {
    const c = franciscoConfigSchema.parse(configPadraoFrancisco());
    expect(c).toMatchObject({ ativo: false, modo: "simulacao", temperatura: 1, nome: "Francisco" });
    expect(c.systemPrompt).toContain("equipe humana");
  });
  it("rejeita configurações incompletas e variáveis extras no template", () => {
    const c = configPadraoFrancisco();
    expect(franciscoConfigSchema.safeParse({ ...c, inicio: "18:00", fim: "09:00" }).success).toBe(
      false,
    );
    expect(franciscoConfigSchema.safeParse({ ...c, temperatura: 3 }).success).toBe(false);
    c.templates.d1.texto += " {{2}}";
    expect(franciscoConfigSchema.safeParse(c).success).toBe(false);
  });
  it("usa horário de Brasília e não envia fora dos dias escolhidos", () => {
    const c = configPadraoFrancisco();
    expect(naJanelaFrancisco(c, new Date("2026-10-08T12:00:00Z"))).toBe(true);
    expect(naJanelaFrancisco(c, new Date("2026-10-08T21:00:00Z"))).toBe(false);
    expect(naJanelaFrancisco(c, new Date("2026-10-11T13:00:00Z"))).toBe(false);
  });
  it("respeita saída sem confundir resposta normal", () => {
    expect(pediuSaidaFrancisco("SAIR!")).toBe(true);
    expect(pediuSaidaFrancisco("Não quero receber mais mensagens")).toBe(true);
    expect(pediuSaidaFrancisco("Quero conversar com a equipe")).toBe(false);
  });
  it("template só recebe o nome da clínica e se apresenta", () => {
    const t = textoTemplateFrancisco(configPadraoFrancisco(), "d1", "Clínica Exemplo");
    expect(t).toContain("Sou Francisco");
    expect(t).toContain("Clínica Exemplo");
    expect(t).not.toContain("{{1}}");
  });
  it("permissão é própria e não herda Nina", () => {
    expect(moduloDaRota("/app/francisco")).toBe("francisco");
    expect(moduloPermitido("francisco", new Set(["nina"]))).toBe(false);
  });
});
