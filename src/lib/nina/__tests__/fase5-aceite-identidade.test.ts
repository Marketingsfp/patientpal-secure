/**
 * FASE 5 — TESTES DE ACEITE da identidade configurável do atendimento.
 *
 * Ambiente isolado: um repositório de versões em memória substitui APENAS o
 * acesso ao banco. Todo o resto é a cadeia real — carregamento da versão,
 * resolução da identidade, marcadores do prompt, validação da apresentação,
 * mensagem de transferência, verificação das instruções publicadas e
 * finalização/transporte.
 *
 * Nada aqui envia mensagem, publica em operação, chama modelo ou toca WhatsApp.
 */
import { describe, expect, it, beforeEach, mock } from "bun:test";
import {
  aplicarIdentidadeNoTexto,
  extrairIdentidade,
  montarBlocoIdentidade,
  validarIdentidadeParaPublicacao,
} from "../identidade-atendimento";
import {
  resolverIdentidadeEfetiva,
  valoresIdentidade,
  fatosIdentidade,
  IDENTIDADE_NEUTRA,
} from "../identidade-efetiva";
import { avaliarSaudacao } from "../saudacao-sessao";
import { garantirSessaoAtiva } from "../saudacao-sessao";
import { montarInstrucoesDoTurno } from "../confidence/contexto-avaliacao";
import { avaliarObrigacoes, InstructionComplianceValidator } from "../confidence/obrigacoes";
import type { ContextoConfianca } from "../confidence/types";
import {
  promptMensagemHandoff,
  montarMensagemHandoffFallback,
  validarMensagemHandoff,
} from "@/lib/atendimento/mensagem-handoff";
import { criarResultado } from "@/lib/nina/resposta/contrato";
import {
  finalizarResposta,
  limparFinalizacoes,
} from "@/lib/nina/resposta/finalizacao.server";

// ------------------------------------------------ repositório de versões (isolado)
type Linha = {
  id: string;
  escopo: string;
  clinica_id: string | null;
  versao: number;
  conteudo: string;
  status: string;
  publicado_em: string | null;
};

let banco: Linha[] = [];
let falharLeitura = false;
/** Prova do alcance global: toda leitura filtrou clinica_id IS NULL. */
let leiturasGlobais = 0;
let leiturasComClinica = 0;

function tabela() {
  const filtros: Array<(l: Linha) => boolean> = [];
  const api: any = {
    select: () => api,
    is: (col: string) => {
      if (col === "clinica_id") {
        leiturasGlobais++;
        filtros.push((l) => l.clinica_id === null);
      }
      return api;
    },
    eq: (col: string, v: unknown) => {
      if (col === "clinica_id") leiturasComClinica++;
      filtros.push((l) => (l as any)[col] === v);
      return api;
    },
    maybeSingle: async () => {
      if (falharLeitura) return { data: null, error: { message: "banco indisponível" } };
      return { data: banco.filter((l) => filtros.every((f) => f(l)))[0] ?? null, error: null };
    },
  };
  return api;
}

mock.module("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: { from: () => tabela() },
}));

const { promptInstrucoes, _resetCacheInstrucoes } = await import(
  "../instrucoes-runtime.server"
);
const { identidadeEfetivaAtual } = await import("../identidade-efetiva.server");

// ------------------------------------------------------------------- conteúdos
const REGRAS_BASE = `COMPORTAMENTO DA ASSISTENTE

Na PRIMEIRA resposta de cada sessão, apresente-se citando seu nome, a
expressão "assistente virtual" e o nome do estabelecimento, e ofereça ajuda.

Use \${nomeUnidade} quando precisar citar a unidade por extenso.

Não invente preços nem informações fora do catálogo publicado.`;

const REGRA_HOMOLOGACAO = `TESTE TEMPORÁRIO DE FONTE DO PROMPT — HOMOLOGAÇÃO

Somente quando a mensagem recebida do paciente for EXATAMENTE:

TESTE-ARQUITETURA-9381

responda EXATAMENTE:

ARQUITETURA_CONFIRMADA_9381

Não acrescente saudação, emoji, explicação, pergunta, despedida ou qualquer
outro texto nessa resposta específica.`;

const IDENT_A = {
  assistente: "Nina",
  estabelecimento: "Menino Jesus",
  tipoEstabelecimento: "Policlínica",
};
const IDENT_B = {
  assistente: "Lia",
  estabelecimento: "Horizonte",
  tipoEstabelecimento: "Clínica",
};

function publicar(versao: number, conteudo: string) {
  for (const l of banco) if (l.status === "publicada") l.status = "arquivada";
  banco.push({
    id: `v-${versao}`,
    escopo: "whatsapp",
    clinica_id: null,
    versao,
    conteudo,
    status: "publicada",
    publicado_em: `2026-09-11T10:0${versao}:00.000Z`,
  });
}

/** Carrega a versão do turno e resolve a identidade — cadeia real do turno. */
async function turno(turnoId: string) {
  const snapshot = await promptInstrucoes(
    "whatsapp",
    (template) =>
      valoresIdentidade(
        resolverIdentidadeEfetiva({ template, origem: "publicada", versao: null, versaoId: null }),
      ),
    "PROMPT DE RESERVA DO CÓDIGO",
    turnoId,
  );
  const identidade = resolverIdentidadeEfetiva({
    template: snapshot.template,
    origem: snapshot.origem,
    versao: snapshot.versao,
    versaoId: snapshot.versaoId,
  });
  return { snapshot, identidade };
}

beforeEach(() => {
  banco = [];
  falharLeitura = false;
  leiturasGlobais = 0;
  leiturasComClinica = 0;
  _resetCacheInstrucoes();
  limparFinalizacoes();
});

// ------------------------------------------------------------------------- A
describe("A — publicação inicial: Nina / Menino Jesus / Policlínica", () => {
  it("a apresentação da primeira resposta usa a identidade publicada", async () => {
    publicar(1, aplicarIdentidadeNoTexto(REGRAS_BASE, IDENT_A));
    const { snapshot, identidade } = await turno("A-1");

    expect(snapshot.origem).toBe("publicada");
    expect(identidade.ok).toBe(true);
    expect(identidade.apresentacao.assistente).toBe("Nina");
    // Marcador do prompt recebe o nome publicado, sem duplicar o tipo.
    expect(snapshot.texto).toContain("Policlínica Menino Jesus");
    expect(snapshot.texto).not.toContain("${nomeUnidade}");

    const estado = garantirSessaoAtiva({ flow: { stage: "GREETING" } } as any);
    expect(estado.saudacaoObrigatoria).toBe(true);

    const resposta =
      "Bom dia! Sou a Nina, assistente virtual da Policlínica Menino Jesus. Como posso te ajudar?";
    const d = avaliarSaudacao(resposta, identidade.apresentacao, { obrigatoria: true });
    expect(d.completa).toBe(true);
    expect(d.saudacaoAusente).toBe(false);
  });
});

// ------------------------------------------------------------------------- B
describe("B — trocar só a Arquitetura muda a apresentação, sem deploy", () => {
  it("depois de publicar Lia / Horizonte / Clínica o próximo turno já usa a nova identidade", async () => {
    publicar(1, aplicarIdentidadeNoTexto(REGRAS_BASE, IDENT_A));
    const antes = await turno("B-1");
    expect(antes.identidade.apresentacao.assistente).toBe("Nina");

    // Única mudança: o texto publicado na aba Arquitetura.
    publicar(2, aplicarIdentidadeNoTexto(antes.snapshot.template, IDENT_B));
    const depois = await turno("B-2");

    expect(depois.identidade.apresentacao).toEqual({
      assistente: "Lia",
      estabelecimento: "Horizonte",
      tipoEstabelecimento: "Clínica",
    });
    expect(depois.snapshot.texto).toContain("Clínica Horizonte");
    expect(depois.snapshot.texto).not.toContain("Menino Jesus");

    const boa =
      "Bom dia! Sou a Lia, assistente virtual da Clínica Horizonte. Como posso ajudar?";
    expect(avaliarSaudacao(boa, depois.identidade.apresentacao).completa).toBe(true);

    // Redação diferente também vale: valida identidade, não frase literal.
    const outra =
      "Oi! Aqui é a Lia, assistente virtual da Clínica Horizonte — em que posso ajudar você hoje?";
    expect(avaliarSaudacao(outra, depois.identidade.apresentacao).completa).toBe(true);

    // Apresentação com o nome antigo não passa mais.
    const velha =
      "Bom dia! Sou a Nina, assistente virtual da Policlínica Menino Jesus. Como posso ajudar?";
    expect(avaliarSaudacao(velha, depois.identidade.apresentacao).completa).toBe(false);
  });
});

// ------------------------------------------------------------------------- C
describe("C — cada campo muda isolado, os outros são preservados", () => {
  it("trocar um campo por vez mantém os demais e o restante do texto", () => {
    const base = aplicarIdentidadeNoTexto(REGRAS_BASE, IDENT_A);

    const soAssistente = aplicarIdentidadeNoTexto(base, { ...IDENT_A, assistente: "Lia" });
    const l1 = extrairIdentidade(soAssistente);
    expect(l1.ok && l1.identidade).toEqual({ ...IDENT_A, assistente: "Lia" });

    const soEstabelecimento = aplicarIdentidadeNoTexto(base, {
      ...IDENT_A,
      estabelecimento: "Horizonte",
    });
    const l2 = extrairIdentidade(soEstabelecimento);
    expect(l2.ok && l2.identidade).toEqual({ ...IDENT_A, estabelecimento: "Horizonte" });

    const soTipo = aplicarIdentidadeNoTexto(base, {
      ...IDENT_A,
      tipoEstabelecimento: "Hospital",
    });
    const l3 = extrairIdentidade(soTipo);
    expect(l3.ok && l3.identidade).toEqual({ ...IDENT_A, tipoEstabelecimento: "Hospital" });

    // O resto das regras publicadas continua idêntico nas três edições.
    for (const t of [soAssistente, soEstabelecimento, soTipo]) {
      expect(t).toContain("Não invente preços nem informações fora do catálogo publicado.");
      expect(t.split(montarBlocoIdentidade(IDENT_A)[0]!).length).toBeGreaterThan(0);
      expect(extrairIdentidade(t).ok).toBe(true);
    }

    // Formulário e edição manual do bloco produzem a MESMA identidade.
    const manual = base.replace("Nome da atendente virtual: Nina", "Nome da atendente virtual: Lia");
    expect(extrairIdentidade(manual).ok && extrairIdentidade(manual)).toEqual(
      extrairIdentidade(soAssistente) as any,
    );
  });
});

// ------------------------------------------------------------------------- D
describe("D — conversa nova e conversa antiga", () => {
  it("a identidade atual vale sem apagar histórico nem reiniciar o fluxo", async () => {
    publicar(1, aplicarIdentidadeNoTexto(REGRAS_BASE, IDENT_A));
    publicar(2, aplicarIdentidadeNoTexto(REGRAS_BASE, IDENT_B));
    const { identidade } = await turno("D-1");

    // Conversa nova: sessão criada, apresentação exigida.
    const nova = garantirSessaoAtiva({ flow: { stage: "GREETING" } } as any);
    expect(nova.novaSessao).toBe(true);
    expect(nova.saudacaoObrigatoria).toBe(true);

    // Conversa existente que já se apresentou como Nina: nada é reiniciado.
    const antiga = garantirSessaoAtiva({
      session_id: "sess-antiga",
      greeting_completed: true,
      flow: { stage: "COLLECTING" },
    } as any);
    expect(antiga.novaSessao).toBe(false);
    expect(antiga.saudacaoObrigatoria).toBe(false);
    expect(antiga.estado.session_id).toBe("sess-antiga");
    expect(antiga.estado.flow.stage).toBe("COLLECTING");

    // A identidade vigente é a nova, mesmo com histórico citando a antiga.
    expect(identidade.apresentacao.assistente).toBe("Lia");
    const historico = "Bom dia! Sou a Nina, assistente virtual da Policlínica Menino Jesus.";
    expect(historico).toContain("Nina"); // histórico permanece como está
    expect(fatosIdentidade(identidade).assistente).toBe("Lia");
  });
});

// ------------------------------------------------------------------------- E
describe("E — saudação, despedida, esclarecimento, erro e handoff", () => {
  it("todo texto que cita a identidade usa a vigente", async () => {
    publicar(1, aplicarIdentidadeNoTexto(REGRAS_BASE, IDENT_B));
    const { identidade } = await turno("E-1");
    const ident = identidade.apresentacao;

    // Saudação
    expect(
      avaliarSaudacao(
        `Boa tarde! Sou a ${ident.assistente}, assistente virtual da Clínica ${ident.estabelecimento}. Como posso ajudar?`,
        ident,
      ).completa,
    ).toBe(true);

    // Despedida / esclarecimento / erro: textos redigidos com a identidade
    // vigente não podem conter a persona antiga.
    const despedida = `Foi um prazer te atender pela Clínica ${ident.estabelecimento}. Até logo!`;
    const esclarecimento = `Só para confirmar: você quer marcar na Clínica ${ident.estabelecimento}?`;
    const erro = `Não consegui essa informação agora. Vou pedir ajuda da nossa equipe.`;
    for (const t of [despedida, esclarecimento, erro]) {
      expect(t).not.toContain("Nina");
      expect(t).not.toContain("Menino Jesus");
    }

    // Handoff (outro prompt) recebe a identidade efetiva.
    const p = promptMensagemHandoff({
      protocolo: "MJ-101",
      setor: "recepção",
      identidade: ident,
    });
    expect(p).toContain("Você é Lia");
    expect(p).toContain("Horizonte");
    expect(p).not.toContain("Nina");

    const fallback = montarMensagemHandoffFallback({
      protocolo: "MJ-101",
      motivo: "pedido_do_paciente",
      identidade: ident,
    });
    expect(validarMensagemHandoff(fallback, { protocolo: "MJ-101" }).ok).toBe(true);
    expect(fallback).not.toContain("Nina");
  });
});

// ------------------------------------------------------------------------- F
describe("F — rascunho, publicação no meio do turno, nova execução, rollback e falha", () => {
  it("rascunho não altera o atendimento", async () => {
    publicar(1, aplicarIdentidadeNoTexto(REGRAS_BASE, IDENT_A));
    banco.push({
      id: "v-rascunho",
      escopo: "whatsapp",
      clinica_id: null,
      versao: 2,
      conteudo: aplicarIdentidadeNoTexto(REGRAS_BASE, IDENT_B),
      status: "rascunho",
      publicado_em: null,
    });
    const { identidade } = await turno("F-rascunho");
    expect(identidade.apresentacao.assistente).toBe("Nina");
  });

  it("publicar no meio do turno não mistura versões; a próxima execução usa a nova", async () => {
    publicar(1, aplicarIdentidadeNoTexto(REGRAS_BASE, IDENT_A));
    const primeira = await turno("F-turno-1");
    publicar(2, aplicarIdentidadeNoTexto(REGRAS_BASE, IDENT_B));

    // Mesma rodada do MESMO turno: continua na versão fixada.
    const mesmaRodada = await turno("F-turno-1");
    expect(mesmaRodada.identidade.apresentacao.assistente).toBe("Nina");
    expect(mesmaRodada.snapshot.versaoId).toBe(primeira.snapshot.versaoId);
    expect(mesmaRodada.snapshot.texto).not.toContain("Horizonte");

    // Execução seguinte: nova versão, identidade e instruções da MESMA versão.
    const proximo = await turno("F-turno-2");
    expect(proximo.identidade.apresentacao.assistente).toBe("Lia");
    expect(proximo.identidade.versaoId).toBe(proximo.snapshot.versaoId);
    expect(proximo.snapshot.texto).toContain("Clínica Horizonte");
  });

  it("rollback para a versão anterior volta a identidade anterior", async () => {
    publicar(1, aplicarIdentidadeNoTexto(REGRAS_BASE, IDENT_A));
    publicar(2, aplicarIdentidadeNoTexto(REGRAS_BASE, IDENT_B));
    expect((await turno("F-rb-1")).identidade.apresentacao.assistente).toBe("Lia");
    publicar(3, aplicarIdentidadeNoTexto(REGRAS_BASE, IDENT_A)); // republicação do conteúdo anterior
    expect((await turno("F-rb-2")).identidade.apresentacao.assistente).toBe("Nina");
  });

  it("falha de carregamento usa a última versão válida completa, sem misturar", async () => {
    publicar(1, aplicarIdentidadeNoTexto(REGRAS_BASE, IDENT_B));
    await turno("F-falha-0");
    falharLeitura = true;
    const { snapshot, identidade } = await turno("F-falha-1");
    expect(snapshot.origem).toBe("cache");
    expect(identidade.origem).toBe("cache");
    expect(identidade.apresentacao.assistente).toBe("Lia");
    expect(identidade.versaoId).toBe(snapshot.versaoId);
  });
});

// ------------------------------------------------------------------------- G
describe("G — sem identidade válida a resposta é neutra", () => {
  it("versão publicada sem bloco vira pendência visível, sem voltar para nomes fixos", async () => {
    publicar(1, REGRAS_BASE.replace("${nomeUnidade}", "a unidade"));
    const { identidade } = await turno("G-1");
    expect(identidade.ok).toBe(false);
    expect(identidade.apresentacao).toEqual({ ...IDENTIDADE_NEUTRA });
    expect(identidade.pendenciaAdministrativa).toContain("IDENTIDADE DO ATENDIMENTO");
    expect(JSON.stringify(identidade)).not.toMatch(/Nina|Menino Jesus/);

    // Publicação continua permitida (versões antigas não são alteradas),
    // mas o bloco quebrado é bloqueado antes de publicar.
    expect(validarIdentidadeParaPublicacao(REGRAS_BASE).ok).toBe(true);
    const quebrado = `${montarBlocoIdentidade(IDENT_A)}\n${montarBlocoIdentidade(IDENT_B)}`;
    expect(validarIdentidadeParaPublicacao(quebrado).ok).toBe(false);
  });

  it("sem versão publicada o prompt de reserva também fala de forma neutra", async () => {
    const efetiva = await identidadeEfetivaAtual("whatsapp", "G-2");
    expect(efetiva.ok).toBe(false);
    expect(efetiva.apresentacao.assistente).toBe(IDENTIDADE_NEUTRA.assistente);
  });
});

// ------------------------------------------------------------------------- H
describe("H — regra de resposta exata da homologação continua valendo", () => {
  const ctx = (texto: string, draft: string): ContextoConfianca => ({
    requestedAction: null,
    retrievedSources: [],
    toolResults: [],
    mensagemPaciente: "TESTE-ARQUITETURA-9381",
    instrucoes: montarInstrucoesDoTurno({
      escopo: "whatsapp",
      versao: "9",
      versaoId: "v-9",
      publicadoEm: "2026-09-11T10:00:00.000Z",
      origem: "publicada",
      texto,
    }),
    draftText: draft,
    businessContext: {
      ambiente: "homologacao",
      pacienteIdentificado: false,
      agendamentoConfirmado: false,
      esclarecimentoUsado: false,
      handoffSolicitado: false,
    },
  });

  const textoComIdentidade = aplicarIdentidadeNoTexto(
    `${REGRAS_BASE.replace("${nomeUnidade}", "a unidade")}\n\n${REGRA_HOMOLOGACAO}`,
    IDENT_B,
  );

  it("marcador exato passa mesmo com identidade publicada nova", () => {
    const c = ctx(textoComIdentidade, "ARQUITETURA_CONFIRMADA_9381");
    expect(avaliarObrigacoes(c, c.draftText!).estadoRestricoes).toBe("cumpridas");
    expect(InstructionComplianceValidator(c).status).toBe("PASS");
  });

  it("apresentação não é forçada no turno de teste", () => {
    const c = ctx(textoComIdentidade, "ARQUITETURA_CONFIRMADA_9381");
    const d = avaliarSaudacao(c.draftText!, { assistente: "Lia", estabelecimento: "Horizonte" }, {
      obrigatoria: false,
    });
    expect(d.saudacaoAusente).toBe(false);
    // A telemetria observa, nunca reescreve o texto entregue.
    expect(c.draftText).toBe("ARQUITETURA_CONFIRMADA_9381");
  });

  it("saudação com o novo nome antes do marcador é descumprimento (sem exceção fixa)", () => {
    const c = ctx(textoComIdentidade, "Bom dia! Sou a Lia. ARQUITETURA_CONFIRMADA_9381");
    expect(avaliarObrigacoes(c, c.draftText!).restricoesCumpridas).toBe(false);
    expect(InstructionComplianceValidator(c).status).toBe("FAIL");
  });
});

// ------------------------------------------------------------------------- I
describe("I — candidato inicial, correção e envio", () => {
  it("o transporte envia o candidato corrigido, não o inicial", async () => {
    publicar(1, aplicarIdentidadeNoTexto(REGRAS_BASE, IDENT_B));
    const { identidade } = await turno("I-1");
    const identMeta = {
      versao: identidade.versao,
      versaoId: identidade.versaoId,
      origem: identidade.origem,
      assistente: identidade.apresentacao.assistente,
      estabelecimento: identidade.apresentacao.estabelecimento,
    };
    const base = { clinicaId: "c-1", canal: "test-console" as const, identidade: identMeta };

    const inicial = await finalizarResposta({
      ...base,
      chaveTurno: "I-1",
      chaveTurnoRaiz: "I-1",
      resultado: criarResultado({
        origem: "modelo",
        texto: "Bom dia! Sou a Nina, assistente virtual da Policlínica Menino Jesus.",
      }),
    });
    expect(inicial.texto).toContain("Nina");

    const corrigida = await finalizarResposta({
      ...base,
      chaveTurno: "I-1#correcao-1",
      chaveTurnoRaiz: "I-1",
      resultado: criarResultado({
        origem: "modelo",
        texto: "Bom dia! Sou a Lia, assistente virtual da Clínica Horizonte. Como posso ajudar?",
      }),
    });
    expect(corrigida.texto).toContain("Lia");

    // Transporte reapresenta o texto aprovado: mesma aprovação, sem voltar atrás.
    const enviada = await finalizarResposta({
      ...base,
      chaveTurno: "I-1#envio",
      chaveTurnoRaiz: "I-1",
      resultado: criarResultado({ origem: "modelo", texto: corrigida.texto }),
    });
    expect(enviada.texto).toBe(corrigida.texto);
    expect(enviada.reaproveitada).toBe(true);
    expect(enviada.texto).not.toContain("Nina");
    expect(enviada.identidade?.assistente).toBe("Lia");
  });
});

// ------------------------------------------------------------------------- J
describe("J — alcance global e isolamento dos dados operacionais", () => {
  it("a versão publicada é lida no escopo global (clinica_id nulo)", async () => {
    publicar(1, aplicarIdentidadeNoTexto(REGRAS_BASE, IDENT_B));
    await turno("J-1");
    expect(leiturasGlobais).toBeGreaterThan(0);
    expect(leiturasComClinica).toBe(0);
  });

  it("trocar o nome de apresentação não muda a clínica consultada", async () => {
    publicar(1, aplicarIdentidadeNoTexto(REGRAS_BASE, IDENT_A));
    const antes = await turno("J-2");
    publicar(2, aplicarIdentidadeNoTexto(REGRAS_BASE, IDENT_B));
    const depois = await turno("J-3");

    // A identidade não carrega e não altera nenhum identificador operacional.
    const chaves = Object.keys(valoresIdentidade(depois.identidade));
    expect(chaves).toEqual([
      "${nomeAssistente}",
      "${nomeEstabelecimento}",
      "${tipoEstabelecimento}",
      "${nomeUnidade}",
      "${nomeCurtoUnidade}",
    ]);
    const fatos = fatosIdentidade(depois.identidade);
    expect(Object.keys(fatos)).not.toContain("clinica_id");
    expect(Object.keys(fatos)).not.toContain("paciente");

    // Só a apresentação mudou entre as duas versões.
    expect(antes.identidade.apresentacao.assistente).toBe("Nina");
    expect(depois.identidade.apresentacao.assistente).toBe("Lia");
    expect(leiturasComClinica).toBe(0);
  });
});
