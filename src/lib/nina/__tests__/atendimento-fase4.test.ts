import { describe, it, expect } from "bun:test";
import { estadoVazio } from "../fluxo-estado.server";
import {
  blocoPromptFase4,
  faltaParaConsultarAgenda,
  lerMensagemFase4,
  textoResumo,
} from "../atendimento-fase4";

function estadoCom(
  appointment: Record<string, unknown>,
  patient: Record<string, unknown> = {},
) {
  const base = estadoVazio();
  return {
    ...base,
    patient: { ...base.patient, ...patient },
    appointment: { ...base.appointment, ...appointment },
  };
}

describe("fase 4 — dados mínimos", () => {
  it("aponta o que falta antes de consultar a agenda", () => {
    expect(faltaParaConsultarAgenda(estadoVazio())).toContain("procedimento");
    expect(faltaParaConsultarAgenda(estadoVazio())).toContain("preferencia_data");
  });

  it("não reclama quando já há especialidade e data", () => {
    const e = estadoCom({ specialty: "Cardiologia", date: "2026-09-08" });
    expect(faltaParaConsultarAgenda(e)).toEqual([]);
  });
});

describe("fase 4 — leitura da mensagem", () => {
  it("escolher horário não é confirmação", () => {
    const r = lerMensagemFase4("Quero 09:00");
    expect(r.escolheuHorario).toBe(true);
    expect(r.confirmouFinal).toBe(false);
  });

  it("reconhece confirmação final explícita", () => {
    expect(lerMensagemFase4("pode confirmar").confirmouFinal).toBe(true);
    expect(lerMensagemFase4("sim").confirmouFinal).toBe(true);
  });

  it("pedido de alteração não confirma", () => {
    const r = lerMensagemFase4("não, prefiro outro horário");
    expect(r.confirmouFinal).toBe(false);
    expect(r.pediuAlteracao).toBe(true);
  });
});

describe("fase 4 — prompt", () => {
  const estado = estadoCom(
    {
      specialty: "Cardiologia",
      doctor_name: "Dr. João",
      date: "2026-09-08",
      time: "09:00",
    },
    { first_name: "João" },
  );

  it("proíbe inventar horário e limita a 3 opções", () => {
    const bloco = blocoPromptFase4({
      mensagem: "tem horário essa semana?",
      estado,
      nomeUnidade: "Policlínica Menino Jesus",
    });
    expect(bloco).toMatch(/PROIBIDO oferecer/);
    expect(bloco).toMatch(/máximo 3 opções/);
  });

  it("exige resumo antes de gravar quando há vaga escolhida", () => {
    const bloco = blocoPromptFase4({
      mensagem: "quero 09:00",
      estado,
      nomeUnidade: "Policlínica Menino Jesus",
    });
    expect(bloco).toMatch(/ESCOLHA NÃO É CONFIRMAÇÃO/);
    expect(bloco).toMatch(/Posso confirmar esse agendamento\?/);
    expect(bloco).toMatch(/Unidade: Policlínica Menino Jesus/);
  });

  it("libera a ferramenta só após confirmação final", () => {
    const bloco = blocoPromptFase4({
      mensagem: "pode confirmar",
      estado,
      nomeUnidade: "Policlínica Menino Jesus",
    });
    expect(bloco).toMatch(/CHAMAR a ferramenta de agendar/);
  });

  it("resumo traz paciente, atendimento, data e horário", () => {
    const resumo = textoResumo(estado, "Policlínica Menino Jesus");
    expect(resumo).toContain("Paciente: João");
    expect(resumo).toContain("Horário: 09:00");
  });
});
