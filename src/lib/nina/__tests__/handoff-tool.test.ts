import { describe, expect, it, mock } from "bun:test";

let retorno: Record<string, unknown> = {};
const encaminhar = mock(async (_args: unknown) => retorno);
mock.module("@/lib/atendimento/handoff.server", () => ({ encaminharParaHumano: encaminhar }));
const { executarHandoffTool } = await import("../handoff-tool.server");
const contexto = { clinicaId: "clinica-teste", conversaId: "conversa-teste" };

describe("orientação após encaminhamento", () => {
  it("propaga o aviso confirmado e não manda criar uma segunda mensagem", async () => {
    retorno = { ok: true, aviso: { estado: "confirmado", mensagemId: "aviso-1" } };
    const r = await executarHandoffTool(contexto, JSON.stringify({ motivo: "AGENDA_SEM_VAGAS" }));
    expect(r.aviso).toEqual(retorno.aviso as never);
    expect(r.instrucao_para_voce).toContain("sem produzir outro aviso");
  });
  it("executa encaminhamento silencioso quando solicitado e uma conversa já com humano sem nova orientação de aviso", async () => {
    retorno = { ok: true, ja_estava_com_humano: true };
    const sfp = await executarHandoffTool(contexto, JSON.stringify({ motivo: "PROFISSIONAL_SFP", avisar_paciente: false }));
    expect(sfp.sem_mensagem_paciente).toBe(true);
    expect(encaminhar.mock.calls.at(-1)?.[0]).toMatchObject({ avisarPaciente: false });
    const semOpcao = await executarHandoffTool(contexto, JSON.stringify({ motivo: "PROFISSIONAL_SFP" }));
    expect(semOpcao.sem_mensagem_paciente).toBe(false);
    const comum = await executarHandoffTool(
      contexto,
      JSON.stringify({ motivo: "Solicitação do paciente" }),
    );
    expect(comum.ja_com_humano).toBe(true);
    expect(comum.instrucao_para_voce).toContain("não repita a transferência");
  });
  it("falha não orienta anunciar uma transferência concluída", async () => {
    retorno = { ok: false, mensagem: "Falha controlada" };
    const r = await executarHandoffTool(
      contexto,
      JSON.stringify({ motivo: "Confirmar pagamento" }),
    );
    expect(r.ok).toBe(false);
    expect(r.instrucao_para_voce).toContain("sem afirmar que transferiu");
    expect(r.instrucao_para_voce).not.toContain("uma atendente da equipe vai continuar");
  });
});

it("ausência de motivo não inventa um pedido do paciente", async () => {
  retorno = { ok: true };
  for (const motivo of [undefined, null, " ", {}, 12]) {
    await executarHandoffTool(contexto, JSON.stringify({ motivo }));
    expect(encaminhar.mock.calls.at(-1)?.[0]).toMatchObject({
      motivo: expect.stringContaining("MOTIVO_NAO_INFORMADO"),
    });
  }
});
