/**
 * Regra da clínica (26/09/2026): quando não consegue concluir uma operação, a
 * Nina encaminha para a equipe humana; nunca responde "Não consegui concluir a
 * consulta ao cadastro… tente novamente em instantes".
 */
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const ler = (arquivo: string) => readFileSync(new URL(arquivo, import.meta.url), "utf8");

describe("falha de operação vai para a equipe", () => {
  test.each(["../identificacao-gate.server.ts", "../../whatsapp.server.ts"])(
    "%s não usa o aviso de instabilidade do cadastro",
    (arquivo) => expect(ler(arquivo)).not.toContain("fluxo.identificacao.instabilidade"),
  );

  test("seleção feita sem continuação do cadastro devolve a vez ao modelo, sem aviso falso", () => {
    const turno = ler("../../whatsapp.server.ts");
    expect(turno).toContain("resumoEscolha = await continuarAgendamento?.(true) ?? null;");
    expect(turno).toContain("CHAMADA_NAO_EXECUTADA");
  });
});
