import { describe, expect, test } from "bun:test";
import {
  criarAgendamentoCore,
  type CriarAgendamentoCoreInput,
} from "../criar-agendamento.core.server";
import type { CtxAgenda } from "../ator.server";

type Linha = Record<string, any>;
function cenario(patch: Linha = {}, ocuparDuranteRpc = false) {
  const vaga: Linha = {
    id: "vaga",
    clinica_id: "clinica",
    medico_id: "medico",
    paciente_id: null,
    paciente_nome: "DISPONIVEL",
    status: "confirmado",
    inicio: "2030-01-21T13:20:00Z",
    fim: "2030-01-21T13:40:00Z",
    agenda_id: "agenda",
    ...patch,
  };
  const rpcs: Linha[] = [];
  const tabelas: Record<string, Linha[]> = {
    agendamentos: [vaga],
    pacientes: [{ id: "paciente", telefone: "21999990000", data_nascimento: "1990-01-02" }],
    procedimentos: [],
    medico_agendas: [],
  };
  const db = {
    from(tabela: string) {
      const filtros: Array<(r: Linha) => boolean> = [];
      const linhas = () =>
        tabelas[tabela]!.filter((r) => filtros.every((f) => f(r))).map((r) => ({ ...r }));
      const q = {
        select: () => q,
        limit: () => q,
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
        lt: (k: string, v: string) => {
          filtros.push((r) => r[k] < v);
          return q;
        },
        gt: (k: string, v: string) => {
          filtros.push((r) => r[k] > v);
          return q;
        },
        gte: (k: string, v: string) => {
          filtros.push((r) => r[k] >= v);
          return q;
        },
        maybeSingle: async () => ({ data: linhas()[0] ?? null, error: null }),
        then: (fn: (r: { data: Linha[]; error: null }) => unknown) =>
          Promise.resolve(fn({ data: linhas(), error: null })),
      };
      return q;
    },
    rpc: async (_nome: string, args: Linha) => {
      rpcs.push(args);
      if (ocuparDuranteRpc)
        Object.assign(vaga, { paciente_nome: "Outro paciente", paciente_id: "outro" });
      // Mesmo compare-and-set da RPC existente: disputa não sobrescreve o vencedor.
      if (
        args._paciente_nome_esperado_no_slot !== null &&
        vaga.paciente_nome !== args._paciente_nome_esperado_no_slot
      )
        return { data: null, error: { code: "23505", message: "Horário ocupado" } };
      Object.assign(vaga, {
        paciente_nome: args._paciente_nome,
        paciente_id: args._paciente_id,
        medico_id: args._medico_id,
        inicio: args._inicio,
        fim: args._fim,
      });
      return { data: { id: "vaga" }, error: null };
    },
  };
  const ctx: CtxAgenda = {
    db: db as never,
    ator: {
      tipo: "integracao",
      api_key_id: "nina-ai",
      clinica_id: "clinica",
      origem_integracao: "nina",
    },
  };
  const pedido: CriarAgendamentoCoreInput = {
    clinica_id: "clinica",
    editing_id: "vaga",
    payload: {
      clinica_id: "clinica",
      paciente_id: "paciente",
      paciente_nome: "Paciente Teste",
      medico_id: "medico",
      inicio: "2030-01-21T13:20:00Z",
      fim: "2030-01-21T13:40:00Z",
      procedimento: "Consulta",
      status: "agendado",
      observacoes: null,
      data_pagamento: null,
      orcamento_id: null,
      tipo_atendimento: "particular",
      forma_pagamento_prevista: null,
    },
    checagens: {
      validar_paciente_completo: true,
      validar_agenda_aberta: true,
      validar_inadimplencia: false,
    },
    pending_orc_item_ids: [],
  };
  return { vaga, rpcs, ctx, pedido };
}
describe("núcleo da agenda: vaga confirmada pela Nina", () => {
  test("mantém 10:20 e ativa a trava de ocupação mesmo sem alteração do intervalo", async () => {
    const t = cenario();
    expect((await criarAgendamentoCore(t.ctx, t.pedido)).ok).toBe(true);
    expect(t.rpcs).toHaveLength(1);
    expect(t.rpcs[0]!._paciente_nome_esperado_no_slot).toBe("DISPONIVEL");
    expect(t.vaga.inicio).toBe("2030-01-21T13:20:00Z");
  });
  for (const patch of [
    { paciente_nome: "Outra pessoa" },
    { paciente_id: "outro" },
    { status: "cancelado" },
    { inicio: "2030-01-21T11:00:00Z" },
    { fim: "2030-01-21T14:00:00Z" },
    { medico_id: "outro" },
  ])
    test(`rejeita vaga modificada: ${JSON.stringify(patch)}`, async () => {
      const t = cenario(patch);
      expect((await criarAgendamentoCore(t.ctx, t.pedido)).ok).toBe(false);
      expect(t.rpcs).toHaveLength(0);
    });
  test("ocupação entre leitura e gravação preserva o outro paciente", async () => {
    const t = cenario({}, true);
    const r = await criarAgendamentoCore(t.ctx, t.pedido);
    expect(r.ok).toBe(false);
    expect(!r.ok && "validation_error" in r && r.validation_error.message).toContain("ocupado");
    expect(t.vaga.paciente_nome).toBe("Outro paciente");
    expect(t.vaga.paciente_id).toBe("outro");
  });
  test("Nina não cria encaixe quando o slot desaparece", async () => {
    const t = cenario();
    t.pedido.editing_id = null;
    expect((await criarAgendamentoCore(t.ctx, t.pedido)).ok).toBe(false);
    expect(t.rpcs).toHaveLength(0);
  });
  test("edição manual de agendamento ocupado mantém o fluxo da recepção", async () => {
    const t = cenario({ paciente_nome: "Paciente Teste", paciente_id: "paciente" });
    t.ctx.ator = { tipo: "usuario", userId: "recepcao" };
    expect((await criarAgendamentoCore(t.ctx, t.pedido)).ok).toBe(true);
    expect(t.rpcs).toHaveLength(1);
  });
});
