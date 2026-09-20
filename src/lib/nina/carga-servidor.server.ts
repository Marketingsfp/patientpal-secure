/** Uma requisição autenticada por tarefa. A continuação é persistida no banco. */
import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { cargaServidor } from "./carga-paralela";
import { carregarCargaControlada } from "./carga-controle.server";
import { executarCargaControlada } from "./carga-execucao.server";

export async function confirmarServidorCargaDisponivel(admin: any) {
  const { data, error } = await admin.rpc("nina_carga_servidor_disponivel");
  if (error || data !== true)
    throw new Error(
      "A execução independente do navegador ainda não está disponível. Ative a fila do servidor antes de iniciar o teste.",
    );
}

const tarefaSchema = z
  .object({
    cargaId: z.string().uuid(),
    slot: z.number().int().min(0).max(9),
    token: z.string().uuid(),
  })
  .strict();
type Dependencias = {
  admin: any;
  processar: Parameters<typeof executarCargaControlada>[0]["processar"];
  preparar: (e: {
    admin: any;
    clinicaId: string;
    cargaId: string;
    userId: string;
    podeContinuar: () => Promise<boolean>;
  }) => Promise<any>;
  heartbeatMs?: number;
};

export async function executarJobCarga(request: Request, e: Dependencias): Promise<Response> {
  const recebido = request.headers.get("x-job-token") ?? "";
  if (!recebido || recebido.length > 512) return new Response("Unauthorized", { status: 401 });
  const { data: segredo, error: erroSegredo } = await e.admin
    .from("sistema_job_tokens")
    .select("token")
    .eq("nome", "nina-carga")
    .maybeSingle();
  const a = Buffer.from(recebido),
    b = Buffer.from(segredo?.token ?? "");
  if (erroSegredo || !b.length || a.length !== b.length || !timingSafeEqual(a, b))
    return new Response("Unauthorized", { status: 401 });
  // Não usa clínica, usuário, texto ou URL fornecidos pelo remetente.
  let tarefa: z.infer<typeof tarefaSchema>;
  try {
    const texto = await request.text();
    if (texto.length > 1024) return new Response("Invalid task", { status: 400 });
    tarefa = tarefaSchema.parse(JSON.parse(texto));
  } catch {
    return new Response("Invalid task", { status: 400 });
  }
  const args = { _carga_id: tarefa.cargaId, _slot: tarefa.slot, _token: tarefa.token };
  const { data: assumida, error: erroAssumir } = await e.admin.rpc(
    "nina_carga_servidor_assumir",
    args,
  );
  if (erroAssumir)
    return Response.json({ erro: "CARGA_JOB_RESERVA_INDISPONIVEL" }, { status: 503 });
  if (!assumida) return Response.json({ ignorada: true });

  let vigente = true;
  let fila: Promise<unknown> = Promise.resolve();
  const renovar = async () => {
    const { data, error } = await e.admin.rpc("nina_carga_servidor_renovar", args);
    vigente = !error && data === true;
    return vigente;
  };
  const timer = setInterval(() => {
    fila = fila.then(renovar).catch(() => {
      vigente = false;
    });
  }, e.heartbeatMs ?? 20_000);
  let atraso = 0;
  let falhou = false;
  try {
    // A função SQL já validou o vínculo do criador e devolve somente a clínica persistida.
    const carga = await carregarCargaControlada(e.admin, String(assumida), tarefa.cargaId);
    if (!cargaServidor(carga.config)) throw new Error("CARGA_EXECUTOR_INCOMPATIVEL");
    const entrada = {
      admin: e.admin,
      clinicaId: carga.clinica_id,
      cargaId: carga.id,
      userId: carga.criado_por,
      podeContinuar: async () => vigente && (await renovar()),
    };
    const r =
      carga.status === "preparando"
        ? await e.preparar(entrada)
        : await executarCargaControlada({ ...entrada, processar: e.processar });
    atraso = r.aguardandoRitmo
      ? Math.max(250, r.aguardarMs || 1000)
      : r.ocupado || r.aguardandoDesfecho
        ? 5000
        : 0;
    return Response.json({ status: r.status, enviadas: r.enviadas });
  } catch {
    falhou = true;
    atraso = 5000;
    return Response.json({ erro: "CARGA_JOB_FALHOU" }, { status: 503 });
  } finally {
    clearInterval(timer);
    await fila;
    // A RPC grava a liberação e agenda a próxima chamada na mesma transação.
    // Se cair aqui, o cron recupera a tarefa expirada; não há promessa em segundo plano.
    const { error } = await e.admin.rpc("nina_carga_servidor_finalizar", {
      ...args,
      _aguardar_ms: Math.min(60000, Math.ceil(atraso)),
      _falhou: falhou,
    });
    if (error) console.error("[NINA_CARGA] continuação pendente de recuperação pelo servidor");
  }
}
