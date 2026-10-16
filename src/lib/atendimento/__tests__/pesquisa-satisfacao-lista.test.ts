import { describe, expect, it } from "bun:test";
import {
  classificarMensagemAposPesquisa,
  ESPELHO_PESQUISA_LISTA,
  PESQUISA_LISTA,
  textoDaRespostaInterativa,
} from "../pesquisa-satisfacao";

describe("Pesquisa de satisfação com lista de toque", () => {
  it("mantém a escala de 1 a 5, da melhor para a pior nota", () => {
    expect(PESQUISA_LISTA.opcoes.map((o) => o.titulo)).toEqual([
      "5 - Excelente",
      "4 - Muito bom",
      "3 - Bom",
      "2 - Regular",
      "1 - Ruim",
    ]);
  });

  it("respeita os limites da Meta para lista interativa", () => {
    expect(PESQUISA_LISTA.botao.length).toBeLessThanOrEqual(20);
    expect(PESQUISA_LISTA.secao.length).toBeLessThanOrEqual(24);
    expect(PESQUISA_LISTA.corpo.length).toBeLessThanOrEqual(1024);
    for (const o of PESQUISA_LISTA.opcoes) expect(o.titulo.length).toBeLessThanOrEqual(24);
    expect(new Set(PESQUISA_LISTA.opcoes.map((o) => o.id)).size).toBe(5);
  });

  it("o toque numa nota vira o número que a pesquisa reconhece", () => {
    for (const o of PESQUISA_LISTA.opcoes) {
      const texto = textoDaRespostaInterativa(o.titulo);
      expect(classificarMensagemAposPesquisa(texto)).toEqual({
        destino: "pesquisa",
        nota: Number(o.titulo[0]),
      });
    }
  });

  it("outros toques seguem como texto para o atendimento", () => {
    expect(textoDaRespostaInterativa("Quero remarcar")).toBe("Quero remarcar");
    expect(classificarMensagemAposPesquisa(textoDaRespostaInterativa("Quero remarcar"))).toEqual({
      destino: "atendimento",
    });
  });

  it("a conversa mostra à equipe a pergunta e as opções enviadas", () => {
    expect(ESPELHO_PESQUISA_LISTA).toContain("Como você avalia o atendimento recebido?");
    for (const o of PESQUISA_LISTA.opcoes) expect(ESPELHO_PESQUISA_LISTA).toContain(o.titulo);
  });
});
