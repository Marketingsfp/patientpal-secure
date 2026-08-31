import { describe, expect, it } from "bun:test";
import { pacienteSchema, resolverPaciente } from "./pacientes-v1.server";
import { ApiError, type ApiKeyContexto } from "./api.server";

const CLINICA = "1d3c4f34-2a0f-40fa-b39a-3609677a11a5";
const PAC = "00000000-0000-0000-0000-0000000000a1";

const ctx: ApiKeyContexto = {
  api_key_id: "00000000-0000-0000-0000-0000000000k1",
  clinica_id: CLINICA,
  origem_integracao: "site-sfp",
  escopos: ["appointments:write", "patients:write"],
  limite_por_minuto: 60,
  limite_por_dia: 1000,
  limite_pacientes_por_minuto: 20,
  limite_pacientes_por_dia: 200,
};

const entrada = {
  cpf: "529.982.247-25", // CPF fictício válido (DV correto)
  nome: "SIM_MARIA TESTE",
  data_nascimento: "1985-03-12",
  telefone: "21999998888",
};

/** Stub mínimo do supabase: só o que resolverPaciente usa. */
function fakeDb(opts: {
  rpc: unknown;
  paciente?: { id: string; nome: string; telefone: string | null } | null;
  onRpc?: (args: Record<string, unknown>) => void;
}) {
  return {
    rpc: async (nome: string, args: Record<string, unknown>) => {
      if (nome === "integracao_rate_limit_consumir") return { data: { permitido: true }, error: null };
      opts.onRpc?.(args);
      return { data: opts.rpc, error: null };
    },
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: opts.paciente === undefined ? { id: PAC, nome: entrada.nome, telefone: entrada.telefone, clinica_id: CLINICA } : opts.paciente,
              error: null,
            }),
          }),
        }),
      }),
    }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

describe("resolverPaciente — validação de CPF", () => {
  it("rejeita CPF com dígito verificador errado", async () => {
    const db = fakeDb({ rpc: { paciente_id: PAC, criado: true } });
    await expect(resolverPaciente(db, ctx, { ...entrada, cpf: "12345678901" })).rejects.toMatchObject(
      { code: "invalid_cpf", status: 422 },
    );
  });

  it("rejeita CPF com todos os dígitos iguais", async () => {
    const db = fakeDb({ rpc: { paciente_id: PAC, criado: true } });
    await expect(resolverPaciente(db, ctx, { ...entrada, cpf: "111.111.111-11" })).rejects.toBeInstanceOf(
      ApiError,
    );
  });
});

describe("resolverPaciente — resolução", () => {
  it("cadastra paciente novo e sinaliza criado apenas no retorno interno", async () => {
    const db = fakeDb({ rpc: { paciente_id: PAC, criado: true, mismatch: false } });
    const r = await resolverPaciente(db, ctx, entrada);
    expect(r.paciente_id).toBe(PAC);
    expect(r.criado).toBe(true);
  });

  it("reaproveita paciente existente sem marcar criação", async () => {
    const db = fakeDb({ rpc: { paciente_id: PAC, criado: false, mismatch: false } });
    const r = await resolverPaciente(db, ctx, entrada);
    expect(r.criado).toBe(false);
  });

  it("recusa data de nascimento divergente sem confirmar existência do CPF", async () => {
    const db = fakeDb({ rpc: { mismatch: true } });
    try {
      await resolverPaciente(db, ctx, entrada);
      throw new Error("deveria ter lançado");
    } catch (e) {
      const err = e as ApiError;
      expect(err.code).toBe("patient_data_mismatch");
      // A mensagem não pode dizer que o CPF existe/não existe.
      expect(err.message.toLowerCase()).not.toContain("já cadastrado");
      expect(err.message.toLowerCase()).not.toContain("não existe");
    }
  });

  it("envia sempre o CPF só em dígitos e a clínica da chave para o banco", async () => {
    let visto: Record<string, unknown> = {};
    const db = fakeDb({
      rpc: { paciente_id: PAC, criado: false, mismatch: false },
      onRpc: (a) => (visto = a),
    });
    await resolverPaciente(db, ctx, entrada);
    expect(visto['_cpf_digits']).toBe("52998224725");
    expect(visto['_clinica_id']).toBe(CLINICA);
  });

  it("não sobrescreve o cadastro: telefone diferente vira observação", async () => {
    const db = fakeDb({
      rpc: { paciente_id: PAC, criado: false, mismatch: false },
      paciente: { id: PAC, nome: entrada.nome, telefone: "2133334444" },
    });
    const r = await resolverPaciente(db, ctx, entrada);
    expect(r.telefone_divergente).toBe("21999998888");
  });

  it("trata paciente fora da clínica da chave como divergência (nunca vaza)", async () => {
    // O SELECT de conferência filtra por clinica_id; sem linha, não passa.
    const db = fakeDb({ rpc: { paciente_id: PAC, criado: false, mismatch: false }, paciente: null });
    await expect(resolverPaciente(db, ctx, entrada)).rejects.toMatchObject({
      code: "patient_data_mismatch",
    });
  });
});

describe("pacienteSchema", () => {
  it("exige cpf, nome, nascimento e telefone", () => {
    const r = pacienteSchema.safeParse({ cpf: "52998224725" });
    expect(r.success).toBe(false);
  });

  it("aceita e-mail e sexo como opcionais", () => {
    expect(pacienteSchema.safeParse(entrada).success).toBe(true);
    expect(
      pacienteSchema.safeParse({ ...entrada, email: "sim@exemplo.com", sexo: "feminino" }).success,
    ).toBe(true);
  });

  it("recusa data de nascimento fora do formato AAAA-MM-DD", () => {
    expect(pacienteSchema.safeParse({ ...entrada, data_nascimento: "12/03/1985" }).success).toBe(
      false,
    );
  });
});
