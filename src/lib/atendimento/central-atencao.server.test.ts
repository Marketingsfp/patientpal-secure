import { describe, expect, it } from "bun:test";
import { carregarDadosCentralAtencao } from "./central-atencao.server";
import { calcularAtencao } from "./central-atencao";

/** Cliente de consulta em memória: executa os filtros, paginação e head/count. */
function bancoTeste(gestor: boolean) {
  const conversas: Record<string, any>[] = [];
  const perfis = [
    { id: "ana", nome: "Ana" },
    { id: "bia", nome: "Bia" },
  ];
  const esperas: { conversa_id: string; aguardando_desde: string }[] = [];
  const paginas: string[] = [];
  let falharDepoisDe: string | null = null;
  function condicao(expressao: string) {
    const [campo, op, ...resto] = expressao.split(".");
    const valor = resto.join(".");
    return (linha: Record<string, any>) =>
      op === "is"
        ? linha[campo] == null
        : op === "neq"
          ? linha[campo] !== valor
          : linha[campo] === valor;
  }
  const client = {
    rpc: async (nome: string) => ({
      data: nome === "can_manage_clinica" ? gestor : esperas,
      error: null,
    }),
    from: (tabela: string) => {
      const filtro: ((r: Record<string, any>) => boolean)[] = [];
      let limite = Infinity;
      let ordenar = "";
      let head = false;
      let cursor = "";
      const query = {
        select(_campos: string, options?: { head?: boolean }) {
          head = options?.head === true;
          return query;
        },
        eq(campo: string, valor: unknown) {
          filtro.push((r) => r[campo] === valor);
          return query;
        },
        is(campo: string, _valor: null) {
          filtro.push((r) => r[campo] == null);
          return query;
        },
        not(campo: string, _op: string, valores: string) {
          const excluir = valores.slice(1, -1).split(",");
          filtro.push((r) => !excluir.includes(r[campo]));
          return query;
        },
        or(expressao: string) {
          const regras = expressao.split(",").map(condicao);
          filtro.push((r) => regras.some((f) => f(r)));
          return query;
        },
        in(campo: string, valores: string[]) {
          filtro.push((r) => valores.includes(r[campo]));
          return query;
        },
        gt(campo: string, valor: string) {
          cursor = valor;
          filtro.push((r) => r[campo] > valor);
          return query;
        },
        order(campo: string) {
          ordenar = campo;
          return query;
        },
        limit(n: number) {
          limite = n;
          return query;
        },
        then(resolve: (r: unknown) => unknown) {
          if (tabela === "atend_conversas" && !head) paginas.push(cursor);
          if (cursor && cursor === falharDepoisDe)
            return Promise.resolve(
              resolve({ data: null, error: { message: "consulta indisponível" } }),
            );
          const rows = (tabela === "profiles" ? perfis : conversas)
            .filter((r) => filtro.every((f) => f(r)))
            .sort((a, b) => String(a[ordenar]).localeCompare(String(b[ordenar])));
          return Promise.resolve(
            resolve({ data: head ? null : rows.slice(0, limite), count: rows.length, error: null }),
          );
        },
      };
      return query;
    },
  };
  const add = (id: string, extra: Record<string, unknown> = {}) =>
    conversas.push({
      id,
      clinica_id: "clinica",
      is_teste: false,
      status: "waiting",
      owner_type: "NONE",
      atribuida_user_id: null,
      fila_pendente: false,
      contato_nome: `Contato ${id}`,
      ...extra,
    });
  return {
    conversas,
    esperas,
    paginas,
    add,
    falharPagina: (id: string) => {
      falharDepoisDe = id;
    },
    carregar: () => carregarDadosCentralAtencao(client as never, "clinica", "ana"),
  };
}

describe("consulta da Central de Atenção", () => {
  it("gestão recebe toda a global acima de 500 e pendências identificadas por atendente", async () => {
    const db = bancoTeste(true);
    for (let i = 0; i < 501; i++) db.add(`g${String(i).padStart(4, "0")}`);
    db.add("ana1", { atribuida_user_id: "ana", fila_pendente: true });
    db.add("bia1", { atribuida_user_id: "bia", fila_pendente: true });
    db.add("outra-clinica", { clinica_id: "outra" });
    db.add("teste", { is_teste: true });
    db.add("fechada", { status: "closed" });
    const dados = await db.carregar();
    const resumo = calcularAtencao({ ...dados, naoAtribuidas: dados.filas });
    expect(resumo.naoAtribuidasGlobal).toBe(501);
    expect(resumo.filasIndividuais.map((f) => [f.nome, f.total])).toEqual([
      ["Ana", 1],
      ["Bia", 1],
    ]);
    expect(resumo.total).toBe(503);
    expect(db.paginas).toHaveLength(2);
  });

  it("atendente vê própria fila e total global; não recebe nomes ou esperas de colegas", async () => {
    const db = bancoTeste(false);
    db.add("a", { atribuida_user_id: "ana", fila_pendente: true });
    db.add("b", { atribuida_user_id: "bia", fila_pendente: true });
    db.add("global");
    db.add("nina", { owner_type: "AI" });
    db.esperas.push(
      ...["a", "b", "global"].map((id) => ({
        conversa_id: id,
        aguardando_desde: "2026-09-17T10:00:00Z",
      })),
    );
    const dados = await db.carregar();
    expect(dados.filas.map((f) => f.id)).toEqual(["a"]);
    expect(dados.globalSemDetalhes).toBe(1);
    expect(Object.keys(dados.espera)).toEqual(["a"]);
    expect(dados.nomes).not.toHaveProperty("b");
    expect(dados.nomes).not.toHaveProperty("global");
    expect(calcularAtencao({ ...dados, naoAtribuidas: dados.filas }).total).toBe(2);
  });

  it("primeira resposta e encerramento atualizam o total sem depender da presença", async () => {
    const db = bancoTeste(true);
    db.add("a", { atribuida_user_id: "ana", fila_pendente: true });
    db.add("b", { atribuida_user_id: "bia", fila_pendente: true });
    expect((await db.carregar()).filas).toHaveLength(2);
    db.conversas[0].fila_pendente = false;
    db.conversas[1].status = "closed";
    expect((await db.carregar()).filas).toEqual([]);
  });

  it("falha ao buscar segunda página não devolve contagem parcial como completa", async () => {
    const db = bancoTeste(true);
    for (let i = 0; i < 501; i++) db.add(String(i).padStart(4, "0"));
    db.falharPagina("0499");
    await expect(db.carregar()).rejects.toThrow("consulta indisponível");
  });
});
