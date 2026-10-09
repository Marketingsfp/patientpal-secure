/**
 * R2 — o telefone do remetente entra em um filtro de texto do banco
 * (`.or(from_number.eq.X,to_number.eq.X)`). Só o formato da Meta é aceito;
 * qualquer caractere que altere o filtro faz o valor ser recusado.
 */
import { describe, expect, it } from "bun:test";
import { telefoneParaFiltro } from "../telefone";

describe("telefoneParaFiltro", () => {
  it("mantém o telefone da Meta exatamente como chega (só dígitos)", () => {
    expect(telefoneParaFiltro("5511987654321")).toBe("5511987654321");
  });

  it("aceita o telefone virtual da homologação", () => {
    expect(telefoneParaFiltro("55000100001")).toBe("55000100001");
  });

  it("aceita '+' inicial e espaços nas pontas, devolvendo só dígitos", () => {
    expect(telefoneParaFiltro(" +5511987654321 ")).toBe("5511987654321");
  });

  it("recusa valor que alteraria o filtro, sem transformá-lo em outro número", () => {
    expect(telefoneParaFiltro("5511987654321,to_number.neq.0")).toBeNull();
    expect(telefoneParaFiltro("5511987654321)")).toBeNull();
    expect(telefoneParaFiltro("and(from_number.eq.1)")).toBeNull();
    expect(telefoneParaFiltro("55.11.98765.4321")).toBeNull();
  });

  it("recusa vazio, curto demais e longo demais", () => {
    expect(telefoneParaFiltro(null)).toBeNull();
    expect(telefoneParaFiltro(undefined)).toBeNull();
    expect(telefoneParaFiltro("")).toBeNull();
    expect(telefoneParaFiltro("1234567")).toBeNull();
    expect(telefoneParaFiltro("1234567890123456")).toBeNull();
  });
});
