import { describe, expect, test } from "bun:test";
import {
  criarAgendamentoCore,
  type CriarAgendamentoCoreInput,
} from "../criar-agendamento.core.server";
import type { CtxAgenda } from "../ator.server";

// Caso de 06/10/2026: as fichas extras do "+ Mais fichas" nascem todas no
// último horário do turno, 1 segundo uma da outra (17:20:07, 17:20:30…), e
// todas terminam às 17:30. A paciente já tinha a das 17:20:30; a recepção
// tentou dar a ela mais uma ficha (outra infiltração) na das 17:20:07.
type Linha = Record<string, any>;
function cenario() {
  const ocupada: Linha = {
    id: "ficha-ocupada",
    clinica_id: "clinica",
    medico_id: "medico",
    paciente_id: "paciente",
    paciente_nome: "Paciente Teste",
    status: "agendado",
    inicio: "2030-01-21T20:20:30Z",
    fim: "2030-01-21T20:30:00Z",
    agenda_id: "agenda",
  };
  const livre: Linha = {
    id: "ficha-livre",
    clinica_id: "clinica",
    medico_id: "medico",
    paciente_id: null,
    paciente_nome: "DISPONIVEL",
    status: "agendado",
    inicio: "2030-01-21T20:20:07Z",
    fim: "2030-01-21T20:30:00Z",
    agenda_id: "agenda",
  };
  const rpcs: Linha[] = [];
  const tabelas: Record<string, Linha[]> = {
    agendamentos: [ocupada, livre],
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
      Object.assign(livre, { paciente_nome: args._paciente_nome, paciente_id: args._paciente_id });
      return { data: { id: "ficha-livre" }, error: null };
    },
  };
  const ctx: CtxAgenda = { db: db as never, ator: { tipo: "usuario", userId: "recepcao" } };
  const pedido: CriarAgendamentoCoreInput = {
    clinica_id: "clinica",
    editing_id: "ficha-livre",
    payload: {
      clinica_id: "clinica",
      paciente_id: "paciente",
      paciente_nome: "Paciente Teste",
      medico_id: "medico",
      inicio: "2030-01-21T20:20:07Z",
      fim: "2030-01-21T20:30:00Z",
      procedimento: "INFILTRACAO (CADA) (ORTOPEDIA)",
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
  return { livre, rpcs, ctx, pedido };
}

describe("mesmo paciente, mais uma ficha com o mesmo profissional", () => {
  test("a recepção recebe uma pergunta, não um bloqueio", async () => {
    const t = cenario();
    const r = await criarAgendamentoCore(t.ctx, t.pedido);
    expect(r.ok).toBe(false);
    expect(!r.ok && "validation_error" in r && r.validation_error.confirmavel).toBe(
      "conflito_mesmo_profissional",
    );
    expect(t.rpcs).toHaveLength(0);
  });

  test("confirmando que é outro procedimento, a ficha é gravada", async () => {
    const t = cenario();
    t.pedido.confirmacoes = { permitir_conflito_mesmo_profissional: true };
    expect((await criarAgendamentoCore(t.ctx, t.pedido)).ok).toBe(true);
    expect(t.rpcs).toHaveLength(1);
    expect(t.livre.paciente_id).toBe("paciente");
  });

  test("a confirmação de OUTRO profissional não libera o mesmo profissional", async () => {
    // Nina e API mandam só esse flag; para elas o choque continua bloqueado.
    const t = cenario();
    t.pedido.confirmacoes = { permitir_conflito_paciente: true };
    const r = await criarAgendamentoCore(t.ctx, t.pedido);
    expect(r.ok).toBe(false);
    expect(t.rpcs).toHaveLength(0);
  });
});
