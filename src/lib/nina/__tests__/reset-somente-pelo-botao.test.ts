/**
 * REGRA DA HOMOLOGAÇÃO — reiniciar a sessão/memória da Nina é ação exclusiva
 * do botão "Resolver / Reiniciar teste" (rotina canônica `resetarLeadTeste`).
 *
 * Encaminhamento simulado, fim de cenário, erro ou timeout não podem mais
 * encerrar o ciclo, zerar a memória nem trocar o telefone virtual.
 */
import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  CRITERIOS_HANDOFF_AVALIADOS,
  criteriosDeHandoff,
  verificarHandoff,
} from "../handoff-assertions";

const raiz = join(import.meta.dir, "..", "..", "..", "..");
const ler = (p: string) => readFileSync(join(raiz, p), "utf8");

describe("reset só pelo botão — encaminhamento", () => {
  it("o handoff não encerra mais o ciclo de teste", () => {
    const src = ler("src/lib/atendimento/handoff.server.ts");
    expect(src).not.toContain("encerrarCicloTestePorHandoff");
    expect(src).not.toContain("IA_MEMORIA_RESETADA");
  });

  it("cenário aprovado mesmo com o ciclo ainda ativo e sem reset de memória", () => {
    const v = verificarHandoff({
      transferida: true,
      protocolo: "MJ-14712",
      protocolosDistintos: 1,
      mensagensSaida: [
        "Vou encaminhar você para nossa equipe. Seu protocolo é MJ-14712.",
      ],
      cicloStatus: "ativo",
      cicloEndReason: null,
      memoryResetAt: null,
    });
    expect(v.cycle_completed).toBe(false);
    expect(v.memory_reset).toBe(false);

    const criterios = criteriosDeHandoff(v);
    expect(criterios.every((c) => c.ok)).toBe(true);
    const chaves = criterios.map((c) => c.valor);
    expect(chaves).not.toContain("cycle_completed");
    expect(chaves).not.toContain("memory_reset");
    expect(chaves.length).toBe(CRITERIOS_HANDOFF_AVALIADOS.length);
  });
});

describe("reset só pelo botão — cenários", () => {
  const src = ler("src/lib/nina/cenarios.functions.ts");

  it("não avança a sessão nem troca o telefone virtual por conta própria", () => {
    expect(src).not.toContain("sessao_seq: proxima");
    expect(src).not.toContain("telefone_sessao: telefoneSessao");
  });

  it("quando reinicia, usa a rotina canônica única", () => {
    expect(src).toContain("resetarLeadTeste");
    expect(src).toContain("reiniciarSessao");
  });
});

describe("reset só pelo botão — rotina canônica", () => {
  it("o botão continua chamando o reset real", () => {
    const fns = ler("src/lib/nina/teste-console.functions.ts");
    expect(fns).toContain("resolverConversaTeste");
    expect(fns).toContain("resetarLeadTeste");
    const server = ler("src/lib/nina/teste-console.server.ts");
    expect(server).toContain("IA_MEMORIA_RESETADA");
    expect(server).toContain("sessao_seq: proxima");
  });
});
