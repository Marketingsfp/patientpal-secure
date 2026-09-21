/**
 * FASE 2 — recuperação correta e segura no catálogo publicado.
 *
 * Banco simulado em memória com o mesmo formato de chamadas usado em produção.
 * O objetivo é provar a RECUPERAÇÃO: registro certo, condições vinculadas,
 * nada de rascunho/arquivado/nota interna e somente detalhes relevantes
 * enviados ao modelo após pesquisar todas as páginas do índice público.
 */
import { beforeEach, describe, expect, it, mock } from "bun:test";
import { agoraNaClinica } from "@/lib/nina-agora";
import { encaminharAposEsclarecimento, prepararSegundaPergunta } from "../catalogo-esclarecimento";
import { lembrarConsultaComprovada, conhecimentoDaMesmaSessao } from "../confidence/conhecimento-sessao";
import { encaminhamentoSemRegistro } from "../catalogo-sem-registro";
import { motivoParaAtendimento } from "@/lib/atendimento/texto-interno-apresentacao";
import { incorporarResultadoOficial } from "../confidence/evidencias-turno";
import { validarResultado } from "../tool-broker";

type Linha = Record<string, unknown>;

const banco: Record<string, Linha[]> = {
  nina_cat_servicos: [],
  nina_cat_profissionais: [],
};
const chamadas: Array<{ tabela: string; colunas: string; filtros: Record<string, string>; limite: number | null; cursor: string | null; ids: string[] | null }> = [];
let tetoServidor = Infinity;
let falharAposPrimeiraPagina = false;

function tabela(nome: string) {
  const filtros: Record<string, string> = {};
  let colunas = "";
  let limite: number | null = null;
  let orExpr: string | null = null;
  let ilikeNome: string | null = null;
  let cursor: string | null = null;
  let ids: string[] | null = null;
  let ordenacao: string | null = null;

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
    order: (col: string) => { ordenacao = col; return api; },
    gt: (_col: string, valor: string) => { cursor = valor; return api; },
    in: (_col: string, valores: string[]) => { ids = valores; return api; },
    then: (resolve: (r: { data: Linha[] | null; error: { message: string } | null }) => void) => {
      chamadas.push({ tabela: nome, colunas, filtros, limite, cursor, ids });
      if (falharAposPrimeiraPagina && cursor) {
        const erro = { data: null, error: { message: "Falha ao ler a próxima página" } };
        resolve(erro);
        return Promise.resolve(erro);
      }
      let linhas = (banco[nome] ?? []).filter((l) =>
        Object.entries(filtros).every(([k, v]) => l[k] === v),
      );
      if (cursor) linhas = linhas.filter((l) => String(l.id) > cursor!);
      if (ids) linhas = linhas.filter((l) => ids!.includes(String(l.id)));
      if (ordenacao) linhas.sort((a, b) => String(a[ordenacao!]).localeCompare(String(b[ordenacao!])));
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
      const projetadas = linhas.slice(0, Math.min(limite ?? linhas.length, tetoServidor)).map((l) => {
        const out: Linha = {};
        for (const c of campos) {
          if (c === "aliases:estrutura->aliases") out.aliases = (l.estrutura as any)?.aliases;
          else if (c in l) out[c] = l[c];
        }
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
  tetoServidor = Infinity;
  falharAposPrimeiraPagina = false;
});

const idSequencial = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;

describe("separação entre consultas e exames", () => {
  beforeEach(() => {
    banco.nina_cat_servicos = [
      servico({ nome: "ELETROCARDIOGRAMA", descricao_publica: "Cardiologia", preparo: "Pedido médico", valor: 90 }),
      servico({ nome: "MAPA 24H cardiologia", descricao_publica: "Cardiologia", valor: 110 }),
    ];
    banco.nina_cat_profissionais = ["Dr. A", "Dra. B"].map(nome => profissional({
      nome, especialidades: [{ nome: "Cardiologia" }], formas_pagamento: [{ forma: "Cartão", valor: 145 }],
    }));
  });

  it.each(["cardiologia", "cardiologista", "cardio", "cardiolgia"])("consulta explícita de %s exclui exames, inclusive pelo nome", async (query) => {
    const r = await buscarNoCatalogo({ clinicaId: CLINICA, query, tipo_atendimento: "consulta" });
    expect(r.records).toHaveLength(2);
    expect(r.records.every(item => item.categoria === "CONSULTA")).toBe(true);
    expect(r.price).toContain("145,00");
    expect(r.tipo_atendimento).toBe("consulta");
    expect(r.esclarecimento).toBeUndefined();
    expect(chamadas.some(c => c.tabela === "nina_cat_servicos")).toBe(false);
  });

  it("consulta ausente não é substituída por exames da especialidade", async () => {
    banco.nina_cat_profissionais = [];
    const r = await buscarNoCatalogo({ clinicaId: CLINICA, query: "cardiologia", tipo_atendimento: "consulta" });
    expect(r.knowledge_status).toBe("not_found");
    expect(r.records).toHaveLength(0);
    expect(r.esclarecimento).toBeUndefined();
  });

  it("consulta genérica não pede identificação de um exame", async () => {
    const r = await buscarNoCatalogo({ clinicaId: CLINICA, query: "consulta", tipo_atendimento: "consulta" });
    expect(r.records).toHaveLength(0);
    expect(r.esclarecimento?.tipo).not.toBe("procedimento");
  });

  it("ECG continua sendo exame mesmo com filtro de médico", async () => {
    const r = await buscarNoCatalogo({ clinicaId: CLINICA, query: "ECG", medico: "Dr. A", tipo_atendimento: "exame_procedimento" });
    expect(r.records.map(item => item.procedimento)).toEqual(["ELETROCARDIOGRAMA"]);
    expect(r.esclarecimento).toBeUndefined();
    expect(chamadas.some(c => c.tabela === "nina_cat_profissionais")).toBe(false);
  });

  it("exames de cardiologia pedem escolha de exame e não devolvem consultas", async () => {
    const r = await buscarNoCatalogo({ clinicaId: CLINICA, query: "cardiologia", tipo_atendimento: "exame_procedimento" });
    expect(r.records.every(item => item.categoria === "EXAME_PROCEDIMENTO")).toBe(true);
    expect(r.doctors).toEqual([]);
    expect(r.tipo_atendimento).toBe("exame_procedimento");
  });

  it("exame ausente não é substituído pelo cadastro de profissional", async () => {
    banco.nina_cat_servicos = [];
    const r = await buscarNoCatalogo({ clinicaId: CLINICA, query: "cardiologia", tipo_atendimento: "exame_procedimento" });
    expect(r.knowledge_status).toBe("not_found");
    expect(r.records).toHaveLength(0);
  });

  it("sigla desconhecida mantém a pergunta de esclarecimento", async () => {
    const r = await buscarNoCatalogo({ clinicaId: CLINICA, query: "XYZ", tipo_atendimento: "nao_identificado" });
    expect(r.esclarecimento?.tipo).toBe("sigla");
    expect(r.records).toHaveLength(0);
  });
});

describe("busca completa com e sem acentos", () => {
  it.each([
    "nebulização",
    "nebulizacao",
    "NEBULIZAÇÃO",
    "nebulizac\u0327a\u0303o",
    "Olá, gostaria de saber como funciona o atendimento para nebulização.",
  ])("encontra %s após 1.100 serviços sem mudar a grafia exibida", async (query) => {
    banco.nina_cat_servicos = Array.from({ length: 1100 }, (_, i) =>
      servico({ id: idSequencial(i + 1), nome: `Outro procedimento ${i}`, preparo: "Detalhe não relevante" }),
    );
    banco.nina_cat_servicos.push(servico({ id: idSequencial(1101), nome: "NEBULIZAÇÃO", valor: 20 }));
    const r = await buscarNoCatalogo({ clinicaId: CLINICA, query });
    expect(r.found).toBe(true);
    expect(r.procedure).toBe("NEBULIZAÇÃO");
    expect(r.records).toHaveLength(1);
    expect(JSON.stringify(r)).not.toContain("Detalhe não relevante");
    const detalhes = chamadas.filter((c) => c.tabela === "nina_cat_servicos" && c.colunas.includes("preparo"));
    expect(detalhes).toHaveLength(1);
    expect(detalhes[0]!.ids).toEqual([idSequencial(1101)]);
    expect(chamadas.filter((c) => c.tabela === "nina_cat_servicos" && !c.ids).length).toBeGreaterThan(4);
  });

  it("normaliza também quando o cadastro está sem acento e a pergunta tem acento", async () => {
    banco.nina_cat_servicos = [servico({ nome: "NEBULIZACAO" })];
    const r = await buscarNoCatalogo({ clinicaId: CLINICA, query: "nebulização" });
    expect(r.procedure).toBe("NEBULIZACAO");
  });

  it("não deixa um resultado secundário sem acento ocultar o nome correto acentuado", async () => {
    banco.nina_cat_servicos = [
      servico({ id: idSequencial(1), nome: "Outro procedimento", descricao_publica: "Orientação após nebulizacao" }),
      servico({ id: idSequencial(2), nome: "NEBULIZAÇÃO" }),
    ];
    const r = await buscarNoCatalogo({ clinicaId: CLINICA, query: "nebulizacao", limite: 1 });
    expect(r.procedure).toBe("NEBULIZAÇÃO");
  });

  it("continua páginas reduzidas pelo servidor e mantém a ordem de relevância nos detalhes", async () => {
    tetoServidor = 3;
    banco.nina_cat_servicos = Array.from({ length: 20 }, (_, i) => servico({
      id: idSequencial(i + 1), nome: `Exame ${i}`, descricao_publica: "Após nebulização",
    }));
    banco.nina_cat_servicos.push(servico({ id: idSequencial(21), nome: "NEBULIZAÇÃO" }));
    const r = await buscarNoCatalogo({ clinicaId: CLINICA, query: "nebulizacao", limite: 5 });
    expect(r.records).toHaveLength(1);
    expect(r.records[0]!.procedimento).toBe("NEBULIZAÇÃO");
    expect(chamadas.every((c) => c.filtros.status === "PUBLICADO" && c.filtros.clinica_id === CLINICA)).toBe(true);
  });

  it("busca a especialidade e o dia antes de limitar, inclusive após o 60º profissional", async () => {
    banco.nina_cat_profissionais = Array.from({ length: 260 }, (_, i) => profissional({
      id: idSequencial(i + 1), nome: `Dr. Outro ${i}`, especialidades: [{ nome: "Clínico geral" }],
      horarios: [{ dia: "Segunda-feira", inicio: "08:00" }],
    }));
    banco.nina_cat_profissionais.push(profissional({
      id: idSequencial(261), nome: "Dr. João Hélio", especialidades: [{ nome: "Clínico geral" }],
      horarios: [{ dia: "Terça-feira", inicio: "08:00" }],
    }));
    const r = await buscarNoCatalogo({ clinicaId: CLINICA, query: "clinico geral", dia: "terca", limite: 1 });
    expect(r.doctors).toEqual(["Dr. João Hélio"]);
    const porNome = await buscarNoCatalogo({ clinicaId: CLINICA, query: "consulta", medico: "joao helio" });
    expect(porNome.doctors).toEqual(["Dr. João Hélio"]);
  });

  it("exclui registros privados, arquivados e de outra clínica em todas as páginas", async () => {
    tetoServidor = 1;
    banco.nina_cat_servicos = [
      servico({ id: idSequencial(1), nome: "Exame qualquer" }),
      servico({ id: idSequencial(2), nome: "NEBULIZAÇÃO rascunho", status: "RASCUNHO" }),
      servico({ id: idSequencial(3), nome: "NEBULIZAÇÃO arquivada", status: "ARQUIVADO" }),
      servico({ id: idSequencial(4), nome: "NEBULIZAÇÃO outra clínica", clinica_id: "outra" }),
      servico({ id: idSequencial(5), nome: "NEBULIZAÇÃO" }),
    ];
    const r = await buscarNoCatalogo({ clinicaId: CLINICA, query: "nebulizacao" });
    expect(r.records).toHaveLength(1);
    expect(r.procedure).toBe("NEBULIZAÇÃO");
    expect(chamadas.every((c) => !c.colunas.includes("nota_interna") && !c.colunas.includes("rascunho"))).toBe(true);
  });

  it("não transforma falha numa página posterior em ausência confirmada", async () => {
    tetoServidor = 1;
    falharAposPrimeiraPagina = true;
    banco.nina_cat_servicos = [servico({ id: idSequencial(1), nome: "Outro exame" }),
      servico({ id: idSequencial(2), nome: "NEBULIZAÇÃO" })];
    await expect(buscarNoCatalogo({ clinicaId: CLINICA, query: "nebulizacao" }))
      .rejects.toThrow("Falha ao ler a próxima página");
  });

  it("não encontra um procedimento ausente só pelas palavras como funciona", async () => {
    banco.nina_cat_servicos = [servico({ nome: "Ecocardiograma", descricao_publica: "Como funciona o exame" })];
    const r = await buscarNoCatalogo({ clinicaId: CLINICA, query: "Como funciona a crioablação?" });
    expect(r.knowledge_status).toBe("not_found");
  });
});

describe("recuperação no catálogo publicado", () => {
  it("cardiologia com quatro médicos e cinco exames retorna somente consultas", async () => {
    banco.nina_cat_profissionais = ["Sandro", "Antonio", "Rosângela", "Alex"].map((nome) =>
      profissional({ nome, especialidades: [{ nome: "CARDIOLOGIA" }] }),
    );
    banco.nina_cat_servicos = ["MAPA 24H", "ECOCARDIOGRAMA", "ELETROCARDIOGRAMA", "HOLTER 24H", "TESTE ERGOMETRICO"].map((nome) =>
      servico({ nome, descricao_publica: "Exame de cardiologia", valor: 90, preparo: "Levar pedido médico" }),
    );
    const r = await buscarNoCatalogo({ clinicaId: CLINICA, query: "cardiologia" });
    expect(r.esclarecimento).toBeUndefined();
    expect(r.records).toHaveLength(4);
    expect(r.records.every((registro) => registro.categoria === "CONSULTA")).toBe(true);
    expect(JSON.stringify(r)).not.toContain("pedido médico");
  });
  it.each([
    "Gostaria de marca a pneumologista",
    "Bom dia gostaria por favor de saber o valor de uma consulta de pneumologia",
    "Vocês realizam o procedimento crioablação?",
  ])("serviço diferente não comprova o pedido ausente: %s", async (query) => {
    banco["nina_cat_servicos"] = [
      servico({ nome: "Consulta Cardiologia", descricao_publica: "Exame realizado na clínica" }),
      servico({ nome: "Procedimento Dermatológico" }),
    ];
    banco["nina_cat_profissionais"] = [profissional({ especialidades: [{ nome: "Cardiologia" }] })];
    const r = await buscarNoCatalogo({ clinicaId: CLINICA, query });
    expect(r.knowledge_status).toBe("not_found");
    expect(r.records).toEqual([]);
    expect(r.instrucao).toContain("Encaminhe obrigatoriamente");
  });
  it("pedido com frase longa encontra a especialidade publicada", async () => {
    banco["nina_cat_profissionais"] = [profissional({ especialidades: [{ nome: "Pneumologia" }] })];
    const r = await buscarNoCatalogo({ clinicaId: CLINICA, query: "Bom dia gostaria por favor de saber o valor de uma consulta com pneumologista" });
    expect(r.knowledge_status).toBe("found");
    expect(r.records).toHaveLength(1);
  });
  it("vigência dos avisos muda à meia-noite de São Paulo, não à meia-noite UTC", async () => {
    banco["nina_cat_profissionais"] = [
      profissional({
        nome: "Dr. Silva", especialidades: [{ nome: "Cardiologia" }],
        aviso_dia: "Aviso válido somente no dia 17",
        aviso_valido_de: "2026-09-17", aviso_valido_ate: "2026-09-17",
      }),
      profissional({
        nome: "Dra. Ana", especialidades: [{ nome: "Cardiologia" }],
        aviso_dia: "Aviso válido somente no dia 18",
        aviso_valido_de: "2026-09-18", aviso_valido_ate: "2026-09-18",
      }),
    ];
    const pedido = { clinicaId: CLINICA, query: "cardiologia" };
    const antes = await buscarNoCatalogo(pedido, new Date("2026-09-18T02:59:59Z"));
    const depois = await buscarNoCatalogo(pedido, new Date("2026-09-18T03:00:00Z"));
    expect(JSON.stringify(antes)).toContain("Aviso válido somente no dia 17");
    expect(JSON.stringify(antes)).not.toContain("Aviso válido somente no dia 18");
    expect(JSON.stringify(depois)).not.toContain("Aviso válido somente no dia 17");
    expect(JSON.stringify(depois)).toContain("Aviso válido somente no dia 18");
  });

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
    expect(notas).toContain("em até 3x — Pix/cartão");
    expect(notas).toContain("Requisitos: Necessário pedido médico");
    expect(notas).toContain("Preparo: Jejum de 8 horas");
  });

  it("mantém recorrência, observação do horário e aviso vigente", async () => {
    const hoje = agoraNaClinica().iso;
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
    expect(r.instrucao).toContain("Qual exame ou procedimento você deseja?");
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

describe("siglas, escrita aproximada e identidade publicadas", () => {
  it.each(["USG de tireoide", "ultra de tireoide", "ultrassonogragia de tireoide"])("localiza %s sem confundir órgão ou outro procedimento", async (query) => {
    banco.nina_cat_servicos = [
      servico({ nome: "Ultrassonografia de tireoide", valor: 180 }),
      servico({ nome: "Punção de tireoide", valor: 250 }),
      servico({ nome: "Ultrassonografia de abdome total", valor: 220 }),
    ];
    const r = await buscarNoCatalogo({ clinicaId: CLINICA, query });
    expect(r.records).toHaveLength(1);
    expect(r.procedure).toBe("Ultrassonografia de tireoide");
    expect(r.price).toBe("R$ 180,00");
    expect(r.esclarecimento).toBeUndefined();
  });
  it.each([1, 6])("não escolhe um tipo de ultrassom por limite de %i resultados", async (limite) => {
    banco.nina_cat_servicos = [
      servico({ nome: "Ultrassonografia de tireoide", valor: 180 }),
      servico({ nome: "Ultrassonografia de abdome total", valor: 220 }),
    ];
    const r = await buscarNoCatalogo({ clinicaId: CLINICA, query: "USG", limite });
    expect(r.esclarecimento?.tipo).toBe("procedimento");
    expect(r.esclarecimento?.opcoes).toHaveLength(2);
    expect(r.procedure).toBeNull();
    expect(r.price).toBeNull();
  });
  it.each(["ultra", "ultrassonogragia"])("uma única USG publicada não identifica o tipo desejado: %s", async (query) => {
    banco.nina_cat_servicos = [servico({ nome: "Ultrassonografia de tireoide" })];
    const r = await buscarNoCatalogo({ clinicaId: CLINICA, query });
    expect(r.esclarecimento?.tipo).toBe("procedimento");
    expect(r.procedure).toBeNull();
  });
  it.each(["xyz", "tc", "PET-CT"])("pede o nome por extenso de %s sem afirmar ausência", async (query) => {
    banco.nina_cat_servicos = [servico({ nome: "Exame de tireoide" })];
    const r = await buscarNoCatalogo({ clinicaId: CLINICA, query });
    expect(r.esclarecimento?.tipo).toBe("sigla");
    expect(r.esclarecimento?.pergunta).toContain("por extenso");
    expect(r.records).toHaveLength(0);
  });
  it("não substitui urologia ausente por neurologia publicada", async () => {
    banco.nina_cat_profissionais = [profissional({ especialidades: [{ nome: "Neurologia" }] })];
    const r = await buscarNoCatalogo({ clinicaId: CLINICA, query: "urologista" });
    expect(r.knowledge_status).toBe("not_found");
    expect(r.esclarecimento).toBeUndefined();
  });
  it("mantém a consulta, repete a lista uma vez e identifica corretamente o motivo da transferência", async () => {
    banco.nina_cat_profissionais = [
      profissional({ id: idSequencial(1), nome: "Dra. Shirley Martins", especialidades: [{ nome: "Dermatologia" }] }),
      profissional({ id: idSequencial(2), nome: "Dra. Raisa Moura", especialidades: [{ nome: "Dermatologia" }] }),
      profissional({ nome: "Dra. Suellen Silva", especialidades: [{ nome: "Cardiologia" }] }),
      profissional({ nome: "Dra. Outra Clínica", clinica_id: "outra", especialidades: [{ nome: "Dermatologia" }] }),
      profissional({ nome: "Dra. Rascunho", status: "RASCUNHO", especialidades: [{ nome: "Dermatologia" }] }),
    ];
    const args = { termo: "Dermatologia", tipo_atendimento: "consulta" as const, medico: "Suellen" };
    const primeira = await buscarNoCatalogo({ clinicaId: CLINICA, query: args.termo, tipo_atendimento: "consulta", medico: args.medico, limite: 1 });
    expect(primeira.esclarecimento?.motivo).toBe("medico_nao_identificado");
    expect(primeira.esclarecimento?.pergunta).toContain("Não encontrei esse nome entre os médicos desta consulta");
    expect(primeira.esclarecimento?.opcoes.map(o => o.nome)).toEqual(["Dra. Shirley Martins", "Dra. Raisa Moura"]);
    expect(primeira.price).toBeNull();
    const r = validarResultado("consultar_base_conhecimento", { ok: true, ...primeira });
    expect(encaminhamentoSemRegistro(r, args)).toBeNull();
    expect(encaminharAposEsclarecimento(null, r, "quero a Suellen")).toBeNull();
    const fatos = incorporarResultadoOficial({ clinicaId: CLINICA, nome: "consultar_base_conhecimento", args, resultado: r, fatos: [], consultas: [] }).fatos;
    const anterior = conhecimentoDaMesmaSessao(lembrarConsultaComprovada({
      clinicaId: CLINICA, sessionId: "sessao", args, fatos, esclarecimento: primeira.esclarecimento,
    }), CLINICA, "sessao");
    expect(anterior?.esclarecimento?.motivo).toBe("medico_nao_identificado");
    expect(anterior?.esclarecimento?.opcoes).toHaveLength(2);
    expect(prepararSegundaPergunta(anterior, r)).toBe(r);
    const handoff = encaminharAposEsclarecimento(anterior, r, "Suellen mesmo");
    expect(handoff?.resumo).toContain("Consulta encontrada: Dermatologia");
    expect(handoff?.resumo).toContain("Suellen mesmo");
    expect(motivoParaAtendimento(handoff?.motivo)).toContain("encontrou a consulta");
    expect(motivoParaAtendimento(handoff?.motivo)).toContain("identificar o médico");
    const corrigida = await buscarNoCatalogo({ clinicaId: CLINICA, query: args.termo, medico: "Shirley" });
    expect(corrigida.esclarecimento).toBeUndefined();
    expect(corrigida.records.map(r => r.id)).toEqual([idSequencial(1)]);
    expect(encaminharAposEsclarecimento(anterior, validarResultado("consultar_base_conhecimento", { ok: true, ...corrigida }), "Shirley")).toBeNull();
    expect(encaminharAposEsclarecimento(anterior, validarResultado("consultar_base_conhecimento", { ok: false, erro: "INTERNAL_ERROR" }), "Shirley")).toBeNull();
  });
  it("escrita parecida pede identificação sem negar a existência do médico", async () => {
    banco.nina_cat_profissionais = [profissional({ nome: "Dra. Shirley Martins", especialidades: [{ nome: "Dermatologia" }] })];
    const r = await buscarNoCatalogo({ clinicaId: CLINICA, query: "Dermatologia", medico: "Shirlei" });
    expect(r.esclarecimento?.motivo).toBe("medico_nao_identificado");
    expect(r.esclarecimento?.pergunta).toContain("Não consegui identificar com segurança");
    expect(r.esclarecimento?.pergunta).not.toContain("Não encontrei");
  });
  it("a lista corretiva não expõe nomes genéricos e não elimina opções pelo dia", async () => {
    banco.nina_cat_profissionais = [
      profissional({ nome: "Enfermagem", especialidades: [{ nome: "Dermatologia" }] }),
      profissional({ nome: "Dra. Shirley Martins", especialidades: [{ nome: "Dermatologia" }], horarios: [{ dia: "Sábado" }] }),
    ];
    const r = await buscarNoCatalogo({ clinicaId: CLINICA, query: "Dermatologia", medico: "Suellen", dia: "segunda" });
    expect(r.esclarecimento?.opcoes.map(o => o.nome)).toEqual(["Dra. Shirley Martins"]);
  });
  it("confirma nome aproximado e diferencia homônimos com os dados do cadastro", async () => {
    banco.nina_cat_profissionais = [
      profissional({ id: idSequencial(1), nome: "Dr. João Hélio", especialidades: [{ nome: "Cardiologia" }], unidades: { nome: "Centro" } }),
      profissional({ id: idSequencial(2), nome: "Dr. João Hélio", especialidades: [{ nome: "Ortopedia" }], unidades: { nome: "Norte" } }),
    ];
    const r = await buscarNoCatalogo({ clinicaId: CLINICA, query: "consulta", medico: "João Hleio", limite: 1 });
    expect(r.esclarecimento?.opcoes).toHaveLength(2);
    expect(r.esclarecimento?.pergunta).toContain("Cardiologia — Centro");
    expect(r.esclarecimento?.pergunta).toContain("Ortopedia — Norte");
    const escolhido = await buscarNoCatalogo({ clinicaId: CLINICA, query: "Ortopedia", medico: idSequencial(2) });
    expect(escolhido.esclarecimento).toBeUndefined();
    expect(escolhido.records.map((r) => r.id)).toEqual([idSequencial(2)]);
  });
  it("a consulta preventiva por nome também pede esclarecimento", async () => {
    banco.nina_cat_profissionais = [profissional({ nome: "Alex Silva" }), profissional({ nome: "Alex Souza" })];
    const r = await buscarNoCatalogo({ clinicaId: CLINICA, query: "quero com Dr. Alex" });
    expect(r.esclarecimento?.tipo).toBe("profissional");
    expect(r.esclarecimento?.opcoes).toHaveLength(2);
  });
  it("dois médicos com nome e especialidade iguais mantêm preços e identidades separados", async () => {
    banco.nina_cat_profissionais = [
      profissional({ nome: "João Silva", especialidades: [{ nome: "Cardiologia" }], formas_pagamento: [{ forma: "Dinheiro", valor: 100 }] }),
      profissional({ nome: "João Silva", especialidades: [{ nome: "Cardiologia" }], formas_pagamento: [{ forma: "Dinheiro", valor: 200 }] }),
    ];
    const r = await buscarNoCatalogo({ clinicaId: CLINICA, query: "consulta", medico: "João Silva" });
    expect(r.knowledge_status).not.toBe("conflict");
    expect(r.esclarecimento?.pergunta).toContain("ainda não permitem distingui-los");
    expect(r.price).toBeNull();
  });
});

describe("nomes e opções em respostas curtas", () => {
  it("busca preventiva de Dr. Jaoo sugere João para confirmação", async () => {
    banco.nina_cat_profissionais = [profissional({ nome: "Dr. João Hélio", especialidades: [{ nome: "Cardiologia" }] })];
    const r = await buscarNoCatalogo({ clinicaId: CLINICA, query: "Quero com Dr. Jaoo Helio" });
    expect(r.esclarecimento?.tipo).toBe("profissional");
    expect(r.esclarecimento?.pergunta).toContain("Dr. João Hélio");
    expect(r.price).toBeNull();
  });
});


describe("aliases publicados por cadastro", () => {
  it("encontra sigla aprovada sem compartilhar regras com outro exame", async () => {
    banco.nina_cat_servicos.push(servico({nome:"Exame de exemplo",estrutura:{aliases:["XYZ"]},formas_pagamento:[{forma:"Dinheiro",valor:75}]}));
    banco.nina_cat_servicos.push(servico({nome:"Exame diferente",estrutura:{aliases:["XYZ contraste"]}}));
    const r = await buscarNoCatalogo({clinicaId:CLINICA,query:"XYZ",tipo_atendimento:"exame_procedimento"});
    expect(r.found).toBe(true);
    expect(r.records.some(r => r.procedimento === "Exame de exemplo")).toBe(true);
    expect(r.esclarecimento?.tipo).not.toBe("sigla_desconhecida");
  });
  it("alias de rascunho não é usado para responder", async () => {
    banco.nina_cat_servicos.push(servico({nome:"Exame de exemplo",estrutura:{aliases:[]},rascunho:{estrutura:{aliases:["ZZZX"]}}}));
    const r = await buscarNoCatalogo({clinicaId:CLINICA,query:"ZZZX",tipo_atendimento:"exame_procedimento"});
    expect(r.records).toHaveLength(0);
  });
});

describe("escolha completa do exame após esclarecer ultrassonografia", () => {
  beforeEach(() => {
    banco.nina_cat_servicos = [
      servico({
        id: idSequencial(1),
        nome: "USG TRANSVAGINAL COM DOPPLER",
        valor: 200,
        preparo: "Preparo Doppler",
      }),
      servico({
        id: idSequencial(2),
        nome: "USG TRANSVAGINAL",
        valor: 100,
        preparo: "Preparo transvaginal",
      }),
      servico({
        id: idSequencial(3),
        nome: "USG TRANSVAGINAL GEMELAR",
        valor: 300,
        preparo: "Preparo gemelar",
      }),
      servico({ id: idSequencial(4), nome: "ULTRASSONOGRAFIA" }),
    ];
  });

  it.each([
    ["Usg transvaginal", "USG TRANSVAGINAL", 100],
    ["ultrassom transvaginal", "USG TRANSVAGINAL", 100],
    ["ultrassonografia transavaginal", "USG TRANSVAGINAL", 100],
    ["USG transvaginal com Doppler", "USG TRANSVAGINAL COM DOPPLER", 200],
    ["USG transvaginal gemelar", "USG TRANSVAGINAL GEMELAR", 300],
  ])("ultra → %s resolve sem transferir nem misturar condições", async (query, nome, valor) => {
    const inicial = await buscarNoCatalogo({
      clinicaId: CLINICA,
      query: "ultra",
      tipo_atendimento: "exame_procedimento",
    });
    expect(inicial.esclarecimento?.tipo).toBe("procedimento");
    const anterior = lembrarConsultaComprovada({
      clinicaId: CLINICA,
      sessionId: "sessao",
      args: { termo: "ultrassom" },
      fatos: [],
      esclarecimento: inicial.esclarecimento,
    });
    const r = await buscarNoCatalogo({
      clinicaId: CLINICA,
      query,
      tipo_atendimento: "exame_procedimento",
      limite: 1,
    });
    expect(r.esclarecimento).toBeUndefined();
    expect(r.procedure).toBe(nome);
    expect(r.price).toBe(`R$ ${valor},00`);
    expect(r.records.map((item) => item.procedimento)).toEqual([nome]);
    expect(
      encaminharAposEsclarecimento(
        anterior,
        validarResultado("consultar_base_conhecimento", r),
        query,
      ),
    ).toBeNull();
    const detalhes = chamadas.filter((c) => c.tabela === "nina_cat_servicos" && c.ids);
    expect(detalhes.at(-1)?.ids).toHaveLength(1);
  });

  it("o nome publicado prevalece sobre um alias genérico de outra variante", async () => {
    banco.nina_cat_servicos[0]!.estrutura = { aliases: ["USG TRANSVAGINAL"] };
    const r = await buscarNoCatalogo({ clinicaId: CLINICA, query: "USG transvaginal" });
    expect(r.records.map((item) => item.procedimento)).toEqual(["USG TRANSVAGINAL"]);
    expect(r.esclarecimento).toBeUndefined();
  });

  it("um alias completo publicado identifica o exame e não uma variante do alias", async () => {
    banco.nina_cat_servicos = [
      servico({ nome: "Exame pélvico A", estrutura: { aliases: ["USG TRANSVAGINAL"] } }),
      servico({
        nome: "Exame pélvico B",
        estrutura: { aliases: ["USG TRANSVAGINAL COM DOPPLER"] },
      }),
    ];
    const r = await buscarNoCatalogo({ clinicaId: CLINICA, query: "USG transvaginal" });
    expect(r.records.map((item) => item.procedimento)).toEqual(["Exame pélvico A"]);
    expect(r.esclarecimento).toBeUndefined();
  });

  it("aliases idênticos em exames diferentes mantêm a dúvida, mesmo com limite 1", async () => {
    banco.nina_cat_servicos = ["Exame A", "Exame B"].map((nome) =>
      servico({
        nome,
        estrutura: { aliases: ["USG TRANSVAGINAL"] },
      }),
    );
    const r = await buscarNoCatalogo({ clinicaId: CLINICA, query: "USG transvaginal", limite: 1 });
    expect(r.esclarecimento?.opcoes).toHaveLength(2);
    expect(r.price).toBeNull();
  });

  it("ultra genérica continua pedindo esclarecimento mesmo com cadastro ULTRASSONOGRAFIA", async () => {
    const r = await buscarNoCatalogo({ clinicaId: CLINICA, query: "ultra", limite: 1 });
    expect(r.esclarecimento?.opcoes).toHaveLength(4);
    expect(r.procedure).toBeNull();
  });

  it("sem correspondência completa preserva a dúvida entre variantes", async () => {
    banco.nina_cat_servicos = banco.nina_cat_servicos.filter((s) => s.nome !== "USG TRANSVAGINAL");
    const r = await buscarNoCatalogo({ clinicaId: CLINICA, query: "USG transvaginal" });
    expect(r.esclarecimento?.opcoes.map((o) => o.nome)).toEqual([
      "USG TRANSVAGINAL COM DOPPLER",
      "USG TRANSVAGINAL GEMELAR",
    ]);
    expect(r.procedure).toBeNull();
  });

  it("Doppler solicitado e ausente não vira transvaginal comum", async () => {
    banco.nina_cat_servicos = banco.nina_cat_servicos.filter(
      (s) => s.nome !== "USG TRANSVAGINAL COM DOPPLER",
    );
    const r = await buscarNoCatalogo({ clinicaId: CLINICA, query: "USG transvaginal com Doppler" });
    expect(r.knowledge_status).toBe("not_found");
    expect(r.records).toHaveLength(0);
  });
});
