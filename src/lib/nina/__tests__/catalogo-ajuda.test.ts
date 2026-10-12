import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { AJUDA_CATALOGO, preservadoNaSincronizacao } from "../catalogo-ajuda";
import { prepararSincronizacao, type RegistroSincronizacao } from "../catalogo-sincronizacao";

const ID = "22222222-2222-4222-8222-222222222222";
const FONTE = "33333333-3333-4333-8333-333333333333";

describe("explicações “Como ler” do catálogo", () => {
  test("toda opção tem título e efeito na Nina", () => {
    for (const ajuda of Object.values(AJUDA_CATALOGO)) {
      expect(ajuda.titulo.trim()).not.toBe("");
      expect(ajuda.efeito.trim()).not.toBe("");
    }
  });

  test("o aviso de sincronização corresponde ao que a sincronização preserva", () => {
    const atual: RegistroSincronizacao = {
      id: ID,
      nome: "Exame Teste",
      status: "PUBLICADO",
      nota_interna: "Nota da equipe",
      estrutura: {
        versao: 1,
        aliases: ["exame teste"],
        nina_pode_agendar: true,
        encaminhamento_humano: true,
        pedido_medico: "obrigatorio",
        complementos: [{ chave: "exame teste::", modalidade: "hora_marcada" }],
      },
    };
    const fonte: RegistroSincronizacao = {
      id: FONTE,
      procedimento_id: FONTE,
      nome: "Exame Teste",
      formas_pagamento: [],
      executantes: [],
      estrutura: { versao: 1, aliases: [], complementos: [] },
    };
    const { dados } = prepararSincronizacao("servico", atual, fonte);
    expect(preservadoNaSincronizacao("aliases")).toBe(true);
    expect(dados.estrutura?.aliases).toEqual(["exame teste"]);
    expect(preservadoNaSincronizacao("nina_pode_agendar")).toBe(true);
    expect(dados.estrutura?.nina_pode_agendar).toBe(true);
    expect(preservadoNaSincronizacao("nota_interna")).toBe(true);
    expect(dados.nota_interna).toBe("Nota da equipe");

    expect(preservadoNaSincronizacao("encaminhamento_humano")).toBe(false);
    expect(dados.estrutura?.encaminhamento_humano ?? null).toBeNull();
    expect(preservadoNaSincronizacao("pedido_medico")).toBe(false);
    expect(dados.estrutura?.pedido_medico).toBe("nao_informado");
    expect(preservadoNaSincronizacao("complemento_modalidade")).toBe(false);
    expect(dados.estrutura?.complementos).toEqual([]);
  });

  test("os textos da tela não prometem o que o sistema não faz", () => {
    const ler = (arquivo: string) =>
      readFileSync(`src/components/nina/catalogo/${arquivo}`, "utf8");
    const estrutura = ler("EstruturaCatalogoEditor.tsx");
    const profissional = ler("FormProfissional.tsx");
    const servico = ler("FormServico.tsx");
    expect(estrutura).not.toContain("encaminhar silenciosamente");
    expect(estrutura).not.toContain("Sim — a Nina agenda este item");
    expect(estrutura.replace(/\s+/g, " ")).toContain(
      "a modalidade deles ainda é considerada pela Nina",
    );
    expect(profissional).not.toContain("Publicar não altera a orientação");
    expect(profissional).not.toContain("Ainda não confirmada — cadastro atual");
    expect(profissional).not.toContain("Aviso do dia (temporário)");
    expect(servico).not.toContain("Escolha o profissional ou digite o nome");
  });
});
