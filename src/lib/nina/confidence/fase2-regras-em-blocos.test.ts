/**
 * FASE 2 — leitura das regras publicadas no formato em blocos.
 *
 *   REGRA <ID> — <TÍTULO>
 *   Tipo:
 *   Aplica-se:
 *   Conduta:
 *   Resultado esperado:
 *
 * O que este teste protege:
 *  1. cada bloco vira UMA regra (parágrafos do mesmo bloco não viram
 *     obrigações independentes);
 *  2. a condição de um bloco — inclusive ambiente — não contamina os outros;
 *  3. versão e hash do texto avaliado ficam preservados na regra;
 *  4. condição comprovadamente falsa => não se aplica; condição que o
 *     avaliador não compreende => indeterminada (nunca cumprimento presumido);
 *  5. a exigência literal condicionada só vale quando a condição publicada
 *     ocorre — uma saudação comum não é penalizada por não respondê-la;
 *  6. texto publicado sem esse formato continua sendo lido como antes.
 */
import { describe, expect, it } from "bun:test";
import {
  aplicabilidadeDaRegra,
  extrairRegrasPublicadas,
  type EntradaAplicabilidade,
} from "./regras-publicadas";
import { PROMPT_PUBLICADO_V15 } from "./fixtures/prompt-publicado-v15";

const META = {
  escopo: "whatsapp",
  versao: "15",
  versaoId: "e8ecc58b-7186-42ce-8e3f-a90c42c25c1a",
  hash: "hash-v15",
};

const extracao = extrairRegrasPublicadas(PROMPT_PUBLICADO_V15, META);
const porId = (id: string) => extracao.regras.find((r) => r.identificador === id);

/** Saudação comum em produção, primeira resposta da sessão. */
const SAUDACAO: EntradaAplicabilidade = {
  mensagemPaciente: "ola bom dia",
  ambiente: "producao",
  demandaDeclarada: false,
  apresentacaoJaFeita: false,
  primeiraMensagem: true,
};

describe("Fase 2 — regras publicadas em blocos", () => {
  it("reconhece o prompt histórico v15 como 23 regras, uma por bloco", () => {
    expect(extracao.regras.length).toBe(23);
    const ids = extracao.regras.map((r) => r.identificador);
    expect(new Set(ids).size).toBe(23);
    expect(ids).toContain("ID-01");
    expect(ids).toContain("TESTE-01");
  });

  it("preserva o bloco inteiro, a classe declarada, a versão e o hash", () => {
    const id01 = porId("ID-01")!;
    expect(id01.classe).toBe("ESSENCIAL");
    expect(id01.trecho).toContain("Tipo:");
    expect(id01.trecho).toContain("Aplica-se:");
    expect(id01.trecho).toContain("Resultado esperado:");
    // O bloco seguinte NÃO entra neste trecho.
    expect(id01.trecho).not.toContain("REGRA CONV-01");
    expect(id01.versao).toBe("15");
    expect(id01.versaoId).toBe(META.versaoId);
    expect(id01.hash).toBe("hash-v15");
    expect(id01.prioridade).toBe("critica");
  });

  it("a condição de homologação de um bloco não contamina os outros", () => {
    // O bloco de homologação é o único restrito a esse ambiente...
    expect(porId("AMB-01")!.ambiente).toBe("homologacao");
    // ...enquanto blocos que apenas MENCIONAM homologação na conduta seguem
    // valendo em qualquer ambiente.
    expect(porId("HUM-01")!.ambiente).toBe("qualquer");
    expect(porId("CONV-01")!.ambiente).toBe("qualquer");
    expect(porId("AMB-01")!.trecho).not.toContain("REGRA ESC-01");
  });

  it("saudação comum recebe somente as exigências aplicáveis", () => {
    const aplicaveis = extracao.regras
      .filter((r) => aplicabilidadeDaRegra(r, SAUDACAO) === "aplica")
      .map((r) => r.identificador);
    expect(aplicaveis).toEqual(["CONV-01"]);

    // Condição comprovadamente falsa: não se aplica.
    expect(aplicabilidadeDaRegra(porId("CONV-02")!, SAUDACAO)).toBe("nao_aplica");
    expect(aplicabilidadeDaRegra(porId("CONV-03")!, SAUDACAO)).toBe("nao_aplica");
    expect(aplicabilidadeDaRegra(porId("AMB-01")!, SAUDACAO)).toBe("nao_aplica");
  });

  it("regra essencial cuja condição não foi compreendida fica indeterminada", () => {
    expect(porId("ID-01")!.condicao.tipo).toBe("nao_compreendida");
    expect(aplicabilidadeDaRegra(porId("ID-01")!, SAUDACAO)).toBe("indeterminada");
    expect(aplicabilidadeDaRegra(porId("FAT-01")!, SAUDACAO)).toBe("indeterminada");
    expect(extracao.limitacoes).toContain("REGRA_ESSENCIAL_COM_CONDICAO_NAO_COMPREENDIDA");
  });

  it("exigência literal condicionada só vale quando a condição publicada ocorre", () => {
    const teste = porId("TESTE-01")!;
    expect(teste.verificacao).toBe("literal");
    expect(teste.literal).toBe("ARQUITETURA_CONFIRMADA_9381");
    expect(teste.operador).toBe("igualdade");
    expect(teste.ambiente).toBe("homologacao");
    expect(teste.condicao).toEqual({
      tipo: "mensagem_exata",
      valor: "TESTE-ARQUITETURA-9381",
    });

    // Saudação comum: não é exigida.
    expect(aplicabilidadeDaRegra(teste, SAUDACAO)).toBe("nao_aplica");
    // Mensagem exata, mas em produção: não é exigida.
    expect(
      aplicabilidadeDaRegra(teste, {
        ...SAUDACAO,
        mensagemPaciente: "TESTE-ARQUITETURA-9381",
        ambiente: "producao",
      }),
    ).toBe("nao_aplica");
    // Homologação com a mensagem exata publicada: aí sim é exigida.
    expect(
      aplicabilidadeDaRegra(teste, {
        ...SAUDACAO,
        mensagemPaciente: "TESTE-ARQUITETURA-9381",
        ambiente: "homologacao",
      }),
    ).toBe("aplica");
  });

  it("texto publicado sem o formato em blocos continua sendo lido", () => {
    const antigo = extrairRegrasPublicadas(
      [
        "REGRAS DE ATENDIMENTO",
        "",
        "Nunca inclua emoji na resposta.",
        "",
        "Responda exatamente: OK",
      ].join("\n"),
      { escopo: "whatsapp", hash: "outro" },
    );
    expect(antigo.regras.length).toBeGreaterThan(0);
    expect(antigo.regras.every((r) => r.identificador == null)).toBe(true);
  });
});
