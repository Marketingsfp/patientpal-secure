import { beforeEach, expect, test } from "bun:test";
import {
  FLAG_VOZ_NINA,
  VOZ_PADRAO,
  VOZES_NINA,
  selecaoVoz,
  vozConfigSchema,
  instrucoesVoz,
} from "../voz-config";
import { gerenciarVozNina, lerVozNina } from "../voz-config.server";
let tabelas: Record<string, any[]>;
let falha: string | null;
let conflito: boolean;
const db = {
  from(tabela: string) {
    const filtros: Record<string, unknown> = {};
    let valores: any,
      operacao = "read",
      unico = false;
    const executar = () => {
      if (falha === tabela) return { data: null, error: { message: "falha simulada" } };
      const linhas = (tabelas[tabela] ??= []);
      let resultado = linhas.filter((l) => Object.entries(filtros).every(([k, v]) => l[k] === v));
      if (operacao === "insert") {
        if (conflito && tabela === "clinica_feature_flags")
          return { data: null, error: { code: "23505" } };
        const linha = structuredClone(valores);
        linhas.push(linha);
        resultado = [linha];
      } else if (operacao === "update") {
        if (conflito) resultado = [];
        resultado.forEach((l) => Object.assign(l, structuredClone(valores)));
      }
      return { data: unico ? (resultado[0] ?? null) : resultado, error: null };
    };
    const q: any = {
      select() {
        return q;
      },
      eq(k: string, v: unknown) {
        filtros[k] = v;
        return q;
      },
      insert(v: unknown) {
        valores = v;
        operacao = "insert";
        return q;
      },
      update(v: unknown) {
        valores = v;
        operacao = "update";
        return q;
      },
      maybeSingle() {
        unico = true;
        return Promise.resolve(executar());
      },
      then(resolve: any) {
        return Promise.resolve(executar()).then(resolve);
      },
    };
    return q;
  },
};
const servico = () => gerenciarVozNina({ supabase: db, userId: "operador" }, db);
beforeEach(() => {
  tabelas = {
    clinica_memberships: [{ id: "m", clinica_id: "a", user_id: "operador", ativo: true }],
    user_roles: [{ clinica_id: "a", user_id: "operador", role: "admin" }],
    clinica_feature_flags: [],
    audit_log: [],
  };
  falha = null;
  conflito = false;
});

test("Nova padrão mantém interruptor legado; configuração inválida não altera desativação", () => {
  expect(selecaoVoz(null)).toMatchObject({
    configuracao: VOZ_PADRAO,
    audioAtivo: true,
    revisao: null,
  });
  expect(selecaoVoz({ ativo: true })).toMatchObject({ audioAtivo: false });
  expect(selecaoVoz({ ativo: true, config: { voz_nina: { voz: "inexistente" } } })).toMatchObject({
    configuracao: VOZ_PADRAO,
    audioAtivo: false,
    origem: "configuracao_invalida",
  });
  for (const voz of VOZES_NINA)
    expect(vozConfigSchema.safeParse({ ...VOZ_PADRAO, voz }).success).toBe(true);
  for (const patch of [
    { velocidade: 0 },
    { velocidade: 4.1 },
    { velocidade: "1" },
    { limiteResumo: 99 },
    { limiteResumo: 3001 },
    { limiteResumo: 101.2 },
    { orientacoes: "a".repeat(2001) },
    { voz: "invalid" },
    { respostasLongas: "inventar" },
  ])
    expect(vozConfigSchema.safeParse({ ...VOZ_PADRAO, ...patch }).success).toBe(false);
});
test("instruções de fala preservam o conteúdo e só entram quando personalizadas", () => {
  expect(instrucoesVoz(VOZ_PADRAO)).toBeUndefined();
  const instrucoes = instrucoesVoz({
    ...VOZ_PADRAO,
    estilo: "acolhedor",
    orientacoes: "Pronuncie ECG letra por letra.",
  });
  expect(instrucoes).toContain("acolhedor");
  expect(instrucoes).toContain("ECG letra por letra");
  expect(instrucoes).toContain("Preserve nomes, valores e números");
});
test("salva voz por clínica sem alterar outros campos e guarda histórico atômico", async () => {
  const config = { ...VOZ_PADRAO, voz: "coral" as const, velocidade: 0.9 };
  const salvo = await servico().salvar("a", config, false, null);
  const linha = tabelas.clinica_feature_flags[0];
  linha.config.preservar = "sim";
  linha.created_by = "criador-original";
  expect(await lerVozNina("a", db)).toMatchObject({ configuracao: config, audioAtivo: false });
  expect((await lerVozNina("b", db)).configuracao.voz).toBe("nova");
  await servico().salvar("a", { ...config, voz: "marin" }, true, salvo.revisao);
  expect((await lerVozNina("a", db)).configuracao.voz).toBe("marin");
  expect(linha.created_by).toBe("criador-original");
  expect(linha.config.preservar).toBe("sim");
  expect(linha.flag_key).toBe(FLAG_VOZ_NINA);
  expect(linha.config.historico_voz).toHaveLength(2);
  expect(linha.config.historico_voz[1]).toMatchObject({
    usuario: "operador",
    antes: { audioAtivo: false },
    depois: { audioAtivo: true },
  });
  expect(tabelas.audit_log).toHaveLength(2);
});
test("telefone, recepção e outra clínica não acessam; gestor e supervisor somente leem", async () => {
  for (const role of ["telefonia", "recepcao"]) {
    tabelas.user_roles[0].role = role;
    await expect(servico().carregar("a")).rejects.toThrow("permissão");
  }
  for (const role of ["gestor", "supervisor"]) {
    tabelas.user_roles[0].role = role;
    expect((await servico().carregar("a")).podeEditar).toBe(false);
    await expect(servico().salvar("a", VOZ_PADRAO, true, null)).rejects.toThrow("permissão");
    await expect(servico().previa("a", VOZ_PADRAO, "Olá")).rejects.toThrow("permissão");
  }
  await expect(servico().carregar("b")).rejects.toThrow("acesso");
  tabelas.clinica_memberships[0].ativo = false;
  await expect(servico().carregar("a")).rejects.toThrow("acesso");
});
test("servidor rejeita configurações e prévias inválidas antes de chamar o provedor", async () => {
  await expect(
    servico().salvar("a", { ...VOZ_PADRAO, velocidade: 8 }, true, null),
  ).rejects.toThrow();
  await expect(servico().previa("a", VOZ_PADRAO, " ")).rejects.toThrow();
  await expect(servico().previa("a", VOZ_PADRAO, "a".repeat(601))).rejects.toThrow();
  expect(tabelas.clinica_feature_flags).toHaveLength(0);
  expect(tabelas.audit_log).toHaveLength(0);
});
test("revisão antiga e colisões não sobrescrevem outra edição", async () => {
  const salvo = await servico().salvar("a", VOZ_PADRAO, true, null);
  await expect(servico().salvar("a", VOZ_PADRAO, false, null)).rejects.toThrow("outra pessoa");
  conflito = true;
  await expect(servico().salvar("a", VOZ_PADRAO, false, salvo.revisao)).rejects.toThrow(
    "outra pessoa",
  );
  tabelas.clinica_feature_flags = [];
  await expect(servico().salvar("a", VOZ_PADRAO, false, null)).rejects.toThrow("outra pessoa");
});
test("falhas de leitura e autorização não viram sucesso; falha de auditoria avisa e preserva histórico", async () => {
  falha = "clinica_feature_flags";
  await expect(lerVozNina("a", db)).rejects.toThrow("carregar");
  await expect(servico().carregar("a")).rejects.toThrow("carregar");
  falha = "user_roles";
  await expect(servico().salvar("a", VOZ_PADRAO, true, null)).rejects.toThrow("permissões");
  falha = "audit_log";
  expect((await servico().salvar("a", VOZ_PADRAO, true, null)).aviso).toContain("histórico");
  expect(tabelas.clinica_feature_flags[0].config.historico_voz).toHaveLength(1);
});
