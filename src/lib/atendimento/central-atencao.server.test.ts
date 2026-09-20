import { describe, expect, it } from "bun:test";
import { carregarDadosCentralAtencao } from "./central-atencao.server";
import { calcularAtencao, itensDaCategoria } from "./central-atencao";
import { faixaEsperaDesde } from "./espera";
import { consultarInicioCronometroPausa } from "./cronometro-pausa.server";

/** Cliente de consulta em memória: executa os filtros, paginação e head/count. */
function bancoTeste(gestor: boolean) {
  const conversas: Record<string, any>[] = [];
  const perfis = [
    { id: "ana", nome: "Ana" },
    { id: "bia", nome: "Bia" },
  ];
  const esperas: { conversa_id: string; aguardando_desde: string }[] = [];
  const presencas: Record<string, any>[] = [];
  const membros: Record<string, any>[] = [];
  const historico: Record<string, any>[] = [];
  const tabelas: Record<string, Record<string, any>[]> = {
    profiles: perfis,
    atend_conversas: conversas,
    atend_agente_presenca: presencas,
    clinica_memberships: membros,
    atend_presenca_manual_log: historico,
  };
  const paginas: string[] = [];
  const leiturasGestao: string[] = [];
  let falharDepoisDe: string | null = null;
  let erroGestao = false;
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
      error:
        nome === "can_manage_clinica" && erroGestao ? { message: "permissão indisponível" } : null,
    }),
    from: (tabela: string) => {
      const filtro: ((r: Record<string, any>) => boolean)[] = [];
      let limite = Infinity;
      let ordenar = "";
      let ascendente = true;
      let unica = false;
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
        gt(campo: string, valor: string | number) {
          if (campo === "id") cursor = String(valor);
          filtro.push((r) => r[campo] > valor);
          return query;
        },
        lte(campo: string, valor: number) {
          filtro.push((r) => r[campo] <= valor);
          return query;
        },
        order(campo: string, options?: { ascending: boolean }) {
          ordenar = campo;
          ascendente = options?.ascending !== false;
          return query;
        },
        maybeSingle() {
          unica = true;
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
          const rows = (tabelas[tabela] ?? [])
            .filter((r) => filtro.every((f) => f(r)))
            .sort(
              (a, b) =>
                (a[ordenar] < b[ordenar] ? -1 : a[ordenar] > b[ordenar] ? 1 : 0) *
                (ascendente ? 1 : -1),
            );
          return Promise.resolve(
            resolve({
              data: head ? null : unica ? (rows[0] ?? null) : rows.slice(0, limite),
              count: rows.length,
              error: null,
            }),
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
    presencas,
    membros,
    historico,
    leiturasGestao,
    presenca: (userId: string, estado: string, versao = 2, clinica = "clinica", ativo = true) => {
      membros.push({ clinica_id: clinica, user_id: userId, ativo });
      presencas.push({
        clinica_id: clinica,
        user_id: userId,
        estado_manual: estado,
        estado_manual_versao: versao,
      });
    },
    inicioSidebar: (userId: string, versao: number) =>
      consultarInicioCronometroPausa(client as never, {
        clinicaId: "clinica",
        userId,
        estado: "PAUSA",
        versao,
      }),
    add,
    falharPagina: (id: string) => {
      falharDepoisDe = id;
    },
    falharGestao: () => {
      erroGestao = true;
    },
    carregar: () =>
      carregarDadosCentralAtencao(client as never, "clinica", "ana", {
        from(tabela: string) {
          leiturasGestao.push(tabela);
          return client.from(tabela);
        },
      } as never),
  };
}

describe("consulta da Central de Atenção", () => {
  it("handoff às 13:02 é crítico na Central e no card às 13:26, ainda na fila individual", async () => {
    const db = bancoTeste(false);
    db.add("encaminhada", {
      owner_type: "HUMAN",
      atribuida_user_id: "ana",
      fila_pendente: true,
    });
    // Instante retornado pela RPC corrigida, apesar do aviso automático posterior.
    db.esperas.push({ conversa_id: "encaminhada", aguardando_desde: "2026-09-20T13:02:12-03:00" });
    const dados = await db.carregar();
    const agora = Date.parse("2026-09-20T13:26:00-03:00");
    const resumo = calcularAtencao({ ...dados, naoAtribuidas: dados.filas, agora });
    expect(resumo.criticas).toBe(1);
    expect(resumo.aguardando).toBe(0);
    expect(resumo.total).toBe(1);
    expect(resumo.nivel).toBeGreaterThan(0);
    expect(itensDaCategoria(resumo.itens, null).map((i) => i.id)).toEqual(["encaminhada"]);
    expect(faixaEsperaDesde(dados.espera.encaminhada, agora)).toBe("critico");
  });

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
    expect(resumo.total).toBe(0);
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
    expect(
      calcularAtencao({
        ...dados,
        naoAtribuidas: dados.filas,
        agora: Date.parse("2026-09-17T10:11:00Z"),
      }).total,
    ).toBe(1);
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

  it("inclui pausadas com zero e dez pendências, sem misturar ativas, Nina e fechadas", async () => {
    const db = bancoTeste(true);
    db.presenca("bia", "PAUSA");
    db.presenca("ana", "PAUSA");
    db.presenca("online", "ONLINE");
    db.presenca("offline", "OFFLINE");
    db.presenca("outra", "PAUSA", 2, "outra-clinica");
    db.presenca("inativa", "PAUSA", 2, "clinica", false);
    for (let i = 0; i < 10; i++) db.add(`a${i}`, { atribuida_user_id: "ana", fila_pendente: true });
    db.add("ativa", { atribuida_user_id: "ana", fila_pendente: false });
    db.add("fechada", { atribuida_user_id: "ana", fila_pendente: true, status: "closed" });
    db.add("nina", { atribuida_user_id: "ana", fila_pendente: true, owner_type: "AI" });
    const dados = await db.carregar();
    expect(dados.pausas.map((p) => p.nome)).toEqual(["Ana", "Bia"]);
    const resumo = calcularAtencao({ ...dados, naoAtribuidas: dados.filas });
    expect(
      dados.pausas.map(
        (p) => resumo.filasIndividuais.find((f) => f.atendenteId === p.atendenteId)?.total ?? 0,
      ),
    ).toEqual([10, 0]);
    expect(resumo.total).toBe(0); // Pausas e filas recentes não acionam o alerta.
  });

  it("atendente recebe só a própria pausa, mesmo sem conversas; gestão vê a equipe", async () => {
    const db = bancoTeste(false);
    db.presenca("ana", "PAUSA");
    db.presenca("bia", "PAUSA");
    const dados = await db.carregar();
    expect(dados.pausas).toEqual([{ atendenteId: "ana", nome: "Ana", inicio: null }]);
    expect(dados.filas).toEqual([]);
    expect(db.leiturasGestao).toEqual([]);
  });

  it("não consulta histórico privilegiado quando a verificação de gestão falha", async () => {
    const db = bancoTeste(true);
    db.presenca("bia", "PAUSA");
    db.falharGestao();
    await expect(db.carregar()).rejects.toThrow("permissão indisponível");
    expect(db.leiturasGestao).toEqual([]);
    expect(db.paginas).toEqual([]);
  });

  it("sincroniza com a sidebar, encerra em Offline/Online e reinicia na próxima pausa", async () => {
    const db = bancoTeste(true);
    db.presenca("ana", "PAUSA", 3);
    const estados = ["ONLINE", "PAUSA", "PAUSA", "OFFLINE", "PAUSA", "ONLINE", "PAUSA"];
    estados.forEach((estado, i) =>
      db.historico.push({
        clinica_id: "clinica",
        user_id: "ana",
        estado,
        versao: i + 1,
        created_at: `2026-09-17T10:0${i}:00Z`,
      }),
    );
    const antes = (await db.carregar()).pausas[0];
    expect(antes.inicio).toBe("2026-09-17T10:01:00Z");
    expect(antes.inicio).toBe(await db.inicioSidebar("ana", 3));
    expect(db.leiturasGestao).toEqual(["atend_presenca_manual_log", "atend_presenca_manual_log"]);
    db.presencas[0].estado_manual = "OFFLINE";
    db.presencas[0].estado_manual_versao = 4;
    expect((await db.carregar()).pausas).toEqual([]);
    db.presencas[0].estado_manual = "PAUSA";
    db.presencas[0].estado_manual_versao = 5;
    const depoisOffline = (await db.carregar()).pausas[0];
    expect(depoisOffline.inicio).toBe(await db.inicioSidebar("ana", 5));
    expect(depoisOffline.inicio).toBe("2026-09-17T10:04:00Z");
    db.presencas[0].estado_manual = "ONLINE";
    db.presencas[0].estado_manual_versao = 6;
    expect((await db.carregar()).pausas).toEqual([]);
    db.presencas[0].estado_manual = "PAUSA";
    db.presencas[0].estado_manual_versao = 7;
    expect((await db.carregar()).pausas[0].inicio).toBe(await db.inicioSidebar("ana", 7));
    expect((await db.carregar()).pausas[0].inicio).toBe("2026-09-17T10:06:00Z");
  });
});
