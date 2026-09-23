import { beforeEach, describe, expect, it } from "bun:test";
import {
  comCache,
  limparCacheFinanceiro,
  tamanhoDoCacheFinanceiro,
  TTL_PERIODO,
} from "./cache-periodo";

beforeEach(() => limparCacheFinanceiro());

describe("comCache", () => {
  it("lê uma vez só quando duas telas pedem o mesmo período", async () => {
    let idas = 0;
    const buscar = async () => {
      idas++;
      return 42;
    };
    expect(await comCache("p|2026-09", TTL_PERIODO, buscar)).toBe(42);
    expect(await comCache("p|2026-09", TTL_PERIODO, buscar)).toBe(42);
    expect(idas).toBe(1);
  });

  it("divide a MESMA consulta quando os dois pedidos chegam juntos", async () => {
    let idas = 0;
    const buscar = async () => {
      idas++;
      await new Promise((r) => setTimeout(r, 10));
      return idas;
    };
    const [a, b] = await Promise.all([
      comCache("junto", TTL_PERIODO, buscar),
      comCache("junto", TTL_PERIODO, buscar),
    ]);
    expect(idas).toBe(1);
    expect(a).toBe(b);
  });

  it("períodos diferentes não se misturam", async () => {
    await comCache("c|set", TTL_PERIODO, async () => "setembro");
    expect(await comCache("c|ago", TTL_PERIODO, async () => "agosto")).toBe("agosto");
    expect(await comCache("c|set", TTL_PERIODO, async () => "outro")).toBe("setembro");
  });

  it("relê quando o prazo vence", async () => {
    let idas = 0;
    const buscar = async () => ++idas;
    expect(await comCache("curto", 1, buscar)).toBe(1);
    await new Promise((r) => setTimeout(r, 5));
    expect(await comCache("curto", 1, buscar)).toBe(2);
  });

  it("`forcar` ignora o que está guardado", async () => {
    let idas = 0;
    const buscar = async () => ++idas;
    expect(await comCache("f", TTL_PERIODO, buscar)).toBe(1);
    expect(await comCache("f", TTL_PERIODO, buscar, true)).toBe(2);
    expect(await comCache("f", TTL_PERIODO, buscar)).toBe(2);
  });

  it("não guarda leitura que falhou", async () => {
    let idas = 0;
    const buscar = async () => {
      idas++;
      if (idas === 1) throw new Error("caiu");
      return "ok";
    };
    await expect(comCache("erro", TTL_PERIODO, buscar)).rejects.toThrow("caiu");
    expect(await comCache("erro", TTL_PERIODO, buscar)).toBe("ok");
    expect(idas).toBe(2);
  });

  it("limpar por prefixo derruba só a clínica pedida", async () => {
    await comCache("A|set", TTL_PERIODO, async () => 1);
    await comCache("B|set", TTL_PERIODO, async () => 2);
    limparCacheFinanceiro("A|");
    let releu = false;
    await comCache("A|set", TTL_PERIODO, async () => {
      releu = true;
      return 9;
    });
    expect(releu).toBe(true);
    await comCache("B|set", TTL_PERIODO, async () => {
      throw new Error("não deveria reler");
    });
  });

  it("não cresce sem limite quando se passeia pelos períodos", async () => {
    for (let i = 0; i < 30; i++) await comCache(`per|${i}`, TTL_PERIODO, async () => i);
    expect(tamanhoDoCacheFinanceiro()).toBeLessThanOrEqual(12);
  });
});
