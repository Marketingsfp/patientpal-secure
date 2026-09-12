/**
 * FASE 2 — uma fonte efetiva por turno.
 * A identidade de apresentação sai da MESMA versão publicada que gerou as
 * instruções do turno, nunca do cadastro da clínica nem de literal do código.
 */
import { describe, it, expect } from "vitest";
import {
  resolverIdentidadeEfetiva,
  valoresIdentidade,
  fatosIdentidade,
  IDENTIDADE_NEUTRA,
} from "../identidade-efetiva";
import { montarBlocoIdentidade } from "../identidade-atendimento";

const bloco = montarBlocoIdentidade({
  assistente: "Aurora",
  estabelecimento: "Vale Verde",
  tipoEstabelecimento: "Policlínica",
});
const textoPublicado = `Instruções da versão.\n\n${bloco}\n\nFim.`;

describe("identidade efetiva do turno", () => {
  it("lê a identidade do texto da versão publicada", () => {
    const r = resolverIdentidadeEfetiva({
      template: textoPublicado,
      origem: "publicada",
      versao: 9,
      versaoId: "v9",
    });
    expect(r.ok).toBe(true);
    expect(r.identidade).toEqual({
      assistente: "Aurora",
      estabelecimento: "Vale Verde",
      tipoEstabelecimento: "Policlínica",
    });
    expect(r.versao).toBe(9);
    expect(r.pendenciaAdministrativa).toBeNull();
  });

  it("aceita a última versão válida completa (cache) do mesmo escopo", () => {
    const r = resolverIdentidadeEfetiva({
      template: textoPublicado,
      origem: "cache",
      versao: 9,
      versaoId: "v9",
    });
    expect(r.ok).toBe(true);
    expect(r.origem).toBe("cache");
  });

  it("no prompt de reserva responde neutro, sem voltar para Nina/Menino Jesus", () => {
    const r = resolverIdentidadeEfetiva({
      template: "texto do código",
      origem: "codigo",
      versao: null,
      versaoId: null,
    });
    expect(r.ok).toBe(false);
    expect(r.motivo).toBe("PROMPT_DE_RESERVA");
    expect(r.apresentacao).toEqual({ ...IDENTIDADE_NEUTRA });
    expect(JSON.stringify(r)).not.toMatch(/Nina|Menino Jesus/);
  });

  it("bloco ausente ou duplicado vira pendência administrativa", () => {
    const ausente = resolverIdentidadeEfetiva({
      template: "sem bloco",
      origem: "publicada",
      versao: 3,
      versaoId: "v3",
    });
    expect(ausente.ok).toBe(false);
    expect(ausente.motivo).toBe("BLOCO_INVALIDO");
    expect(ausente.pendenciaAdministrativa).toContain("IDENTIDADE DO ATENDIMENTO");

    const duplicado = resolverIdentidadeEfetiva({
      template: `${bloco}\n${bloco}`,
      origem: "publicada",
      versao: 3,
      versaoId: "v3",
    });
    expect(duplicado.ok).toBe(false);
    expect(duplicado.apresentacao.assistente).toBe(IDENTIDADE_NEUTRA.assistente);
  });

  it("substitui os marcadores de apresentação pela identidade publicada", () => {
    const v = valoresIdentidade(
      resolverIdentidadeEfetiva({
        template: textoPublicado,
        origem: "publicada",
        versao: 9,
        versaoId: "v9",
      }),
    );
    expect(v["${nomeAssistente}"]).toBe("Aurora");
    expect(v["${nomeCurtoUnidade}"]).toBe("Vale Verde");
    expect(v["${nomeUnidade}"]).toBe("Policlínica Vale Verde");
    expect(v["${tipoEstabelecimento}"]).toBe("Policlínica");
  });

  it("sem identidade válida os marcadores ficam neutros", () => {
    const v = valoresIdentidade(
      resolverIdentidadeEfetiva({
        template: "sem bloco",
        origem: "publicada",
        versao: 3,
        versaoId: "v3",
      }),
    );
    expect(v["${nomeUnidade}"]).toBe(IDENTIDADE_NEUTRA.estabelecimento);
    expect(v["${nomeAssistente}"]).toBe(IDENTIDADE_NEUTRA.assistente);
  });

  it("os fatos do contexto trazem versão e origem para auditoria", () => {
    const f = fatosIdentidade(
      resolverIdentidadeEfetiva({
        template: textoPublicado,
        origem: "publicada",
        versao: 9,
        versaoId: "v9",
      }),
    );
    expect(f).toMatchObject({
      assistente: "Aurora",
      estabelecimento: "Vale Verde",
      identidade_publicada: true,
      versao: 9,
      versao_id: "v9",
    });
  });
});
