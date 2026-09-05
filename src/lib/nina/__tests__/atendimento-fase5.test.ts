import { describe, it, expect } from "bun:test";
import { estadoVazio } from "../fluxo-estado.server";
import { blocoPromptFase5, lerMensagemFase5 } from "../atendimento-fase5";

function estadoCom(appointment: Record<string, unknown>) {
  const base = estadoVazio();
  return { ...base, appointment: { ...base.appointment, ...appointment } };
}

const UNIDADE = "Policlínica Menino Jesus";

describe("fase 5 — leitura da mensagem", () => {
  it("reconhece encerramento", () => {
    expect(lerMensagemFase5("não, obrigado").pediuEncerramento).toBe(true);
    expect(lerMensagemFase5("era só isso").pediuEncerramento).toBe(true);
  });

  it("nova pergunta não encerra", () => {
    const r = lerMensagemFase5("qual o endereço da unidade?");
    expect(r.pediuEncerramento).toBe(false);
    expect(r.novaSolicitacao).toBe(true);
  });
});

describe("fase 5 — prompt", () => {
  it("exige confirmação e prova de sucesso", () => {
    const bloco = blocoPromptFase5({
      mensagem: "pode confirmar",
      estado: estadoVazio(),
      nomeUnidade: UNIDADE,
      baseAtiva: true,
    });
    expect(bloco).toMatch(/SOMENTE depois da confirmação explícita/);
    expect(bloco).toMatch(/PROVA DE SUCESSO/);
    expect(bloco).toMatch(/preparo, documentos/);
  });

  it("falha não vira confirmação e slot ocupado reconsulta", () => {
    const bloco = blocoPromptFase5({
      mensagem: "sim",
      estado: estadoVazio(),
      nomeUnidade: UNIDADE,
      baseAtiva: false,
    });
    expect(bloco).toMatch(/NÃO diga que agendou/);
    expect(bloco).toMatch(/acabou de ficar indisponível/);
    expect(bloco).not.toMatch(/preparo, documentos/);
  });

  it("evita agendamento duplicado quando já existe registro", () => {
    const bloco = blocoPromptFase5({
      mensagem: "obrigado",
      estado: estadoCom({ appointment_id: "abc-123" }),
      nomeUnidade: UNIDADE,
      baseAtiva: false,
    });
    expect(bloco).toMatch(/JÁ foi criado nesta conversa/);
  });

  it("despede só quando o paciente encerra", () => {
    const fim = blocoPromptFase5({
      mensagem: "era só isso",
      estado: estadoVazio(),
      nomeUnidade: UNIDADE,
      baseAtiva: false,
    });
    expect(fim).toMatch(/agradece o contato/);

    const segue = blocoPromptFase5({
      mensagem: "preciso também de um exame de sangue",
      estado: estadoVazio(),
      nomeUnidade: UNIDADE,
      baseAtiva: false,
    });
    expect(segue).toMatch(/continue o atendimento normalmente/);
    expect(segue).toMatch(/Não se despeça/);
  });
});
