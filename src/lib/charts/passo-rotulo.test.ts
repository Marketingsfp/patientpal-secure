import { describe, expect, it } from "bun:test";
import { passoDoRotulo } from "./passo-rotulo";

/** Como o BI monta o eixo: largura útil dividida pelo número de barras. */
const larguraPorBarra = (larguraDoGrafico: number, barras: number) =>
  (larguraDoGrafico - 56 - 16) / barras;

const dias = (n: number) =>
  Array.from({ length: n }, (_, i) => `${String(i + 1).padStart(2, "0")}/09`);

describe("passoDoRotulo", () => {
  it("escreve todos os rótulos quando eles cabem", () => {
    // 6 meses ("Ago/26") numa tela de 1200px: sobra espaço de folga.
    expect(passoDoRotulo(["Abr/26", "Mai/26", "Jun/26"], larguraPorBarra(1200, 3))).toBe(1);
  });

  it("pula rótulos com o mês inteiro por dia — o caso que ficou ilegível", () => {
    // 30 dias em 1128px de gráfico: cada barra tem ~35px e "01/09" pede ~39px.
    expect(passoDoRotulo(dias(30), larguraPorBarra(1128, 30))).toBeGreaterThan(1);
  });

  it("pula mais rótulos em tela estreita do que em tela larga", () => {
    const estreita = passoDoRotulo(dias(31), larguraPorBarra(420, 31));
    const larga = passoDoRotulo(dias(31), larguraPorBarra(1600, 31));
    expect(estreita).toBeGreaterThan(larga);
  });

  it("mantém legível o pior caso: 31 dias no celular", () => {
    const passo = passoDoRotulo(dias(31), larguraPorBarra(360, 31));
    const rotulosEscritos = Math.ceil(31 / passo);
    const espacoPorRotulo = larguraPorBarra(360, 31) * passo;
    // Cada rótulo escrito tem espaço para os 5 caracteres de "01/09".
    expect(espacoPorRotulo).toBeGreaterThanOrEqual(5 * 6.2);
    expect(rotulosEscritos).toBeGreaterThan(1);
  });

  it("não divide por zero quando o gráfico ainda não foi medido", () => {
    expect(passoDoRotulo(dias(30), 0)).toBe(1);
    expect(passoDoRotulo(dias(30), Number.NaN)).toBe(1);
  });

  it("sem rótulo nenhum devolve 1", () => {
    expect(passoDoRotulo([], 24)).toBe(1);
  });
});
