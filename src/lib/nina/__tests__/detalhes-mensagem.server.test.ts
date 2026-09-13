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
