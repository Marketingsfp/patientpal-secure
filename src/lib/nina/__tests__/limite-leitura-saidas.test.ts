import { expect, it } from "bun:test";
import { criarLimiteLeituraSaidas } from "../limite-leitura-saidas";

it("cancelar uma leitura na fila não executa a consulta nem ocupa uma vaga", async () => {
  const executar = criarLimiteLeituraSaidas(1);
  let liberar!: () => void;
  const primeira = executar(
    () =>
      new Promise<void>((resolve) => {
        liberar = resolve;
      }),
  );
  const controller = new AbortController();
  let executouCancelada = false;
  const cancelada = executar(async () => {
    executouCancelada = true;
  }, controller.signal).then(
    () => "executou",
    (e: Error) => e.name,
  );
  const seguinte = executar(async () => "seguinte");
  controller.abort();
  expect(await cancelada).toBe("AbortError");
  liberar();
  await primeira;
  expect(await seguinte).toBe("seguinte");
  expect(executouCancelada).toBe(false);
});

it("falha em uma consulta libera vaga para a seguinte", async () => {
  const executar = criarLimiteLeituraSaidas(1);
  const erro = executar(async () => {
    throw new Error("indisponível");
  }).catch((e: Error) => e.message);
  const seguinte = executar(async () => "ok");
  expect(await erro).toBe("indisponível");
  expect(await seguinte).toBe("ok");
});
