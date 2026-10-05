import { describe, expect, test } from "bun:test";
import { adaptarCadastroCompleto, planejarImportacao, type CadastroImportacao } from "../catalogo-importacao";
import { importacaoCompleta, lerCadastroCompleto, lerPaginasCatalogo } from "../catalogo-importacao.server";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const CLINICA = id(9000);
function cadastro(): CadastroImportacao {
  return {
    hojeISO: "2026-10-05",
    medicos: Array.from({ length: 82 }, (_, i) => ({ id: id(i + 1), nome: `Médico ${i + 1}`, especialidade_id: null,
      ativo: i < 80, visivel_agendamento_online: i !== 79 })),
    procedimentos: [
      { id: id(101), nome: "CONSULTA", tipo: "consulta", ativo: true, valor_padrao: 120,
        preparo: "Trazer exames anteriores", observacoes: "Chegar dez minutos antes", exige_termo: true },
      { id: id(102), nome: "EXAME", tipo: "exame", ativo: true, valor_padrao: 80, preparo: "Jejum de 8 horas", observacoes: "Trazer pedido", exige_autorizacao: true },
      { id: id(103), nome: "Consulta sem médico", tipo: "consulta", ativo: true, valor_padrao: 0 },
      { id: id(104), nome: "Exame inativo", tipo: "exame", ativo: false },
      { id: id(105), nome: "Consulta inativa", tipo: "consulta", ativo: false },
    ],
    especialidades: [{ id: id(201), nome: "Cardiologia" }, { id: id(202), nome: "Clínico Geral" }],
    especialidadesMedicos: [{ medico_id: id(1), especialidade_id: id(201) }, { medico_id: id(1), especialidade_id: id(202) }],
    disponibilidades: [{ medico_id: id(1), dia_semana: 6, hora_inicio: "08:00", hora_fim: "12:00" }],
    agendas: [{ id: id(301), medico_id: id(1), nome: "Agenda", ordem_chegada: false }],
    vinculos: [
      { medico_id: id(1), procedimento_id: id(101) },
      { medico_id: id(1), procedimento_id: id(102) },
      { medico_id: id(80), procedimento_id: id(102) },
      { medico_id: id(81), procedimento_id: id(102) },
      { medico_id: id(1), procedimento_id: id(105) },
    ],
  };
}
function ambiente() {
  const raw = cadastro();
  const fontes = () => adaptarCadastroCompleto(raw);
  let role = "admin", falharNo = 0, tentativas = 0, revogar = false, corrida = false;
  const banco: Record<string, any[]> = {
    nina_cat_profissionais: fontes().filter(f => f.tipo === "profissional").slice(0, 66).map((f, i) => ({
      ...f.fonte, id: id(1000 + i), clinica_id: CLINICA, medico_id: null, estrutura: { aliases: ["Alias revisado"] },
      nome: `Dr. ${f.fonte.nome}`, status: "PUBLICADO", updated_at: "2026-10-05T12:00:00Z", nota_interna: "Nota preservada",
    })),
    nina_cat_servicos: [],
  };
  const db = { from(t: string) {
    let escrita: any, inserindo = false;
    const filtros: Record<string, unknown> = {};
    const q: any = {
      select: () => q, order: () => q,
      eq: (k: string, v: unknown) => { filtros[k] = v; return q; },
      range: async (de: number, ate: number) => ({ data: structuredClone((banco[t] ?? []).filter(r => Object.entries(filtros).every(([k, v]) => r[k] === v)).slice(de, ate + 1)), error: null }),
      update: (v: any) => { escrita = v; return q; },
      insert: (v: any) => { escrita = v; inserindo = true; return q; },
      maybeSingle: async () => {
        if (t === "clinica_memberships") return { data: filtros.clinica_id === CLINICA ? { role, ativo: true } : null, error: null };
        if (!escrita) throw Error("Leitura inesperada");
        tentativas++;
        if (falharNo === tentativas) return { data: null, error: { message: "Falha simulada" } };
        if (inserindo) {
          if (banco[t]!.some(r => r.id === escrita.id)) return { data: null, error: { code: "23505" } };
          banco[t]!.push({ ...escrita, updated_at: "2026-10-05T14:00:00Z" });
          return { data: { id: escrita.id }, error: null };
        }
        if (corrida) return { data: null, error: null };
        const r = banco[t]!.find(r => Object.entries(filtros).every(([k, v]) => r[k] === v));
        if (!r) return { data: null, error: null };
        Object.assign(r, escrita, { updated_at: "2026-10-05T14:00:00Z" });
        return { data: { id: r.id }, error: null };
      },
    };
    return q;
  } };
  const api = importacaoCompleta({ supabase: db, userId: id(9999) }, async () => {
    if (revogar) role = "telefonia";
    return fontes();
  });
  return { raw, banco, api, fontes, config: (c: { role?: string; falharNo?: number; revogar?: boolean; corrida?: boolean }) => {
    role = c.role ?? role; falharNo = c.falharNo ?? falharNo; revogar = c.revogar ?? revogar; corrida = c.corrida ?? corrida;
  }, tentativas: () => tentativas };
}

describe("adaptação completa do Clínica OS", () => {
  test("82 médicos são representados; inativos/ocultos ficam rascunho e não vazam nos executantes", () => {
    const fontes = adaptarCadastroCompleto(cadastro());
    expect(fontes.filter(f => f.fonte.estrutura.origem_clinica_os.tipo === "medico")).toHaveLength(82);
    expect(fontes.filter(f => f.somenteRascunho)).toHaveLength(6);
    const exame = fontes.find(f => f.fonte.id === id(102))!.fonte;
    expect(exame.executantes.map((x: any) => x.medico_id)).toEqual([id(1)]);
    expect(exame.descricao_publica).not.toContain("Médico 80");
    expect(exame.preparo).toBe("Jejum de 8 horas");
    expect(exame.restricoes).toBe("Exige autorização.");
    const medico = fontes[0]!.fonte;
    expect(medico.especialidades.map((x: any) => x.nome)).toEqual(["Cardiologia", "Clínico Geral"]);
    expect(medico.observacao_publica).toContain("Especialidade: Cardiologia, Clínico Geral");
    expect(medico.observacao_publica).not.toContain("Consulta inativa");
    expect(medico.observacao_publica).toContain("Preparo: Trazer exames anteriores");
    expect(medico.observacao_publica).toContain("Chegar dez minutos antes");
    expect(medico.observacao_publica).toContain("Exige termo.");
    expect(medico.horarios[0].inicio).toBe("08:00");
    const consulta = fontes.find(f => f.fonte.id === id(103))!.fonte;
    expect(consulta.medico_id).toBeNull();
    expect(consulta.formas_pagamento).toEqual([]);
    expect(consulta.estrutura.origem_clinica_os.tipo).toBe("consulta");
    expect(consulta.observacao_publica).not.toContain("Profissional: Consulta sem médico");
  });
  test("nome ambíguo, grupo, arquivado e rascunho em revisão exigem conferência", () => {
    const fontes = adaptarCadastroCompleto(cadastro()).slice(0, 1);
    const atual = { id: id(1000), nome: fontes[0]!.fonte.nome, status: "PUBLICADO" };
    for (const patch of [{ status: "ARQUIVADO" }, { rascunho: {} }, { estrutura: { abrangencia: "grupo" } }]) {
      expect(planejarImportacao(fontes, { profissional: [{ ...atual, ...patch }], servico: [] })[0]!.acao).toBe("revisar");
    }
    const repetidas = [fontes[0]!, { ...fontes[0]!, fonte: { ...fontes[0]!.fonte, id: id(2) } }];
    expect(planejarImportacao(repetidas, { profissional: [atual], servico: [] }).map(i => i.acao)).toEqual(["revisar", "revisar"]);
    expect(planejarImportacao(fontes, { profissional: [atual, { ...atual, id: id(1001) }], servico: [] })[0]!.acao).toBe("revisar");
  });
  test("exame conserva convênios ativos, especialidades e condições dos horários", () => {
    const c = cadastro();
    c.procedimentos[1]!.valor_pix = 85;
    c.convenios = [{ id: id(401), nome: "Convênio A", ativo: true }, { id: id(402), nome: "Inativo", ativo: false }];
    c.valoresConvenios = [
      { procedimento_id: id(102), convenio_id: id(401), valor_dinheiro: 70, valor_outros: 75 },
      { procedimento_id: id(102), convenio_id: id(402), valor_dinheiro: 60, valor_outros: 65 },
    ];
    c.especialidadesProcedimentos = [{ procedimento_id: id(102), especialidade_id: id(201) }];
    c.disponibilidades[0]!.observacoes = "Somente adultos";
    const s = adaptarCadastroCompleto(c).find(o => o.fonte.id === id(102))!.fonte;
    expect(s.formas_pagamento).toHaveLength(3);
    expect(s.formas_pagamento).toContainEqual({ forma: "Pix", valor: 85, condicao: null, observacao: null });
    expect(s.formas_pagamento.some((f: any) => f.condicao === "Inativo")).toBe(false);
    expect(s.descricao_publica).toContain("Especialidades cadastradas: Cardiologia.");
    expect(s.executantes[0].observacao).toBe("Sábado 08:00–12:00: Somente adultos");
  });
});
describe("sincronização completa autenticada", () => {
  test("66 registros viram 82 médicos sem duplicar nomes; repetição não grava novamente", async () => {
    const e = ambiente();
    const antes = structuredClone(e.banco);
    const p = await e.api.prever(CLINICA);
    expect(e.banco).toEqual(antes);
    expect(p.resumo).toMatchObject({ medicos: 82, profissionais: 66, atualizar: 66, criar: 20, revisar: 0 });
    const r = await e.api.aplicar(CLINICA, p.assinatura);
    expect(r.resultados.every(x => x.ok)).toBe(true);
    const medicos = e.banco.nina_cat_profissionais!.filter(x => x.medico_id);
    expect(medicos).toHaveLength(82);
    expect(new Set(medicos.map(x => x.medico_id)).size).toBe(82);
    expect(medicos.filter(x => x.status === "RASCUNHO")).toHaveLength(3);
    expect(medicos[0].estrutura.aliases).toEqual(["Alias revisado"]);
    expect(medicos[0].nota_interna).toBe("Nota preservada");
    const p2 = await e.api.prever(CLINICA);
    expect(p2.resumo).toMatchObject({ criar: 0, atualizar: 0, iguais: 86 });
    const tentativas = e.tentativas();
    await e.api.aplicar(CLINICA, p2.assinatura);
    expect(e.tentativas()).toBe(tentativas);
  });
  test("médico publicado que ficou oculto volta a rascunho", async () => {
    const e = ambiente(); e.raw.medicos[0]!.visivel_agendamento_online = false;
    const p = await e.api.prever(CLINICA);
    expect(p.itens[0]!.status).toBe("RASCUNHO");
    await e.api.aplicar(CLINICA, p.assinatura);
    expect(e.banco.nina_cat_profissionais![0].status).toBe("RASCUNHO");
  });
  test("retira médico oculto da publicação sem sobrescrever revisão pendente", async () => {
    const e = ambiente(); e.raw.medicos[0]!.visivel_agendamento_online = false;
    e.banco.nina_cat_profissionais![0].rascunho = { nome: "Edição pendente" };
    const p = await e.api.prever(CLINICA);
    await e.api.aplicar(CLINICA, p.assinatura);
    expect(e.banco.nina_cat_profissionais![0]).toMatchObject({ status: "RASCUNHO", rascunho: { nome: "Edição pendente" } });
  });
  test("lotes usam a prévia original por registro sem repetir os primeiros cinquenta", async () => {
    const e = ambiente(); const p = await e.api.prever(CLINICA);
    const alvos = p.itens.map(i => ({ tipo: i.tipo, fonteId: i.fonteId, assinatura: i.assinatura }));
    expect((await e.api.aplicar(CLINICA, p.assinatura, alvos.slice(0, 50))).processados).toBe(50);
    expect((await e.api.aplicar(CLINICA, p.assinatura, alvos.slice(50))).resultados.every(i => i.ok)).toBe(true);
    await expect(e.api.aplicar(CLINICA, p.assinatura, alvos.slice(0, 50))).rejects.toThrow("mudou");
    expect(e.banco.nina_cat_profissionais!.filter(i => i.medico_id)).toHaveLength(82);
    await expect(e.api.aplicar(CLINICA, p.assinatura, [alvos[0]!, alvos[0]!])).rejects.toThrow("Lote inválido");
  });
  test("rejeita hash adulterado ou dados alterados depois da prévia", async () => {
    const e = ambiente(); const p = await e.api.prever(CLINICA);
    await expect(e.api.aplicar(CLINICA, "inventado")).rejects.toThrow("mudou");
    e.raw.medicos[0]!.nome = "Nome alterado";
    await expect(e.api.aplicar(CLINICA, p.assinatura)).rejects.toThrow("mudou");
    expect(e.tentativas()).toBe(0);
  });
  test("falha parcial informa concluídos e permite retomar por nova prévia", async () => {
    const e = ambiente(); const p = await e.api.prever(CLINICA); e.config({ falharNo: 2 });
    const r = await e.api.aplicar(CLINICA, p.assinatura);
    expect(r.processados).toBe(2); expect(r.total).toBe(86);
    expect(r.resultados.map(x => x.ok)).toEqual([true, false]);
    const p2 = await e.api.prever(CLINICA);
    expect(p2.resumo.iguais).toBe(1);
    expect((await e.api.aplicar(CLINICA, p2.assinatura)).resultados.every(x => x.ok)).toBe(true);
    expect(e.banco.nina_cat_profissionais!.filter(x => x.medico_id)).toHaveLength(82);
  });
  test("CAS bloqueia concorrência e permissão é revalidada", async () => {
    const e = ambiente(); const p = await e.api.prever(CLINICA); e.config({ corrida: true });
    expect((await e.api.aplicar(CLINICA, p.assinatura)).resultados[0]!.ok).toBe(false);
    const revogado = ambiente(); revogado.config({ revogar: true });
    await expect(revogado.api.prever(CLINICA)).rejects.toThrow("administradores");
    expect(revogado.tentativas()).toBe(0);
    const negado = ambiente(); negado.config({ role: "telefonia" });
    await expect(negado.api.prever(CLINICA)).rejects.toThrow("administradores");
    await expect(ambiente().api.prever(id(9990))).rejects.toThrow("administradores");
  });
  test("leitor pagina acima de mil e propaga falhas de leitura", async () => {
    const rows = Array.from({ length: 2082 }, (_, i) => i);
    expect(await lerPaginasCatalogo(() => ({ range: async (de: number, ate: number) => ({ data: rows.slice(de, ate + 1), error: null }) }))).toEqual(rows);
    expect(await lerPaginasCatalogo(() => ({ range: async (de: number) => ({ data: rows.slice(de, de + 100), error: null }) }))).toEqual(rows);
    await expect(lerPaginasCatalogo(() => ({ range: async () => ({ data: null, error: { message: "Falhou" } }) }))).rejects.toThrow("Falhou");
  });
  test("leitura inclui inativos, filtra clínica e nunca seleciona dados privados dos médicos", async () => {
    const leituras: any[] = [];
    const db = { from(tabela: string) { const l: any = { tabela, filtros: {} }; leituras.push(l);
      const q: any = { select: (campos: string) => { l.campos = campos; return q; },
        eq: (k: string, v: any) => { l.filtros[k] = v; return q; }, order: () => q,
        range: async () => ({ data: [], error: null }) }; return q;
    } };
    expect(await lerCadastroCompleto(db, CLINICA)).toEqual([]);
    for (const tabela of ["medicos", "procedimentos"]) expect(leituras.find(l => l.tabela === tabela).filtros).toEqual({ clinica_id: CLINICA });
    expect(leituras.find(l => l.tabela === "medicos").campos).not.toMatch(/cpf|banco|email|telefone|repasse|face|pix/);
    for (const tabela of ["medico_procedimentos", "medico_especialidades"]) expect(leituras.find(l => l.tabela === tabela).filtros).toEqual({ "medicos.clinica_id": CLINICA });
    for (const tabela of ["cb_convenios", "procedimento_cb_convenio_valores"]) expect(leituras.find(l => l.tabela === tabela).filtros).toEqual({ clinica_id: CLINICA });
    expect(leituras.find(l => l.tabela === "procedimento_especialidades").filtros).toEqual({ "procedimentos.clinica_id": CLINICA });
    expect(leituras.find(l => l.tabela === "procedimentos").campos).toContain("valor_pix");
    expect(leituras.find(l => l.tabela === "procedimentos").campos).toContain("valor_variavel");
  });
});
