import { describe, expect, it } from "bun:test";
import { avancarContadorDps, reservarNumeroDps, type SupabaseAdmin } from "./nfse-numeracao";

/**
 * Cliente de mentira que imita o que interessa do Supabase: guarda o contador
 * de um emitente e só aplica o UPDATE quando a condição bate — que é
 * exatamente o comportamento do banco de verdade e o que impede duas emissões
 * de levarem o mesmo número.
 */
function bancoDeMentira(inicial: number) {
  const estado = { contador: inicial };

  const client = {
    from() {
      return {
        update(valores: { rps_proximo_numero: number }) {
          const condicoes: { igual?: number; menorQue?: number } = {};
          const query = {
            eq(coluna: string, valor: unknown) {
              if (coluna === "rps_proximo_numero") condicoes.igual = Number(valor);
              return query;
            },
            lt(_coluna: string, valor: unknown) {
              condicoes.menorQue = Number(valor);
              return query;
            },
            select() {
              return query;
            },
            async maybeSingle() {
              return { data: aplicar(), error: null };
            },
            // `avancarContadorDps` não pede resultado: o await cai aqui.
            then(resolve: (v: unknown) => void) {
              resolve({ data: aplicar(), error: null });
            },
          };
          function aplicar() {
            const casaIgual = condicoes.igual === undefined || estado.contador === condicoes.igual;
            const casaMenor =
              condicoes.menorQue === undefined || estado.contador < condicoes.menorQue;
            if (!casaIgual || !casaMenor) return null;
            estado.contador = valores.rps_proximo_numero;
            return { rps_proximo_numero: estado.contador };
          }
          return query;
        },
        select() {
          const query = {
            eq() {
              return query;
            },
            async maybeSingle() {
              return { data: { rps_proximo_numero: estado.contador }, error: null };
            },
          };
          return query;
        },
      };
    },
  };

  return { estado, client: client as unknown as SupabaseAdmin };
}

const EMITENTE = "82d6cfbf-ec58-480d-aa42-cc90ba49364a";

describe("reservarNumeroDps", () => {
  it("entrega o número livre e já deixa o contador no seguinte", async () => {
    const { estado, client } = bancoDeMentira(8540);
    expect(await reservarNumeroDps(client, EMITENTE, 8540)).toBe(8540);
    expect(estado.contador).toBe(8541);
  });

  it("duas emissões no mesmo segundo recebem números diferentes", async () => {
    // O caso real de 31/08/2026: Suellen e Nicole clicaram juntas, as duas
    // leram o contador em 8540 e as duas mandaram a DPS 8540 — a segunda
    // voltou recusada com E0014.
    const { estado, client } = bancoDeMentira(8540);
    const [primeira, segunda] = await Promise.all([
      reservarNumeroDps(client, EMITENTE, 8540),
      reservarNumeroDps(client, EMITENTE, 8540),
    ]);
    expect(primeira).not.toBe(segunda);
    expect([primeira, segunda].sort()).toEqual([8540, 8541]);
    expect(estado.contador).toBe(8542);
  });

  it("dez emissões simultâneas não repetem nenhum número", async () => {
    const { estado, client } = bancoDeMentira(100);
    const numeros = await Promise.all(
      Array.from({ length: 10 }, () => reservarNumeroDps(client, EMITENTE, 100)),
    );
    expect(new Set(numeros).size).toBe(10);
    expect(estado.contador).toBe(110);
  });

  it("acompanha o contador quando ele já foi adiantado por outra emissão", async () => {
    const { client } = bancoDeMentira(9000);
    // Leu 8540 de um cadastro velho; o contador real já está em 9000.
    expect(await reservarNumeroDps(client, EMITENTE, 8540)).toBe(9000);
  });
});

describe("avancarContadorDps", () => {
  it("adianta o contador quando o novo número é maior", async () => {
    const { estado, client } = bancoDeMentira(8540);
    await avancarContadorDps(client, EMITENTE, 8600);
    expect(estado.contador).toBe(8600);
  });

  it("nunca puxa o contador para trás", async () => {
    // A repescagem do E0014 de uma emissão lenta não pode desfazer o avanço
    // que outra emissão já fez — se desfizer, os números voltam a colidir.
    const { estado, client } = bancoDeMentira(8700);
    await avancarContadorDps(client, EMITENTE, 8600);
    expect(estado.contador).toBe(8700);
  });
});
