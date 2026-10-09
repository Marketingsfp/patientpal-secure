import { describe, expect, it } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { SeletorStatusPresenca } from "@/components/nina/SeletorStatusPresenca";

const base = {
  salvando: null,
  desabilitado: false,
  carregando: false,
  inicioPausa: null,
  onEscolher: () => {},
};

describe("seletor único de status", () => {
  it("mostra só o status atual num botão, sem a lista de opções aberta", () => {
    const html = renderToStaticMarkup(<SeletorStatusPresenca {...base} selecionado="ONLINE" />);
    expect(html).toContain("Online");
    expect(html).toContain("Meu status: Online");
    // Compacto: as outras opções só aparecem ao abrir a lista.
    expect(html).not.toContain("Offline");
    expect(html).not.toContain("Em pausa para almoço");
  });

  it("cada estado aparece com o nome certo", () => {
    const nome = (s: "ONLINE" | "OFFLINE" | "PAUSA" | "PAUSA_SAIDA") =>
      renderToStaticMarkup(<SeletorStatusPresenca {...base} selecionado={s} />);
    expect(nome("PAUSA")).toContain("Em pausa");
    expect(nome("PAUSA_SAIDA")).toContain("Em pausa para almoço");
    expect(nome("OFFLINE")).toContain("Offline");
  });

  it("sem escolha ainda, pede a disponibilidade; carregando, avisa", () => {
    expect(renderToStaticMarkup(<SeletorStatusPresenca {...base} selecionado={null} />)).toContain(
      "Escolha sua disponibilidade",
    );
    expect(
      renderToStaticMarkup(<SeletorStatusPresenca {...base} selecionado={null} carregando />),
    ).toContain("Carregando");
  });

  it("o cronômetro aparece ao lado só nas pausas", () => {
    const pausa = renderToStaticMarkup(
      <SeletorStatusPresenca {...base} selecionado="PAUSA" inicioPausa="2026-09-30T15:00:00Z" />,
    );
    expect(pausa).toContain('role="timer"');
    expect(
      renderToStaticMarkup(<SeletorStatusPresenca {...base} selecionado="ONLINE" />),
    ).not.toContain('role="timer"');
  });

  it("fica desabilitado enquanto grava ou não carregou (sem clique duplicado)", () => {
    const html = renderToStaticMarkup(
      <SeletorStatusPresenca {...base} selecionado="ONLINE" desabilitado />,
    );
    expect(html).toMatch(/disabled/);
  });
});
