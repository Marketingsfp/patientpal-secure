import { describe, expect, it } from "vitest";
import {
  fatosRemetente,
  primeiroNomeSeguro,
  resolverIdentidadePaciente,
  type CandidatoPacienteNina,
} from "./identidade-paciente";

const aparecida: CandidatoPacienteNina = {
  id: "p-aparecida",
  nome: "APARECIDA DE SOUZA",
  associado: true,
  convenio_nome: "Cartão Benefícios",
};
const tuane: CandidatoPacienteNina = {
  id: "p-tuane",
  nome: "TUANE ALVES",
  associado: false,
  convenio_nome: null,
};

describe("FASE 4 — identidade do paciente na Nina", () => {
  it("TESTE 1: mesmo telefone em dois pacientes → AMBIGUOUS", () => {
    const r = resolverIdentidadePaciente({ candidates: [aparecida, tuane], viaCpf: false });
    expect(r.status).toBe("AMBIGUOUS");
    expect(r.paciente).toBeNull();
  });

  it("TESTE 2: ambíguo não expõe nome nem convênio do primeiro cadastro", () => {
    const r = resolverIdentidadePaciente({ candidates: [aparecida, tuane], viaCpf: false });
    const fatos = fatosRemetente(r);
    expect(fatos.nome).toBeNull();
    expect(fatos.associado).toBe(false);
    expect(fatos.convenio).toBeNull();
    expect(fatos.identidade_confirmada).toBe(false);
    expect(primeiroNomeSeguro(r)).toBeNull();
  });

  it("TESTE 3: confirmação do nome correto → CONFIRMED com o cadastro certo", () => {
    const r = resolverIdentidadePaciente(
      { candidates: [tuane], viaCpf: false },
      { confirmadoNaConversa: true },
    );
    expect(r.status).toBe("CONFIRMED");
    expect(r.paciente?.id).toBe("p-tuane");
  });

  it("TESTE 4: handoff antes da confirmação usa o nome do contato WhatsApp", () => {
    const r = resolverIdentidadePaciente({ candidates: [aparecida], viaCpf: false });
    expect(r.status).toBe("UNIQUE_CANDIDATE");
    expect(primeiroNomeSeguro(r, "Tuane")).toBe("Tuane");
    expect(primeiroNomeSeguro(r, "+55 21 97158-9468")).toBeNull();
  });

  it("TESTE 5: candidato único não libera contrato/benefício", () => {
    const fatos = fatosRemetente(
      resolverIdentidadePaciente({ candidates: [aparecida], viaCpf: false }),
    );
    expect(fatos.associado).toBe(false);
    expect(fatos.convenio).toBeNull();
    expect(fatos.cadastro_encontrado).toBe(true);
  });

  it("CPF informado com cadastro único confirma a identidade", () => {
    const r = resolverIdentidadePaciente({ candidates: [tuane], viaCpf: true });
    expect(r.status).toBe("CONFIRMED");
    expect(fatosRemetente(r).nome).toBe("TUANE ALVES");
  });

  it("vínculo explícito da conversa vale como confirmado", () => {
    const r = resolverIdentidadePaciente(
      { candidates: [aparecida, tuane], viaCpf: false },
      { pacienteVinculadoId: "p-tuane" },
    );
    expect(r.status).toBe("CONFIRMED");
    expect(r.paciente?.id).toBe("p-tuane");
  });

  it("sem candidatos → NONE", () => {
    expect(resolverIdentidadePaciente(null).status).toBe("NONE");
    expect(resolverIdentidadePaciente({ candidates: [], viaCpf: false }).status).toBe("NONE");
  });
});
