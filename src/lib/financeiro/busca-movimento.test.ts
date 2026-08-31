import { describe, expect, it } from "bun:test";
import {
  avisoDaBuscaGlobal,
  buscaAtiva,
  buscaEmTodasAsDatas,
  normalizarTermoBusca,
  LIMITE_BUSCA_GLOBAL,
  TERMO_MINIMO,
} from "./busca-movimento";

describe("normalizarTermoBusca", () => {
  it("tira espaço das pontas", () => {
    expect(normalizarTermoBusca("  MARIA  ")).toBe("MARIA");
  });

  it("colapsa espaços repetidos do meio", () => {
    expect(normalizarTermoBusca("MARIA   DA    SILVA")).toBe("MARIA DA SILVA");
  });

  it("trata nulo e indefinido como texto vazio", () => {
    expect(normalizarTermoBusca(null)).toBe("");
    expect(normalizarTermoBusca(undefined)).toBe("");
  });
});

describe("buscaAtiva", () => {
  it("caixa vazia não filtra nada", () => {
    expect(buscaAtiva("")).toBe(false);
    expect(buscaAtiva("   ")).toBe(false);
  });

  it("uma letra já estreita a lista dentro do período", () => {
    // Dentro do período não há piso: o recorte de data já limita o volume.
    expect(buscaAtiva("M")).toBe(true);
  });
});

describe("buscaEmTodasAsDatas", () => {
  it("chave desligada mantém a trava de data mesmo com termo longo", () => {
    expect(buscaEmTodasAsDatas({ termo: "MARIA DA SILVA", todasAsDatas: false })).toBe(false);
  });

  it("chave ligada com caixa vazia não derruba a trava de data", () => {
    // Senão a tela baixaria o histórico inteiro da clínica sem motivo.
    expect(buscaEmTodasAsDatas({ termo: "", todasAsDatas: true })).toBe(false);
    expect(buscaEmTodasAsDatas({ termo: "   ", todasAsDatas: true })).toBe(false);
  });

  it("chave ligada com termo curto demais também não derruba", () => {
    expect(buscaEmTodasAsDatas({ termo: "MA", todasAsDatas: true })).toBe(false);
  });

  it("chave ligada com termo no tamanho mínimo libera a busca global", () => {
    const termo = "A".repeat(TERMO_MINIMO);
    expect(buscaEmTodasAsDatas({ termo, todasAsDatas: true })).toBe(true);
  });

  it("espaço das pontas não conta para o mínimo", () => {
    // "  MA  " tem 6 caracteres, mas só 2 de texto.
    expect(buscaEmTodasAsDatas({ termo: "  MA  ", todasAsDatas: true })).toBe(false);
  });

  it("nome de paciente comum libera a busca global", () => {
    expect(buscaEmTodasAsDatas({ termo: "MARIA DA SILVA", todasAsDatas: true })).toBe(true);
  });
});

describe("avisoDaBuscaGlobal", () => {
  it("no modo normal não há aviso", () => {
    expect(avisoDaBuscaGlobal({ termo: "MARIA", todasAsDatas: false, truncado: false })).toBeNull();
  });

  it("termo curto demais não gera aviso, porque a busca global nem valeu", () => {
    expect(avisoDaBuscaGlobal({ termo: "MA", todasAsDatas: true, truncado: false })).toBeNull();
  });

  it("na busca global avisa que os totais não fecham com o cupom do dia", () => {
    const aviso = avisoDaBuscaGlobal({ termo: "MARIA", todasAsDatas: true, truncado: false });
    expect(aviso).toContain("MARIA");
    expect(aviso).toContain("não fecham com o cupom do dia");
  });

  it("quando a lista foi cortada, o aviso diz isso", () => {
    const aviso = avisoDaBuscaGlobal({ termo: "SILVA", todasAsDatas: true, truncado: true });
    expect(aviso).toContain("cortada");
    expect(aviso).toContain("refine o texto");
  });

  it("sem corte, não fala em lista cortada", () => {
    const aviso = avisoDaBuscaGlobal({ termo: "SILVA", todasAsDatas: true, truncado: false });
    expect(aviso).not.toContain("cortada");
  });

  it("o teto exportado é o mesmo usado pela tela para cortar os lotes", () => {
    expect(LIMITE_BUSCA_GLOBAL).toBe(1000);
  });

  it("o termo mostrado no aviso vem normalizado", () => {
    const aviso = avisoDaBuscaGlobal({
      termo: "  MARIA   SILVA  ",
      todasAsDatas: true,
      truncado: false,
    });
    expect(aviso).toContain('"MARIA SILVA"');
  });
});
