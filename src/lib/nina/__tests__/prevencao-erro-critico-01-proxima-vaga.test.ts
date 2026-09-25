/**
 * Prevenção do Erro Crítico 01 — 5) teto de consultas de `proxima_vaga`.
 * Cenário equivalente ao da Iarmila em 24/09 (sem dados reais de pacientes): 155 médicos,
 * 61 especialidades, catálogo publicado com 41 profissionais e 201 serviços, e 140 horários
 * em 5 quintas-feiras (136 livres) numa única agenda. Código real do executor; banco em memória.
 * Guarda de regressão: a investigação mediu 11 a 17 consultas e ~0,1–0,3 s de CPU por chamada.
 */
import { describe, expect, mock, test } from "bun:test";
import { cardiologiaAlex } from "./fixtures/consultas-publicadas.fixture";

type Linha = Record<string, unknown>;
const CLINICA = "22222222-2222-4222-8222-222222222222";
const MEDICO = "33333333-3333-4333-8333-333333333333";
const PROFISSIONAL = "44444444-4444-4444-8444-444444444444";
const AGENDA = "55555555-5555-4555-8555-555555555555";
const SESSAO = "66666666-6666-4666-8666-666666666666";
const uuid = (prefixo: string, n: number) =>
  `${prefixo}${String(n).padStart(4, "0")}-0000-4000-8000-${String(n).padStart(12, "0")}`;

/** Próximas quintas-feiras no fuso da clínica (08:00 às 11:10, a cada 7 min). */
function horariosDeQuinta(): Linha[] {
  const linhas: Linha[] = [];
  const hoje = new Date();
  const base = new Date(Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth(), hoje.getUTCDate()));
  let quintas = 0;
  for (let d = 1; quintas < 5; d++) {
    const dia = new Date(base.getTime() + d * 86_400_000);
    if (dia.getUTCDay() !== 4) continue;
    quintas++;
    for (let i = 0; i < 28; i++) {
      const inicio = new Date(dia.getTime() + (11 * 60 + i * 7) * 60_000); // 08:00 em São Paulo = 11:00 UTC
      linhas.push({
        id: uuid("77777777", linhas.length + 1),
        clinica_id: CLINICA,
        medico_id: MEDICO,
        agenda_id: AGENDA,
        inicio: inicio.toISOString(),
        fim: new Date(inicio.getTime() + 7 * 60_000).toISOString(),
        paciente_nome: linhas.length % 35 === 34 ? "PACIENTE FICTICIO" : "DISPONÍVEL",
        status: "agendado",
      });
    }
  }
  return linhas;
}

const especialidades: Linha[] = [
  { id: uuid("88888888", 1), nome: "ENDOCRINOLOGIA", ativo: true },
  { id: uuid("88888888", 2), nome: "CLINICO GERAL", ativo: true },
  ...Array.from({ length: 59 }, (_, i) => ({
    id: uuid("88888888", i + 3),
    nome: `ESPECIALIDADE FICTICIA ${i + 3}`,
    ativo: true,
  })),
];
const medicos: Linha[] = [
  {
    id: MEDICO,
    nome: "ENDOCRINOLOGISTA FICTICIA DA SILVA",
    ativo: true,
    especialidade_id: especialidades[0]!.id,
    clinica_id: CLINICA,
  },
  ...Array.from({ length: 154 }, (_, i) => ({
    id: uuid("99999999", i + 1),
    nome: `MEDICO FICTICIO ${String(i + 1).padStart(3, "0")} SOBRENOME`,
    ativo: true,
    especialidade_id: especialidades[(i % 59) + 2]!.id,
    clinica_id: CLINICA,
  })),
];
const texto = (n: number) => "Informação pública do atendimento. ".repeat(n);
const base: Record<string, Linha[]> = {
  medicos,
  especialidades,
  medico_especialidades: [
    { medico_id: MEDICO, especialidade_id: especialidades[0]!.id },
    { medico_id: MEDICO, especialidade_id: especialidades[1]!.id },
    ...medicos.slice(1).map((m) => ({ medico_id: m.id, especialidade_id: m.especialidade_id })),
  ],
  medico_agendas: [{ id: AGENDA, clinica_id: CLINICA, medico_id: MEDICO, ordem_chegada: false }],
  agendamentos: horariosDeQuinta(),
  nina_cat_profissionais: [
    {
      id: PROFISSIONAL,
      clinica_id: CLINICA,
      medico_id: MEDICO,
      status: "PUBLICADO",
      nome: "Endocrinologista Ficticia",
      tipo_atendimento: "Consulta",
      especialidades: [{ nome: "ENDOCRINOLOGIA" }, { nome: "CLINICO GERAL" }],
      observacao_publica:
        "CONSULTA ENDOCRINOLOGIA\nEspecialidade: ENDOCRINOLOGIA\nIdade/critério informado: a partir de 18 anos\nDinheiro: R$ 120,00\nPix/cartão: R$ 145,00\nObservação: Agendado\n\n" +
        "CONSULTA CLÍNICO GERAL\nEspecialidade: CLÍNICO GERAL\nIdade/critério informado: a partir de 18 anos\nDinheiro: R$ 120,00\nPix/cartão: R$ 145,00\nObservação: Agendado",
      horarios: [{ dia: "Quinta", hora: "08:00" }],
      formas_pagamento: ["Dinheiro", "Pix", "Cartão"],
      convenios: [],
      atende_consultorio: true,
      aviso_dia: null,
      aviso_valido_de: null,
      aviso_valido_ate: null,
      estrutura: null,
      unidades: { nome: "Unidade Fictícia" },
      updated_at: new Date().toISOString(),
    },
    ...Array.from({ length: 40 }, (_, i) => ({
      ...cardiologiaAlex,
      id: uuid("aaaaaaaa", i + 1),
      clinica_id: CLINICA,
      medico_id: medicos[i + 1]!.id,
      status: "PUBLICADO",
      nome: `Medico Ficticio ${String(i + 1).padStart(3, "0")}`,
      horarios: [{ dia: "Segunda", hora: "08:00" }],
      formas_pagamento: ["Dinheiro"],
      convenios: [],
      atende_consultorio: true,
      aviso_dia: null,
      aviso_valido_de: null,
      aviso_valido_ate: null,
      estrutura: null,
      unidades: { nome: "Unidade Fictícia" },
      updated_at: new Date().toISOString(),
    })),
  ],
  nina_cat_servicos: Array.from({ length: 201 }, (_, i) => ({
    id: uuid("bbbbbbbb", i + 1),
    clinica_id: CLINICA,
    status: "PUBLICADO",
    procedimento_id: null,
    nome: `EXAME FICTICIO ${i + 1}`,
    valor: 100 + i,
    valor_observacao: null,
    descricao_publica: texto(30),
    preparo: texto(4),
    restricoes: null,
    executantes: [
      {
        nome: `Medico Ficticio ${String((i % 40) + 1).padStart(3, "0")}`,
        medico_id: medicos[(i % 40) + 1]!.id,
      },
    ],
    formas_pagamento: ["Dinheiro", "Pix"],
    estrutura: { versao: 1 },
    updated_at: new Date().toISOString(),
  })),
};

const leituras: string[] = [];
mock.module("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: {
    async rpc(nome: string) {
      throw new Error(`RPC inesperada no teste: ${nome}`);
    },
    from(tabela: string) {
      if (tabela === "audit_log")
        return {
          insert: async () => {
            leituras.push(tabela);
            return { error: null };
          },
        };
      if (!(tabela in base)) throw new Error(`Consulta inesperada no teste: ${tabela}`);
      const filtros: Array<(r: Linha) => boolean> = [];
      let ordem: string | null = null;
      let faixa: [number, number] | null = null;
      let limite: number | null = null;
      const ler = async () => {
        leituras.push(tabela);
        let linhas = base[tabela]!.filter((r) => filtros.every((f) => f(r)));
        if (ordem)
          linhas = [...linhas].sort((a, b) => String(a[ordem!]).localeCompare(String(b[ordem!])));
        const saida = faixa
          ? linhas.slice(faixa[0], faixa[1] + 1)
          : limite != null
            ? linhas.slice(0, limite)
            : linhas;
        return JSON.parse(JSON.stringify(saida)) as Linha[];
      };
      const q: any = {
        select: () => q,
        eq: (k: string, v: unknown) => {
          filtros.push((r) => r[k] === v);
          return q;
        },
        neq: (k: string, v: unknown) => {
          filtros.push((r) => r[k] !== v);
          return q;
        },
        in: (k: string, v: unknown[]) => {
          filtros.push((r) => v.includes(r[k]));
          return q;
        },
        gt: (k: string, v: unknown) => {
          filtros.push((r) => String(r[k]) > String(v));
          return q;
        },
        gte: (k: string, v: unknown) => {
          filtros.push((r) => String(r[k]) >= String(v));
          return q;
        },
        lt: (k: string, v: unknown) => {
          filtros.push((r) => String(r[k]) < String(v));
          return q;
        },
        lte: (k: string, v: unknown) => {
          filtros.push((r) => String(r[k]) <= String(v));
          return q;
        },
        is: (k: string, v: unknown) => {
          filtros.push((r) => (r[k] ?? null) === v);
          return q;
        },
        ilike: (k: string, v: string) => {
          const re = new RegExp(
            `^${v
              .split("%")
              .map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
              .join(".*")}$`,
            "i",
          );
          filtros.push((r) => re.test(String(r[k] ?? "")));
          return q;
        },
        order: (k: string) => {
          if (!ordem) ordem = k;
          return q;
        },
        limit: (n: number) => {
          limite = n;
          return q;
        },
        range: (a: number, b: number) => {
          faixa = [a, b];
          return q;
        },
        maybeSingle: async () => ({ data: (await ler())[0] ?? null, error: null }),
        single: async () => ({ data: (await ler())[0] ?? null, error: null }),
        then: (
          ok: (r: { data: Linha[]; error: null }) => unknown,
          erro?: (e: unknown) => unknown,
        ) => ler().then((data) => ok({ data, error: null }), erro),
      };
      return q;
    },
  },
}));

const { executarFerramentaPaciente } = await import("../paciente-tools.server");
const { comCatalogoDoTurno, catalogoDoTurno } = await import("../catalogo-turno.server");
const { comColetor } = await import("../evidencias.server");
const { normalizarEstado } = await import("../fluxo-estado-normalizar");

const contexto = () => ({
  clinicaId: CLINICA,
  telefone: "55000100999",
  pacienteId: null,
  pacienteNome: null,
  conversaId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
  origem: "homologacao" as const,
  podeAgendar: true,
  teste: true,
  estado: normalizarEstado({
    flow: { stage: "INFORMATION_RESPONSE" },
    greeting_completed: true,
    session_id: SESSAO,
    knowledge_context: {
      clinicaId: CLINICA,
      consulta: { termo: "Endocrinologia", tipo_atendimento: "consulta" },
      referencias: [
        {
          medicoNome: "Endocrinologista Ficticia",
          procedimento: "Consulta ENDOCRINOLOGIA",
          registro: PROFISSIONAL,
          versao: null,
        },
      ],
      selecao: null,
      sessionId: SESSAO,
      versao: 1,
    },
  }),
});

describe("Erro Crítico 01 — 5) teto de consultas de proxima_vaga", () => {
  for (const [nome, args] of [
    ["nome + quinta", { medico_id: "Endocrinologista Ficticia", dia_semana: 4 }],
    ["UUID operacional + quinta", { medico_id: MEDICO, dia_semana: 4 }],
    [
      "nome + especialidade + quinta",
      {
        medico_id: "Dra. Endocrinologista Ficticia",
        especialidade: "Endocrinologia",
        dia_semana: 4,
      },
    ],
  ] as const) {
    test(`${nome}: encontra a vaga com poucas consultas e pouco processamento (já funciona)`, async () => {
      const cpu0 = process.cpuUsage();
      const { resultado } = await comColetor(() =>
        comCatalogoDoTurno(CLINICA, async () => {
          await catalogoDoTurno(CLINICA); // no turno real o catálogo já foi lido antes da ferramenta
          leituras.length = 0;
          return executarFerramentaPaciente(contexto() as never, "proxima_vaga", args);
        }),
      );
      const cpu = process.cpuUsage(cpu0);
      const r = resultado as { ok: boolean; proxima?: { data: string } };
      const porTabela = leituras.reduce<Record<string, number>>(
        (a, t) => ({ ...a, [t]: (a[t] ?? 0) + 1 }),
        {},
      );
      console.info(
        "PROXIMA_VAGA=" +
          JSON.stringify({
            variante: nome,
            ok: r.ok,
            primeira: r.proxima?.data ?? null,
            consultas: leituras.length,
            porTabela,
            cpuMs: Math.round((cpu.user + cpu.system) / 1000),
          }),
      );
      expect(r.ok).toBe(true);
      expect(r.proxima?.data).toBeDefined();
      expect(leituras.length).toBeLessThanOrEqual(20);
      expect((cpu.user + cpu.system) / 1000).toBeLessThan(1500);
    });
  }
});
