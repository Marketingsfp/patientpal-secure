/**
 * FASE 4 — PRÉVIA, FINALIZAÇÃO E ENVIO.
 *
 * Prova o problema corrigido: o cache por chave de turno devolvia um texto
 * anterior à correção, e o transporte reenviava esse texto antigo.
 */
import { describe, it, expect, beforeEach } from "bun:test";
import { criarResultado } from "@/lib/nina/resposta/contrato";
import {
  finalizarResposta,
  limparFinalizacoes,
  ultimaFinalizacaoDoTurno,
} from "@/lib/nina/resposta/finalizacao.server";

const base = {
  clinicaId: "11111111-1111-1111-1111-111111111111",
  canal: "test-console" as const,
};

describe("FASE 4 — finalização e transporte", () => {
  beforeEach(() => limparFinalizacoes());

  it("uma correção no mesmo turno não devolve o texto anterior", async () => {
    const primeira = await finalizarResposta({
      ...base,
      chaveTurno: "turno-1",
      chaveTurnoRaiz: "turno-1",
      resultado: criarResultado({ origem: "modelo", texto: "texto com saudação proibida" }),
    });
    expect(primeira.texto).toBe("texto com saudação proibida");

    const corrigida = await finalizarResposta({
      ...base,
      chaveTurno: "turno-1#correcao-2",
      chaveTurnoRaiz: "turno-1",
      resultado: criarResultado({ origem: "modelo", texto: "ARQUITETURA_CONFIRMADA_9381" }),
    });
    expect(corrigida.reaproveitada).toBe(false);
    expect(corrigida.texto).toBe("ARQUITETURA_CONFIRMADA_9381");
    expect(ultimaFinalizacaoDoTurno("turno-1")?.texto).toBe("ARQUITETURA_CONFIRMADA_9381");
  });

  it("o transporte reapresentando o texto aprovado recebe a mesma aprovação", async () => {
    await finalizarResposta({
      ...base,
      chaveTurno: "turno-2",
      chaveTurnoRaiz: "turno-2",
      resultado: criarResultado({ origem: "modelo", texto: "candidato antigo" }),
    });
    const corrigida = await finalizarResposta({
      ...base,
      chaveTurno: "turno-2#correcao-2",
      chaveTurnoRaiz: "turno-2",
      resultado: criarResultado({ origem: "modelo", texto: "texto corrigido e aprovado" }),
    });

    // O webhook chama de novo com a chave RAIZ, levando o texto já aprovado.
    const noEnvio = await finalizarResposta({
      ...base,
      canal: "whatsapp",
      chaveTurno: "turno-2",
      chaveTurnoRaiz: "turno-2",
      resultado: criarResultado({ origem: "modelo", texto: corrigida.texto }),
    });
    expect(noEnvio.reaproveitada).toBe(true);
    expect(noEnvio.texto).toBe("texto corrigido e aprovado");
    expect(noEnvio.textoHash).toBe(corrigida.textoHash);
  });

  it("a mesma entrada continua idempotente", async () => {
    const um = await finalizarResposta({
      ...base,
      chaveTurno: "turno-3",
      chaveTurnoRaiz: "turno-3",
      resultado: criarResultado({ origem: "modelo", texto: "mesma resposta" }),
    });
    const dois = await finalizarResposta({
      ...base,
      chaveTurno: "turno-3",
      chaveTurnoRaiz: "turno-3",
      resultado: criarResultado({ origem: "modelo", texto: "mesma resposta" }),
    });
    expect(dois.reaproveitada).toBe(true);
    expect(dois.texto).toBe(um.texto);
  });

  it("registra texto original, texto entregue e hashes para diagnóstico", async () => {
    const f = await finalizarResposta({
      ...base,
      chaveTurno: "turno-4",
      chaveTurnoRaiz: "turno-4",
      resultado: criarResultado({ origem: "modelo", texto: "resposta final" }),
    });
    expect(f.textoOriginal).toBe("resposta final");
    expect(f.textoOriginalHash).toBeTruthy();
    expect(f.textoHash).toBeTruthy();
  });
});
