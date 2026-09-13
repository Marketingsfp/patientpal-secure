import { describe, expect, test } from "bun:test";
import { criarToolBroker } from "../tool-broker.server";

// Somente a execução externa é simulada; cache, validação e trilha são reais.
function preparar(retornos: unknown[]) {
  const chamadas: Array<{ nome: string; args: unknown }> = [];
  const broker = criarToolBroker({
    ctxPaciente: {
      clinicaId: "clinica-teste",
      telefone: null,
      pacienteId: null,
      pacienteNome: null,
      conversaId: "conversa-teste",
      origem: "homologacao",
      teste: true,
    },
    ctxHandoff: { clinicaId: "clinica-teste", conversaId: "conversa-teste" },
    executarPaciente: async (_ctx, nome, args) => {
      chamadas.push({ nome, args });
      return retornos[chamadas.length - 1];
    },
  });
  return { broker, chamadas };
}

describe("broker revalida somente leituras comandadas pelo servidor", () => {
  test("retry comum reutiliza a leitura e não duplica execução na trilha", async () => {
    const { broker, chamadas } = preparar([{ ok: true, versao: "v1" }]);
    const primeira = await broker.executar("consultar_base_conhecimento", { termo: "cardiologia" });
    const repetida = await broker.executar(
      "consultar_base_conhecimento",
      '{"termo":"cardiologia"}',
    );
    expect(chamadas).toHaveLength(1);
    expect(repetida).toEqual({ ...primeira, reused: true });
    expect(broker.resultados()).toHaveLength(1);
  });

  test("revalidação lê a versão nova e substitui o cache usado em retries seguintes", async () => {
    const { broker, chamadas } = preparar([
      { ok: true, versao: "v1", price: "R$ 120,00" },
      { ok: true, versao: "v2", price: "R$ 130,00" },
    ]);
    const args = { termo: "cardiologia" };
    await broker.executar("consultar_base_conhecimento", args);
    const nova = await broker.executar("consultar_base_conhecimento", args, {
      revalidarLeitura: true,
    });
    const cacheNovo = await broker.executar("consultar_base_conhecimento", args);
    expect(chamadas).toHaveLength(2);
    expect(nova.reused).toBe(false);
    expect(nova.dados).toEqual({ ok: true, versao: "v2", price: "R$ 130,00" });
    expect(cacheNovo).toEqual({ ...nova, reused: true });
    expect(broker.resultados()).toHaveLength(2);
    expect(broker.resultados()[1]?.resultado).toMatchObject({ versao: "v2", success: true });
  });

  test("consulta que falhou pode ser recuperada por nova leitura real", async () => {
    const { broker, chamadas } = preparar([
      { ok: false, erro: "INTERNAL_ERROR" },
      { ok: true, knowledge_status: "found" },
    ]);
    const args = { termo: "cardiologia" };
    expect((await broker.executar("consultar_base_conhecimento", args)).success).toBe(false);
    const recuperada = await broker.executar("consultar_base_conhecimento", args, {
      revalidarLeitura: true,
    });
    expect(chamadas).toHaveLength(2);
    expect(recuperada.success).toBe(true);
    expect(recuperada.reused).toBe(false);
    expect(recuperada.erro).toBeUndefined();
  });

  test("se reconsulta falha, retry posterior não ressuscita sucesso antigo", async () => {
    const { broker, chamadas } = preparar([
      { ok: true, knowledge_status: "found" },
      { ok: false, erro: "INTERNAL_ERROR" },
    ]);
    const args = { termo: "cardiologia" };
    await broker.executar("consultar_base_conhecimento", args);
    await broker.executar("consultar_base_conhecimento", args, { revalidarLeitura: true });
    const atual = await broker.executar("consultar_base_conhecimento", args);
    expect(chamadas).toHaveLength(2);
    expect(atual.success).toBe(false);
    expect(atual.erro).toBe("INTERNAL_ERROR");
    expect(atual.reused).toBe(true);
  });

  test("opção de revalidar leitura jamais repete um agendamento confirmado", async () => {
    const { broker, chamadas } = preparar([{ ok: true, appointment_id: "reserva-1" }]);
    const args = { medico_id: "medico-1", inicio: "2030-01-01T13:00:00Z" };
    const primeira = await broker.executar("agendar", args);
    const repetida = await broker.executar("agendar", args, { revalidarLeitura: true });
    expect(chamadas).toHaveLength(1);
    expect(repetida).toEqual({ ...primeira, reused: true });
    expect(broker.agendamentoConfirmado()).toBe(true);
    expect(broker.resultados()).toHaveLength(1);
  });

  test("escrita com erro também não é repetida automaticamente", async () => {
    const { broker, chamadas } = preparar([{ ok: false, erro: "APPOINTMENT_UNCERTAIN" }]);
    const args = { medico_id: "medico-1", inicio: "2030-01-01T13:00:00Z" };
    await broker.executar("agendar", args);
    const repetida = await broker.executar("agendar", args, { revalidarLeitura: true });
    expect(chamadas).toHaveLength(1);
    expect(repetida.success).toBe(false);
    expect(repetida.reused).toBe(true);
    expect(broker.agendamentoConfirmado()).toBe(false);
  });

  test("ferramenta desconhecida não ganha permissão de reexecução", async () => {
    const { broker, chamadas } = preparar([{ ok: false, erro: "FERRAMENTA_INDISPONIVEL" }]);
    await broker.executar("ferramenta_desconhecida", {});
    const repetida = await broker.executar(
      "ferramenta_desconhecida",
      {},
      { revalidarLeitura: true },
    );
    expect(chamadas).toHaveLength(1);
    expect(repetida.reused).toBe(true);
  });

  test("argumento inventado pelo modelo não força revalidação", async () => {
    const { broker, chamadas } = preparar([{ ok: true, versao: "v1" }]);
    const args = { termo: "cardiologia", revalidarLeitura: true };
    await broker.executar("consultar_base_conhecimento", args);
    const repetida = await broker.executar("consultar_base_conhecimento", args);
    expect(chamadas).toHaveLength(1);
    expect(repetida.reused).toBe(true);
  });

  test("consultas com argumentos distintos mantêm seus resultados separados", async () => {
    const { broker, chamadas } = preparar([
      { ok: true, medico: "Alex" },
      { ok: true, medico: "Marina" },
      { ok: true, medico: "Alex", versao: "v2" },
    ]);
    const alex = { termo: "cardiologia", medico: "Alex" };
    const marina = { termo: "cardiologia", medico: "Marina" };
    await broker.executar("consultar_base_conhecimento", alex);
    const outra = await broker.executar("consultar_base_conhecimento", marina);
    await broker.executar("consultar_base_conhecimento", alex, { revalidarLeitura: true });
    expect(await broker.executar("consultar_base_conhecimento", marina)).toEqual({
      ...outra,
      reused: true,
    });
    expect(chamadas).toHaveLength(3);
  });
});
