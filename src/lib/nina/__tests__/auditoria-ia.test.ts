import { afterEach, describe, expect, it } from "bun:test";
import { fetchComAuditoriaIA } from "../auditoria-ia.server";
import type { ChamadaIA } from "../auditoria-ia";
import { montarLeituraDetalhesMensagem } from "../detalhes-mensagem";
import { pacoteMJ55 } from "./fixtures/detalhes-mj55";
import { evidenciaRegraHumano } from "../regras-catalogo";

const fetchOriginal = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = fetchOriginal;
});
describe("auditoria das chamadas auxiliares", () => {
  it("preserva resposta e registra consumo real sem copiar payload ou credenciais", async () => {
    const chamadas: ChamadaIA[] = [];
    globalThis.fetch = (async () =>
      Response.json({
        choices: [{ message: { content: "ECG" } }],
        usage: { prompt_tokens: 28, completion_tokens: 2 },
      })) as unknown as typeof fetch;
    const r = await fetchComAuditoriaIA(
      "https://exemplo.invalid",
      { body: "segredo", headers: { Authorization: "segredo" } },
      { modelo: "modelo", finalidade: "leitura_imagem" },
      (c) => {
        chamadas.push(c);
      },
    );
    expect((await r.json()).choices[0].message.content).toBe("ECG");
    expect(chamadas[0]).toMatchObject({ consumoEntrada: 28, consumoSaida: 2, estado: "concluido" });
    expect(JSON.stringify(chamadas)).not.toContain("segredo");
  });
  it("voz sem usage e retry não viram custo zero nem chamada única", async () => {
    const chamadas: ChamadaIA[] = [];
    let tentativa = 0;
    globalThis.fetch = (async () =>
      new Response("bytes", { status: tentativa++ ? 200 : 503 })) as unknown as typeof fetch;
    for (const formato of ["opus", "mp3"])
      await fetchComAuditoriaIA(
        "https://exemplo.invalid",
        {},
        { finalidade: "sintese_voz", modelo: "tts", formato, caracteres: 50 },
        (c) => {
          chamadas.push(c);
        },
      );
    expect(chamadas.map((c) => c.estado)).toEqual(["falhou", "concluido"]);
    expect(new Set(chamadas.map((c) => c.id)).size).toBe(2);
    expect(chamadas.every((c) => c.consumoEntrada === null && c.consumoSaida === null)).toBe(true);
  });
  it("falha da auditoria não altera o retorno e erro de rede permanece erro", async () => {
    globalThis.fetch = (async () => Response.json({ ok: true })) as unknown as typeof fetch;
    const r = await fetchComAuditoriaIA(
      "https://exemplo.invalid",
      {},
      { finalidade: "jev", modelo: "jev" },
      () => {
        throw Error("banco");
      },
    );
    expect(r.ok).toBe(true);
    globalThis.fetch = (async () => {
      throw new TypeError("rede com dado sensível");
    }) as unknown as typeof fetch;
    const chamadas: ChamadaIA[] = [];
    await expect(
      fetchComAuditoriaIA(
        "https://exemplo.invalid",
        {},
        { finalidade: "jev", modelo: "jev" },
        (c) => {
          chamadas.push(c);
        },
      ),
    ).rejects.toThrow();
    expect(chamadas[0]?.erro).toBe("TypeError");
  });
});

describe("painel: evidências do turno", () => {
  function pacote() {
    const p = structuredClone(pacoteMJ55);
    p.execucao = null;
    p.eventos = [];
    p.etapas = [];
    p.decisoes = [];
    return p;
  }
  it.each([true, false])("recupera v64 sem execução e preserva ambiente: teste=%s", (teste) => {
    const p = pacote();
    p.mensagem!.is_teste = teste;
    p.mensagem!.canal = teste ? "test-console" : "whatsapp";
    p.avisos = [];
    p.eventos.push({
      node_id: "instructions.published",
      event_type: "completed",
      status: "ok",
      metadata: { versao: 64 },
    });
    const r = montarLeituraDetalhesMensagem(p);
    expect(r.versaoPrompt).toBe(64);
    expect(r.fonteVersaoPrompt).toContain("Carregamento");
    expect(r.ambiente).toBe(teste ? "homologacao" : "producao");
  });
  it("não escolhe uma versão em conflito", () => {
    const p = pacote();
    p.execucao = { prompt_versao: 65 };
    p.eventos.push({
      node_id: "instructions.published",
      event_type: "completed",
      metadata: { versao: 64 },
    });
    const r = montarLeituraDetalhesMensagem(p);
    expect(r.versaoPrompt).toBeNull();
    expect(r.alertas.join(" ")).toContain("divergentes");
  });
  it("mostra leitura da foto, chamada e decisões sem duplicar uma chamada do Jev", () => {
    const p = pacote();
    const c = {
      id: "chamada",
      finalidade: "jev",
      modelo: "jev",
      estado: "concluido",
      duracaoMs: 30,
    };
    p.entradas[0] = {
      ...p.entradas[0],
      tipo: "image",
      body: "Imagem",
      transcricao: "Pedido: ECG",
      raw: { nina_chamadas_ia: [c] },
    };
    p.eventos.push(
      { node_id: "ai.auxiliary", metadata: c },
      {
        node_id: "jev.decision",
        metadata: {
          fase: "fase2_encaminhamento",
          aplicada: true,
          respostas: { urgencia: { noul: 0.96 } },
        },
      },
    );
    const r = montarLeituraDetalhesMensagem(p);
    expect(r.entradas[0]).toContain("Pedido: ECG");
    expect(r.chamadasAuxiliares).toHaveLength(1);
    expect(r.decisoesJev?.[0]).toMatchObject({ aplicada: true, resumo: "Urgência: 0.96" });
    expect(r.chamadasAuxiliares?.[0]?.consumoEntrada).toBeNull();
  });
  it("rótulo legado não é prova de build e fingerprint ausente permanece ausente", () => {
    const p = pacote();
    p.eventos.push({ node_id: "turn.summary", metadata: { runtime_versao: "setembro" } });
    expect(montarLeituraDetalhesMensagem(p).fingerprintTurno).toBeNull();
    p.eventos[0]!.metadata = { runtime_fingerprint: `sha256:${"a".repeat(64)}` };
    expect(montarLeituraDetalhesMensagem(p).fingerprintTurno).toContain("sha256:");
  });
  it("mostra cadastro e campo do snapshot da regra, sem consultar catálogo atual", () => {
    const p = pacote();
    const registros = evidenciaRegraHumano(
      {
        records: [
          { id: "A", procedimento: "Exame A", extras: { atendimento_humano_obrigatorio: true } },
          { id: "B", procedimento: "Exame B", extras: { atendimento_humano_obrigatorio: true } },
        ],
      },
      ["B"],
    );
    p.etapas.push({
      codigo: { funcao: "encaminharRegraCatalogo" },
      dados: { motivo: "CATALOGO_ATENDIMENTO_HUMANO", registros },
    });
    const r = montarLeituraDetalhesMensagem(p);
    expect(r.encaminhamentos?.[0]?.registros).toEqual([
      { id: "B", nome: "Exame B", campo: "extras.atendimento_humano_obrigatorio", valor: true },
    ]);
  });
});
