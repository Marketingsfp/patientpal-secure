import { describe, expect, it } from "bun:test";
import { carregarDetalhesMensagem } from "../detalhes-mensagem.server";
import type { RegistroDetalhes } from "../detalhes-mensagem";
import { pacoteMJ55 } from "./fixtures/detalhes-mj55";
import { hashDoTexto } from "../confidence/hash";

type Tabelas = Record<string, RegistroDetalhes[]>;
function banco(tabelas: Tabelas) {
  const consultas: Array<{ tabela: string; filtros: Array<[string, unknown]> }> = [];
  return {
    consultas,
    cliente: {
      from(tabela: string) {
        const registro = { tabela, filtros: [] as Array<[string, unknown]> };
        consultas.push(registro);
        let max = Infinity;
        let unica = false;
        const q = {
          select: () => q,
          eq(chave: string, valor: unknown) {
            registro.filtros.push([chave, valor]);
            return q;
          },
          in(chave: string, valores: unknown[]) {
            registro.filtros.push([chave, valores]);
            return q;
          },
          order: () => q,
          limit(valor: number) {
            max = valor;
            return q;
          },
          maybeSingle() {
            unica = true;
            return q;
          },
          then(resolve: (r: { data: unknown; error: null }) => unknown) {
            const linhas = (tabelas[tabela] ?? [])
              .filter((r) =>
                registro.filtros.every(([k, v]) =>
                  Array.isArray(v) ? v.includes(r[k]) : r[k] === v,
                ),
              )
              .slice(0, max);
            return Promise.resolve(
              resolve({ data: unica ? (linhas[0] ?? null) : linhas, error: null }),
            );
          },
        };
        return q;
      },
    } as unknown as Parameters<typeof carregarDetalhesMensagem>[0],
  };
}

function preparar() {
  const p = structuredClone(pacoteMJ55);
  p.mensagem!.enviada_por = "nina";
  const tabelas: Tabelas = {
    whatsapp_mensagens: [p.mensagem!, ...p.entradas],
    nina_execucoes: [p.execucao!],
    nina_execucao_evidencias: [
      { clinica_id: p.clinicaId, execucao_id: p.execucao!.id, etapas: p.etapas },
    ],
    nina_trace_eventos: p.eventos,
    nina_confianca_decisoes: p.decisoes,
    nina_confianca_vinculos: p.vinculos,
    atend_aviso_encaminhamento: p.avisos,
  };
  return { p, tabelas, ...banco(tabelas) };
}

describe("carregador por mensagem — leitura isolada", () => {
  it("vínculos oficiais conflitantes não escolhem execução nem atribuem nota", async () => {
    const { p, cliente } = preparar();
    p.mensagem!.execucao_id = "outra-execucao";
    const r = await carregarDetalhesMensagem(cliente, { clinicaId: p.clinicaId, mensagemId: String(p.mensagem!.id) });
    expect(r.execucao).toBeNull();
    expect(r.leitura?.avaliacoes).toEqual([]);
    expect(r.leitura?.alertas.some((a) => a.includes("execuções diferentes"))).toBe(true);
  });
  it("aviso sistema legado abre os detalhes pela ligação oficial à mesma mensagem", async () => {
    const { p, cliente } = preparar();
    p.mensagem!.enviada_por = "sistema";
    p.mensagem!.execucao_id = null;
    const r = await carregarDetalhesMensagem(cliente, {
      clinicaId: p.clinicaId, mensagemId: String(p.mensagem!.id),
    });
    expect(r.leitura?.mensagem?.origem).toBe("Aviso do sistema");
    expect(r.leitura?.avaliacoes.some((a) => a.explicacao.includes("não pertence ao aviso"))).toBe(true);
  });
  it("execução isolada não libera inspeção de sistema sem aviso oficial", async () => {
    const { p, tabelas, cliente } = preparar();
    p.mensagem!.enviada_por = "sistema";
    tabelas.atend_aviso_encaminhamento = [];
    await expect(carregarDetalhesMensagem(cliente, {
      clinicaId: p.clinicaId, mensagemId: String(p.mensagem!.id),
    })).rejects.toThrow("oficialmente vinculado");
  });
  it("MJ55: trace ligado à mensagem prevalece sobre traces auxiliares da execução", async () => {
    const { p, tabelas, cliente } = preparar();
    const canonico = String(p.avisos[0]!.turno_id);
    const quantidadeCanonica = p.eventos.length;
    tabelas.nina_trace_eventos.push(
      ...["instructions.published", "prompt.compose"].map((node_id, i) => ({
        id: `auxiliar-${i}`,
        clinica_id: p.clinicaId,
        execution_id: p.execucao!.id,
        trace_id: p.execucao!.id,
        conversation_id: p.mensagem!.conversa_id,
        message_id: null,
        node_id,
        cycle_id: 1,
        event_type: "completed",
        status: "ok",
        started_at: "2026-09-13T17:11:46.500Z",
      })),
    );
    const r = await carregarDetalhesMensagem(cliente, {
      clinicaId: p.clinicaId,
      mensagemId: String(p.mensagem!.id),
    });
    expect(r.traceId).toBe(canonico);
    expect(r.eventos).toHaveLength(quantidadeCanonica);
    expect(r.eventos.every((e) => e.trace_id === canonico)).toBe(true);
    expect(r.eventos.some((e) => e.id === "modelo-inicio")).toBe(true);
    expect(r.leitura?.rodadas).toBe(2);
    expect(r.leitura?.alertas.join(" ")).not.toContain("rastreamentos diferentes");
    expect(r.registrosComplementares?.eventosAuxiliares.map((e) => e.id)).toEqual([
      "auxiliar-0",
      "auxiliar-1",
    ]);
  });

  it("conflitos entre vínculos diretos não são resolvidos pelo trace da execução", async () => {
    const { p, tabelas, cliente } = preparar();
    tabelas.nina_trace_eventos.push({
      ...p.eventos.find((e) => e.node_id === "turn.delivery")!,
      id: "entrega-conflitante",
      trace_id: "outro-trace-direto",
    });
    const r = await carregarDetalhesMensagem(cliente, {
      clinicaId: p.clinicaId,
      mensagemId: String(p.mensagem!.id),
    });
    expect(r.traceId).toBeNull();
    expect(r.eventos).toHaveLength(0);
    expect(r.leitura?.alertas.join(" ")).toContain("vínculos diretos da mensagem");
    expect(
      r.registrosComplementares?.eventosAuxiliares.some((e) => e.id === "entrega-conflitante"),
    ).toBe(true);
    expect(r.leitura?.mensagem?.id).toBe(p.mensagem!.id as string);
  });

  it("consulta apenas a clínica autorizada e retorna a mensagem selecionada", async () => {
    const { p, cliente, consultas } = preparar();
    const r = await carregarDetalhesMensagem(cliente, {
      clinicaId: p.clinicaId,
      mensagemId: String(p.mensagem!.id),
    });
    expect(r.leitura?.mensagem?.id).toBe(p.mensagem!.id as string);
    expect(r.leitura?.mensagem?.texto).toBe(p.mensagem!.body as string);
    expect(r.leitura?.entradas).toEqual(["vcs tem cardiologista?"]);
    expect(
      consultas.every((c) => c.filtros.some(([k, v]) => k === "clinica_id" && v === p.clinicaId)),
    ).toBe(true);
  });

  it("não encontra mensagem de outra clínica", async () => {
    const { p, cliente } = preparar();
    const r = await carregarDetalhesMensagem(cliente, {
      clinicaId: "outra-clinica",
      mensagemId: String(p.mensagem!.id),
    });
    expect(r.leitura).toBeNull();
  });

  it("rejeita conversa ou execução incompatível em vez de misturar atendimentos", async () => {
    const { p, cliente } = preparar();
    const alvo = { clinicaId: p.clinicaId, mensagemId: String(p.mensagem!.id) };
    await expect(
      carregarDetalhesMensagem(cliente, { ...alvo, conversaId: "outra-conversa" }),
    ).rejects.toThrow("não pertence à conversa");
    await expect(
      carregarDetalhesMensagem(cliente, { ...alvo, execucaoId: "outra-execucao" }),
    ).rejects.toThrow("não corresponde à mensagem");
  });

  it("não aceita mensagem de atendente humano como saída da Nina", async () => {
    const { p, cliente } = preparar();
    p.mensagem!.enviada_por = "atendente";
    await expect(
      carregarDetalhesMensagem(cliente, {
        clinicaId: p.clinicaId,
        mensagemId: String(p.mensagem!.id),
      }),
    ).rejects.toThrow("saída da Nina");
  });

  it("preserva avaliação diretamente ligada à mensagem mesmo sem execução", async () => {
    const { p, tabelas, cliente } = preparar();
    p.mensagem!.execucao_id = null;
    tabelas.nina_trace_eventos = [];
    tabelas.nina_confianca_vinculos = [];
    tabelas.atend_aviso_encaminhamento = [];
    tabelas.nina_confianca_decisoes = [
      {
        ...p.decisoes[1],
        execucao_id: null,
        outgoing_message_id: p.mensagem!.id,
        texto_final_hash: hashDoTexto(String(p.mensagem!.body)),
        score: 89,
      },
    ];
    const r = await carregarDetalhesMensagem(cliente, {
      clinicaId: p.clinicaId,
      mensagemId: String(p.mensagem!.id),
    });
    expect(r.execucao).toBeNull();
    expect(r.leitura?.mensagem?.id).toBe(p.mensagem!.id as string);
    expect(r.leitura?.avaliacoes[0]?.titulo).toBe("Confiança desta mensagem");
    expect(r.leitura?.avaliacoes[0]?.nota).toBe(89);
  });

  it("consulta legada por execução não escolhe a última bolha", async () => {
    const { p, cliente } = preparar();
    const r = await carregarDetalhesMensagem(cliente, {
      clinicaId: p.clinicaId,
      execucaoId: String(p.execucao!.id),
    });
    expect(r.leitura?.mensagem).toBeNull();
    expect(r.leitura?.resultado).toContain("Não há mensagem selecionada");
  });
});
