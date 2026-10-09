import { describe, expect, it } from "bun:test";
import { carregarAcessosOsZap } from "@/lib/permissoes-oszap.server";
import { autorizarFrancisco } from "../service.server";
import { acessosFrancisco, conferirEdicaoFrancisco } from "../permissoes";
import { configPadraoFrancisco } from "../config";
import type { Acesso } from "@/lib/permissoes-presets";

function contexto({
  role = "gestor",
  ativo = true,
  regras = [{ modulo: "francisco", acesso: "write" }],
  excecoes = [],
  erroTabela = "",
  adminPublicacao = false,
}: {
  role?: string;
  ativo?: boolean;
  regras?: { modulo: string; acesso: string }[];
  excecoes?: { modulo: string; acesso: string }[];
  erroTabela?: string;
  adminPublicacao?: boolean;
} = {}) {
  const consultas: Array<{ tabela: string; filtros: Record<string, unknown> }> = [];
  const supabase = {
    from(tabela: string) {
      const filtros: Record<string, unknown> = {};
      consultas.push({ tabela, filtros });
      const resposta = () => {
        const data =
          tabela === "clinica_memberships"
            ? ativo
              ? { role }
              : null
            : tabela === "perfis_acesso"
              ? { id: "perfil-1" }
              : tabela === "perfil_permissoes"
                ? regras
                : tabela === "usuario_permissoes"
                  ? excecoes
                  : tabela === "user_roles"
                    ? [{ role: adminPublicacao ? "admin" : role }]
                    : null;
        return { data, error: erroTabela === tabela ? { message: "falha simulada" } : null };
      };
      const q = {
        select() {
          return q;
        },
        eq(chave: string, valor: unknown) {
          filtros[chave] = valor;
          return q;
        },
        maybeSingle: async () => resposta(),
        then(resolve: (v: unknown) => unknown) {
          return Promise.resolve(resposta()).then(resolve);
        },
      };
      return q;
    },
  };
  return {
    ctx: {
      supabase: supabase as Parameters<typeof autorizarFrancisco>[0]["supabase"],
      userId: "pessoa-1",
    },
    consultas,
  };
}

describe("Francisco — autorização independente por tela no servidor", () => {
  it("mensagens prontas também usa a escolha específica, com exceção da pessoa", async () => {
    const { ctx } = contexto({
      regras: [{ modulo: "nina", acesso: "write" }],
      excecoes: [{ modulo: "oszap-mensagens-prontas", acesso: "read" }],
    });
    const telas = await carregarAcessosOsZap(ctx.supabase, ctx.userId, "clinica-1");
    expect(telas["oszap-mensagens-prontas"]).toBe("read");
    expect(telas["oszap-conversas"]).toBe("write");
    const isolado = contexto({ regras: [{ modulo: "oszap-mensagens-prontas", acesso: "write" }] });
    const somenteMensagens = await carregarAcessosOsZap(
      isolado.ctx.supabase,
      isolado.ctx.userId,
      "clinica-1",
    );
    expect(somenteMensagens["oszap-mensagens-prontas"]).toBe("write");
    expect(somenteMensagens["oszap-conversas"]).toBe("none");
  });
  it("uma liberação isolada funciona sem conceder o acesso padrão", async () => {
    const { ctx, consultas } = contexto({ regras: [{ modulo: "francisco-voz", acesso: "write" }] });
    const resposta = await autorizarFrancisco(ctx, "clinica-1", true, false, "voz");
    expect(resposta.acessos.voz).toBe("write");
    expect(resposta.acessos.arquitetura).toBe("none");
    expect(resposta.podePublicar).toBe(false);
    await expect(autorizarFrancisco(ctx, "clinica-1", false, false, "historico")).rejects.toThrow(
      "Sem permissão",
    );
    expect(consultas.find((c) => c.tabela === "clinica_memberships")?.filtros).toEqual({
      user_id: "pessoa-1",
      clinica_id: "clinica-1",
      ativo: true,
    });
    expect(consultas.find((c) => c.tabela === "usuario_permissoes")?.filtros).toEqual({
      user_id: "pessoa-1",
      clinica_id: "clinica-1",
    });
  });
  it("mantém o legado até configurar uma aba e respeita o bloqueio explícito", async () => {
    const { ctx } = contexto({
      regras: [
        { modulo: "francisco", acesso: "write" },
        { modulo: "francisco-voz", acesso: "none" },
      ],
    });
    const resposta = await autorizarFrancisco(ctx, "clinica-1");
    expect(resposta.acessos.mensagens).toBe("write");
    expect(resposta.acessos.voz).toBe("none");
    await expect(autorizarFrancisco(ctx, "clinica-1", false, false, "voz")).rejects.toThrow(
      "Sem permissão",
    );
  });
  it("a exceção pessoal prevalece e leitura não permite modificar", async () => {
    const { ctx } = contexto({ excecoes: [{ modulo: "francisco-homologacao", acesso: "read" }] });
    await autorizarFrancisco(ctx, "clinica-1", false, false, "homologacao");
    await expect(autorizarFrancisco(ctx, "clinica-1", true, false, "homologacao")).rejects.toThrow(
      "Sem permissão",
    );
    await autorizarFrancisco(ctx, "clinica-1", true, false, "acompanhamento");
  });
  it("não remove a restrição adicional de Telefonia", async () => {
    const { ctx } = contexto({ role: "telefonia" });
    await expect(autorizarFrancisco(ctx, "clinica-1")).rejects.toThrow("Sem permissão");
  });
  it("publicação continua reservada ao administrador", async () => {
    await expect(autorizarFrancisco(contexto().ctx, "clinica-1", true, true)).rejects.toThrow(
      "Somente um administrador",
    );
    expect(
      (await autorizarFrancisco(contexto({ role: "admin" }).ctx, "clinica-1", true, true))
        .podePublicar,
    ).toBe(true);
  });
  it("falhas de consulta e vínculo inativo fecham o acesso", async () => {
    await expect(autorizarFrancisco(contexto({ ativo: false }).ctx, "clinica-1")).rejects.toThrow(
      "Sem acesso",
    );
    for (const erroTabela of [
      "clinica_memberships",
      "perfis_acesso",
      "perfil_permissoes",
      "usuario_permissoes",
    ])
      await expect(autorizarFrancisco(contexto({ erroTabela }).ctx, "clinica-1")).rejects.toThrow(
        "verificar sua permissão",
      );
  });
  it("o servidor e o menu usam o preset fechado da Arquitetura do supervisor", async () => {
    const { ctx } = contexto({ role: "supervisor", regras: [] });
    const telas = await carregarAcessosOsZap(ctx.supabase, ctx.userId, "clinica-1");
    expect(telas["nina-arquitetura"]).toBe("none");
    expect(telas["nina-homologacao"]).toBe("write");
    expect(telas["francisco-homologacao"]).toBe("none");
  });
});

describe("salvar uma configuração inteira não contorna a permissão de outra aba", () => {
  const anterior = configPadraoFrancisco();
  const soVoz = acessosFrancisco({ "francisco-voz": "write" });
  it("permite salvar a voz isoladamente", () => {
    expect(() =>
      conferirEdicaoFrancisco(soVoz, anterior, {
        ...anterior,
        voz: { ...anterior.voz, velocidade: 1.2 },
      }),
    ).not.toThrow();
  });
  it("bloqueia voz em leitura e alterações em campos de outras abas", () => {
    for (const acesso of ["none", "read"] as Acesso[])
      expect(() =>
        conferirEdicaoFrancisco(acessosFrancisco({ "francisco-voz": acesso }), anterior, {
          ...anterior,
          voz: { ...anterior.voz, velocidade: 1.2 },
        }),
      ).toThrow("Sem permissão");
    for (const patch of [
      { ativo: true },
      { temperatura: 0.5 },
      {
        templates: {
          ...anterior.templates,
          d1: { ...anterior.templates.d1, nome: "outro_template" },
        },
      },
    ])
      expect(() => conferirEdicaoFrancisco(soVoz, anterior, { ...anterior, ...patch })).toThrow(
        "Sem permissão",
      );
  });
  it("edição de mensagens não libera a arquitetura", () => {
    const soMensagens = acessosFrancisco({ "francisco-mensagens": "write" });
    expect(() =>
      conferirEdicaoFrancisco(soMensagens, anterior, {
        ...anterior,
        templates: {
          ...anterior.templates,
          d1: { ...anterior.templates.d1, nome: "outro_template" },
        },
      }),
    ).not.toThrow();
    expect(() =>
      conferirEdicaoFrancisco(soMensagens, anterior, { ...anterior, modo: "real" }),
    ).toThrow("Sem permissão");
  });
});
