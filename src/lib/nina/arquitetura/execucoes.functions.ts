/**
 * FASE 8 — Busca de execuções reais e leitura sob demanda de um trace.
 *
 * Regras de performance:
 *  - nunca carrega todos os traces ao abrir a tela;
 *  - a lista traz só o resumo (uma query, sem N+1) e é paginada;
 *  - o trace completo só é lido quando a pessoa escolhe uma execução.
 * Regras de segurança: leitura sempre como o próprio usuário (RLS por clínica)
 * e apenas para quem tem a capacidade de execução.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { capacidadesDoPapel } from "./permissoes";
import type { EventoTrace } from "./tracing";

const PAGINA_MAX = 50;

async function podeExecucao(
  supabase: { from: (t: string) => any },
  userId: string,
  clinicaId: string,
): Promise<boolean> {
  const { data } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("clinica_id", clinicaId);
  return (data ?? []).some((p: { role: string }) =>
    capacidadesDoPapel(String(p.role)).includes("arquitetura.execucao"),
  );
}

export type ResumoExecucao = {
  traceId: string;
  executionId: string;
  conversationId: string | null;
  messageId: string | null;
  inicio: string;
  fim: string | null;
  eventos: number;
  comErro: boolean;
};

export type RespostaExecucoes =
  | { permitido: false }
  | { permitido: true; itens: ResumoExecucao[]; pagina: number; temMais: boolean };

const filtros = z.object({
  clinicaId: z.string().uuid(),
  /** Busca livre por trace, execução, conversa ou mensagem. */
  termo: z.string().trim().max(120).optional(),
  de: z.string().datetime().optional(),
  ate: z.string().datetime().optional(),
  somenteErros: z.boolean().optional(),
  pagina: z.number().int().min(0).max(200).optional(),
  tamanho: z.number().int().min(1).max(PAGINA_MAX).optional(),
});

export const listarExecucoes = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => filtros.parse(i))
  .handler(async ({ data, context }): Promise<RespostaExecucoes> => {
    if (!(await podeExecucao(context.supabase as never, context.userId, data.clinicaId))) {
      return { permitido: false };
    }

    const tamanho = data.tamanho ?? 20;
    const pagina = data.pagina ?? 0;
    // Lê só as colunas do resumo, limitado a um teto de eventos por página.
    const teto = tamanho * 60;

    let q = context.supabase
      .from("nina_trace_eventos")
      .select("trace_id,execution_id,conversation_id,message_id,started_at,finished_at,status")
      .eq("clinica_id", data.clinicaId)
      .order("started_at", { ascending: false })
      .limit(teto);

    if (data.de) q = q.gte("started_at", data.de);
    if (data.ate) q = q.lte("started_at", data.ate);
    if (data.termo) {
      const t = data.termo.replace(/[%,]/g, "");
      q = q.or(
        `trace_id.ilike.%${t}%,execution_id.ilike.%${t}%,conversation_id.ilike.%${t}%,message_id.ilike.%${t}%`,
      );
    }

    const { data: linhas, error } = await q;
    if (error) return { permitido: true, itens: [], pagina, temMais: false };

    const porTrace = new Map<string, ResumoExecucao>();
    for (const l of (linhas ?? []) as Array<Record<string, string | null>>) {
      const traceId = String(l["trace_id"]);
      const atual = porTrace.get(traceId);
      const inicio = String(l["started_at"]);
      const erro = l["status"] === "error";
      if (!atual) {
        porTrace.set(traceId, {
          traceId,
          executionId: String(l["execution_id"]),
          conversationId: l["conversation_id"] ?? null,
          messageId: l["message_id"] ?? null,
          inicio,
          fim: l["finished_at"] ?? null,
          eventos: 1,
          comErro: erro,
        });
      } else {
        atual.eventos += 1;
        atual.comErro = atual.comErro || erro;
        if (inicio < atual.inicio) atual.inicio = inicio;
        const fim = l["finished_at"] ?? inicio;
        if (!atual.fim || fim > atual.fim) atual.fim = fim;
      }
    }

    let itens = [...porTrace.values()].sort((a, b) => b.inicio.localeCompare(a.inicio));
    if (data.somenteErros) itens = itens.filter((i) => i.comErro);

    const inicioPagina = pagina * tamanho;
    return {
      permitido: true,
      pagina,
      itens: itens.slice(inicioPagina, inicioPagina + tamanho),
      temMais: itens.length > inicioPagina + tamanho,
    };
  });

export type RespostaTrace =
  | { permitido: false }
  | { permitido: true; eventos: EventoTrace[] };

export const lerExecucao = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({ clinicaId: z.string().uuid(), traceId: z.string().min(1).max(120) }).parse(i),
  )
  .handler(async ({ data, context }): Promise<RespostaTrace> => {
    if (!(await podeExecucao(context.supabase as never, context.userId, data.clinicaId))) {
      return { permitido: false };
    }

    const { data: linhas, error } = await context.supabase
      .from("nina_trace_eventos")
      .select(
        "trace_id,execution_id,conversation_id,message_id,cycle_id,node_id,event_type,started_at,finished_at,duration_ms,status,metadata",
      )
      .eq("clinica_id", data.clinicaId)
      .eq("trace_id", data.traceId)
      .order("started_at", { ascending: true })
      .limit(500);

    if (error) return { permitido: true, eventos: [] };
    return { permitido: true, eventos: (linhas ?? []) as unknown as EventoTrace[] };
  });
