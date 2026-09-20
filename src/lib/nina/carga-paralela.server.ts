/** Reservas por lead. Cada chamada executa um único pipeline, em sua própria requisição. */
import type { CargaPersistida } from "./carga-controle";
import {
  atualizarCargaCAS,
  carregarCargaControlada,
  type DonoCarga,
} from "./carga-controle.server";
import { lerAmostrasCarga, totaisAmostrasCarga, type ItemCarga } from "./carga-itens.server";
import {
  controleParalelo,
  intervaloDisparoParalelo,
  limiteParalelo,
  reservasVivas,
  LEASE_PARALELA_MS,
  type ControleParalelo,
} from "./carga-paralela";

type Entrada = {
  admin: any;
  carga: CargaPersistida;
  agora?: () => number;
  heartbeatMs?: number;
  executar: (dono: DonoCarga, carga: CargaPersistida) => Promise<void>;
};

export async function comReservaParalela(e: Entrada) {
  const agora = e.agora ?? Date.now;
  const ler = () => carregarCargaControlada(e.admin, e.carga.clinica_id, e.carga.id);
  let carga = e.carga;
  const token = crypto.randomUUID();
  let indice: number | null = null;
  // CAS reserva metadados; nenhuma chamada ao modelo ocorre sob uma trava global.
  for (let tentativa = 0; tentativa < 40; tentativa++) {
    carga = await ler();
    if (carga.status !== "executando" || carga.cancelar) return { carga, ocupado: false };
    const c = controleParalelo(carga.config);
    const vivas = reservasVivas(c, agora());
    if (vivas.length >= limiteParalelo(carga.config) || agora() < c.proximoDisparo)
      return { carga, ocupado: true };
    const amostras = await lerAmostrasCarga(e.admin, carga);
    const concluidos = new Set(amostras.map((a) => a.indice));
    const totais = totaisAmostrasCarga(amostras);
    const plano = carga.plano as ItemCarga[];
    if (plano.every((p) => concluidos.has(p.indice))) {
      const salva = await atualizarCargaCAS(e.admin, carga, {
        ...totais,
        status: "concluido",
        finalizado_em: new Date(agora()).toISOString(),
      });
      if (salva) return { carga: salva, ocupado: vivas.length > 0 };
      continue;
    }
    // O executor comum verifica orçamento/prazo antes de gerar, depois de conciliar
    // entradas existentes. Um resultado já entregue ainda pode ser registrado.
    const vistos = new Set(vivas.map((r) => r.leadId));
    const item = plano.find((p) => {
      if (concluidos.has(p.indice) || vistos.has(p.leadId)) return false;
      vistos.add(p.leadId); // Nunca pula uma pendência para enviar a próxima do mesmo lead.
      return (c.tempos[p.indice]?.retomarApos ?? 0) <= agora();
    });
    if (!item) return { carga, ocupado: true };
    const inicio = agora();
    const reserva = {
      token,
      indice: item.indice,
      leadId: item.leadId,
      inicio,
      expira: inicio + LEASE_PARALELA_MS,
    };
    const novo: ControleParalelo = {
      ...c,
      reservas: { ...Object.fromEntries(vivas.map((r) => [r.token, r])), [token]: reserva },
      tempos: {
        ...c.tempos,
        [item.indice]: c.tempos[item.indice] ?? { leadId: item.leadId, reservadoEm: inicio },
      },
      proximoDisparo: inicio + intervaloDisparoParalelo(carga.config),
      pico: Math.max(c.pico, vivas.length + 1),
    };
    const salva = await atualizarCargaCAS(e.admin, carga, {
      ...totais,
      config: { ...(carga.config as any), _cargaParalela: novo },
    });
    if (salva) {
      carga = salva;
      indice = item.indice;
      break;
    }
  }
  if (indice === null) return { carga: await ler(), ocupado: true };
  const reservado = indice;
  let fila: Promise<unknown> = Promise.resolve();
  let incerto = false;
  let liberando = false;
  let falha: string | null = null;
  const alterar: DonoCarga["alterar"] = (patch, indices, _proximoDisparo) => {
    const proxima = fila.then(async () => {
      for (let tentativa = 0; tentativa < 40; tentativa++) {
        const atual = await ler();
        const c = controleParalelo(atual.config);
        const r = c.reservas[token];
        if (!r || r.indice !== reservado) return null;
        const amostras = await lerAmostrasCarga(e.admin, atual);
        const terminou = amostras.some((a) => a.indice === reservado);
        const tempos = { ...c.tempos };
        const tempo = { ...tempos[reservado]! };
        if (indices?.length && tempo.iniciadoEm == null) tempo.iniciadoEm = agora();
        if (terminou && tempo.finalizadoEm == null) tempo.finalizadoEm = agora();
        if (liberando && !terminou) tempo.retomarApos = agora() + 5000;
        if (liberando) tempo.falhas = falha ? (tempo.falhas ?? 0) + 1 : 0;
        if (typeof patch.retriesDoItem === "number")
          tempo.retries = Math.max(0, patch.retriesDoItem);
        tempos[reservado] = tempo;
        const reservas = { ...c.reservas, [token]: { ...r, expira: agora() + LEASE_PARALELA_MS } };
        if (liberando) delete reservas[token];
        const todos = (atual.plano as ItemCarga[]).every((p) =>
          amostras.some((a) => a.indice === p.indice),
        );
        // Recalcula após a leitura da revisão: resultados concorrentes não perdem contadores.
        const total = totaisAmostrasCarga(amostras);
        const erroFatal = falha && (falha.startsWith("Lead ") || (tempo.falhas ?? 0) >= 3);
        const status =
          atual.cancelar || atual.status !== "executando"
            ? atual.status
            : erroFatal
              ? "erro"
              : patch.status === "parado"
                ? "parado"
                : todos
                  ? "concluido"
                  : "executando";
        const salva = await atualizarCargaCAS(e.admin, atual, {
          ...total,
          retries: Object.values(tempos).reduce((n, t) => n + (t.retries ?? 0), 0),
          status,
          cancelar: atual.cancelar || patch.cancelar === true || !!erroFatal,
          ...(status !== "executando" && !atual.finalizado_em
            ? { finalizado_em: new Date(agora()).toISOString() }
            : {}),
          config: {
            ...(atual.config as any),
            _cargaParalela: { ...c, reservas, tempos, erro: erroFatal ? falha : c.erro },
          },
        });
        if (salva) {
          incerto = false;
          return salva;
        }
      }
      throw new Error("CARGA_RESERVA_EM_DISPUTA: atualize para retomar.");
    });
    fila = proxima.catch(() => {
      incerto = true;
    });
    return proxima;
  };
  const dono: DonoCarga = {
    token,
    ler,
    alterar,
    aindaAtivo: async () => {
      const atual = await ler();
      const reserva = controleParalelo(atual.config).reservas[token];
      return (
        !incerto &&
        !atual.cancelar &&
        atual.status === "executando" &&
        !!reserva &&
        agora() < reserva.expira
      );
    },
  };
  const timer = setInterval(() => {
    void alterar({}).catch(() => undefined);
  }, e.heartbeatMs ?? 20_000);
  try {
    await e.executar(dono, { ...carga, indiceReservado: reservado });
  } catch (erro) {
    // O item permanece conciliável pela chave física; não repete uma entrada aceita.
    falha = String(erro instanceof Error ? erro.message : erro).slice(0, 500);
    throw erro;
  } finally {
    clearInterval(timer);
    await fila;
    liberando = true;
    await alterar({});
  }
  return { carga: await ler(), ocupado: false };
}
