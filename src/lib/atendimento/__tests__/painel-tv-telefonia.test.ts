import { describe, expect, it } from "bun:test";
import { carregarPainelTv, idsTelefoniaTv } from "../painel-tv.server";

describe("Equipe do painel TV — somente telefonia", () => {
  it("exclui administrador, supervisão e outros perfis", () => {
    expect([
      ...idsTelefoniaTv([
        { user_id: "telefonia", role: "telefonia" },
        { user_id: "admin", role: "admin" },
        { user_id: "gestor", role: "gestor" },
        { user_id: "recepcao", role: "recepcao" },
      ]),
    ]).toEqual(["telefonia"]);
  });

  it("administrador com vínculo de telefonia também fica fora", () => {
    expect([
      ...idsTelefoniaTv([
        { user_id: "duplo", role: "telefonia" },
        { user_id: "duplo", role: "admin" },
        { user_id: "telefonia", role: "telefonia" },
      ]),
    ]).toEqual(["telefonia"]);
  });

  it("retorno do painel filtra presença e atribuição antiga sem apagar métricas das conversas", async () => {
    const abertas = [
      { id: "c1", atribuida_user_id: "tel-online", owner_type: "HUMAN" },
      { id: "c2", atribuida_user_id: "admin", owner_type: "HUMAN" },
      { id: "c3", atribuida_user_id: "inativo", owner_type: "HUMAN" },
      { id: "c4", atribuida_user_id: "tel-offline", owner_type: "HUMAN" },
      { id: "c5", atribuida_user_id: "tel-sem-presenca", owner_type: "HUMAN" },
    ];
    const membros = [
      { user_id: "tel-online", role: "telefonia", ativo: true },
      { user_id: "tel-pausa", role: "telefonia", ativo: true },
      { user_id: "tel-almoco", role: "telefonia", ativo: true },
      { user_id: "tel-offline", role: "telefonia", ativo: true },
      { user_id: "tel-sem-presenca", role: "telefonia", ativo: true },
      { user_id: "admin", role: "admin", ativo: true },
      { user_id: "duplo", role: "admin", ativo: true },
      { user_id: "duplo", role: "telefonia", ativo: true },
      { user_id: "outro", role: "recepcao", ativo: true },
      { user_id: "inativo", role: "telefonia", ativo: false },
    ];
    const presencas = ["tel-online", "admin", "outro", "duplo", "inativo"].map((user_id) => ({
      user_id,
      estado_manual: "ONLINE",
      estado_manual_versao: 1,
    }));
    presencas.push({ user_id: "tel-pausa", estado_manual: "PAUSA", estado_manual_versao: 1 });
    presencas.push({
      user_id: "tel-almoco",
      estado_manual: "PAUSA_SAIDA",
      estado_manual_versao: 1,
    });
    presencas.push({ user_id: "tel-offline", estado_manual: "OFFLINE", estado_manual_versao: 1 });
    const aguardando = new Date(Date.now() - 15 * 60_000).toISOString();
    const consultas: { tabela: string; campos: string; filtros: [string, unknown][] }[] = [];
    const db = {
      async rpc(nome: string) {
        return {
          data:
            nome === "can_manage_clinica"
              ? true
              : [
                  { conversa_id: "c1", aguardando_desde: aguardando },
                  { conversa_id: "c4", aguardando_desde: aguardando },
                ],
          error: null,
        };
      },
      from(tabela: string) {
        const chamada = { tabela, campos: "", filtros: [] as [string, unknown][] };
        consultas.push(chamada);
        let single = false;
        const q: any = {
          select(campos: string) {
            chamada.campos = campos;
            return q;
          },
          eq(campo: string, valor: unknown) {
            chamada.filtros.push([campo, valor]);
            return q;
          },
          neq() {
            return q;
          },
          not() {
            return q;
          },
          order() {
            return q;
          },
          limit() {
            return q;
          },
          gt() {
            return q;
          },
          gte() {
            return q;
          },
          lte() {
            return q;
          },
          lt() {
            return q;
          },
          range() {
            return q;
          },
          in() {
            return q;
          },
          maybeSingle() {
            single = true;
            return q;
          },
          then(resolve: (v: unknown) => unknown) {
            let data: unknown = [];
            if (tabela === "atend_conversas" && chamada.campos.includes("owner_type"))
              data = abertas;
            if (tabela === "atend_conversas" && chamada.campos === "resolved_by")
              data = [{ resolved_by: "tel-online" }, { resolved_by: "tel-offline" }];
            if (tabela === "atend_agente_presenca") data = presencas;
            if (tabela === "clinica_memberships")
              data = membros.filter((m) =>
                chamada.filtros.every(([campo, valor]) => campo !== "ativo" || m.ativo === valor),
              );
            if (tabela === "profiles")
              data = membros.map((m) => ({ id: m.user_id, nome: m.user_id }));
            return Promise.resolve({ data: single ? null : data, error: null, count: 0 }).then(
              resolve,
            );
          },
        };
        return q;
      },
    } as never;
    const painel = await carregarPainelTv(db, db, "clinica", "gestor");
    expect(painel.atendentes.map((a) => a.id).sort()).toEqual([
      "tel-almoco",
      "tel-online",
      "tel-pausa",
    ]);
    expect(painel.atendentes.filter((a) => a.estado === "ONLINE")).toHaveLength(1);
    expect(painel.atendentes.filter((a) => a.estado === "PAUSA")).toHaveLength(1);
    expect(painel.atendentes.filter((a) => a.estado === "PAUSA_SAIDA")).toHaveLength(1);
    expect(painel.atendentes.some((a) => a.estado === "OFFLINE")).toBe(false);
    expect(painel.emAndamento).toBe(5);
    expect(painel.espera).toHaveLength(2);
    expect(painel.resolvidasHoje).toBe(2);
    expect(painel.atendentes.find((a) => a.id === "tel-online")?.resolvidasHoje).toBe(1);
    expect(consultas.find((c) => c.tabela === "clinica_memberships")?.campos).toBe("user_id, role");
    expect(
      consultas
        .filter((c) => c.tabela === "atend_conversas")
        .every((c) =>
          c.filtros.some(([campo, valor]) => campo === "clinica_id" && valor === "clinica"),
        ),
    ).toBe(true);
  });
});
