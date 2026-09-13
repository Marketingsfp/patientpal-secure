/**
 * VALIDAÇÃO DO CASO MJ-52 — reprodução isolada, com serviços externos
 * SIMULADOS (banco em memória e transporte de mensagens falso).
 *
 * O que o caso real mostrou: uma única decisão de encaminhamento produziu
 * DUAS bolhas ao paciente (a do protocolo e o aviso de baixa confiança), e a
 * nota de um texto aparecia colada em outro.
 *
 * Aqui os dez cenários exigidos rodam ponta a ponta contra:
 *  - o registro durável do aviso (`atend_aviso_encaminhamento`), simulado;
 *  - a conversa (`whatsapp_mensagens`), simulada;
 *  - um transporte de mensagens que pode falhar, estourar tempo ou confirmar.
 *
 * Nenhum serviço real é chamado: não há rede, não há fila de atendimento
 * verdadeira e nenhuma mensagem sai para paciente algum.
 */
import { beforeEach, describe, expect, it, mock } from "bun:test";

// ----------------------------------------------------------------- simulação

type Linha = Record<string, any>;

const bd: Record<string, Linha[]> = {
  atend_aviso_encaminhamento: [],
  whatsapp_mensagens: [],
};

/** Fila REAL de atendimento humano — em produção simulada. Homologação nunca entra aqui. */
const filaHumana: Array<{ conversaId: string; protocolo: string | null }> = [];

let seq = 0;
const novoId = (p: string) => `${p}-${String(++seq).padStart(4, "0")}`;

function consulta(tabela: string) {
  const filtros: Array<(l: Linha) => boolean> = [];
  let patch: Linha | null = null;
  const alvo = () => bd[tabela]!.filter((l) => filtros.every((f) => f(l)));

  const api: any = {
    select: () => api,
    eq: (c: string, v: unknown) => (filtros.push((l) => l[c] === v), api),
    in: (c: string, v: unknown[]) => (filtros.push((l) => v.includes(l[c])), api),
    gte: (c: string, v: string) => (filtros.push((l) => String(l[c] ?? "") >= v), api),
    order: () => api,
    limit: () => api,
    update: (p: Linha) => ((patch = p), api),
    upsert: (valores: Linha, opcoes?: { onConflict?: string; ignoreDuplicates?: boolean }) => {
      const chaveConflito = opcoes?.onConflict ?? "id";
      const existente = bd[tabela]!.find((l) => l[chaveConflito] === valores[chaveConflito]);
      if (existente) {
        // Unicidade do banco: o segundo INSERT concorrente não cria nada.
        if (opcoes?.ignoreDuplicates) return { ...api, __resultado: null };
        Object.assign(existente, valores, { updated_at: new Date().toISOString() });
        return { ...api, __resultado: existente };
      }
      const nova = {
        id: novoId("aviso"),
        tentativas: 0,
        ...valores,
        updated_at: new Date().toISOString(),
      };
      bd[tabela]!.push(nova);
      return { ...api, __resultado: nova };
    },
    insert: (v: Linha) => {
      const nova = { id: novoId("msg"), ...v };
      bd[tabela]!.push(nova);
      return { ...api, __resultado: nova };
    },
    maybeSingle: async () => {
      if ("__resultado" in api) return { data: api.__resultado ?? null, error: null };
      if (patch) {
        const linhas = alvo();
        for (const l of linhas) Object.assign(l, patch, { updated_at: new Date().toISOString() });
        return { data: linhas[0] ?? null, error: null };
      }
      return { data: alvo()[0] ?? null, error: null };
    },
    then: (resolver: (r: { data: Linha[] | null; error: null }) => unknown) => {
      if (patch) {
        for (const l of alvo()) Object.assign(l, patch, { updated_at: new Date().toISOString() });
      }
      return Promise.resolve(resolver({ data: alvo(), error: null }));
    },
  };
  // `upsert`/`insert` devolvem um objeto derivado: preserva a cadeia .select().maybeSingle().
  const envolver = (base: any) => {
    base.select = () => base;
    base.maybeSingle = async () => ({ data: base.__resultado ?? null, error: null });
    return base;
  };
  const upsertOriginal = api.upsert;
  api.upsert = (...a: any[]) => envolver(upsertOriginal(...a));
  const insertOriginal = api.insert;
  api.insert = (...a: any[]) => envolver(insertOriginal(...a));
  return api;
}

mock.module("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: { from: (t: string) => consulta(t) },
}));

import {
  chaveAvisoEncaminhamento,
  decidirEntregaAviso,
  precisaAvisoDoChamador,
  type AmbienteAviso,
  type OrigemAviso,
} from "@/lib/atendimento/aviso-encaminhamento";
import {
  avisoDaOperacao,
  conferirAvisoJaEnviado,
  confirmarEnvioAviso,
  lerAviso,
  marcarResultadoIncerto,
  registrarFalhaAviso,
  reservarEnvioAviso,
  resultadoDoRegistro,
} from "@/lib/atendimento/aviso-encaminhamento.server";
import { hashDoTexto } from "@/lib/nina/confidence/hash";
import { selecionarAvaliacaoDaSaida } from "@/lib/nina/confidence/identidade-saida";
import {
  classificarSaida,
  podeExibirPorcentagem,
} from "@/lib/nina/confidence/classificacao-saida";

// ------------------------------------------------------------- apoio do teste

const CLINICA = "clinica-mj";
const CONVERSA = "conversa-mj52";

function origem(over: Partial<OrigemAviso> = {}): OrigemAviso {
  return {
    clinicaId: CLINICA,
    ambiente: "producao",
    conversaId: CONVERSA,
    sessaoId: "sessao-1",
    turnoId: "turno-1",
    ...over,
  };
}

/** Transporte SIMULADO: pode confirmar, falhar ou estourar tempo. */
async function transporteSimulado(
  texto: string,
  modo: "ok" | "falha" | "timeout" = "ok",
): Promise<{ mensagemId: string; transporteId: string }> {
  if (modo === "falha") throw new Error("transporte recusou a mensagem");
  if (modo === "timeout") {
    // O envio PODE ter saído: grava a mensagem e devolve resultado desconhecido.
    bd["whatsapp_mensagens"]!.push({
      id: novoId("msg"),
      clinica_id: CLINICA,
      conversa_id: CONVERSA,
      direction: "out",
      body: texto,
      wa_message_id: null,
      recebida_em: new Date().toISOString(),
    });
    throw new Error("timeout do transporte");
  }
  const id = novoId("msg");
  const wa = novoId("wa");
  bd["whatsapp_mensagens"]!.push({
    id,
    clinica_id: CLINICA,
    conversa_id: CONVERSA,
    direction: "out",
    body: texto,
    wa_message_id: wa,
    recebida_em: new Date().toISOString(),
  });
  return { mensagemId: id, transporteId: wa };
}

/**
 * O ÚNICO responsável pela entrega do aviso: reserva, entrega e confirma.
 * Qualquer caminho (protocolo ou finalização da Nina) passa por aqui.
 */
async function entregarAvisoUnico(args: {
  origem: OrigemAviso;
  protocolo: string | null;
  texto: string;
  modo?: "ok" | "falha" | "timeout";
}) {
  const reserva = await reservarEnvioAviso({
    origem: args.origem,
    protocolo: args.protocolo,
    texto: args.texto,
    textoHash: hashDoTexto(args.texto),
  });
  if (!reserva.reservado) {
    return { enviou: false, decisao: reserva.decisao, registro: reserva.registro };
  }
  // Produção encaminha de verdade; homologação mantém o aviso simbólico.
  if (args.origem.ambiente === "producao") {
    filaHumana.push({ conversaId: args.origem.conversaId, protocolo: args.protocolo });
  }
  try {
    const r = await transporteSimulado(args.texto, args.modo ?? "ok");
    await confirmarEnvioAviso({
      chave: reserva.chave,
      mensagemId: r.mensagemId,
      transporte: "whatsapp",
      transporteId: r.transporteId,
      protocolo: args.protocolo,
      texto: args.texto,
    });
    return { enviou: true, decisao: reserva.decisao, registro: await lerAviso(reserva.chave) };
  } catch (e) {
    const msg = String((e as Error).message);
    if (msg.includes("timeout")) {
      await marcarResultadoIncerto({ chave: reserva.chave, erro: msg, transporte: "whatsapp" });
    } else {
      await registrarFalhaAviso({ chave: reserva.chave, erro: msg, transporte: "whatsapp" });
    }
    return { enviou: false, decisao: reserva.decisao, registro: await lerAviso(reserva.chave) };
  }
}

const bolhasDaConversa = () =>
  bd["whatsapp_mensagens"]!.filter((m) => m.conversa_id === CONVERSA && m.direction === "out");

beforeEach(() => {
  bd["atend_aviso_encaminhamento"] = [];
  bd["whatsapp_mensagens"] = [];
  filaHumana.length = 0;
  seq = 0;
});

// ----------------------------------------------------------------- cenários

describe("MJ-52 · 1. saudação normal", () => {
  it("uma resposta, com avaliação do texto realmente entregue", async () => {
    const texto = "Olá! Sou a Nina, do atendimento. Como posso ajudar?";
    await transporteSimulado(texto);
    const avaliacao = {
      clinicaId: CLINICA,
      conversaId: CONVERSA,
      execucaoId: "exec-1",
      outgoingMessageId: bolhasDaConversa()[0]!.id,
      representacao: "texto_completo",
      textoHash: hashDoTexto(texto),
      score: 92,
    };
    const escolha = selecionarAvaliacaoDaSaida([avaliacao], {
      clinicaId: CLINICA,
      conversaId: CONVERSA,
      execucaoId: "exec-1",
      outgoingMessageId: bolhasDaConversa()[0]!.id,
      representacao: "texto_completo",
      conteudo: texto,
    });
    const classe = classificarSaida({
      carregou: true,
      avisoOperacional: false,
      temAvaliacao: true,
      avaliacaoAplicavel: escolha.suficiente,
      motivoVinculo: escolha.motivo,
    });

    expect(bolhasDaConversa()).toHaveLength(1);
    expect(escolha.motivo).toBe("vinculo_exato");
    expect(classe.classe).toBe("resposta_avaliada");
    expect(podeExibirPorcentagem(classe.classe)).toBe(true);
  });
});

describe("MJ-52 · 2. resposta bloqueada por baixa confiança", () => {
  it("um único aviso final e nenhuma nota emprestada do texto bloqueado", async () => {
    const candidato = "O cardiologista atende toda quarta às 14h."; // texto bloqueado
    const avisoLow = "Não vou seguir com esta resposta agora. Vou chamar um atendente.";
    const avaliacaoDoCandidato = {
      clinicaId: CLINICA,
      conversaId: CONVERSA,
      execucaoId: "exec-2",
      representacao: "texto_completo",
      textoHash: hashDoTexto(candidato),
      score: 31,
    };

    const r = await entregarAvisoUnico({
      origem: origem({ turnoId: "turno-low" }),
      protocolo: null,
      texto: avisoLow,
    });
    // Segunda passagem do mesmo turno (finalização) não gera outra bolha.
    const repetida = await entregarAvisoUnico({
      origem: origem({ turnoId: "turno-low" }),
      protocolo: null,
      texto: avisoLow,
    });

    expect(r.enviou).toBe(true);
    expect(repetida.enviou).toBe(false);
    expect(repetida.decisao).toBe("ja_entregue");
    expect(bolhasDaConversa()).toHaveLength(1);

    // O aviso é operacional: nunca recebe a nota do texto bloqueado.
    const escolha = selecionarAvaliacaoDaSaida([avaliacaoDoCandidato], {
      clinicaId: CLINICA,
      conversaId: CONVERSA,
      execucaoId: "exec-2",
      representacao: "texto_completo",
      conteudo: avisoLow,
    });
    expect(escolha.suficiente).toBe(false);
    const classe = classificarSaida({
      carregou: true,
      avisoOperacional: true,
      temAvaliacao: true,
      avaliacaoAplicavel: false,
      motivoVinculo: escolha.motivo,
    });
    expect(classe.classe).toBe("aviso_operacional");
    expect(podeExibirPorcentagem(classe.classe)).toBe(false);
    // A avaliação do texto bloqueado continua existindo como evidência.
    expect(avaliacaoDoCandidato.score).toBe(31);
  });
});

describe("MJ-52 · 3. encaminhamento com protocolo", () => {
  it("o protocolo vai dentro do aviso único", async () => {
    const protocolo = "2026-000123";
    const texto = `Vou te encaminhar para um atendente. Seu protocolo é ${protocolo}.`;
    const r = await entregarAvisoUnico({ origem: origem(), protocolo, texto });

    expect(r.enviou).toBe(true);
    expect(bolhasDaConversa()).toHaveLength(1);
    expect(bolhasDaConversa()[0]!.body).toContain(protocolo);
    expect((await lerAviso(chaveAvisoEncaminhamento(origem())))?.protocolo).toBe(protocolo);
  });
});

describe("MJ-52 · 4. os dois caminhos antigos acionados juntos", () => {
  it("protocolo entrega e a finalização da Nina cala — sem duplicidade", async () => {
    const protocolo = "2026-000124";
    const texto = `Vou te encaminhar para um atendente. Seu protocolo é ${protocolo}.`;

    // Caminho A — módulo de protocolo/encaminhamento.
    await entregarAvisoUnico({ origem: origem(), protocolo, texto });

    // Caminho B — finalização da Nina consulta a operação antes de falar.
    const jaExistente = await avisoDaOperacao(origem());
    const precisa = precisaAvisoDoChamador(jaExistente);

    expect(jaExistente?.entregue).toBe(true);
    expect(precisa).toBe(false);
    expect(bolhasDaConversa()).toHaveLength(1);
  });
});

describe("MJ-52 · 5. retry e chamadas concorrentes", () => {
  it("três chamadas simultâneas da mesma operação produzem uma mensagem", async () => {
    const texto = "Vou te encaminhar para um atendente.";
    const resultados = await Promise.all([
      entregarAvisoUnico({ origem: origem(), protocolo: null, texto }),
      entregarAvisoUnico({ origem: origem(), protocolo: null, texto }),
      entregarAvisoUnico({ origem: origem(), protocolo: null, texto }),
    ]);
    expect(resultados.filter((r) => r.enviou)).toHaveLength(1);
    expect(bolhasDaConversa()).toHaveLength(1);

    // Retry posterior do MESMO turno também não duplica.
    const retry = await entregarAvisoUnico({ origem: origem(), protocolo: null, texto });
    expect(retry.enviou).toBe(false);
    expect(bolhasDaConversa()).toHaveLength(1);
  });
});

describe("MJ-52 · 6. falha e timeout no envio", () => {
  it("falha conhecida permite nova tentativa e entrega uma única mensagem", async () => {
    const texto = "Vou te encaminhar para um atendente.";
    const primeira = await entregarAvisoUnico({
      origem: origem({ turnoId: "turno-falha" }),
      protocolo: null,
      texto,
      modo: "falha",
    });
    expect(primeira.enviou).toBe(false);
    expect(primeira.registro?.estado).toBe("falhou");
    expect(bolhasDaConversa()).toHaveLength(0);

    const segunda = await entregarAvisoUnico({
      origem: origem({ turnoId: "turno-falha" }),
      protocolo: null,
      texto,
    });
    expect(segunda.enviou).toBe(true);
    expect(segunda.registro?.estado).toBe("confirmado");
    expect(bolhasDaConversa()).toHaveLength(1);
  });

  it("timeout não vira entrega confirmada: confere antes e não duplica", async () => {
    const texto = "Vou te encaminhar para um atendente.";
    const o = origem({ turnoId: "turno-timeout" });
    const r = await entregarAvisoUnico({ origem: o, protocolo: null, texto, modo: "timeout" });

    expect(r.enviou).toBe(false);
    expect(r.registro?.estado).toBe("incerto");
    expect(r.registro?.estado).not.toBe("confirmado");

    // Próxima passagem: conferir antes de reenviar.
    const decisao = decidirEntregaAviso(r.registro ?? null);
    expect(decisao).toBe("verificar_antes_de_reenviar");

    const anterior = await conferirAvisoJaEnviado({
      clinicaId: CLINICA,
      conversaId: CONVERSA,
      texto,
    });
    expect(anterior?.mensagemId).toBeTruthy();
    await confirmarEnvioAviso({
      chave: chaveAvisoEncaminhamento(o),
      mensagemId: anterior!.mensagemId,
      transporte: "whatsapp",
      transporteId: anterior!.transporteId,
      texto,
    });

    expect((await lerAviso(chaveAvisoEncaminhamento(o)))?.estado).toBe("confirmado");
    expect(bolhasDaConversa()).toHaveLength(1);
  });
});

describe("MJ-52 · 7. homologação", () => {
  it("aviso simbólico preservado e nenhuma transferência real", async () => {
    const o = origem({ ambiente: "homologacao" as AmbienteAviso, turnoId: "turno-homolog" });
    const texto = "[simulação] Encaminharia para um atendente humano agora.";
    const r = await entregarAvisoUnico({ origem: o, protocolo: null, texto });

    expect(r.enviou).toBe(true);
    expect(bolhasDaConversa()).toHaveLength(1);
    expect(bolhasDaConversa()[0]!.body).toContain("[simulação]");
    expect(filaHumana).toHaveLength(0); // nenhuma fila real acionada
  });
});

describe("MJ-52 · 8. produção simulada", () => {
  it("estado da transferência e mensagem ao paciente ficam coerentes", async () => {
    const protocolo = "2026-000125";
    const texto = `Vou te encaminhar para um atendente. Seu protocolo é ${protocolo}.`;
    const r = await entregarAvisoUnico({ origem: origem(), protocolo, texto });

    expect(filaHumana).toHaveLength(1);
    expect(filaHumana[0]!.protocolo).toBe(protocolo);
    expect(r.registro?.estado).toBe("confirmado");
    expect(r.registro?.transporteId).toBeTruthy();
    expect(r.registro?.mensagemId).toBe(bolhasDaConversa()[0]!.id);
  });
});

describe("MJ-52 · 9. reset manual durante uma execução", () => {
  it("o retorno atrasado da sessão antiga não entra na nova sessão", async () => {
    const antiga = origem({ sessaoId: "sessao-1", turnoId: "turno-antigo" });
    const nova = origem({ sessaoId: "sessao-2", turnoId: "turno-antigo" });
    expect(chaveAvisoEncaminhamento(antiga)).not.toBe(chaveAvisoEncaminhamento(nova));

    // Operação da sessão antiga chega DEPOIS do reset manual do operador.
    await entregarAvisoUnico({
      origem: antiga,
      protocolo: null,
      texto: "Aviso da sessão anterior.",
    });

    // A nova sessão não reaproveita nada da anterior.
    const naNova = await avisoDaOperacao(nova);
    expect(naNova).toBeNull();
    expect(precisaAvisoDoChamador(naNova)).toBe(true);
    // O histórico anterior continua registrado, sem apagamento.
    expect(await lerAviso(chaveAvisoEncaminhamento(antiga))).not.toBeNull();
    expect(bolhasDaConversa()).toHaveLength(1);
  });
});

describe("MJ-52 · 10. recarregamento da tela", () => {
  it("confiança e detalhes continuam presos à mensagem certa", async () => {
    const resposta = "A consulta de cardiologia custa R$ 250,00.";
    await transporteSimulado(resposta);
    const mensagemId = bolhasDaConversa()[0]!.id;
    const protocolo = "2026-000126";
    const avisoTexto = `Vou te encaminhar para um atendente. Seu protocolo é ${protocolo}.`;
    await entregarAvisoUnico({
      origem: origem({ turnoId: "turno-reload" }),
      protocolo,
      texto: avisoTexto,
    });
    const avisoMensagemId = bolhasDaConversa()[1]!.id;

    const avaliacoes = [
      {
        clinicaId: CLINICA,
        conversaId: CONVERSA,
        execucaoId: "exec-10",
        outgoingMessageId: mensagemId,
        representacao: "texto_completo",
        textoHash: hashDoTexto(resposta),
      },
    ];

    // Duas leituras seguidas (a segunda simula o F5) devem dar o mesmo resultado.
    const ler = (alvoId: string, conteudo: string, aviso: boolean) => {
      const escolha = selecionarAvaliacaoDaSaida(avaliacoes, {
        clinicaId: CLINICA,
        conversaId: CONVERSA,
        execucaoId: "exec-10",
        outgoingMessageId: alvoId,
        representacao: "texto_completo",
        conteudo,
      });
      return classificarSaida({
        carregou: true,
        avisoOperacional: aviso,
        temAvaliacao: avaliacoes.length > 0,
        avaliacaoAplicavel: escolha.suficiente && !aviso,
        motivoVinculo: escolha.motivo,
      }).classe;
    };

    expect(ler(mensagemId, resposta, false)).toBe("resposta_avaliada");
    expect(ler(mensagemId, resposta, false)).toBe("resposta_avaliada");
    expect(ler(avisoMensagemId, avisoTexto, true)).toBe("aviso_operacional");
    expect(ler(avisoMensagemId, avisoTexto, true)).toBe("aviso_operacional");

    // O aviso tem origem e auditoria acessíveis pela operação persistida.
    const registro = await lerAviso(chaveAvisoEncaminhamento(origem({ turnoId: "turno-reload" })));
    const view = resultadoDoRegistro(registro, "producao", true);
    expect(view?.protocolo).toBe(protocolo);
    expect(view?.mensagemId).toBe(avisoMensagemId);
    expect(view?.entregue).toBe(true);
  });
});

describe("MJ-52 · critérios de aceite", () => {
  it("texto alterado depois da avaliação não herda a nota anterior", () => {
    const avaliado = "Atendemos cardiologia às quartas.";
    const entregue = "Atendemos cardiologia às quintas.";
    const escolha = selecionarAvaliacaoDaSaida(
      [
        {
          clinicaId: CLINICA,
          representacao: "texto_completo",
          textoHash: hashDoTexto(avaliado),
        },
      ],
      { clinicaId: CLINICA, representacao: "texto_completo", conteudo: entregue },
    );
    expect(escolha.suficiente).toBe(false);
    expect(escolha.motivo).toBe("conteudo_divergente");
    const classe = classificarSaida({
      carregou: true,
      avisoOperacional: false,
      temAvaliacao: true,
      avaliacaoAplicavel: false,
      motivoVinculo: escolha.motivo,
    });
    expect(classe.classe).toBe("texto_alterado");
    expect(podeExibirPorcentagem(classe.classe)).toBe(false);
  });

  it("nenhuma mensagem histórica é apagada pela coordenação do aviso", async () => {
    bd["whatsapp_mensagens"]!.push({
      id: "historico-1",
      clinica_id: CLINICA,
      conversa_id: CONVERSA,
      direction: "out",
      body: "Aviso duplicado antigo (histórico).",
      recebida_em: "2026-01-01T10:00:00.000Z",
    });
    await entregarAvisoUnico({
      origem: origem({ turnoId: "turno-historico" }),
      protocolo: null,
      texto: "Vou te encaminhar para um atendente.",
    });
    expect(bd["whatsapp_mensagens"]!.some((m) => m.id === "historico-1")).toBe(true);
    expect(bolhasDaConversa()).toHaveLength(2);
  });
});
