/**
 * FASE 2 — publicação, resolução de versão e cache.
 *
 * Cenários de aceite: template válido/inválido, rascunho, publicação
 * concorrente, dois resolvedores (instâncias distintas), publicação no meio
 * de um turno e falha de banco. Tudo contra um banco simulado em memória:
 * nada aqui toca WhatsApp, produção ou publicação real.
 */
import { describe, expect, it, mock, beforeEach } from "bun:test";
import {
  MARCADORES_PERMITIDOS,
  marcadoresDoTemplate,
  renderizarTemplateInstrucoes,
  validarTemplateInstrucoes,
} from "./instrucoes-template";

// ---------------------------------------------------------------- banco falso
type Linha = {
  id: string;
  escopo: string;
  versao: number;
  conteudo: string;
  status: string;
  publicado_em: string | null;
};

let banco: Linha[] = [];
let falharLeitura = false;
let leiturasPonteiro = 0;
let leiturasConteudo = 0;

function tabela() {
  const filtros: Array<(l: Linha) => boolean> = [];
  let colunas = "";
  const api: any = {
    select: (c: string) => {
      colunas = c;
      return api;
    },
    is: (col: string, _v: null) => {
      if (col === "clinica_id") filtros.push(() => true);
      return api;
    },
    eq: (col: string, v: unknown) => {
      filtros.push((l) => (l as any)[col] === v);
      return api;
    },
    maybeSingle: async () => {
      if (falharLeitura) return { data: null, error: { message: "banco indisponível" } };
      if (colunas.includes("conteudo") && !colunas.includes("versao")) leiturasConteudo++;
      else leiturasPonteiro++;
      return { data: banco.filter((l) => filtros.every((f) => f(l)))[0] ?? null, error: null };
    },
  };
  return api;
}

mock.module("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: { from: () => tabela() },
}));

const { promptInstrucoes, invalidarCacheInstrucoes, _resetCacheInstrucoes, IDADE_MAX_CACHE_MS } =
  await import("./instrucoes-runtime.server");

const VALORES = { "${nomeUnidade}": "Policlínica Menino Jesus", "${nomeCurtoUnidade}": "Menino Jesus" };
const CODIGO = "PROMPT DO CÓDIGO";

function publicar(versao: number, conteudo: string) {
  for (const l of banco) if (l.status === "publicada") l.status = "arquivada";
  banco.push({
    id: `v-${versao}`,
    escopo: "whatsapp",
    versao,
    conteudo,
    status: "publicada",
    publicado_em: `2026-09-10T10:0${versao}:00.000Z`,
  });
}

beforeEach(() => {
  banco = [];
  falharLeitura = false;
  leiturasPonteiro = 0;
  leiturasConteudo = 0;
  _resetCacheInstrucoes();
});

// -------------------------------------------------------------- 1. templates
describe("template compartilhado", () => {
  it("aceita apenas os marcadores realmente substituídos em cada escopo", () => {
    // FASE 2 (identidade) — os marcadores de apresentação recebem a identidade
    // efetiva publicada no mesmo texto do turno.
    expect(MARCADORES_PERMITIDOS.whatsapp).toEqual([
      "${nomeUnidade}",
      "${nomeCurtoUnidade}",
      "${nomeAssistente}",
      "${nomeEstabelecimento}",
      "${tipoEstabelecimento}",
    ]);
    expect(MARCADORES_PERMITIDOS.painel_interno).toEqual(["${contextoTexto}"]);
    expect(validarTemplateInstrucoes("whatsapp", "Olá, aqui é a ${nomeCurtoUnidade}.").ok).toBe(true);
  });

  it("reprova marcador desconhecido dizendo qual é", () => {
    const r = validarTemplateInstrucoes("whatsapp", "Bem-vindo à ${nomeDaClinica}!");
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.marcador).toBe("${nomeDaClinica}");
      expect(r.mensagem).toContain("${nomeDaClinica}");
      expect(r.mensagem).toContain("${nomeUnidade}");
    }
  });

  it("separa escopos: marcador do painel não vale no WhatsApp", () => {
    expect(validarTemplateInstrucoes("painel_interno", "Base: ${contextoTexto}").ok).toBe(true);
    expect(validarTemplateInstrucoes("whatsapp", "Base: ${contextoTexto}").ok).toBe(false);
  });

  it("renderiza e acusa marcador que sobrou", () => {
    const ok = renderizarTemplateInstrucoes("Oi, ${nomeUnidade}", VALORES);
    expect(ok.ok && ok.texto).toBe("Oi, Policlínica Menino Jesus");
    const falha = renderizarTemplateInstrucoes("Oi, ${outro}", VALORES);
    expect(falha.ok).toBe(false);
    expect(marcadoresDoTemplate("a ${x} b ${y}")).toEqual(["${x}", "${y}"]);
  });
});

// ------------------------------------------------------------ 2/3. runtime
describe("resolução de versão no runtime", () => {
  it("usa a versão publicada e reporta qual foi", async () => {
    publicar(12, "Você é a Nina da ${nomeUnidade}.");
    const s = await promptInstrucoes("whatsapp", VALORES, CODIGO);
    expect(s.versao).toBe(12);
    expect(s.origem).toBe("publicada");
    expect(s.fallbackPorErro).toBe(false);
    expect(s.texto).toContain("Policlínica Menino Jesus");
  });

  it("rascunho não tem efeito nenhum no atendimento", async () => {
    publicar(12, "publicada ${nomeUnidade}");
    banco.push({
      id: "v-13",
      escopo: "whatsapp",
      versao: 13,
      conteudo: "rascunho ${nomeUnidade}",
      status: "rascunho",
      publicado_em: null,
    });
    const s = await promptInstrucoes("whatsapp", VALORES, CODIGO);
    expect(s.versao).toBe(12);
    expect(s.texto).toContain("publicada");
  });

  it("versão inválida não substitui a última válida e não vira a versão em uso", async () => {
    publicar(12, "válida ${nomeUnidade}");
    await promptInstrucoes("whatsapp", VALORES, CODIGO, "t1");
    publicar(13, "quebrada ${marcadorInexistente}");
    const s = await promptInstrucoes("whatsapp", VALORES, CODIGO, "t2");
    expect(s.versao).toBe(12);
    expect(s.texto).toContain("válida");
    expect(s.origem).toBe("cache");
    expect(s.fallbackPorErro).toBe(true);
  });

  it("nova publicação vale no próximo turno sem reiniciar conversa nem esperar TTL", async () => {
    publicar(12, "v12 ${nomeUnidade}");
    const antes = await promptInstrucoes("whatsapp", VALORES, CODIGO, "turno-a");
    expect(antes.versao).toBe(12);
    publicar(13, "v13 ${nomeUnidade}");
    const depois = await promptInstrucoes("whatsapp", VALORES, CODIGO, "turno-b");
    expect(depois.versao).toBe(13);
    expect(depois.texto).toContain("v13");
  });

  it("dois resolvedores independentes convergem para a mesma versão publicada", async () => {
    publicar(12, "v12 ${nomeUnidade}");
    const a = await promptInstrucoes("whatsapp", VALORES, CODIGO, "t1");
    publicar(13, "v13 ${nomeUnidade}");
    // Segunda instância: cache local vazio, mesmo banco.
    invalidarCacheInstrucoes();
    const b = await promptInstrucoes("whatsapp", VALORES, CODIGO, "t2");
    // Primeira instância, novo turno: reconferiu o ponteiro.
    const a2 = await promptInstrucoes("whatsapp", VALORES, CODIGO, "t3");
    expect(a.versao).toBe(12);
    expect(b.versao).toBe(13);
    expect(a2.versao).toBe(13);
  });

  it("versão fica fixa durante as rodadas do mesmo turno", async () => {
    publicar(12, "v12 ${nomeUnidade}");
    const r1 = await promptInstrucoes("whatsapp", VALORES, CODIGO, "turno-fixo");
    publicar(13, "v13 ${nomeUnidade}");
    const r2 = await promptInstrucoes("whatsapp", VALORES, CODIGO, "turno-fixo");
    expect(r2.versao).toBe(12);
    expect(r2.texto).toBe(r1.texto);
    const proximo = await promptInstrucoes("whatsapp", VALORES, CODIGO, "turno-seguinte");
    expect(proximo.versao).toBe(13);
  });

  it("confere o ponteiro a cada turno, mas relê o texto só quando a versão muda", async () => {
    publicar(12, "v12 ${nomeUnidade}");
    await promptInstrucoes("whatsapp", VALORES, CODIGO, "t1");
    const conteudos = leiturasConteudo;
    await promptInstrucoes("whatsapp", VALORES, CODIGO, "t2");
    expect(leiturasConteudo).toBe(conteudos);
    expect(leiturasPonteiro).toBe(2);
  });
});

// ---------------------------------------------------------- 4. falha de banco
describe("política de falha", () => {
  it("mantém a última versão válida e identifica o motivo", async () => {
    publicar(12, "v12 ${nomeUnidade}");
    await promptInstrucoes("whatsapp", VALORES, CODIGO, "t1");
    falharLeitura = true;
    const s = await promptInstrucoes("whatsapp", VALORES, CODIGO, "t2");
    expect(s.versao).toBe(12);
    expect(s.origem).toBe("cache");
    expect(s.fallbackPorErro).toBe(true);
    expect(s.motivo).toContain("última versão válida");
    expect(s.idadeMs).not.toBeNull();
  });

  it("sem versão publicada, usa o código e NÃO se apresenta como versão publicada", async () => {
    falharLeitura = true;
    const s = await promptInstrucoes("whatsapp", VALORES, CODIGO, "t1");
    expect(s.origem).toBe("codigo");
    expect(s.versao).toBeNull();
    expect(s.versaoId).toBeNull();
    expect(s.fallbackPorErro).toBe(true);
    expect(s.texto).toBe(CODIGO);
  });

  it("idade máxima do cache é explícita e limitada", () => {
    expect(IDADE_MAX_CACHE_MS).toBe(15 * 60_000);
  });
});
