/**
 * PRECEDÊNCIA DO TURNO NO FLUXO NORMAL — regras publicadas x apresentação.
 *
 * Dados fictícios de homologação. Nenhuma mensagem real, nenhum paciente real,
 * nenhuma chamada a modelo, banco ou WhatsApp.
 */
import { describe, expect, it } from "bun:test";
import { montarContexto, removerMensagemAtualDuplicada } from "@/lib/nina/context-builder";
import { comporRequestNina } from "@/lib/nina/prompt-composer";
import { REGRA_SAUDACAO } from "@/lib/nina/prompt/precedencia";
import { resolverPrecedenciaDoTurno } from "@/lib/nina/prompt/precedencia-turno";

/** Texto publicado da versão 6 (escopo whatsapp), como está no banco. */
const TEXTO_V6 = `
TESTE TEMPORÁRIO DE FONTE DO PROMPT — HOMOLOGAÇÃO

Somente quando a mensagem recebida do paciente for EXATAMENTE:

TESTE-ARQUITETURA-9381

responda EXATAMENTE:

ARQUITETURA_CONFIRMADA_9381

Não acrescente saudação, emoji, explicação, pergunta, despedida ou qualquer
outro texto nessa resposta específica.

Esta regra existe exclusivamente para teste em homologação.`;

const base = (over: Partial<Parameters<typeof resolverPrecedenciaDoTurno>[0]> = {}) =>
  resolverPrecedenciaDoTurno({
    textoPublicado: TEXTO_V6,
    escopo: "whatsapp",
    hash: "hash-v6",
    versao: "6",
    ambiente: "homologacao",
    mensagemPaciente: "TESTE-ARQUITETURA-9381",
    saudacaoObrigatoria: true,
    ...over,
  });

describe("precedência do turno — condição aplicável", () => {
  it("dispensa a apresentação quando a regra publicada aplicável proíbe saudação", () => {
    const r = base();
    expect(r.regrasAplicaveis.length).toBeGreaterThan(0);
    expect(r.saudacaoObrigatoria).toBe(false);
    expect(r.saudacaoDispensadaPor).toBeTruthy();
    expect(r.resumo.regras_gerais_suprimidas).toContain(REGRA_SAUDACAO);
    expect(r.contrato).toContain("ARQUITETURA_CONFIRMADA_9381");
  });

  it("mantém a apresentação em mensagem diferente do gatilho", () => {
    const r = base({ mensagemPaciente: "oi, quero marcar uma consulta" });
    expect(r.saudacaoObrigatoria).toBe(true);
    expect(r.saudacaoDispensadaPor).toBeNull();
    // A regra do teste não pode obrigar o marcador fora do gatilho.
    expect(r.contrato).not.toContain("ARQUITETURA_CONFIRMADA_9381");
  });

  it("não aplica a regra fora do ambiente previsto quando o texto o restringe", () => {
    const r = base({ ambiente: "producao" });
    for (const regra of r.regrasAplicaveis) {
      expect(regra.ambiente === "qualquer" || regra.ambiente === "producao").toBe(true);
    }
  });

  it("sessão em andamento: sem apresentação exigida, nada muda", () => {
    const r = base({ saudacaoObrigatoria: false });
    expect(r.saudacaoObrigatoria).toBe(false);
    expect(r.saudacaoDispensadaPor).toBeNull();
  });

  it("sem texto publicado, a regra geral de apresentação continua valendo", () => {
    const r = base({ textoPublicado: "" });
    expect(r.saudacaoObrigatoria).toBe(true);
    expect(r.contrato).toContain(REGRA_SAUDACAO);
  });
});

describe("precedência do turno — instruções adicionais no mesmo contrato", () => {
  it("registra origem, prioridade e motivo da instrução adicional", () => {
    const r = base({
      instrucoesAdicionais: [
        {
          codigo: "ESCLARECIMENTO_PENDENTE",
          origem: "motor de confiabilidade",
          motivo: "pendência de esclarecimento aberta",
          texto: "Retome a pergunta em aberto antes de avançar.",
        },
      ],
    });
    expect(r.contrato).toContain("ESCLARECIMENTO_PENDENTE");
    expect(r.contrato).toContain("motivo: pendência de esclarecimento aberta");
    const vigente = r.resumo.vigentes.find((v) => v.codigo === "ESCLARECIMENTO_PENDENTE");
    expect(vigente?.origem).toBe("motor de confiabilidade");
  });

  it("o contrato entra no system prompt pelo composer, não solto no histórico", () => {
    const r = base();
    const req = comporRequestNina({
      behaviorPrompt: TEXTO_V6,
      runtimeContext: { canal: "whatsapp" } as never,
      contratoPrecedencia: r.contrato,
    });
    expect(req.systemPrompt).toContain("CONTRATO DE PRECEDÊNCIA DESTE TURNO");
    expect(req.contratoPrecedencia).toBe(r.contrato);
  });
});

describe("deduplicação da mensagem atual", () => {
  it("remove pelo ID a mensagem atual já gravada no histórico", () => {
    const { mensagens, removidas } = removerMensagemAtualDuplicada(
      [
        { role: "user", content: "oi", id: "m1" },
        { role: "assistant", content: "olá", id: "m2" },
        { role: "user", content: "quero marcar", id: "m3" },
      ],
      "quero marcar",
      ["m3"],
    );
    expect(removidas).toBe(1);
    expect(mensagens.map((m) => m.id)).toEqual(["m1", "m2"]);
  });

  it("preserva mensagens iguais enviadas em turnos diferentes", () => {
    const ctx = montarContexto({
      systemBlocos: ["sistema"],
      historico: [
        { role: "user", content: "oi", id: "m1" },
        { role: "assistant", content: "olá", id: "m2" },
        { role: "user", content: "oi", id: "m3" },
      ],
      mensagemAtual: "oi",
      idsMensagemAtual: ["m3"],
    });
    const usuarios = ctx.messages.filter((m) => m.role === "user");
    expect(usuarios.length).toBe(2);
    expect(ctx.metricas.mensagens_atuais_deduplicadas).toBe(1);
  });

  it("sem IDs, remove só a última cópia idêntica recém-gravada", () => {
    const ctx = montarContexto({
      systemBlocos: ["sistema"],
      historico: [
        { role: "user", content: "oi" },
        { role: "assistant", content: "olá" },
        { role: "user", content: "oi" },
      ],
      mensagemAtual: "oi",
    });
    expect(ctx.metricas.mensagens_atuais_deduplicadas).toBe(1);
    expect(ctx.messages.filter((m) => m.role === "user").length).toBe(2);
  });
});
