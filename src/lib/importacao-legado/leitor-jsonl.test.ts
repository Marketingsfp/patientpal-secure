import { describe, expect, test } from "bun:test";
import { interpretarLinha, lerLinhas, loteCheio } from "./leitor-jsonl";

function fluxoDe(pedacos: Uint8Array[]): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(c) {
      for (const p of pedacos) c.enqueue(p);
      c.close();
    },
  });
}

async function todas(f: ReadableStream<Uint8Array>) {
  const out: string[] = [];
  for await (const l of lerLinhas(f)) out.push(l);
  return out;
}

const enc = new TextEncoder();

describe("lerLinhas", () => {
  test("linha cortada entre pedaços e acento partido no meio do byte", async () => {
    const bytes = enc.encode('{"nome":"José"}\r\n{"nome":"Ção"}');
    // corta no meio do "é" (2 bytes) e no meio da segunda linha
    const corte = bytes.indexOf(0xc3) + 1;
    const linhas = await todas(
      fluxoDe([bytes.slice(0, corte), bytes.slice(corte, 20), bytes.slice(20)]),
    );
    expect(linhas).toEqual(['{"nome":"José"}', '{"nome":"Ção"}']);
  });

  test("remove BOM e mantém linha vazia para a contagem", async () => {
    const linhas = await todas(fluxoDe([enc.encode('\uFEFF{"a":1}\n\n{"a":2}\n')]));
    expect(linhas).toEqual(['{"a":1}', "", '{"a":2}']);
  });
});

describe("interpretarLinha", () => {
  test("texto com quebra escapada, aspas e acentos é preservado", () => {
    const r = interpretarLinha('{"observacao":"linha 1\\nlinha 2 \\"aspas\\" ç","data":null}', 7);
    expect(r).toEqual({ n: 7, d: { observacao: 'linha 1\nlinha 2 "aspas" ç', data: null } });
  });
  test("linha vazia é ignorada", () => {
    expect(interpretarLinha("   ", 3)).toBeNull();
  });
  test("JSON quebrado vira erro com o número da linha", () => {
    expect(interpretarLinha('{"nome": "x"', 9)).toEqual({ n: 9, e: "JSON inválido na linha" });
  });
  test("array não é aceito", () => {
    expect(interpretarLinha("[1,2]", 1)).toEqual({ n: 1, e: "Linha não é um objeto JSON" });
  });
});

describe("loteCheio", () => {
  test("500 linhas ou 3 MB fecham o lote", () => {
    expect(loteCheio(499, 10)).toBe(false);
    expect(loteCheio(500, 10)).toBe(true);
    expect(loteCheio(10, 3_000_000)).toBe(true);
  });
});
