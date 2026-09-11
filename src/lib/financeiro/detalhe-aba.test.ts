import { describe, expect, it } from "bun:test";
import { guardarPacote, lerPacote, limparPacotesVencidos, VALIDADE_MS } from "./detalhe-aba";
import type { Detalhe } from "./detalhe-tabela";

/** Armazenamento de mentira com a mesma interface do `Storage` do navegador. */
function armazem() {
  const m = new Map<string, string>();
  return {
    m,
    get length() {
      return m.size;
    },
    key: (i: number) => Array.from(m.keys())[i] ?? null,
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
  };
}

const tabela: Detalhe = {
  titulo: "Receita bruta",
  explicacao: "x",
  colunas: [{ rotulo: "Valor", tipo: "moeda" }],
  linhas: [[10]],
  temSintetico: false,
};
const pacote = {
  sintetico: null,
  analitico: tabela,
  rotuloSintetico: "Por categoria",
  arquivo: "financeiro_receita",
  de: "2026-09-10",
  ate: "2026-09-10",
  clinicaNome: "CLINICA",
};

describe("detalhe em nova aba", () => {
  it("a aba nova lê o pacote, leva para a sessão e apaga do localStorage", () => {
    const local = armazem();
    const sessao = armazem();
    const id = guardarPacote(pacote, local, 1000)!;
    expect(local.m.size).toBe(1);

    const lido = lerPacote(id, local, sessao);
    expect(lido?.analitico.linhas).toEqual([[10]]);
    expect(local.m.size).toBe(0);
    expect(sessao.m.size).toBe(1);

    // Recarregar a aba: vem da sessão.
    expect(lerPacote(id, local, sessao)?.arquivo).toBe("financeiro_receita");
  });

  it("id desconhecido ou vazio não abre nada", () => {
    expect(lerPacote("nao-existe", armazem(), armazem())).toBeNull();
    expect(lerPacote("", armazem(), armazem())).toBeNull();
  });

  it("pacote que ninguém abriu em dois minutos é descartado", () => {
    const local = armazem();
    guardarPacote(pacote, local, 1000);
    local.setItem("outra:chave", "fica");
    limparPacotesVencidos(local, 1000 + VALIDADE_MS + 1);
    expect(Array.from(local.m.keys())).toEqual(["outra:chave"]);
  });

  it("armazenamento cheio devolve null, para a tela abrir o detalhamento ali mesmo", () => {
    const local = armazem();
    local.setItem = () => {
      throw new Error("QuotaExceededError");
    };
    expect(guardarPacote(pacote, local)).toBeNull();
  });
});
