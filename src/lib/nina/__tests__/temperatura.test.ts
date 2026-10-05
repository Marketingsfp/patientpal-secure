import { beforeEach, expect, test } from "bun:test";
import { FLAG_TEMPERATURA_NINA, selecaoTemperatura, temperaturaSchema } from "../temperatura";
import { gerenciarTemperaturaNina, lerTemperaturaNina } from "../temperatura.server";

let tabelas: Record<string, any[]>;
let falha: string | null;
let conflito: boolean;
const db = { from(tabela: string) {
  const filtros: Record<string, unknown> = {};
  let valores: any, operacao = "read", unico = false;
  const executar = () => {
    if (falha === tabela) return { data: null, error: { message: "falha simulada" } };
    const linhas = tabelas[tabela] ??= [];
    let resultado = linhas.filter(l => Object.entries(filtros).every(([k, v]) => l[k] === v));
    if (operacao === "insert") {
      if (conflito && tabela === "clinica_feature_flags") return { data: null, error: { code: "23505" } };
      const linha = structuredClone(valores); linhas.push(linha); resultado = [linha];
    } else if (operacao === "update") {
      if (conflito) resultado = [];
      resultado.forEach(l => Object.assign(l, structuredClone(valores)));
    }
    return { data: unico ? resultado[0] ?? null : resultado, error: null };
  };
  const q: any = {
    select() { return q; }, eq(k: string, v: unknown) { filtros[k] = v; return q; },
    insert(v: unknown) { valores = v; operacao = "insert"; return q; },
    update(v: unknown) { valores = v; operacao = "update"; return q; },
    maybeSingle() { unico = true; return Promise.resolve(executar()); },
    then(resolve: any) { return Promise.resolve(executar()).then(resolve); },
  }; return q;
} };
const servico = () => gerenciarTemperaturaNina({ supabase: db, userId: "operador" }, db);
beforeEach(() => {
  tabelas = {
    clinica_memberships: [{ id: "m", clinica_id: "a", user_id: "operador", ativo: true }],
    user_roles: [{ clinica_id: "a", user_id: "operador", role: "admin" }],
    clinica_feature_flags: [], audit_log: [],
  };
  falha = null; conflito = false;
});

test("padrão 1,0; zero preservado; inválidos nunca viram temperatura", () => {
  expect(selecaoTemperatura(null).temperatura).toBe(1);
  expect(selecaoTemperatura({ ativo: true, config: { temperatura: 0 } }).temperatura).toBe(0);
  for (const valor of [null, "", "1", -0.1, 2.1, NaN, Infinity]) {
    expect(temperaturaSchema.safeParse(valor).success).toBe(false);
    expect(selecaoTemperatura({ config: { temperatura: valor } }).origem).toBe("padrao_configuracao_invalida");
  }
});
test("persiste por clínica, relê sem cache e conserva histórico e campos anteriores", async () => {
  expect(await servico().carregar("a")).toMatchObject({ temperatura: 1, podeEditar: true, revisao: null });
  const salvo = await servico().salvar("a", 0, null);
  expect(salvo.temperatura).toBe(0);
  const linha = tabelas.clinica_feature_flags[0];
  linha.config.preservar = "sim";
  expect(await lerTemperaturaNina("a", db)).toMatchObject({ temperatura: 0, origem: "configurada" });
  expect((await lerTemperaturaNina("b", db)).temperatura).toBe(1);
  await servico().salvar("a", 2, salvo.revisao);
  expect((await lerTemperaturaNina("a", db)).temperatura).toBe(2);
  expect(linha.config.historico).toHaveLength(2);
  expect(linha.config.historico[1]).toMatchObject({ usuario: "operador", antes: 0, depois: 2 });
  expect(linha.config.preservar).toBe("sim");
  expect(linha.created_by).toBe("operador");
  expect(linha.flag_key).toBe(FLAG_TEMPERATURA_NINA);
  expect(tabelas.audit_log).toHaveLength(2);
});
test("rejeita valor inválido no serviço, mesmo sem passar pelo endpoint", async () => {
  await expect(servico().salvar("a", -1, null)).rejects.toThrow();
  expect(tabelas.clinica_feature_flags).toHaveLength(0);
});
test("gestor visualiza mas não altera; membro inativo e outra clínica não acessam", async () => {
  tabelas.user_roles[0].role = "gestor";
  expect((await servico().carregar("a")).podeEditar).toBe(false);
  await expect(servico().salvar("a", 0.5, null)).rejects.toThrow("permissão");
  await expect(servico().carregar("b")).rejects.toThrow("acesso");
  tabelas.clinica_memberships[0].ativo = false;
  await expect(servico().carregar("a")).rejects.toThrow("acesso");
  expect(tabelas.clinica_feature_flags).toHaveLength(0);
});
test("recepção e falha de permissão não acessam a configuração", async () => {
  tabelas.user_roles[0].role = "recepcao";
  await expect(servico().carregar("a")).rejects.toThrow("permissão");
  falha = "user_roles";
  await expect(servico().salvar("a", 1, null)).rejects.toThrow("permissões");
});
test("edição concorrente e criação duplicada exigem recarregar", async () => {
  const salvo = await servico().salvar("a", 0.5, null);
  await expect(servico().salvar("a", 2, null)).rejects.toThrow("outra pessoa");
  conflito = true;
  await expect(servico().salvar("a", 2, salvo.revisao)).rejects.toThrow("outra pessoa");
  tabelas.clinica_feature_flags = [];
  await expect(servico().salvar("a", 2, null)).rejects.toThrow("outra pessoa");
});
test("falha de leitura não quebra atendimento; painel não finge carregamento bem sucedido", async () => {
  falha = "clinica_feature_flags";
  expect(await lerTemperaturaNina("a", db)).toMatchObject({ temperatura: 1, origem: "padrao_falha_leitura" });
  await expect(servico().carregar("a")).rejects.toThrow("ler a temperatura");
});
test("falha na auditoria adicional preserva histórico atômico e avisa", async () => {
  falha = "audit_log";
  const r = await servico().salvar("a", 0.8, null);
  expect(r.aviso).toContain("histórico");
  expect(tabelas.clinica_feature_flags[0].config.historico).toHaveLength(1);
});
