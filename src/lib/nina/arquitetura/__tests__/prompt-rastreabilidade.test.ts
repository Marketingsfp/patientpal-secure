/**
 * FASE 6 — rastreabilidade do prompt.
 *
 * Critério de aceite: duas mensagens feitas com versões diferentes precisam
 * mostrar, cada uma, a versão que realmente foi usada — nunca a versão atual.
 */
import { describe, expect, it } from "bun:test";
import { lerDetalheEspecifico } from "../detalhes-ia";
import { criarColetor, modulosUtilizados } from "@/lib/nina/evidencias";

function metadataDaExecucao(versao: number, publicadoEm: string, modulos: string[]) {
  return {
    prompt_versao: `v${versao}`,
    publicado_em: publicadoEm,
    prompt_status: "sucesso",
    modulos,
  };
}

describe("versão do prompt por execução", () => {
  it("cada mensagem mostra a versão histórica que usou", () => {
    const antiga = lerDetalheEspecifico(
      "prompt.compose",
      metadataDaExecucao(17, "2026-01-10T12:00:00Z", []),
      "admin",
    );
    const recente = lerDetalheEspecifico(
      "prompt.compose",
      metadataDaExecucao(25, "2026-09-01T12:00:00Z", ["Agendamento"]),
      "admin",
    );

    expect(antiga?.tipo).toBe("prompt");
    expect(antiga && antiga.tipo === "prompt" ? antiga.versao : null).toBe("v17");
    expect(recente && recente.tipo === "prompt" ? recente.versao : null).toBe("v25");
    expect(antiga && antiga.tipo === "prompt" ? antiga.modulos : []).toEqual([]);
    expect(recente && recente.tipo === "prompt" ? recente.modulos : []).toEqual(["Agendamento"]);
  });

  it("o node das instruções publicadas também é lido como prompt", () => {
    const d = lerDetalheEspecifico(
      "instructions.published",
      metadataDaExecucao(18, "2026-05-05T10:00:00Z", []),
      "admin",
    );
    expect(d && d.tipo === "prompt" ? d.publicadoEm : null).toBe("2026-05-05T10:00:00Z");
  });
});

describe("módulos complementares", () => {
  it("lista apenas o que realmente rodou", () => {
    expect(modulosUtilizados([])).toEqual([]);
    const usados = modulosUtilizados([
      { tipo: "consulta", fonte: "catalogo", titulo: "Preços", em: "", dados: {} },
      { tipo: "ferramenta", fonte: "agenda", titulo: "Horários", em: "", dados: {} },
    ]);
    expect(usados).toContain("Conhecimento");
    expect(usados).toContain("Agendamento");
    expect(usados).not.toContain("Transferência");
  });

  it("reconhece transferência para atendente humana", () => {
    const usados = modulosUtilizados([
      {
        tipo: "ferramenta",
        fonte: "atendimento",
        titulo: "Handoff solicitado",
        em: "",
        dados: {},
      },
    ]);
    expect(usados).toEqual(["Transferência"]);
  });
});

describe("snapshot da versão na execução", () => {
  it("mantém a primeira versão carregada, mesmo com publicação no meio", () => {
    const c = criarColetor(() => "2026-09-07T00:00:00.000Z");
    c.promptVersao({
      escopo: "whatsapp",
      versaoId: "a",
      versao: 12,
      publicadoEm: "2026-08-01T00:00:00Z",
      origem: "publicada",
    });
    c.promptVersao({
      escopo: "whatsapp",
      versaoId: "b",
      versao: 13,
      publicadoEm: "2026-09-01T00:00:00Z",
      origem: "publicada",
    });
    expect(c.pacote().prompt?.versao).toBe(12);
  });

  it("sem versão publicada, a execução não inventa número", () => {
    const c = criarColetor(() => "2026-09-07T00:00:00.000Z");
    expect(c.pacote().prompt).toBeNull();
  });
});
