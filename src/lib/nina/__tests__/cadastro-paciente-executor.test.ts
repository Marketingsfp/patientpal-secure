import { beforeEach, describe, expect, mock, test } from "bun:test";
import { estadoVazio } from "../fluxo-estado-normalizar";
import type { CtxNinaPaciente } from "../paciente-tools.server";
type Linha = Record<string, unknown>;
let banco: Record<string, Linha[]>;
let retornoRpc: Linha;
const rpcs: Array<{ nome: string; args: Linha }> = [];
const leituras: Array<{ tabela: string; filtros: Linha }> = [];
const escritos: Array<{ tabela: string; valor: Linha }> = [];
mock.module("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: {
    rpc: async (nome: string, args: Linha) => {
      rpcs.push({ nome, args });
      return { data: retornoRpc, error: null };
    },
    from: (tabela: string) => {
      const filtros: Linha = {};
      let patch: Linha | null = null;
      let inserir: Linha | null = null;
      const concluir = () => {
        leituras.push({ tabela, filtros: { ...filtros } });
        const tabelaDados = banco[tabela] ?? (banco[tabela] = []);
        if (inserir) {
          const linha = { id: "novo-sintetico", ativo: true, ...inserir };
          tabelaDados.push(linha);
          escritos.push({ tabela, valor: inserir });
          return { data: linha, error: null };
        }
        const linhas = tabelaDados.filter((r) =>
          Object.entries(filtros).every(([k, v]) => r[k] === v),
        );
        if (patch) {
          for (const r of linhas) Object.assign(r, patch);
          escritos.push({ tabela, valor: patch });
        }
        return { data: linhas[0] ?? null, error: null };
      };
      const q = {
        select: () => q,
        eq: (k: string, v: unknown) => {
          filtros[k] = v;
          return q;
        },
        is: (k: string, v: unknown) => {
          filtros[k] = v;
          return q;
        },
        insert: (v: Linha) => {
          inserir = v;
          return q;
        },
        update: (v: Linha) => {
          patch = v;
          return q;
        },
        maybeSingle: async () => concluir(),
        then: (fn: (r: ReturnType<typeof concluir>) => unknown) => Promise.resolve(fn(concluir())),
      };
      return q;
    },
  },
}));
const { executarFerramentaPaciente } = await import("../paciente-tools.server");
function contexto(teste = false): CtxNinaPaciente {
  const estado = estadoVazio();
  Object.assign(estado.appointment, {
    procedure: "Consulta Ortopedia",
    doctor_id: "medico",
    doctor_name: "Jorge",
    slot_inicio: "2030-01-21T17:00:00Z",
    slot_fim: "2030-01-21T17:30:00Z",
    slot_confirmed_by_patient: true,
  });
  return {
    clinicaId: "clinica",
    conversaId: "conversa",
    telefone: "5521999990000",
    pacienteId: null,
    pacienteNome: null,
    estado,
    origem: teste ? "homologacao" : "whatsapp",
    teste,
    podeAgendar: true,
  };
}
function vincular(ctx: CtxNinaPaciente, dados: Linha = {}) {
  ctx.pacienteId = "paciente";
  Object.assign(ctx.estado!.patient, { id: "paciente", identified: true, validated: true });
  banco.pacientes!.push({
    id: "paciente",
    clinica_id: "clinica",
    nome: "ANA DA SILVA",
    data_nascimento: "1990-01-02",
    telefone: "21999990000",
    ativo: true,
    is_mock_data: false,
    teste: false,
    ...dados,
  });
}
beforeEach(() => {
  banco = {
    pacientes: [],
    atend_conversas: [{ id: "conversa", clinica_id: "clinica" }],
    nina_teste_leads: [
      { id: "lead", clinica_id: "clinica", telefone_sessao: "5521999990000", indice: 1 },
    ],
  };
  retornoRpc = { ok: true, paciente_id: "paciente", criado: true };
  rpcs.length = 0;
  leituras.length = 0;
  escritos.length = 0;
});

describe("executor do cadastro com banco simulado", () => {
  test("só aceita cadastro depois de atendimento definido e vaga confirmada", async () => {
    const ctx = contexto();
    ctx.estado!.appointment.slot_confirmed_by_patient = false;
    const r = await executarFerramentaPaciente(ctx, "identificar_paciente", {
      nome: "Ana Silva",
      data_nascimento: "1990-01-02",
    });
    expect(r.ok).toBe(false);
    expect(r.erro).toBe("ACTION_NOT_AUTHORIZED");
    expect(rpcs).toHaveLength(0);
    expect(leituras.filter((l) => l.tabela === "pacientes")).toHaveLength(0);
  });
  test("contato desconhecido precisa só nome e nascimento; telefone vem do WhatsApp", async () => {
    const r = await executarFerramentaPaciente(contexto(), "consultar_cadastro_paciente", {});
    expect(r).toMatchObject({
      ok: true,
      cadastro: "a_identificar",
      campos_faltantes: ["nome", "data_nascimento"],
    });
  });
  test("cadastro confirmado completo não solicita dados", async () => {
    const ctx = contexto();
    vincular(ctx);
    expect(await executarFerramentaPaciente(ctx, "consultar_cadastro_paciente", {})).toMatchObject({
      ok: true,
      campos_faltantes: [],
    });
  });
  test("cadastro confirmado incompleto pede apenas o campo ausente", async () => {
    const ctx = contexto();
    vincular(ctx, { data_nascimento: null });
    expect(await executarFerramentaPaciente(ctx, "consultar_cadastro_paciente", {})).toMatchObject({
      ok: true,
      campos_faltantes: ["data_nascimento"],
    });
  });
  test("produção usa a função atômica sem CPF e registra identidade", async () => {
    const ctx = contexto();
    expect(
      (
        await executarFerramentaPaciente(ctx, "identificar_paciente", {
          nome: "Ana da Silva",
          data_nascimento: "02/01/1990",
        })
      ).ok,
    ).toBe(true);
    expect(rpcs).toEqual([
      {
        nome: "nina_resolver_cadastro",
        args: {
          _clinica_id: "clinica",
          _conversa_id: "conversa",
          _nome: "ANA DA SILVA",
          _data_nascimento: "1990-01-02",
          _telefone: "21999990000",
          _cpf: null,
        },
      },
    ]);
    expect(ctx.estado!.patient.validated).toBe(true);
    expect(JSON.stringify(escritos.filter((e) => e.tabela === "audit_log"))).not.toContain(
      "1990-01-02",
    );
  });
  test("campos já existentes prevalecem sobre argumentos do modelo", async () => {
    const ctx = contexto();
    vincular(ctx);
    await executarFerramentaPaciente(ctx, "identificar_paciente", {
      nome: "Outra Pessoa",
      data_nascimento: "1980-01-01",
      telefone: "21900000000",
    });
    expect(rpcs[0]?.args._nome).toBe("ANA DA SILVA");
    expect(rpcs[0]?.args._data_nascimento).toBe("1990-01-02");
  });
  test("ambiguidade não valida paciente nem tenta outro cadastro", async () => {
    retornoRpc = { ok: false, erro: "PATIENT_AMBIGUOUS" };
    const ctx = contexto();
    const r = await executarFerramentaPaciente(ctx, "identificar_paciente", {
      nome: "Ana Silva",
      data_nascimento: "1990-01-02",
    });
    expect(r.erro).toBe("PATIENT_AMBIGUOUS");
    expect(ctx.pacienteId).toBeNull();
    expect(rpcs).toHaveLength(1);
  });
  test("dados ausentes não chegam à função de cadastro", async () => {
    const r = await executarFerramentaPaciente(contexto(), "identificar_paciente", {
      nome: "Ana Silva",
    });
    expect(r.erro).toBe("PATIENT_DATA_REQUIRED");
    expect(rpcs).toHaveLength(0);
  });
  test("homologação cria apenas paciente sintético, sem RPC real e sem CPF", async () => {
    const ctx = contexto(true);
    const r = await executarFerramentaPaciente(ctx, "identificar_paciente", {
      nome: "Ana Silva",
      data_nascimento: "1990-01-02",
    });
    expect(r.ok).toBe(true);
    expect(rpcs).toHaveLength(0);
    const criado = escritos.find((e) => e.tabela === "pacientes")?.valor;
    expect(criado).toMatchObject({
      is_mock_data: true,
      teste: true,
      data_nascimento: "2000-01-01",
    });
    expect(criado?.nome).toContain("[TESTE NINA]");
    expect(criado).not.toHaveProperty("cpf");
  });
  test("homologação não lê nem reutiliza paciente real vinculado por engano", async () => {
    const ctx = contexto(true);
    vincular(ctx);
    expect((await executarFerramentaPaciente(ctx, "consultar_cadastro_paciente", {})).ok).toBe(
      false,
    );
    expect(
      leituras
        .filter((l) => l.tabela === "pacientes")
        .every((l) => l.filtros.is_mock_data === true),
    ).toBe(true);
    expect(rpcs).toHaveLength(0);
  });
});
