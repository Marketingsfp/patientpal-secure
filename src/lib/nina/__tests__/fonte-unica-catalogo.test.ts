/**
 * FONTE ÚNICA — o atendimento ao paciente só pode falar a partir do catálogo
 * PUBLICADO. Estes testes travam a regra na origem: nenhuma porta paralela
 * (tabela operacional/legada) pode voltar a alimentar prompt ou ferramenta.
 */
import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";

const whatsapp = readFileSync("src/lib/whatsapp.server.ts", "utf8");
const tools = readFileSync("src/lib/nina/paciente-tools.server.ts", "utf8");

/** Só o trecho que monta o prompt/ferramentas de consulta do paciente. */
function trechoFerramentasConsulta(fonte: string): string {
  const ini = fonte.indexOf('case "listar_especialidades"');
  const fim = fonte.indexOf('case "horario_funcionamento"');
  return fonte.slice(ini, fim);
}

describe("prompt do WhatsApp", () => {
  it("não injeta mais a tabela operacional de procedimentos", () => {
    expect(whatsapp).not.toContain('.from("procedimentos")');
  });

  it("não injeta lista de médicos, escalas ou especialidades legadas", () => {
    expect(whatsapp).not.toContain('.from("medico_disponibilidades")');
    expect(whatsapp).not.toContain('.from("medico_especialidades")');
    expect(whatsapp).not.toContain('.from("especialidades")');
  });

  it("substitui os blocos por instrução de consultar o catálogo e encaminhar", () => {
    expect(whatsapp).toContain("consultar_base_conhecimento");
    expect(whatsapp).toContain("solicitar_atendente_humano");
  });
});

describe("ferramentas de consulta do paciente", () => {
  const trecho = trechoFerramentasConsulta(tools);

  it("buscar_procedimentos e buscar_medicos usam o catálogo publicado", () => {
    expect(trecho).toContain("searchKnowledgeBase");
    expect(trecho).not.toContain('.from("procedimentos")');
    expect(trecho).not.toContain('.from("medicos")');
  });

  it("sem registro publicado a resposta manda encaminhar para humano", () => {
    expect(trecho).toContain("SEM_CATALOGO_INSTRUCAO");
    expect(trecho.match(/encaminhar_para_humano: true/g)?.length).toBeGreaterThanOrEqual(3);
  });
});

describe("mensagem de ausência de informação", () => {
  it("proíbe conhecimento próprio e aponta o handoff", async () => {
    const { SEM_CATALOGO_INSTRUCAO } = await import("../catalogo-fonte.server");
    expect(SEM_CATALOGO_INSTRUCAO).toMatch(/PUBLICADO/);
    expect(SEM_CATALOGO_INSTRUCAO).toMatch(/conhecimento próprio/i);
    expect(SEM_CATALOGO_INSTRUCAO).toContain("solicitar_atendente_humano");
  });
});
