/**
 * Processo isolado: roda o `executarWatchdogNina` REAL sobre um lote que a varredura devolveu com
 * `HANDOFF_REQUIRED` (Erro Crítico 01). Banco, encaminhamento e geração são simulados e só registram
 * as chamadas. Cenário em argv[2]: "nina" | "mensagem-nova" | "ja-humano" | "entrega-incerta-viva".
 * Usado por prevencao-erro-critico-01.test.ts.
 */
import { mock } from "bun:test";

const cenario = process.argv[2] ?? "nina";
const CLINICA = "11111111-1111-4111-8111-111111111111";
const CONVERSA = "22222222-2222-4222-8222-222222222222";
const LOTE = "33333333-3333-4333-8333-333333333333";
const TOKEN = "44444444-4444-4444-8444-444444444444";
const registro = {
  finalizar: [] as Array<{ estado: string; erro: string | null }>,
  eventos: [] as string[],
  encaminhamentos: [] as Array<Record<string, unknown>>,
  geracoes: 0,
};

const lote = {
  id: LOTE,
  clinica_id: CLINICA,
  conversa_id: CONVERSA,
  telefone: "5500000000001",
  watchdog_token: TOKEN,
  watchdog_state: "processing",
  watchdog_stage: "generating",
  watchdog_revision: 7,
  attempt_count: 1,
  response_snapshot: null,
  created_at: "2026-09-24T22:57:50.000Z",
  erro_tecnico: "HANDOFF_REQUIRED: GENERATION_OUTCOME_UNKNOWN",
};
const conversa = {
  owner_type: cenario === "ja-humano" ? "HUMAN" : "AI",
  atribuida_user_id: null,
  ai_enabled: true,
  status: "open",
  ultima_msg_em: "2026-09-24T22:57:50.000Z",
  nina_fluxo_estado: { session_id: "sessao-1", session_started_at: "2026-09-24T22:50:00.000Z" },
};
const tabelas: Record<string, unknown[]> = {
  nina_message_batch_itens: [{ mensagem_id: "m-in-1", ordem: 1 }],
  whatsapp_mensagens: [
    {
      id: "m-in-1",
      body: "isso, com a dra na quinta",
      transcricao: null,
      tipo: "text",
      is_teste: false,
      canal: "whatsapp",
      conversa_id: CONVERSA,
      wa_message_id: "wamid-1",
      created_at: lote.created_at,
    },
  ],
  nina_message_batches: [lote],
  nina_batch_entregas: [],
  atend_conversas: [conversa],
};

mock.module("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: {
    async rpc(nome: string, args: Record<string, any>) {
      if (nome === "nina_watchdog_reivindicar") return { data: [lote], error: null };
      if (nome === "nina_revisao_atual")
        return { data: cenario === "mensagem-nova" ? 8 : 7, error: null };
      if (nome === "nina_watchdog_iniciar")
        return { data: { maxAttempts: 3, snapshot: null, stage: "generating" }, error: null };
      if (nome === "nina_watchdog_evento") {
        registro.eventos.push(args._evento);
        return { data: null, error: null };
      }
      if (nome === "nina_watchdog_checkpoint") return { data: true, error: null };
      if (nome === "nina_watchdog_finalizar") {
        registro.finalizar.push({ estado: args._estado, erro: args._erro ?? null });
        lote.watchdog_state = args._estado;
        return { data: true, error: null };
      }
      if (nome === "nina_lock_renovar" || nome === "nina_lock_liberar")
        return { data: true, error: null };
      throw new Error(`RPC inesperada: ${nome}`);
    },
    from(tabela: string) {
      const linhas = tabelas[tabela];
      if (!linhas) throw new Error(`Tabela inesperada: ${tabela}`);
      const q: any = {
        select: () => q,
        eq: () => q,
        in: () => q,
        order: () => q,
        limit: () => q,
        maybeSingle: async () => ({ data: linhas[0] ?? null, error: null }),
        single: async () => ({ data: linhas[0] ?? null, error: null }),
        then: (ok: (r: unknown) => unknown, erro?: (e: unknown) => unknown) =>
          Promise.resolve({ data: linhas, error: null }).then(ok, erro),
      };
      return q;
    },
  },
}));
mock.module("@/lib/atendimento/handoff.server", () => ({
  async encaminharParaHumano(args: Record<string, unknown>) {
    registro.encaminhamentos.push(args);
    conversa.owner_type = "NONE";
    return { ok: true, aviso: { entregue: true, mensagemId: "m-out-frase" } };
  },
  async estadoConversaPorId() {
    return conversa;
  },
  ninaPodeResponder: () => true,
}));
const gerar = async () => {
  registro.geracoes++;
  return {};
};
mock.module("@/lib/nina/whatsapp-processamento.server", () => ({
  processarRespostaWhatsappNina: gerar,
}));
mock.module("@/lib/nina/teste-console.server", () => ({ processarMensagemTeste: gerar }));
mock.module("@/lib/whatsapp.server", () => ({
  loadWhatsAppConfig: async () => ({ access_token: "t", phone_number_id: "p" }),
}));
mock.module("@/lib/nina-desligada.server", () => ({ ninaDesativadaNaClinica: async () => false }));

const { executarWatchdogNina, finalizarWatchdogNina, ErroEntregaWatchdog } =
  await import("../../watchdog.server");
if (cenario === "entrega-incerta-viva") {
  // Processo vivo, mas sem saber se o WhatsApp aceitou a resposta (confirmação perdida).
  tabelas.nina_batch_entregas = [{ estado: "uncertain", parte: "texto", payload: {} }];
  await finalizarWatchdogNina(
    {
      batchId: LOTE,
      lock: { chave: `${CLINICA}:${lote.telefone}`, token: TOKEN },
      snapshot: null,
      maxTentativas: 3,
      checkpoint: async () => {},
      evento: async (nome) => void registro.eventos.push(nome),
      finalizar: async (estado, motivo) =>
        void registro.finalizar.push({ estado, erro: motivo ?? null }),
    },
    new ErroEntregaWatchdog(false, true),
  );
} else await executarWatchdogNina(1);
console.log("DESISTENCIA=" + JSON.stringify(registro));
process.exit(0);
