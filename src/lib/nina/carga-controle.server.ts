/** Controle persistente da carga: CAS por revisão e lease com heartbeat. */
import {
  configComControle,
  controleExecucaoCarga,
  estadoControleCarga,
  patchRecuperarCarga,
  LEASE_CARGA_MS,
  HEARTBEAT_CARGA_MS,
  type CargaPersistida,
  type LeaseCarga,
} from "./carga-controle";

export async function carregarCargaControlada(
  admin: any,
  clinicaId: string,
  id: string,
): Promise<CargaPersistida> {
  const { data, error } = await admin
    .from("nina_teste_carga")
    .select("*")
    .eq("clinica_id", clinicaId)
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Teste de carga não encontrado nesta clínica");
  return data;
}

/** O banco compara a revisão na mesma operação que grava; só um concorrente vence. */
export async function atualizarCargaCAS(
  admin: any,
  anterior: CargaPersistida,
  patch: Record<string, unknown>,
): Promise<CargaPersistida | null> {
  const { data, error } = await admin
    .from("nina_teste_carga")
    .update(patch)
    .eq("clinica_id", anterior.clinica_id)
    .eq("id", anterior.id)
    .eq("updated_at", anterior.updated_at)
    .eq("status", anterior.status)
    .eq("cancelar", anterior.cancelar)
    .select("*")
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ?? null;
}

/** Leitura pode encerrar um órfão, mas nunca renova atividade nem repete mensagens. */
export async function recuperarCargaSemAtividade(
  admin: any,
  carga: CargaPersistida,
  agora = Date.now(),
): Promise<CargaPersistida> {
  if (!["preparando", "executando"].includes(carga.status)) return carga;
  const { data, error } = await admin
    .from("nina_teste_carga_amostras")
    .select("created_at")
    .eq("clinica_id", carga.clinica_id)
    .eq("carga_id", carga.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  // Sem conseguir verificar atividade, preserva o teste em vez de declarar órfão.
  if (error) throw new Error(`Não foi possível verificar a atividade do teste: ${error.message}`);
  const atual = { ...carga, ultima_amostra_em: data?.created_at ?? null };
  const patch = patchRecuperarCarga(atual, agora);
  if (!patch) return atual;
  return (
    (await atualizarCargaCAS(admin, carga, patch)) ??
    (await carregarCargaControlada(admin, carga.clinica_id, carga.id))
  );
}

/** Inclui a execução parada cujo processador ainda não terminou. */
export async function cargasQueReservamExecutor(
  admin: any,
  clinicaId: string,
): Promise<CargaPersistida[]> {
  const respostas = await Promise.all([
    admin
      .from("nina_teste_carga")
      .select("*")
      .eq("clinica_id", clinicaId)
      .in("status", ["preparando", "executando"]),
    admin
      .from("nina_teste_carga")
      .select("*")
      .eq("clinica_id", clinicaId)
      .not("config->_execucaoCarga->lease->>token", "is", null),
  ]);
  for (const r of respostas)
    if (r.error)
      throw new Error(`Não foi possível verificar os testes em atividade: ${r.error.message}`);
  const linhas = [
    ...new Map(
      respostas.flatMap((r) => r.data ?? []).map((c: CargaPersistida) => [c.id, c]),
    ).values(),
  ] as CargaPersistida[];
  const atuais = await Promise.all(linhas.map((c) => recuperarCargaSemAtividade(admin, c)));
  return atuais.filter((c) => {
    const estado = estadoControleCarga(c);
    return estado.ativo || estado.ocupado;
  });
}

export function retornoCarga<T extends Record<string, unknown> = Record<string, never>>(
  carga: CargaPersistida,
  extra: T = {} as T,
) {
  const controle = estadoControleCarga(carga);
  return {
    status: carga.status,
    enviadas: Number(carga.enviadas ?? 0),
    total: Number(carga.total_planejado ?? 0),
    ocupado: controle.ocupado,
    erro: controle.erro,
    controle,
    aguardandoRitmo: false,
    aguardarMs: controle.aguardarMs,
    ...extra,
  };
}

export type DonoCarga = {
  token: string;
  ler: () => Promise<CargaPersistida>;
  alterar: (
    patch: Record<string, unknown>,
    indices?: number[],
    proximoDisparoEm?: string,
  ) => Promise<CargaPersistida | null>;
  aindaAtivo: () => Promise<boolean>;
};

/** Nada da operação fica em fire-and-forget; o lease só sai após o trabalho terminar. */
export async function comLeaseCarga<T>(entrada: {
  admin: any;
  carga: CargaPersistida;
  fase: LeaseCarga["fase"];
  executar: (dono: DonoCarga, carga: CargaPersistida) => Promise<T>;
  agora?: () => number;
  heartbeatMs?: number;
}): Promise<{ carga: CargaPersistida; resultado?: T; ocupado: boolean }> {
  const { admin, fase } = entrada;
  const agora = entrada.agora ?? Date.now;
  let carga = await recuperarCargaSemAtividade(admin, entrada.carga, agora());
  const estado = estadoControleCarga(carga, agora());
  if (!estado.podeRetomar) return { carga, ocupado: estado.ocupado };
  const token = crypto.randomUUID();
  const c = controleExecucaoCarga(carga.config);
  const lease: LeaseCarga = {
    token,
    fase,
    heartbeatEm: new Date(agora()).toISOString(),
    expiraEm: new Date(agora() + LEASE_CARGA_MS).toISOString(),
    indices: [],
  };
  const adquirida = await atualizarCargaCAS(admin, carga, {
    config: configComControle(carga.config, { ...c, lease, erro: null, motivo: null }),
  });
  if (!adquirida)
    return {
      carga: await carregarCargaControlada(admin, carga.clinica_id, carga.id),
      ocupado: true,
    };
  carga = adquirida;
  let perdeu = false;
  let renovacaoIncerta = false;
  let fila: Promise<unknown> = Promise.resolve();
  const ler = () => carregarCargaControlada(admin, carga.clinica_id, carga.id);
  const alterar = (
    patch: Record<string, unknown>,
    indices?: number[],
    proximoDisparoEm?: string,
  ): Promise<CargaPersistida | null> => {
    const proxima = fila.then(async () => {
      for (let tentativa = 0; tentativa < 3; tentativa++) {
        const atual = await ler();
        const controle = controleExecucaoCarga(atual.config);
        if (perdeu || controle.lease?.token !== token) {
          perdeu = true;
          return null;
        }
        const l = {
          ...controle.lease,
          heartbeatEm: new Date(agora()).toISOString(),
          expiraEm: new Date(agora() + LEASE_CARGA_MS).toISOString(),
          ...(indices ? { indices } : {}),
        };
        // Cancelamento é definitivo. Só métricas/resultado do trabalho já iniciado podem chegar depois.
        const preservado =
          atual.cancelar || !["preparando", "executando"].includes(atual.status)
            ? {
                ...patch,
                status: atual.status,
                cancelar: atual.cancelar,
                finalizado_em: atual.finalizado_em,
              }
            : patch;
        const salvo = await atualizarCargaCAS(admin, atual, {
          ...preservado,
          config: configComControle(atual.config, {
            ...controle,
            lease: l,
            ...(proximoDisparoEm ? { proximoDisparoEm } : {}),
          }),
        });
        if (!salvo) {
          // A revisão pode ter mudado por uma parada externa. Releia o token
          // antes de distinguir disputa de revisão de perda real da reserva.
          renovacaoIncerta = true;
          continue;
        }
        carga = salvo;
        renovacaoIncerta = false;
        return salvo;
      }
      return null;
    });
    fila = proxima.catch(() => {
      // Uma indisponibilidade transitória não desliga futuros heartbeats.
      // Até uma renovação comprovada, nenhuma nova mensagem é iniciada.
      renovacaoIncerta = true;
    });
    return proxima;
  };
  const dono: DonoCarga = {
    token,
    ler,
    alterar,
    aindaAtivo: async () => {
      const atual = await ler();
      return (
        !perdeu &&
        !renovacaoIncerta &&
        !atual.cancelar &&
        ["preparando", "executando"].includes(atual.status) &&
        controleExecucaoCarga(atual.config).lease?.token === token
      );
    },
  };
  const timer = setInterval(() => {
    void alterar({}).catch(() => {
      // `fila` registra a incerteza; o próximo heartbeat tenta novamente.
    });
  }, entrada.heartbeatMs ?? HEARTBEAT_CARGA_MS);
  let resultado: T | undefined;
  let falha: string | null = null;
  try {
    resultado = await entrada.executar(dono, carga);
  } catch (e) {
    falha = String(e instanceof Error ? e.message : e).slice(0, 500);
  } finally {
    clearInterval(timer);
    await fila;
    for (let tentativa = 0; tentativa < 3; tentativa++) {
      const atual = await ler();
      const controle = controleExecucaoCarga(atual.config);
      carga = atual;
      if (controle.lease?.token !== token) break;
      const final = await atualizarCargaCAS(admin, atual, {
        ...(falha && ["preparando", "executando"].includes(atual.status)
          ? { status: "erro", cancelar: true, finalizado_em: new Date(agora()).toISOString() }
          : {}),
        config: configComControle(atual.config, {
          ...controle,
          lease: null,
          ...(falha
            ? { motivo: "FALHA_EXECUTOR", erro: falha, indicesIncertos: controle.lease.indices }
            : {}),
        }),
      });
      if (final) {
        carga = final;
        break;
      }
      // Parar pode disputar a revisão entre leitura e liberação. Releia,
      // preserve a parada e libere somente o token deste executor terminado.
    }
    carga = await ler();
  }
  return { carga, resultado, ocupado: estadoControleCarga(carga, agora()).ocupado };
}

/** Usa a trava persistente existente, com namespace que não é telefone de paciente. */
export async function comLockCriacaoCarga<T>(
  admin: any,
  clinicaId: string,
  executar: () => Promise<T>,
): Promise<T> {
  const chave = `${clinicaId}:nina-carga-criacao`;
  const { data, error } = await admin.rpc("nina_lock_adquirir", {
    _chave: chave,
    _clinica_id: clinicaId,
    _lease_segundos: 90,
  });
  if (error) throw new Error(`Não foi possível reservar a criação do teste: ${error.message}`);
  const token = Array.isArray(data) ? data[0] : data;
  if (!token)
    throw new Error(
      "Outro operador está criando um teste nesta clínica. Atualize a lista antes de tentar novamente.",
    );
  try {
    return await executar();
  } finally {
    const r = await admin.rpc("nina_lock_liberar", { _chave: chave, _token: token });
    if (r.error) console.warn("[NINA_CARGA] falha ao liberar criação", r.error.message);
  }
}
