import { describe, it, expect } from "bun:test";
import { readFileSync } from "node:fs";
import { PUBLICACOES_CONSOLIDADAS } from "../../../../scripts/nina/gerar-consolidacao-instrucoes";
import {
  MIGRATION_LIMITE_ESCLARECIMENTO,
  gerarMigrationLimiteEsclarecimento,
} from "../../../../scripts/nina/gerar-limite-esclarecimento";
import {
  ALTERACOES_LIMITE_ESCLARECIMENTO,
  atualizarLimiteEsclarecimento,
} from "../prompt/limite-esclarecimento";
import { validarTemplateInstrucoes } from "../instrucoes-template";

describe("publicação do limite de duas perguntas", () => {
  it("aplica somente as três substituições e não reescreve a migration histórica", () => {
    const antiga = PUBLICACOES_CONSOLIDADAS[0]!.conteudo;
    const nova = atualizarLimiteEsclarecimento(antiga);
    let restaurada = nova;
    for (const [antes, depois] of ALTERACOES_LIMITE_ESCLARECIMENTO)
      restaurada = restaurada.replace(depois, antes);
    expect(restaurada).toBe(antiga);
    expect(validarTemplateInstrucoes("whatsapp", nova).ok).toBe(true);
    expect(nova.length).toBeLessThan(60000);
    expect(atualizarLimiteEsclarecimento(nova)).toBe(nova);
    expect(readFileSync(MIGRATION_LIMITE_ESCLARECIMENTO, "utf8")).toBe(
      gerarMigrationLimiteEsclarecimento(),
    );
  });
  it("recusa versão incompatível para não sobrescrever regras desconhecidas", () => {
    expect(() => atualizarLimiteEsclarecimento("Outro texto")).toThrow("divergiram");
  });
});
