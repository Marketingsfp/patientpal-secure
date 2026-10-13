import { describe, expect, test } from "bun:test";
import { codigoDoErro, estadoAposTranscricao, prazoTranscricao } from "./fila-analise";

describe("fila de análise de ligações", () => {
  test("HTTP 500 da Sufficit fica pendente nas duas primeiras tentativas", () => {
    const r = { ok: false as const, erro: "A Sufficit não entregou a transcrição (HTTP 500)." };
    expect(estadoAposTranscricao(r, 1)).toEqual({ estado: "pendente", ultimoErro: "HTTP 500" });
    expect(estadoAposTranscricao(r, 2).estado).toBe("pendente");
  });

  test("na 3ª tentativa com erro vira erro", () => {
    const r = { ok: false as const, erro: "x (HTTP 500)" };
    expect(estadoAposTranscricao(r, 3).estado).toBe("erro");
  });

  test("202 / em processamento continua pendente, sem erro", () => {
    expect(estadoAposTranscricao({ ok: true, situacao: "em_processamento" }, 3)).toEqual({
      estado: "pendente",
      ultimoErro: null,
    });
  });

  test("menos de 20 caracteres é sem_gravacao", () => {
    const r = { ok: true as const, situacao: "gravada" as const, caracteres: 19, segmentos: 1 };
    expect(estadoAposTranscricao(r, 1).estado).toBe("sem_gravacao");
  });

  test("20 caracteres ou mais é transcrito", () => {
    const r = { ok: true as const, situacao: "ja_existia" as const, caracteres: 20, segmentos: 1 };
    expect(estadoAposTranscricao(r, 1).estado).toBe("transcrito");
  });

  test("ultimo_erro guarda só o código HTTP", () => {
    expect(codigoDoErro("A Sufficit recusou (HTTP 401). corpo qualquer")).toBe("HTTP 401");
  });

  test("prazo da transcrição respeita o orçamento de 60 s", () => {
    expect(prazoTranscricao(0)).toBe(55_000);
    expect(prazoTranscricao(50_000)).toBe(15_000);
  });
});
