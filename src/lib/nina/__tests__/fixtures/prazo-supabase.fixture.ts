/**
 * Processo isolado: carrega o cliente REAL do servidor (`supabaseAdmin`) sem nenhum mock de módulo
 * e intercepta o `fetch` global, para que nenhuma requisição saia da máquina.
 * Imprime se cada requisição levou um AbortSignal (prazo). Usado por prevencao-erro-critico-01.test.ts.
 */
process.env.SUPABASE_URL = "http://127.0.0.1:1";
process.env.SUPABASE_SERVICE_ROLE_KEY = "chave-somente-teste";

const requisicoes: Array<{ caminho: string; comPrazo: boolean }> = [];
globalThis.fetch = (async (entrada: RequestInfo | URL, init?: RequestInit) => {
  const url = new URL(entrada instanceof Request ? entrada.url : String(entrada));
  requisicoes.push({ caminho: url.pathname, comPrazo: init?.signal instanceof AbortSignal });
  return new Response("[]", { status: 200, headers: { "content-type": "application/json" } });
}) as typeof fetch;

const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
// As mesmas formas usadas pelo turno: leitura da agenda e renovação da reserva.
await supabaseAdmin.from("agendamentos").select("id").eq("clinica_id", "clinica-teste");
await supabaseAdmin.rpc("nina_lock_renovar", {
  _chave: "c",
  _token: "t",
  _lease_segundos: 90,
} as never);
console.log("PRAZO_SUPABASE=" + JSON.stringify(requisicoes));
