import { describe, expect, test } from "bun:test";
import { fileURLToPath } from "node:url";
import { consultaRpcsAusentes, rpcsDoCodigo } from "../../../../scripts/nina-rpcs-esperadas";

const raiz = fileURLToPath(new URL("../../../../", import.meta.url));

describe("funções do banco esperadas pela Nina", () => {
  test("lista as RPCs chamadas pelo código, inclusive com cast de tipo", () => {
    const nomes = rpcsDoCodigo(raiz);
    expect(nomes).toContain("nina_alterar_telefone_paciente");
    expect(nomes).toContain("nina_resolver_cadastro");
    expect(nomes).toEqual([...new Set(nomes)].sort());
  });
  test("a consulta é somente leitura e devolve só as ausentes", () => {
    const sql = consultaRpcsAusentes(["nina_a", "nina_b"]);
    expect(sql).toStartWith("select ");
    expect(sql).toContain("('nina_a'), ('nina_b')");
    expect(sql).toContain("where not exists");
    expect(sql).not.toMatch(/\b(?:insert|update|delete|create|drop|alter|grant)\b/i);
  });
});
