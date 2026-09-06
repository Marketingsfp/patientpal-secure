/**
 * FASE 2 — recuperação correta e segura no catálogo publicado.
 *
 * Banco simulado em memória com o mesmo formato de chamadas usado em produção.
 * O objetivo é provar a RECUPERAÇÃO: registro certo, condições vinculadas,
 * nada de rascunho/arquivado/nota interna e nenhuma leitura do catálogo
 * inteiro por mensagem.
 */
import { beforeEach, describe, expect, it, mock } from "bun:test";

type Linha = Record<string, unknown>;

const banco: Record<string, Linha[]> = {
  nina_cat_servicos: [],
  nina_cat_profissionais: [],
};
const chamadas: Array<{ tabela: string; colunas: string; filtros: Record<string, string>; limite: number | null }> = [];

function tabela(nome: string) {
  const filtros: Record<string, string> = {};
  let colunas = "";
  let limite: number | null = null;
  let orExpr: string | null = null;
  let ilikeNome: string | null = null;

  const api: any = {
    select: (c: string) => {
      colunas = c;
      return api;
    },
    eq: (col: string, v: string) => {
      filtros[col] = v;
      return api;
    },
    ilike: (_col: string, v: string) => {
      ilikeNome = String(v).replaceAll("%", "").toLowerCase();
      return api;
    },
    or: (expr: string) => {
      orExpr = expr;
      return api;
    },
    limit: (n: number) => {
      limite = n;
      return api;
    },
    then: (resolve: (r: { data: Linha[]; error: null }) => void) => {
      chamadas.push({ tabela: nome, colunas, filtros, limite });
      let linhas = (banco[nome] ?? []).filter((l) =>
        Object.entries(filtros).every(([k, v]) => l[k] === v),
      );
      if (orExpr) {
        const termos = [...String(orExpr).matchAll(/ilike\.%([^%]+)%/g)].map((m) => m[1]!);
        linhas = linhas.filter((l) =>
          termos.some(
            (t) =>
              String(l["nome"] ?? "").toLowerCase().includes(t) ||
              String(l["descricao_publica"] ?? "").toLowerCase().includes(t),
          ),
        );
      }
      if (ilikeNome) {
        linhas = linhas.filter((l) => String(l["nome"] ?? "").toLowerCase().includes(ilikeNome!));
      }
      // Só devolve as colunas pedidas — igual ao PostgREST.
      const campos = colunas
        .replace(/unidades\(nome\)/, "unidades")
        .split(",")
        .map((c) => c.trim());
      const projetadas = linhas.slice(0, limite ?? linhas.length).map((l) => {
        const out: Linha = {};
        for (const c of campos) if (c in l) out[c] = l[c];
        return out;
      });
      resolve({ data: projetadas, error: null });
      return Promise.resolve({ data: projetadas, error: null });
    },
  };
  return api;
}

mock.module("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: { from: (nome: string) => tabela(nome) },
}));

const { buscarNoCatalogo } = await import("../catalogo-retrieval.server");

const CLINICA = "11111111-1111-1111-1111-111111111111";

function servico(over: Linha): Linha {
  return {
    id: crypto.randomUUID(),
    clinica_id: CLINICA,
    status: "PUBLICADO",
    nome: "Exame",
    valor: null,
    valor_observacao: null,
    descricao_publica: null,
    preparo: null,
    restricoes: null,
    nota_interna: "uso interno — não pode vazar",
    executantes: [],
    formas_pagamento: [],
    ...over,
  };
}

function profissional(over: Linha): Linha {
  return {
    id: crypto.randomUUID(),
    clinica_id: CLINICA,
    status: "PUBLICADO",
    nome: "Dra. Fulana",
    especialidades: [],
    atende_consultorio: null,
    formas_pagamento: [],
    convenios: [],
    horarios: [],
    tipo_atendimento: null,
    observacao_publica: null,
    aviso_dia: null,
    aviso_valido_de: null,
    aviso_valido_ate: null,
    nota_interna: "combinação interna de repasse",
    rascunho: { nome: "texto ainda não aprovado" },
    unidades: { nome: "Unidade Centro" },
    ...over,
  };
}

beforeEach(() => {
  banco["nina_cat_servicos"] = [];
  banco["nina_cat_profissionais"] = [];
  chamadas.length = 0;
});

describe("recuperação no catálogo publicado", () => {
  it("traz o exame certo mesmo com plural e não confunde com outro parecido", async () => {
    banco["nina_cat_servicos"] = [
      servico({ nome: "Ultrassom de tireoide", valor: 180 }),
      servico({ nome: "Ultrassom de abdome total", valor: 220 }),
    ];
    const r = await buscarNoCatalogo({ clinicaId: CLINICA, query: "ultrassons de tireoide" });
    expect(r.knowledge_status).toBe("found");
    expect(r.procedure).toBe("Ultrassom de tireoide");
    expect(r.price).toBe("R$ 180,00");
  });

  it("preserva as condições de pagamento vinculadas ao valor", async () => {
    banco["nina_cat_servicos"] = [
      servico({
        nome: "Endoscopia",
        formas_pagamento: [
          { forma: "PIX", valor: 300, condicao: "à vista" },
          { forma: "Cartão", valor: 360, condicao: "em até 3x" },
        ],
        preparo: "Jejum de 8 horas",
        restricoes: "Necessário pedido médico",
      }),
    ];
    const r = await buscarNoCatalogo({ clinicaId: CLINICA, query: "endoscopia" });
    const notas = r.notes.join(" | ");
    expect(notas).toContain("à vista — PIX");
    expect(notas).toContain("em até 3x — Cartão");
    expect(notas).toContain("Requisitos: Necessário pedido médico");
    expect(notas).toContain("Preparo: Jejum de 8 horas");
  });

  it("mantém recorrência, observação do horário e aviso vigente", async () => {
    const hoje = new Date().toISOString().slice(0, 10);
    banco["nina_cat_profissionais"] = [
      profissional({
        nome: "Dr. Silva",
        especialidades: [{ nome: "Cardiologia" }],
        horarios: [
          { dia: "Sábado", inicio: "08:00", fim: "12:00", recorrencia: "Quinzenal", observacao: "somente encaixe" },
        ],
        aviso_dia: "Nesta semana atende só pela manhã",
        aviso_valido_de: hoje,
        aviso_valido_ate: hoje,
      }),
    ];
    const r = await buscarNoCatalogo({ clinicaId: CLINICA, query: "cardiologista" });
    expect(r.days.join(" ")).toContain("Quinzenal");
    expect(r.days.join(" ")).toContain("somente encaixe");
    expect(r.notes.join(" ")).toContain("Aviso vigente");
  });

  it("pergunta de consulta não usa o preço do exame como preço da consulta", async () => {
    banco["nina_cat_servicos"] = [servico({ nome: "Eletrocardiograma cardiologia", valor: 90 })];
    banco["nina_cat_profissionais"] = [
      profissional({
        nome: "Dr. Silva",
        especialidades: [{ nome: "Cardiologia" }],
        formas_pagamento: [{ forma: "PIX", valor: 250 }],
      }),
    ];
    const r = await buscarNoCatalogo({ clinicaId: CLINICA, query: "consulta de cardiologia" });
    expect(r.procedure).toBe("Consulta — Cardiologia");
    expect(r.price).toBe("R$ 250,00");
  });

  it("vários profissionais da mesma especialidade não viram ambiguidade", async () => {
    banco["nina_cat_profissionais"] = [
      profissional({ nome: "Dr. A", especialidades: [{ nome: "Ortopedia" }] }),
      profissional({ nome: "Dra. B", especialidades: [{ nome: "Ortopedia" }] }),
    ];
    const r = await buscarNoCatalogo({ clinicaId: CLINICA, query: "consulta ortopedia" });
    expect(r.instrucao).not.toContain("pedido médico");
    expect(r.doctors.length).toBe(2);
  });

  it("dois exames diferentes empatados devolvem ambiguidade para a Nina perguntar", async () => {
    banco["nina_cat_servicos"] = [
      servico({ nome: "Raio-x de tórax" }),
      servico({ nome: "Raio-x de coluna" }),
    ];
    const r = await buscarNoCatalogo({ clinicaId: CLINICA, query: "raio" });
    expect(r.instrucao).toContain("pedido médico");
  });

  it("filtra pelo dia pedido sem excluir quem não tem horário cadastrado", async () => {
    banco["nina_cat_profissionais"] = [
      profissional({
        nome: "Dr. Segunda",
        especialidades: [{ nome: "Dermatologia" }],
        horarios: [{ dia: "Segunda-feira", inicio: "08:00", fim: "12:00", recorrencia: "Toda semana" }],
      }),
      profissional({
        nome: "Dra. Quinta",
        especialidades: [{ nome: "Dermatologia" }],
        horarios: [{ dia: "Quinta-feira", inicio: "08:00", fim: "12:00", recorrencia: "Toda semana" }],
      }),
    ];
    const r = await buscarNoCatalogo({ clinicaId: CLINICA, query: "dermatologia", dia: "Quinta-feira" });
    expect(r.doctors).toEqual(["Dra. Quinta"]);
  });

  it("não lê rascunho, arquivado, nota interna nem outra clínica", async () => {
    banco["nina_cat_servicos"] = [
      servico({ nome: "Ressonância", status: "RASCUNHO" }),
      servico({ nome: "Ressonância antiga", status: "ARQUIVADO" }),
      servico({ nome: "Ressonância outra clínica", clinica_id: "22222222-2222-2222-2222-222222222222" }),
      servico({ nome: "Ressonância de crânio", valor: 700 }),
    ];
    const r = await buscarNoCatalogo({ clinicaId: CLINICA, query: "ressonancia" });
    expect(r.records.length).toBe(1);
    expect(r.procedure).toBe("Ressonância de crânio");
    const bruto = JSON.stringify(r);
    expect(bruto).not.toContain("uso interno");
    expect(bruto).not.toContain("não aprovado");
    // A consulta pede só colunas públicas e sempre com teto.
    const svc = chamadas.find((c) => c.tabela === "nina_cat_servicos")!;
    expect(svc.colunas).not.toContain("nota_interna");
    expect(svc.colunas).not.toContain("rascunho");
    expect(svc.filtros["status"]).toBe("PUBLICADO");
    expect(svc.filtros["clinica_id"]).toBe(CLINICA);
    expect(svc.limite).toBeGreaterThan(0);
  });

  it("catálogo sem o item devolve not_found, sem fallback de planilha", async () => {
    banco["nina_cat_servicos"] = [servico({ nome: "Ecocardiograma" })];
    const r = await buscarNoCatalogo({ clinicaId: CLINICA, query: "mamografia" });
    expect(r.knowledge_status).toBe("not_found");
    expect(r.records.length).toBe(0);
    expect(r.source).toBe("nina_catalogo");
  });
});
