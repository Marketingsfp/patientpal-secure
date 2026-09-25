import { describe, expect, it } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { VisaoSimplesNina } from "../VisaoSimplesNina";
import {
  ETAPAS_VISAO_SIMPLES,
  NOTA_HOMOLOGACAO_VISAO_SIMPLES,
  SAIDAS_VISAO_SIMPLES,
} from "@/lib/nina/arquitetura/visao-simples";

describe("Como a Nina atende — tela", () => {
  const html = renderToStaticMarkup(createElement(VisaoSimplesNina));

  it("mostra as 7 etapas e as 3 saídas com o resumo de cada uma", () => {
    expect(html).toContain("Como a Nina atende");
    for (const item of [...ETAPAS_VISAO_SIMPLES, ...SAIDAS_VISAO_SIMPLES]) {
      expect(html).toContain(item.titulo);
      expect(html).toContain(item.resumo);
    }
    expect(html).toContain(NOTA_HOMOLOGACAO_VISAO_SIMPLES);
  });

  it("abre fechada: explicações só aparecem ao tocar na etapa", () => {
    expect(html).not.toContain('id="visao-simples-');
    expect(html.match(/aria-expanded="false"/g)?.length).toBe(
      ETAPAS_VISAO_SIMPLES.length + SAIDAS_VISAO_SIMPLES.length,
    );
  });

  it("não mostra identificadores técnicos do mapa", () => {
    expect(html).not.toMatch(/\b(llm|tool|message|turn)\.[a-z_]+/);
  });
});
