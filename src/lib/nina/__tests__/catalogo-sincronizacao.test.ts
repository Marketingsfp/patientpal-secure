import { describe, expect, test } from "bun:test";
import {
  candidatosMapeamento,
  escolhaMapeamento,
  prepararSincronizacao,
  type RegistroSincronizacao,
} from "../catalogo-sincronizacao";
import { sincronizacaoManual } from "../catalogo-sincronizacao.server";

const CLINICA = "11111111-1111-4111-8111-111111111111";
const ID = "22222222-2222-4222-8222-222222222222";
const FONTE = "33333333-3333-4333-8333-333333333333";
const VERSAO = "2026-10-04T12:00:00.123456+00:00";
const atual = (): RegistroSincronizacao => ({
  id: ID,
  clinica_id: CLINICA,
  nome: "USG abdome total",
  status: "PUBLICADO",
  updated_at: VERSAO,
  rascunho: null,
  procedimento_id: null,
  valor: 200,
  preparo: "Antigo",
  descricao_publica: "Descrição antiga",
  restricoes: "Restrição antiga",
  nota_interna: "Revisado pela equipe",
  estrutura: {
    versao: 1,
    aliases: ["ultrassom de abdome total"],
    pedido_medico: "obrigatorio",
    complementos: [{ chave: "velha", idade_minima: 18, unidade_idade: "anos" }],
  },
});
const fonte = (): RegistroSincronizacao => ({
  id: FONTE,
  procedimento_id: FONTE,
  nome: "Ultrassonografia de abdome total",
  valor: 120,
  preparo: null,
  descricao_publica: "Descrição da origem",
  restricoes: null,
  valor_observacao: null,
  formas_pagamento: [{ forma: "Dinheiro", valor: 120, condicao: null, observacao: null }],
  executantes: [],
  estrutura: { versao: 1, categoria: "exame_procedimento", aliases: [], complementos: [] },
});

function ambiente() {
  let r = atual(),
    origem = fonte(),
    role = "admin",
    erroFonte = false,
    corrida = false,
    revogarNaLeitura = false;
  let escritas = 0,
    leiturasFonte = 0,
    chamadasJev = 0;
  const sb = {
    from(t: string) {
      let dados: any;
      const filtros: Record<string, unknown> = {};
      const q: any = {
        select: () => q,
        eq: (k: string, v: unknown) => {
          filtros[k] = v;
          return q;
        },
        update: (v: any) => {
          dados = v;
          return q;
        },
        maybeSingle: async () => {
          if (t === "clinica_memberships")
            return { data: filtros.clinica_id === CLINICA && role ? { role } : null, error: null };
          if (t !== "nina_cat_servicos") throw Error("Tabela indevida");
          if (filtros.clinica_id !== r.clinica_id || filtros.id !== r.id)
            return { data: null, error: null };
          if (dados) {
            if (corrida || filtros.updated_at !== r.updated_at) return { data: null, error: null };
            escritas++;
            r = { ...r, ...dados, updated_at: "2026-10-04T13:00:00+00:00" };
          }
          return { data: structuredClone(r), error: null };
        },
      };
      return q;
    },
  };
  const api = sincronizacaoManual(
    { supabase: sb, userId: "operador" },
    {
      lerFonte: async () => {
        leiturasFonte++;
        if (revogarNaLeitura) role = "telefonia";
        if (erroFonte) throw Error("Fonte indisponível");
        return { servicos: origem ? [structuredClone(origem)] : [], profissionais: [] };
      },
      perguntar: async () => {
        chamadasJev++;
        return {
          ok: true,
          respostas: { vinculo: { choice: FONTE, confidence: 0.99 } },
          latencyMs: 15,
        };
      },
    },
  );
  return {
    api,
    ver: () => ({ r, escritas, leiturasFonte, chamadasJev }),
    configurar: (x: {
      registro?: RegistroSincronizacao;
      origem?: RegistroSincronizacao;
      role?: string;
      erroFonte?: boolean;
      corrida?: boolean;
      revogarNaLeitura?: boolean;
    }) => {
      if (x.registro) r = x.registro;
      if (x.origem) origem = x.origem;
      if (x.role !== undefined) role = x.role;
      if (x.erroFonte !== undefined) erroFonte = x.erroFonte;
      if (x.corrida !== undefined) corrida = x.corrida;
      if (x.revogarNaLeitura !== undefined) revogarNaLeitura = x.revogarNaLeitura;
    },
  };
}
describe("sincronização manual da base", () => {
  test("copia fatos da origem, preserva dicionário e nota; mostra remoção de regras antigas", () => {
    const p = prepararSincronizacao("servico", atual(), fonte());
    expect(p.dados.nome).toBe(fonte().nome);
    expect(p.dados.estrutura?.aliases).toEqual(atual().estrutura.aliases);
    expect(p.dados.nota_interna).toBe(atual().nota_interna);
    expect(p.dados.estrutura?.pedido_medico).toBe("nao_informado");
    expect(p.dados.estrutura?.complementos).toEqual([]);
    expect(p.dados).toMatchObject({
      valor: 120,
      preparo: null,
      restricoes: null,
      procedimento_id: FONTE,
    });
    expect(p.mudancas.some((m) => m.campo === "Necessidade de pedido médico")).toBe(true);
    expect(p.mudancas.some((m) => m.campo === "Regras por atendimento")).toBe(true);
  });
  test("não trunca textos de origem para caber na base", () => {
    expect(() =>
      prepararSincronizacao("servico", atual(), { ...fonte(), preparo: "x".repeat(4001) }),
    ).toThrow("Nenhum texto foi cortado");
  });
  test("prévia e sincronização preservam horários extensos de todos os executantes", async () => {
    const e = ambiente();
    const horarios = "Segunda e quarta: 08:00–12:00; sexta: 13:00–17:00.\n".repeat(100) + "Último turno: sábado, 09:00–11:00.";
    expect(horarios.length).toBeGreaterThan(4000);
    const executantes = [
      { medico_id: null, nome: "Profissional A", horarios, observacao: null },
      { medico_id: null, nome: "Profissional B", horarios: horarios + "\nSomente com confirmação prévia.", observacao: null },
    ];
    e.configurar({ origem: { ...fonte(), executantes } });
    const p = await e.api.prever(CLINICA, "servico", ID, FONTE);
    expect(e.ver().escritas).toBe(0);
    await e.api.aplicar(CLINICA, "servico", p);
    expect(e.ver().escritas).toBe(1);
    expect(e.ver().r.executantes).toEqual(executantes);
    expect(e.ver().chamadasJev).toBe(0);
  });
  test("profissional mantém vínculo exato e horários, sem completar campos com conteúdo antigo", () => {
    const p = prepararSincronizacao("profissional", atual(), {
      id: FONTE,
      medico_id: FONTE,
      nome: "Dra. Ana",
      especialidades: [{ id: FONTE, nome: "Cardiologia" }],
      horarios: [{ dia: "Segunda-feira", inicio: "09:00", fim: "12:00", observacao: null }],
      estrutura: { categoria: "consulta" },
      formas_pagamento: [],
    });
    expect(p.dados).toMatchObject({
      medico_id: FONTE,
      unidade_id: null,
      formas_pagamento: [],
      atende_consultorio: null,
    });
    expect(p.dados.estrutura?.aliases).toEqual(atual().estrutura.aliases);
  });
  test.each([
    { rascunho: { nome: "Edição em curso" } },
    { status: "ARQUIVADO" },
    { estrutura: { abrangencia: "grupo" } },
  ])("protege alterações pendentes, arquivo e grupos: %j", (patch) => {
    expect(() => prepararSincronizacao("servico", { ...atual(), ...patch }, fonte())).toThrow();
  });
  test("prioriza aliases na lista de candidatos e rejeita escolha inválida ou sem confiança", () => {
    const fontes = Array.from({ length: 60 }, (_, n) => ({
      id: String(n),
      nome: `Outro ${n}`,
      detalhe: "",
    }));
    fontes.push({ id: FONTE, nome: "ultrassom de abdome total", detalhe: "" });
    const candidatos = candidatosMapeamento(atual(), fontes);
    expect(candidatos).toHaveLength(40);
    expect(candidatos[0]?.id).toBe(FONTE);
    for (const confidence of [NaN, Infinity, 1.1, 0.79])
      expect(escolhaMapeamento({ choice: FONTE, confidence }, candidatos)).toBeNull();
    expect(escolhaMapeamento({ choice: "inventado", confidence: 0.99 }, candidatos)).toBeNull();
    expect(escolhaMapeamento({ choice: "nenhuma", confidence: 1 }, candidatos)).toBeNull();
  });
  test("Jev e prévia não escrevem; somente confirmação sincroniza sem nova chamada de IA", async () => {
    const e = ambiente();
    expect((await e.api.mapear(CLINICA, "servico", ID)).sugestao?.id).toBe(FONTE);
    const p = await e.api.prever(CLINICA, "servico", ID, FONTE);
    expect(e.ver().escritas).toBe(0);
    await e.api.aplicar(CLINICA, "servico", p);
    expect(e.ver().escritas).toBe(1);
    expect(e.ver().chamadasJev).toBe(1);
    expect(e.ver().r.publicado_por).toBe("operador");
    expect(e.ver().r.procedimento_id).toBe(FONTE);
    expect(e.ver().r.status).toBe("PUBLICADO");
    await expect(e.api.aplicar(CLINICA, "servico", p)).rejects.toThrow("mudou");
    expect(e.ver().escritas).toBe(1);
  });
  test("mantém rascunho como rascunho", async () => {
    const e = ambiente();
    e.configurar({ registro: { ...atual(), status: "RASCUNHO" } });
    const p = await e.api.prever(CLINICA, "servico", ID, FONTE);
    await e.api.aplicar(CLINICA, "servico", p);
    expect(e.ver().r.status).toBe("RASCUNHO");
    expect(e.ver().r.publicado_por).toBeUndefined();
  });
  test("mudança na origem invalida a prévia sem gravar parcialmente", async () => {
    const e = ambiente();
    const p = await e.api.prever(CLINICA, "servico", ID, FONTE);
    e.configurar({ origem: { ...fonte(), preparo: "Nova orientação" } });
    await expect(e.api.aplicar(CLINICA, "servico", p)).rejects.toThrow("mudou");
    expect(e.ver().escritas).toBe(0);
  });
  test("corrida de escrita e hash adulterado não sobrescrevem a base", async () => {
    const e = ambiente();
    const p = await e.api.prever(CLINICA, "servico", ID, FONTE);
    await expect(
      e.api.aplicar(CLINICA, "servico", { ...p, assinatura: "inventada" }),
    ).rejects.toThrow("mudou");
    e.configurar({ corrida: true });
    await expect(e.api.aplicar(CLINICA, "servico", p)).rejects.toThrow("mudou");
    expect(e.ver().escritas).toBe(0);
  });
  test("leitura de origem com erro não altera o registro", async () => {
    const e = ambiente();
    const p = await e.api.prever(CLINICA, "servico", ID, FONTE);
    e.configurar({ erroFonte: true });
    await expect(e.api.aplicar(CLINICA, "servico", p)).rejects.toThrow("indisponível");
    expect(e.ver().escritas).toBe(0);
  });
  test.each(["telefonia", ""])(
    "nega mapeamento e leitura administrativa ao perfil %s",
    async (role) => {
      const e = ambiente();
      e.configurar({ role });
      await expect(e.api.mapear(CLINICA, "servico", ID)).rejects.toThrow("Apenas administradores");
      await expect(e.api.opcoes(CLINICA, "servico")).rejects.toThrow("Apenas administradores");
      expect(e.ver().leiturasFonte).toBe(0);
      expect(e.ver().chamadasJev).toBe(0);
    },
  );
  test("isola clínica e revalida permissão após a leitura", async () => {
    const e = ambiente();
    await expect(e.api.prever(FONTE, "servico", ID, FONTE)).rejects.toThrow(
      "Apenas administradores",
    );
    const p = await e.api.prever(CLINICA, "servico", ID, FONTE);
    e.configurar({ revogarNaLeitura: true });
    await expect(e.api.aplicar(CLINICA, "servico", p)).rejects.toThrow("Apenas administradores");
    expect(e.ver().escritas).toBe(0);
  });
});
