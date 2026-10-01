import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import {
  caminhoDaMidia,
  caminhoEhDaClinica,
  dataDeCorteMidia,
  ehCaminhoGuardado,
  midiaExpirada,
  nomeArquivoSeguro,
  nomeDoDocumento,
  textoDoDocumento,
  tipoMimeAceito,
} from "@/lib/whatsapp-midia-armazenamento";
import { interpretarLeituraImagem, textoDoPedidoLido } from "@/lib/nina/leitura-imagem";
import {
  guardarMidiaEnviada,
  limparMidiasExpiradas,
  receberArquivoWhatsapp,
  receberMidiaWhatsapp,
} from "@/lib/whatsapp-midia.server";
import { temMidiaVisivel, textoDaBolha } from "@/components/nina/MidiaMensagem";

const CLINICA = "7570ddde-8c1c-4b55-ba72-cf12b2a6c940";

describe("armazenamento: regras puras", () => {
  it("o caminho usa só caracteres seguros e fica na pasta da clínica", () => {
    const c = caminhoDaMidia({
      clinicaId: CLINICA,
      waMessageId: "wamid.HBgM/../ABC==",
      mime: "image/jpeg",
      agora: new Date("2026-09-30T12:00:00Z"),
    });
    expect(c).toBe(`${CLINICA}/2026-09/wamid_HBgM____ABC__.jpg`);
    expect(caminhoEhDaClinica(c, CLINICA)).toBe(true);
  });

  it("não aceita caminho de outra clínica nem com ..", () => {
    expect(caminhoEhDaClinica("outra/2026-09/a.jpg", CLINICA)).toBe(false);
    expect(caminhoEhDaClinica(`${CLINICA}/../outra/a.jpg`, CLINICA)).toBe(false);
  });

  it("só aceita imagem e áudio comuns (SVG, HTML e tipo trocado são recusados)", () => {
    expect(tipoMimeAceito("image", "image/jpeg")).toBe("image/jpeg");
    expect(tipoMimeAceito("audio", "audio/ogg; codecs=opus")).toBe("audio/ogg");
    expect(tipoMimeAceito("image", "image/svg+xml")).toBeNull();
    expect(tipoMimeAceito("image", "text/html")).toBeNull();
    expect(tipoMimeAceito("image", "audio/ogg")).toBeNull();
    expect(tipoMimeAceito("audio", null)).toBeNull();
  });

  it("distingue caminho guardado de link externo", () => {
    expect(ehCaminhoGuardado(`${CLINICA}/2026-09/a.ogg`)).toBe(true);
    expect(ehCaminhoGuardado("https://exemplo.com/a.jpg")).toBe(false);
    expect(ehCaminhoGuardado("/etc/passwd")).toBe(false);
    expect(ehCaminhoGuardado(null)).toBe(false);
  });

  it("a mídia fica guardada por 5 anos: nada some antes disso", () => {
    const agora = new Date("2026-09-30T00:00:00Z");
    expect(dataDeCorteMidia(agora).toISOString()).toBe("2021-09-30T00:00:00.000Z");
    expect(midiaExpirada("2026-05-25T00:00:00Z", agora)).toBe(false);
    expect(midiaExpirada("2022-01-01T00:00:00Z", agora)).toBe(false);
    expect(midiaExpirada("2021-09-29T00:00:00Z", agora)).toBe(true);
  });

  it("documento aceita PDF, Office e texto; vídeo aceita mp4; executável e SVG não", () => {
    expect(tipoMimeAceito("document", "application/pdf")).toBe("application/pdf");
    expect(tipoMimeAceito("document", "application/vnd.openxmlformats-officedocument.wordprocessingml.document")).toBeTruthy();
    expect(tipoMimeAceito("document", "image/jpeg")).toBe("image/jpeg");
    expect(tipoMimeAceito("document", "application/x-msdownload")).toBeNull();
    expect(tipoMimeAceito("document", "text/html")).toBeNull();
    expect(tipoMimeAceito("document", "image/svg+xml")).toBeNull();
    expect(tipoMimeAceito("video", "video/mp4")).toBe("video/mp4");
    expect(tipoMimeAceito("video", "application/pdf")).toBeNull();
    expect(tipoMimeAceito("audio", "application/pdf")).toBeNull();
  });

  it("nome do arquivo: sem pasta, sem caracteres de controle e com tamanho limitado", () => {
    expect(nomeArquivoSeguro("../../etc/passwd")).toBe("passwd");
    expect(nomeArquivoSeguro("C:\\Users\\Ana\\exame.pdf")).toBe("exame.pdf");
    expect(nomeArquivoSeguro("exame\u0000\n.pdf")).toBe("exame .pdf");
    expect(nomeArquivoSeguro("..")).toBe("");
    expect(nomeArquivoSeguro(null)).toBe("");
    expect(nomeArquivoSeguro("a".repeat(300)).length).toBe(120);
  });

  it("texto do documento: ida e volta entre nome e legenda", () => {
    expect(textoDoDocumento("exame.pdf")).toBe("📎 exame.pdf");
    expect(textoDoDocumento("", null)).toBe("📎 Documento");
    expect(textoDoDocumento("exame.pdf", "segue o pedido")).toBe("📎 exame.pdf — segue o pedido");
    expect(nomeDoDocumento("📎 exame.pdf — segue o pedido")).toBe("exame.pdf");
    expect(nomeDoDocumento("📎 exame.pdf")).toBe("exame.pdf");
    expect(nomeDoDocumento("texto qualquer")).toBe("");
  });
});

describe("leitura da imagem: só identifica pedido", () => {
  it("pedido médico com itens", () => {
    const r = interpretarLeituraImagem(
      '{"tipo":"pedido_medico","itens":["Hemograma completo","Glicemia de jejum"]}',
    );
    expect(r).toEqual({ tipo: "pedido_medico", itens: ["Hemograma completo", "Glicemia de jejum"] });
  });

  it("aceita JSON dentro de bloco de código e limpa, deduplica e limita", () => {
    const itens = Array.from({ length: 30 }, (_, i) => `Exame ${i}`);
    const r = interpretarLeituraImagem(
      "```json\n" + JSON.stringify({ tipo: "pedido_medico", itens: ["  TSH \n", "tsh", ...itens] }) + "\n```",
    );
    expect(r.tipo).toBe("pedido_medico");
    if (r.tipo === "pedido_medico") {
      expect(r.itens[0]).toBe("TSH");
      expect(r.itens).toHaveLength(15);
      expect(r.itens.filter((i) => i.toLowerCase() === "tsh")).toHaveLength(1);
    }
  });

  it("qualquer dúvida vira 'outro' (vai para a atendente)", () => {
    expect(interpretarLeituraImagem("não sei")).toEqual({ tipo: "outro" });
    expect(interpretarLeituraImagem("{ quebrado")).toEqual({ tipo: "outro" });
    expect(interpretarLeituraImagem('{"tipo":"resultado_exame","itens":["Glicose 98"]}')).toEqual({ tipo: "outro" });
    expect(interpretarLeituraImagem('{"tipo":"pedido_medico","itens":[]}')).toEqual({ tipo: "outro" });
    expect(interpretarLeituraImagem('{"tipo":"pedido_medico","itens":[1,null,"a"]}')).toEqual({ tipo: "outro" });
    expect(interpretarLeituraImagem(null)).toEqual({ tipo: "outro" });
  });

  it("o texto entregue à Nina vem na voz do paciente, com a legenda se houver", () => {
    expect(textoDoPedidoLido(["Hemograma", "TSH"])).toBe("Enviei a foto de um pedido médico com: Hemograma; TSH.");
    expect(textoDoPedidoLido(["TSH"], "quanto custa?")).toBe(
      "Enviei a foto de um pedido médico com: TSH. quanto custa?",
    );
  });
});

function respostaMeta(conteudo: Uint8Array, mime: string) {
  const fetchFn = (async (url: string) => {
    if (!String(url).includes("download")) {
      return new Response(JSON.stringify({ url: "https://meta.test/download/1", mime_type: mime }), { status: 200 });
    }
    return new Response(conteudo as unknown as BodyInit, { status: 200, headers: { "content-type": mime } });
  }) as unknown as typeof fetch;
  return { fetchFn };
}

const entrada = (tipo: "image" | "audio") => ({
  clinicaId: CLINICA,
  waMessageId: "wamid.ABC",
  tipo,
  mediaId: "m1",
  accessToken: "token",
});

describe("recebimento da mídia (rede e bucket simulados)", () => {
  it("baixa, guarda no caminho da clínica e devolve o conteúdo para a leitura", async () => {
    const guardados: Array<{ caminho: string; mime: string; tamanho: number }> = [];
    const { fetchFn } = respostaMeta(new Uint8Array([1, 2, 3]), "image/jpeg");
    const r = await receberMidiaWhatsapp(entrada("image"), {
      fetchFn,
      armazenar: async (caminho, bytes, mime) => {
        guardados.push({ caminho, mime, tamanho: bytes.length });
        return null;
      },
    });
    expect(r.erro).toBeNull();
    expect(r.caminho).toMatch(new RegExp(`^${CLINICA}/\\d{4}-\\d{2}/wamid_ABC\\.jpg$`));
    expect(r.base64).toBe("AQID");
    expect(guardados).toEqual([{ caminho: r.caminho!, mime: "image/jpeg", tamanho: 3 }]);
  });

  it("falha ao guardar não derruba: sem caminho, mas o conteúdo segue para a transcrição", async () => {
    const { fetchFn } = respostaMeta(new Uint8Array([1, 2, 3]), "audio/ogg");
    const r = await receberMidiaWhatsapp(entrada("audio"), {
      fetchFn,
      armazenar: async () => ({ message: "bucket indisponível" }),
    });
    expect(r.caminho).toBeNull();
    expect(r.base64).toBe("AQID");
  });

  it("tipo não aceito (SVG) não é guardado", async () => {
    const { fetchFn } = respostaMeta(new Uint8Array([1]), "image/svg+xml");
    let chamou = false;
    const r = await receberMidiaWhatsapp(entrada("image"), {
      fetchFn,
      armazenar: async () => {
        chamou = true;
        return null;
      },
    });
    expect(chamou).toBe(false);
    expect(r.caminho).toBeNull();
    expect(r.erro).toContain("não guardado");
  });

  it("arquivo acima do limite da Meta não é guardado nem lido", async () => {
    const { fetchFn } = respostaMeta(new Uint8Array(5 * 1024 * 1024 + 1), "image/jpeg");
    const r = await receberMidiaWhatsapp(entrada("image"), { fetchFn, armazenar: async () => null });
    expect(r.caminho).toBeNull();
    expect(r.base64).toBeNull();
    expect(r.erro).toContain("limite");
  });

  it("erro da Meta vira erro no resultado, sem lançar", async () => {
    const fetchFn = (async () => new Response("{}", { status: 500 })) as unknown as typeof fetch;
    const r = await receberMidiaWhatsapp(entrada("audio"), { fetchFn, armazenar: async () => null });
    expect(r.caminho).toBeNull();
    expect(r.erro).toBeTruthy();
  });
});

describe("limpeza de mídias que passaram dos 5 anos", () => {
  function bancoFalso(linhas: Array<{ id: string; media_url: string }>) {
    const removidos: string[][] = [];
    const atualizados: Array<{ patch: unknown; ids: string[] }> = [];
    const filtros: Record<string, unknown> = {};
    const consulta: any = {
      select: () => consulta,
      eq: (k: string, v: unknown) => ((filtros[k] = v), consulta),
      like: (k: string, v: unknown) => ((filtros[`like:${k}`] = v), consulta),
      lt: (k: string, v: unknown) => ((filtros[`lt:${k}`] = v), consulta),
      limit: async () => ({ data: linhas, error: null }),
      update: (patch: unknown) => ({
        in: async (_c: string, ids: string[]) => {
          atualizados.push({ patch, ids });
          return { error: null };
        },
      }),
    };
    const admin: any = {
      from: () => consulta,
      storage: { from: () => ({ remove: async (c: string[]) => (removidos.push(c), { error: null }) }) },
    };
    return { admin, removidos, atualizados, filtros };
  }

  it("apaga o arquivo e solta o vínculo; só procura as mídias da própria clínica e antigas", async () => {
    const { admin, removidos, atualizados, filtros } = bancoFalso([
      { id: "a", media_url: `${CLINICA}/2026-08/x.jpg` },
      { id: "b", media_url: `${CLINICA}/2026-08/y.ogg` },
    ]);
    expect(await limparMidiasExpiradas(CLINICA, 100, admin)).toBe(2);
    expect(removidos).toEqual([[`${CLINICA}/2026-08/x.jpg`, `${CLINICA}/2026-08/y.ogg`]]);
    expect(atualizados).toEqual([{ patch: { media_url: null }, ids: ["a", "b"] }]);
    expect(filtros["like:media_url"]).toBe(`${CLINICA}/%`);
    expect(filtros["clinica_id"]).toBe(CLINICA);
    const corte = new Date(String(filtros["lt:recebida_em"])).getTime();
    // 5 anos (1825 ou 1826 dias, conforme o ano bissexto): nunca menos que isso.
    expect(Date.now() - corte).toBeGreaterThan(1824.9 * 86400000);
    expect(Date.now() - corte).toBeLessThan(1826.1 * 86400000);
  });

  it("se não conseguiu apagar o arquivo, mantém o vínculo (tenta de novo depois)", async () => {
    const { admin, atualizados } = bancoFalso([{ id: "a", media_url: `${CLINICA}/2026-08/x.jpg` }]);
    admin.storage.from = () => ({ remove: async () => ({ error: { message: "falhou" } }) });
    expect(await limparMidiasExpiradas(CLINICA, 100, admin)).toBe(0);
    expect(atualizados).toHaveLength(0);
  });
});

function respostaArquivo(corpo: Uint8Array, mime: string, comTamanho = true) {
  const fetchFn = (async (url: string) => {
    if (!String(url).includes("download")) {
      return new Response(JSON.stringify({ url: "https://meta.test/download/1", mime_type: mime }), { status: 200 });
    }
    const headers: Record<string, string> = { "content-type": mime };
    if (comTamanho) headers["content-length"] = String(corpo.length);
    return new Response(corpo as unknown as BodyInit, { status: 200, headers });
  }) as unknown as typeof fetch;
  return fetchFn;
}

const entradaArquivo = (tipo: "document" | "video", extra: Record<string, unknown> = {}) => ({
  clinicaId: CLINICA,
  waMessageId: "wamid.DOC",
  tipo,
  mediaId: "m9",
  accessToken: "token",
  ...extra,
});

describe("documentos e vídeos (guardados em fluxo)", () => {
  it("com tamanho conhecido, o corpo segue em fluxo para o bucket, sem virar texto em memória", async () => {
    const enviados: Array<{ caminho: string; mime: string; tamanho: number; ehFluxo: boolean }> = [];
    const r = await receberArquivoWhatsapp(entradaArquivo("document"), {
      fetchFn: respostaArquivo(new Uint8Array(2048), "application/pdf"),
      enviarEmFluxo: async (caminho, corpo, mime, tamanho) => {
        enviados.push({ caminho, mime, tamanho, ehFluxo: typeof (corpo as ReadableStream).getReader === "function" });
        return null;
      },
    });
    expect(r.erro).toBeNull();
    expect(r.caminho).toMatch(new RegExp(`^${CLINICA}/\\d{4}-\\d{2}/wamid_DOC\\.pdf$`));
    expect(enviados).toEqual([{ caminho: r.caminho!, mime: "application/pdf", tamanho: 2048, ehFluxo: true }]);
  });

  it("sem tamanho informado, lê até o teto e guarda", async () => {
    let guardou = 0;
    const r = await receberArquivoWhatsapp(entradaArquivo("video"), {
      fetchFn: respostaArquivo(new Uint8Array(1000), "video/mp4", false),
      armazenar: async (_c, bytes) => {
        guardou = bytes.length;
        return null;
      },
    });
    expect(r.erro).toBeNull();
    expect(guardou).toBe(1000);
    expect(r.caminho).toMatch(/\.mp4$/);
  });

  it("vídeo acima de 16 MB não é guardado e não é lido por inteiro", async () => {
    let enviou = false;
    const r = await receberArquivoWhatsapp(entradaArquivo("video"), {
      fetchFn: respostaArquivo(new Uint8Array(16 * 1024 * 1024 + 1), "video/mp4"),
      enviarEmFluxo: async () => {
        enviou = true;
        return null;
      },
    });
    expect(enviou).toBe(false);
    expect(r.caminho).toBeNull();
    expect(r.erro).toContain("limite");
  });

  it("tipo perigoso (executável, HTML) é recusado antes de guardar", async () => {
    let enviou = false;
    const r = await receberArquivoWhatsapp(entradaArquivo("document"), {
      fetchFn: respostaArquivo(new Uint8Array(10), "application/x-msdownload"),
      enviarEmFluxo: async () => {
        enviou = true;
        return null;
      },
    });
    expect(enviou).toBe(false);
    expect(r.caminho).toBeNull();
    expect(r.erro).toContain("não guardado");
  });

  it("usa o tipo informado no aviso quando a Meta devolve um tipo genérico", async () => {
    const r = await receberArquivoWhatsapp(entradaArquivo("document", { mimeInformado: "application/pdf" }), {
      fetchFn: respostaArquivo(new Uint8Array(10), "application/octet-stream"),
      enviarEmFluxo: async () => null,
    });
    expect(r.caminho).toMatch(/\.pdf$/);
  });

  it("falha do bucket não lança: a mensagem fica sem arquivo e o motivo vai no resultado", async () => {
    const r = await receberArquivoWhatsapp(entradaArquivo("document"), {
      fetchFn: respostaArquivo(new Uint8Array(10), "application/pdf"),
      enviarEmFluxo: async () => ({ message: "bucket indisponível" }),
    });
    expect(r.caminho).toBeNull();
    expect(r.erro).toContain("bucket indisponível");
  });
});

describe("cópia da mídia que a clínica envia (áudio da Nina)", () => {
  const base = {
    clinicaId: CLINICA,
    mensagemId: "11111111-1111-4111-8111-111111111111",
    waMessageId: "wamid.OUT",
    tipo: "audio" as const,
    bytes: new Uint8Array([1, 2, 3]),
    mime: "audio/mpeg",
  };

  it("guarda a cópia e liga ao registro da mensagem", async () => {
    const ligados: Array<{ id: string; caminho: string }> = [];
    const caminho = await guardarMidiaEnviada(base, {
      armazenar: async () => null,
      ligar: async (id, c) => (ligados.push({ id, caminho: c }), null),
    });
    expect(caminho).toMatch(new RegExp(`^${CLINICA}/\\d{4}-\\d{2}/wamid_OUT\\.mp3$`));
    expect(ligados).toEqual([{ id: base.mensagemId, caminho: caminho! }]);
  });

  it("falha ao guardar ou ligar nunca derruba o envio: devolve null", async () => {
    expect(await guardarMidiaEnviada(base, { armazenar: async () => ({ message: "x" }), ligar: async () => null })).toBeNull();
    expect(await guardarMidiaEnviada(base, { armazenar: async () => null, ligar: async () => ({ message: "x" }) })).toBeNull();
    expect(
      await guardarMidiaEnviada(base, {
        armazenar: async () => {
          throw new Error("explodiu");
        },
      }),
    ).toBeNull();
  });

  it("áudio vazio ou de tipo não aceito não é guardado", async () => {
    let chamou = false;
    const deps = { armazenar: async () => ((chamou = true), null), ligar: async () => null };
    expect(await guardarMidiaEnviada({ ...base, bytes: new Uint8Array(0) }, deps)).toBeNull();
    expect(await guardarMidiaEnviada({ ...base, mime: "text/html" }, deps)).toBeNull();
    expect(chamou).toBe(false);
  });
});

describe("bolha do chat", () => {
  const img = { id: "m1", tipo: "image", body: "📷 Imagem", media_url: `${CLINICA}/2026-09/a.jpg` };

  it("imagem e áudio guardados aparecem; o texto padrão da imagem some, legenda e transcrição ficam", () => {
    expect(temMidiaVisivel(img)).toBe(true);
    expect(textoDaBolha(img)).toBe("");
    expect(textoDaBolha({ ...img, body: "📷 quanto custa?" })).toBe("📷 quanto custa?");
    const audio = { id: "m2", tipo: "audio", body: "🎤 bom dia", media_url: `${CLINICA}/2026-09/a.ogg` };
    expect(textoDaBolha(audio)).toBe("🎤 bom dia");
  });

  it("documento e vídeo guardados aparecem; o texto padrão some e a legenda fica", () => {
    const doc = { id: "d1", tipo: "document", body: "📎 exame.pdf", media_url: `${CLINICA}/2026-10/a.pdf` };
    expect(temMidiaVisivel(doc)).toBe(true);
    expect(textoDaBolha(doc)).toBe("");
    expect(textoDaBolha({ ...doc, body: "📎 exame.pdf — segue o pedido" })).toBe("segue o pedido");
    const video = { id: "v1", tipo: "video", body: "🎞️ Vídeo", media_url: `${CLINICA}/2026-10/a.mp4` };
    expect(temMidiaVisivel(video)).toBe(true);
    expect(textoDaBolha(video)).toBe("");
    expect(textoDaBolha({ ...video, body: "🎞️ olha isso" })).toBe("🎞️ olha isso");
  });

  it("mensagem antiga (sem arquivo) continua como era", () => {
    const antiga = { id: "m3", tipo: "image", body: "[image]", media_url: null };
    expect(temMidiaVisivel(antiga)).toBe(false);
    expect(textoDaBolha(antiga)).toBe("[image]");
    expect(textoDaBolha({ id: "m4", tipo: "image", body: "📷 Imagem", media_url: null })).toBe("📷 Imagem");
  });
});

describe("integração no sistema", () => {
  const webhook = readFileSync("src/routes/api/public/whatsapp.$clinicaId.ts", "utf8");

  it("o webhook guarda o caminho na mensagem e só lê a imagem se a Nina vai responder", () => {
    expect(webhook).toContain("media_url: caminhoMidia");
    const verificacao = webhook.indexOf("podeAntes(estado)");
    expect(verificacao).toBeGreaterThan(-1);
    expect(verificacao).toBeLessThan(webhook.indexOf("lerPedidoNaImagem(recebida.base64"));
  });

  it("o webhook guarda documentos e vídeos e o áudio da Nina também tem cópia", () => {
    expect(webhook).toContain("receberArquivoWhatsapp");
    expect(webhook).toContain("textoDoDocumento(nomeDocumento, legendaArquivo)");
    expect(readFileSync("src/lib/nina/whatsapp-processamento.server.ts", "utf8")).toContain("guardarMidiaEnviada");
  });

  it("o link do documento força o download (nunca abre no navegador)", () => {
    expect(readFileSync("src/lib/atendimento/midia-mensagem.functions.ts", "utf8")).toContain("download:");
  });

  it("o agrupamento da Nina usa a leitura da imagem como texto", () => {
    expect(readFileSync("src/lib/nina/burst.server.ts", "utf8")).toContain('m.tipo === "image"');
  });

  it("o bucket é privado e não tem política de acesso para usuários", () => {
    const sql = readFileSync("supabase/migrations/20260930180000_whatsapp_midia_armazenamento.sql", "utf8");
    expect(sql).toMatch(/'whatsapp-midia'[\s\S]*false/);
    expect(sql).not.toMatch(/CREATE POLICY/i);
  });

  it("o painel do chat usa o componente de mídia", () => {
    expect(readFileSync("src/components/nina/AtendimentoExtraTabs.tsx", "utf8")).toContain("<MidiaMensagem");
  });
});
