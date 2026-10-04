import { beforeEach, expect, it, mock } from "bun:test";
import { FLAG_FONTE_CONSULTA, selecaoFonte } from "../fonte-consulta";
import { alinharFonteDaSessao } from "../fonte-consulta-sessao";
import { estadoVazio, normalizarEstado } from "../fluxo-estado-normalizar";

// Executar este arquivo em processo próprio: mocks não são compartilhados com outras suítes.
let tabelas: Record<string, any[]>;
let falha: string | null;
let conflito: boolean;
let leiturasOS: string[];
let chamadas: Array<{ tabela: string; colunas: string; filtros: Record<string, unknown>; operacao: string }>;
const db = { from(tabela: string) {
  const filtros: Record<string, unknown> = {};
  let colunas = "*", cursor = "", operacao = "read", valores: any, unico = false;
  const executar = () => {
    chamadas.push({ tabela, colunas, filtros: { ...filtros }, operacao });
    if (falha === tabela) return { data: null, error: { message: "indisponível" } };
    const linhas = tabelas[tabela] ?? [];
    let selecionadas = linhas.filter(l => Object.entries(filtros).every(([k, v]) => l[k] === v));
    if (operacao === "insert") {
      if (conflito && tabela === "clinica_feature_flags") return { data: null, error: { code: "23505" } };
      const linha = structuredClone({ id: "nova-config", ...valores });
      (tabelas[tabela] ??= []).push(linha); selecionadas = [linha];
    } else if (operacao === "update") {
      if (conflito) selecionadas = [];
      selecionadas.forEach(l => Object.assign(l, structuredClone(valores)));
    }
    if (cursor) selecionadas = selecionadas.filter(l => l.id > cursor);
    // Simula servidor limitando páginas a 100 mesmo com limit(250).
    selecionadas = selecionadas.sort((a, b) => String(a.id).localeCompare(String(b.id))).slice(0, 100);
    const projecao = selecionadas.map(l => colunas === "*" ? structuredClone(l) : Object.fromEntries(
      colunas.split(",").map(c => c.trim()).map(c => c === "unidades(nome)" ? "unidades" : c).map(c => [c, structuredClone(l[c])])));
    return { data: unico ? projecao[0] ?? null : projecao, error: null };
  };
  const q: any = {
    select(c: string) { colunas = c; return q; }, eq(k: string, v: unknown) { filtros[k] = v; return q; },
    order() { return q; }, limit() { return q; }, gt(_k: string, v: string) { cursor = v; return q; },
    insert(v: unknown) { operacao = "insert"; valores = v; return q; },
    update(v: unknown) { operacao = "update"; valores = v; return q; },
    maybeSingle() { unico = true; return q; },
    then(ok: any, erro: any) { return Promise.resolve(executar()).then(ok, erro); },
  };
  return q;
} };
mock.module("@/integrations/supabase/client.server", () => ({ supabaseAdmin: db }));
mock.module("../evidencias.server", () => ({ registrarEtapa: () => {} }));
mock.module("../fonte-operacional.server", () => ({ lerFonteOperacional: async (clinica: string) => {
  leiturasOS.push(clinica);
  return { servicos: [{ id: "os-exame", nome: "Ultrassonografia", valor: 90, status: "PUBLICADO" }], profissionais: [] };
} }));
const { lerFonteEditorial } = await import("../fonte-editorial.server");
const { gerenciarFonteConsulta } = await import("../fonte-consulta-admin.server");
const { catalogoDoTurno, comCatalogoDoTurno } = await import("../catalogo-turno.server");
const { lerSelecaoFonte } = await import("../fonte-consulta-config.server");
const { buscarNoCatalogo } = await import("../catalogo-retrieval.server");
const { lerDicionarioDaMensagem } = await import("../dicionario-leitura.server");

it("consulta dicionário só na base, reutiliza leitura concorrente e atualiza no próximo turno", async () => {
  configurar();
  await comCatalogoDoTurno("clinica-a", async () => {
    const [a, b] = await Promise.all([lerDicionarioDaMensagem("clinica-a", "Quero ultra"), lerDicionarioDaMensagem("clinica-a", "Quero ultra")]);
    expect(a).toEqual(b);
    expect(a.status).toBe("consultado");
    expect(JSON.stringify(a)).toContain("base-exame");
    expect(chamadas.filter(c => c.tabela === "nina_cat_servicos")).toHaveLength(2); // página e fim
    tabelas.nina_cat_servicos[0].estrutura.aliases = ["novo termo"];
    expect(JSON.stringify(await lerDicionarioDaMensagem("clinica-a", "ultra"))).toContain("base-exame");
  });
  expect(JSON.stringify(await comCatalogoDoTurno("clinica-a", () => lerDicionarioDaMensagem("clinica-a", "novo termo")))).toContain("base-exame");
  configurar("clinica_os"); chamadas = [];
  expect(await lerDicionarioDaMensagem("clinica-a", "ultra")).toEqual({ status: "nao_aplicavel" });
  expect(chamadas.some(c => c.tabela.startsWith("nina_cat_"))).toBe(false);
});

it("falha de leitura não é dicionário vazio e não ativa outra fonte", async () => {
  configurar(); falha = "nina_cat_servicos";
  expect(await lerDicionarioDaMensagem("clinica-a", "ultra")).toEqual({ status: "indisponivel" });
  expect(leiturasOS).toEqual([]);
});

function configurar(fonte = "base_conhecimento", revisao = "v1", clinica = "clinica-a") {
  tabelas.clinica_feature_flags = [{ id: "config", clinica_id: clinica, flag_key: FLAG_FONTE_CONSULTA,
    ativo: true, config: { fonte, historico: [{ usuario: "anterior" }], preservar: "sim" }, updated_at: revisao, created_by: "criador" }];
}
const admin = () => gerenciarFonteConsulta({ supabase: db, userId: "gestor" }, db);
beforeEach(() => {
  tabelas = {
    clinica_memberships: [{ id: "m", clinica_id: "clinica-a", user_id: "gestor", ativo: true, role: "gestor" }],
    nina_cat_servicos: [{ id: "base-exame", clinica_id: "clinica-a", status: "PUBLICADO", nome: "Ultrassonografia", valor: 150,
      estrutura: { aliases: ["ultra"] }, nota_interna: "SEGREDO", rascunho: { valor: 777 } }],
    nina_cat_profissionais: [], clinica_feature_flags: [],
  };
  falha = null; conflito = false; leiturasOS = []; chamadas = [];
});

it("mantém Clínica OS como padrão, sem aceitar configuração inválida", () => {
  expect(selecaoFonte(null)).toEqual({ fonte: "clinica_os", revisao: null });
  expect(() => selecaoFonte({ ativo: true, config: { fonte: "internet" } })).toThrow("inválida");
});
it("consulta só a fonte selecionada, fixa no turno e atualizada no próximo", async () => {
  await comCatalogoDoTurno("clinica-a", async () => {
    expect((await catalogoDoTurno("clinica-a")).servicos[0].valor).toBe(90);
    configurar();
    expect((await catalogoDoTurno("clinica-a")).servicos[0].valor).toBe(90);
  });
  await comCatalogoDoTurno("clinica-a", async () => {
    const base = await catalogoDoTurno("clinica-a");
    expect(base.servicos[0].valor).toBe(150);
    expect(base.selecao.fonte).toBe("base_conhecimento");
    base.servicos[0].valor = 999;
    expect((await catalogoDoTurno("clinica-a")).servicos[0].valor).toBe(150);
  });
  expect(leiturasOS).toEqual(["clinica-a"]);
  configurar("clinica_os", "v2");
  expect((await catalogoDoTurno("clinica-a")).servicos[0].valor).toBe(90);
});
it("isola clínicas e rejeita consultas cruzadas no mesmo turno", async () => {
  configurar();
  const [a, b] = await Promise.all(["clinica-a", "clinica-b"].map(c => comCatalogoDoTurno(c, () => catalogoDoTurno(c))));
  expect(a.selecao.fonte).toBe("base_conhecimento"); expect(b.selecao.fonte).toBe("clinica_os");
  await expect(comCatalogoDoTurno("clinica-a", async () => { await catalogoDoTurno("clinica-b"); })).rejects.toThrow("clínica");
});
it("recupera variação publicada e devolve a fonte real, sem preço do outro cadastro", async () => {
  configurar();
  const r = await buscarNoCatalogo({ clinicaId: "clinica-a", query: "ultra", tipo_atendimento: "exame_procedimento" });
  expect(r.found).toBe(true); expect(r.fonte_consulta).toBe("base_conhecimento");
  expect(JSON.stringify(r)).toContain("150,00"); expect(JSON.stringify(r)).not.toContain("90,00");
  expect(leiturasOS).toEqual([]);
});
it("lê todas as páginas publicadas, sem rascunhos, notas ou registros de outra clínica", async () => {
  const item = tabelas.nina_cat_servicos[0];
  tabelas.nina_cat_servicos = Array.from({ length: 260 }, (_, i) => ({ ...item, id: String(i).padStart(4, "0") }));
  tabelas.nina_cat_servicos.push({ ...item, id: "draft", status: "RASCUNHO" }, { ...item, id: "outro", clinica_id: "clinica-b" });
  const r = await lerFonteEditorial("clinica-a");
  expect(r.servicos).toHaveLength(260);
  expect(JSON.stringify(r)).not.toContain("SEGREDO"); expect(JSON.stringify(r)).not.toContain("777");
  expect(r.servicos[0].estrutura).toEqual({ aliases: ["ultra"] });
});
it("não recorre ao Clínica OS quando a base está vazia ou indisponível", async () => {
  configurar(); tabelas.nina_cat_servicos = [];
  expect((await catalogoDoTurno("clinica-a")).servicos).toEqual([]);
  falha = "nina_cat_servicos";
  await expect(catalogoDoTurno("clinica-a")).rejects.toThrow("base publicada");
  expect(leiturasOS).toEqual([]);
});
it("falha de configuração não vira consulta à fonte padrão", async () => {
  falha = "clinica_feature_flags";
  await expect(lerSelecaoFonte("clinica-a")).rejects.toThrow("conferir");
  await expect(catalogoDoTurno("clinica-a")).rejects.toThrow("conferir");
  expect(leiturasOS).toEqual([]);
});
it("somente ler a tela não altera a configuração", async () => {
  expect((await admin().carregar("clinica-a")).fonte).toBe("clinica_os");
  expect(chamadas.every(c => c.operacao === "read")).toBe(true);
});
it("troca manual registra autor e histórico sem apagar dados existentes", async () => {
  configurar("clinica_os");
  const r = await admin().aplicar("clinica-a", "base_conhecimento", "v1");
  expect(r.fonte).toBe("base_conhecimento"); expect(r.aviso).toBeNull();
  const salvo = tabelas.clinica_feature_flags[0];
  expect(salvo.created_by).toBe("criador"); expect(salvo.updated_by).toBe("gestor");
  expect(salvo.config.preservar).toBe("sim"); expect(salvo.config.historico).toHaveLength(2);
  expect(tabelas.audit_log[0].user_id).toBe("gestor");
  expect(chamadas.filter(c => c.operacao !== "read").map(c => c.tabela)).toEqual(["clinica_feature_flags", "audit_log"]);
});
it("pode criar a seleção na primeira troca e voltar ao cadastro", async () => {
  const r = await admin().aplicar("clinica-a", "base_conhecimento", null);
  expect((await admin().aplicar("clinica-a", "clinica_os", r.revisao)).fonte).toBe("clinica_os");
});
it("não permite ativar base vazia nem salva após erro de leitura", async () => {
  tabelas.nina_cat_servicos = [];
  await expect(admin().aplicar("clinica-a", "base_conhecimento", null)).rejects.toThrow("Publique");
  falha = "nina_cat_profissionais";
  await expect(admin().aplicar("clinica-a", "base_conhecimento", null)).rejects.toThrow("base publicada");
  expect(tabelas.clinica_feature_flags).toEqual([]);
});
it("bloqueia telefonia, membro inativo e alteração de outra clínica", async () => {
  tabelas.clinica_memberships[0].role = "telefonia";
  await expect(admin().aplicar("clinica-a", "base_conhecimento", null)).rejects.toThrow("administradores");
  tabelas.clinica_memberships[0].role = "admin";
  await expect(admin().aplicar("clinica-b", "base_conhecimento", null)).rejects.toThrow("Sem acesso");
  tabelas.clinica_memberships[0].ativo = false;
  await expect(admin().carregar("clinica-a")).rejects.toThrow("Sem acesso");
  expect(chamadas.every(c => c.operacao === "read")).toBe(true);
});
it("protege contra atualização concorrente antes e durante a gravação", async () => {
  configurar("clinica_os");
  await expect(admin().aplicar("clinica-a", "base_conhecimento", "velha")).rejects.toThrow("outra pessoa");
  conflito = true;
  await expect(admin().aplicar("clinica-a", "base_conhecimento", "v1")).rejects.toThrow("outra pessoa");
  tabelas.clinica_feature_flags = [];
  await expect(admin().aplicar("clinica-a", "base_conhecimento", null)).rejects.toThrow("outra pessoa");
});
it("limpa referências e escolhas antigas preservando paciente e sessão", () => {
  const e = estadoVazio(); e.session_id = "sessao"; e.patient.first_name = "Paciente";
  e.appointment.doctor_id = "anterior"; e.appointment.price = "90";
  const nova = { fonte: "base_conhecimento" as const, revisao: "v1" };
  expect(alinharFonteDaSessao(e, nova)).toBe(true);
  expect(e.appointment.doctor_id).toBeNull(); expect(e.appointment.price).toBeNull();
  expect(e.session_id).toBe("sessao"); expect(e.patient.first_name).toBe("Paciente");
  expect(normalizarEstado(e).fonte_consulta).toEqual(nova);
  expect(alinharFonteDaSessao(e, nova)).toBe(false);
  expect(alinharFonteDaSessao(e, { ...nova, revisao: "v3" })).toBe(true);
});
it("não desfaz reserva existente durante troca de fonte", () => {
  const e = estadoVazio(); e.appointment.appointment_id = "reserva"; e.appointment.doctor_id = "medico";
  alinharFonteDaSessao(e, { fonte: "base_conhecimento", revisao: "v1" });
  expect(e.appointment.appointment_id).toBe("reserva"); expect(e.appointment.doctor_id).toBe("medico");
});
