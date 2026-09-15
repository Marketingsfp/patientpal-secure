/**
 * FASE 1 — aceite do contrato de regras publicadas.
 *
 * Nenhuma chamada de IA, banco ou rede: só o texto publicado.
 */
import { describe, expect, it, beforeEach } from "bun:test";
import { PROMPT_CANDIDATO_23_REGRAS } from "./fixtures/prompt-23-regras";
import { PROMPT_PUBLICADO_V19 } from "./fixtures/prompt-publicado-v19";
import { hashDoTexto } from "./hash";
import {
  avaliarAplicabilidade,
  compararContratos,
  compilarCondicoes,
  compilarContratoRegras,
  contratoValidoParaPublicacao,
  VERSAO_COMPILACAO_CONTRATO,
} from "./contrato-regras";
import { contratoDoTurno, contratosEmMemoria, invalidarContratos } from "./contrato-turno";
import { implementacaoDeFlag } from "./contrato-flag.server";

const META = { escopo: "homologacao", versao: "candidato-1", versaoId: "v1" };
const contrato = compilarContratoRegras(PROMPT_CANDIDATO_23_REGRAS, META);
const regra = (id: string) => contrato.regras.find((r) => r.identificador === id)!;

describe("extração íntegra das regras", () => {
  it("lê as 23 regras identificadas, sem duplicar nem inventar", () => {
    expect(contrato.regras).toHaveLength(23);
    expect(contrato.diagnostico.duplicados).toEqual([]);
    const ids = contrato.regras.map((r) => r.identificador);
    for (const id of ["ID-01", "CONV-05", "FAT-03", "DAD-01", "OP-03", "CONF-02", "HUM-03", "AMB-01", "ESC-01", "SEG-01", "LING-01", "TESTE-01"]) {
      expect(ids).toContain(id);
    }
  });

  it("preserva texto integral, origem, categoria e campos da ficha", () => {
    const r = regra("FAT-01");
    expect(r.categoria).toBe("ESSENCIAL");
    expect(r.tipoDeclarado).toBe("ESSENCIAL");
    expect(r.conduta).toContain("catálogo publicado");
    expect(r.resultadoEsperado).toContain("fonte no catálogo");
    expect(r.textoIntegral).toContain("FAT-01");
    expect(r.linhaFim).toBeGreaterThanOrEqual(r.linhaInicio);
    expect(r.hash).toBe(hashDoTexto(PROMPT_CANDIDATO_23_REGRAS));
    expect(r.versao).toBe("candidato-1");
  });

  it("nenhuma ficha fica sem campo obrigatório nem sem interpretação", () => {
    expect(contrato.diagnostico.camposFaltando).toEqual([]);
    expect(contrato.diagnostico.naoInterpretadas).toEqual([]);
  });

  it("preserva a identidade do MESMO texto, sem fixar nomes no código", () => {
    expect(contrato.identidade).toEqual({
      assistente: "Nina",
      estabelecimento: "Menino Jesus",
      tipoEstabelecimento: "Policlínica",
    });
    expect(contrato.identidadePendente).toBe(false);

    const outro = compilarContratoRegras(
      PROMPT_CANDIDATO_23_REGRAS.replace("Nina", "Sol").replace("Menino Jesus", "São Francisco"),
      META,
    );
    expect(outro.identidade?.assistente).toBe("Sol");
    expect(outro.identidade?.estabelecimento).toBe("São Francisco");
  });

  it("separa orientação geral de regra: instrução de ferramenta não vira exigência", () => {
    const ferramenta = contrato.orientacoes.find((o) => o.texto.includes("ferramenta"));
    expect(ferramenta).toBeDefined();
    expect(contrato.regras.some((r) => r.textoIntegral.includes("solicite a ferramenta"))).toBe(false);
  });
});

describe("condição falsa versus indeterminada", () => {
  it("primeira resposta: verdadeira, falsa comprovada e indeterminada", () => {
    const r = regra("ID-01");
    expect(avaliarAplicabilidade(r, { primeiraResposta: true })).toBe("verdadeira");
    expect(avaliarAplicabilidade(r, { primeiraResposta: false })).toBe("falsa");
    expect(avaliarAplicabilidade(r, {})).toBe("indeterminada");
  });

  it("indeterminada não vira verdadeira nem 'não aplicável'", () => {
    const r = regra("CONV-03");
    expect(avaliarAplicabilidade(r, { pedidoConcreto: null })).toBe("indeterminada");
  });

  it("condição sem forma conhecida fica registrada como não compilada", () => {
    const c = compilarCondicoes("quando o paciente estiver de bom humor");
    expect(c[0]!.tipo).toBe("nao_compilada");
    const solto = compilarContratoRegras(
      ["XYZ-01 — Teste", "Tipo: ESSENCIAL", "Aplica-se: quando fizer sentido", "Conduta: seja breve.", "Resultado esperado: resposta breve."].join("\n"),
      { escopo: "homologacao" },
    );
    expect(solto.diagnostico.condicoesNaoCompiladas).toHaveLength(1);
    expect(solto.limitacoes).toContain("CONDICAO_NAO_COMPILADA");
    expect(avaliarAplicabilidade(solto.regras[0]!, { primeiraResposta: true })).toBe("indeterminada");
  });
});

describe("momento de aplicação e dependências", () => {
  it("CONF-02 é guarda posterior à classificação, não item da conta", () => {
    const r = regra("CONF-02");
    expect(r.momento).toBe("decisao_saida");
    expect(r.posteriorAClassificacao).toBe(true);
    expect(r.componente).toBe("politica_saida");
    expect(avaliarAplicabilidade(r, { posClassificacao: false })).toBe("falsa");
    expect(avaliarAplicabilidade(r, {})).toBe("indeterminada");
  });

  it("HUM-02 e HUM-03 dependem do resultado operacional", () => {
    for (const id of ["HUM-02", "HUM-03"]) {
      const r = regra(id);
      expect(r.dependeDeResultadoOperacional).toBe(true);
      expect(r.momento).toBe("confirmacao_operacional");
      expect(avaliarAplicabilidade(r, { resultadoOperacional: false })).toBe("falsa");
    }
  });

  it("OP-01 é autorização antes de executar e tem precedência sobre linguagem", () => {
    expect(regra("OP-01").momento).toBe("autorizacao_acao");
    expect(regra("OP-01").precedencia).toBeLessThan(regra("LING-01").precedencia);
  });
});

describe("marcador exato só no ambiente e na entrada previstos", () => {
  const r = () => regra("TESTE-01");

  it("lê ambiente, literal e operador do próprio texto", () => {
    expect(r().ambiente).toBe("homologacao");
    expect(r().literal).toBe("9381");
    expect(r().operador).toBe("igualdade");
    expect(r().verificacao).toBe("literal");
  });

  it("não se aplica em produção nem com outra mensagem", () => {
    expect(
      avaliarAplicabilidade(r(), { ambiente: "producao", mensagemPaciente: "verificar fonte 9381" }),
    ).toBe("falsa");
    expect(
      avaliarAplicabilidade(r(), { ambiente: "homologacao", mensagemPaciente: "bom dia" }),
    ).toBe("falsa");
    expect(
      avaliarAplicabilidade(r(), { ambiente: "homologacao", mensagemPaciente: "verificar fonte 9381" }),
    ).toBe("verdadeira");
    expect(avaliarAplicabilidade(r(), { mensagemPaciente: "verificar fonte 9381" })).toBe(
      "indeterminada",
    );
  });

  it("é capacidade genérica: outro marcador é lido sem código especial", () => {
    const outro = compilarContratoRegras(
      [
        "TESTE-02 — Outro marcador",
        "Tipo: ESSENCIAL",
        'Aplica-se: em homologação, quando a mensagem for exatamente "conferir origem 7777"',
        "Conduta: responda exatamente: 7777",
        "Resultado esperado: apenas o marcador.",
      ].join("\n"),
      { escopo: "homologacao" },
    );
    expect(outro.regras[0]!.literal).toBe("7777");
    expect(outro.regras[0]!.ambiente).toBe("homologacao");
  });
});

describe("mudança de texto, regra nova e invalidação de versão", () => {
  const textoNovo = PROMPT_CANDIDATO_23_REGRAS.replace(
    "Conduta: escreva de 2 a 4 frases.",
    "Conduta: escreva de 2 a 6 frases.",
  );

  it("mesmo identificador com texto diferente gera nova representação", () => {
    const depois = compilarContratoRegras(textoNovo, META);
    const antes = regra("CONV-04");
    const agora = depois.regras.find((r) => r.identificador === "CONV-04")!;
    expect(agora.identificador).toBe(antes.identificador);
    expect(agora.hashRegra).not.toBe(antes.hashRegra);
    expect(compararContratos(contrato, depois).alteradas).toEqual(["CONV-04"]);
  });

  it("regra nova entra sem alterar código e sem lista fixa de identificadores", () => {
    const comNova = compilarContratoRegras(
      `${PROMPT_CANDIDATO_23_REGRAS}\nNOVA-01 — Retorno\nTipo: CONVERSACIONAL\nAplica-se: sempre\nConduta: informe o prazo de retorno.\nResultado esperado: prazo informado.\n`,
      META,
    );
    expect(comNova.regras).toHaveLength(24);
    expect(compararContratos(contrato, comNova).incluidas).toEqual(["NOVA-01"]);
  });

  it("contrato de outra publicação é inválido para o texto atual", () => {
    const hashNovo = hashDoTexto(textoNovo);
    expect(contratoValidoParaPublicacao(contrato, contrato.hash)).toBe(true);
    expect(contratoValidoParaPublicacao(contrato, hashNovo)).toBe(false);
    expect(
      contratoValidoParaPublicacao({ ...contrato, versaoCompilacao: "antiga" }, contrato.hash),
    ).toBe(false);
    expect(VERSAO_COMPILACAO_CONTRATO).toBe("contrato-1");
  });

  it("fixa o contrato uma vez por turno e invalida após publicar", () => {
    invalidarContratos();
    const a = contratoDoTurno(PROMPT_CANDIDATO_23_REGRAS, META);
    const b = contratoDoTurno(PROMPT_CANDIDATO_23_REGRAS, META);
    expect(b).toBe(a);
    const c = contratoDoTurno(textoNovo, META);
    expect(c).not.toBe(a);
    expect(contratosEmMemoria().length).toBe(2);
    invalidarContratos("homologacao");
    expect(contratosEmMemoria()).toEqual([]);
  });
});

describe("cabeçalho no formato publicado", () => {
  it("aceita o prefixo REGRA usado pela publicação da Arquitetura", () => {
    const publicado = compilarContratoRegras(PROMPT_PUBLICADO_V19, {
      escopo: "whatsapp",
      versao: "19",
    });
    expect(publicado.limitacoes).not.toContain("NENHUMA_REGRA_IDENTIFICADA");
    expect(publicado.regras).toHaveLength(24);
    const ids = publicado.regras.map((r) => r.identificador);
    for (const id of ["ID-01", "CONV-06", "AMB-01", "TESTE-01"]) expect(ids).toContain(id);
    expect(regra("ID-01").identificador).toBe("ID-01");
  });
});

describe("seleção explícita de implementação", () => {
  beforeEach(() => invalidarContratos());

  it("sem flag ativa continua a implementação atual", () => {
    expect(implementacaoDeFlag(undefined, false)).toBe("atual");
    expect(implementacaoDeFlag("novo", false)).toBe("atual");
    expect(implementacaoDeFlag("qualquer", true)).toBe("atual");
    expect(implementacaoDeFlag("sombra", true)).toBe("sombra");
    expect(implementacaoDeFlag("novo", true)).toBe("novo");
  });
});
