import { normalizarConfig, PERFIS, type ConfigCarga } from "@/lib/nina/carga";
import { validarPlanoCarga, type PlanoCarga } from "@/lib/nina/carga-planejamento";

export type RascunhoCarga = {
  modo: "ia" | "manual" | "profissional";
  pedido: string;
  config: ConfigCarga;
  cenariosManuais: string;
  usarLuna: boolean;
  plano: PlanoCarga | null;
  planoValido: boolean;
  clinicaPlano: string | null;
  pedidoPlanejado: string | null;
};

export function novoRascunhoCarga(): RascunhoCarga {
  return {
    modo: "ia",
    pedido: "",
    config: { ...PERFIS.leve, retriesMax: 0 },
    cenariosManuais: "Quero saber sobre cardiologia\nQuero saber o preço de uma ultrassonografia",
    usarLuna: true,
    plano: null,
    planoValido: false,
    clinicaPlano: null,
    pedidoPlanejado: null,
  };
}

/** Alterar a solicitação invalida o disparo, preservando o plano editado. */
export function alterarPedidoCarga(r: RascunhoCarga, pedido: string): RascunhoCarga {
  return { ...r, pedido, planoValido: pedido === r.pedido ? r.planoValido : false };
}

export function planoDaClinicaAtual(r: RascunhoCarga, clinicaId: string): boolean {
  return Boolean(
    r.plano &&
    r.planoValido &&
    r.clinicaPlano === clinicaId &&
    r.pedidoPlanejado === r.pedido.trim(),
  );
}

export function configuracaoManual(r: RascunhoCarga): ConfigCarga {
  return normalizarConfig({
    ...r.config,
    retriesMax: 0,
    distribuicao: r.cenariosManuais
      .split("\n")
      .map((cenario) => cenario.trim())
      .filter(Boolean)
      .map((cenario) => ({ cenario, peso: 1 })),
  });
}

export type ProfissionalBateriaUI = {
  id: string;
  nome: string;
  vagas: number | null;
  vinculadoAgenda: boolean;
  ultimoTeste: { em: string; resultado: string } | null;
  consultas: {
    consulta: string;
    especialidade: string | null;
    dinheiro: string | null;
    pixCartao: string | null;
    modalidade: string;
    esperado: string;
    esperadoRotulo: string;
  }[];
};

/** Cenários que a seleção gera: cada consulta publicada × variações de paciente. */
export function cenariosDaSelecao(
  profissionais: ProfissionalBateriaUI[],
  selecionados: ReadonlySet<string>,
  variacoes: number,
): number {
  return profissionais
    .filter((p) => selecionados.has(p.id))
    .reduce((n, p) => n + p.consultas.length * variacoes, 0);
}

/** Próximo lote: profissionais ainda não testados, na ordem, sem passar do limite de cenários. */
export function proximoLoteBateria(
  profissionais: ProfissionalBateriaUI[],
  variacoes: number,
  limite: number,
): string[] {
  const lote: string[] = [];
  let cenarios = 0;
  for (const p of profissionais) {
    const custo = p.consultas.length * variacoes;
    if (p.ultimoTeste || !custo || cenarios + custo > limite) continue;
    lote.push(p.id);
    cenarios += custo;
  }
  return lote;
}

/** A prévia limpa linhas vazias sem modificar o texto que está sendo digitado. */
export function revisarPlanoCarga(plano: PlanoCarga, config: ConfigCarga): PlanoCarga {
  const linhas = (valores: string[]) => valores.map((v) => v.trim()).filter(Boolean);
  return validarPlanoCarga({
    ...plano,
    config: { ...config, retriesMax: 0 },
    cenarios: plano.cenarios.map((c) => ({
      ...c,
      mensagens: linhas(c.mensagens),
      verificacoes: linhas(c.verificacoes),
    })),
  });
}

export type ControleCarga = {
  servidor?: boolean;
  paralela?: boolean;
  concorrencia?: number;
  ativo: boolean;
  ocupado: boolean;
  podeRetomar: boolean;
  recuperada?: boolean;
  motivo?: string | null;
  erro?: string | null;
  ultimaAtividadeEm?: string | null;
  leaseExpiraEm?: string | null;
  proximoDisparoEm?: string | null;
  aguardarMs?: number;
};
export type CargaPersistida = {
  id: string;
  nome: string;
  status: string;
  enviadas: number;
  total_planejado: number;
  controle?: ControleCarga;
  config?: unknown;
};
export const cargaAtiva = (c: CargaPersistida) =>
  Boolean(
    c.controle?.ocupado || (c.controle?.ativo ?? ["preparando", "executando"].includes(c.status)),
  );

/** Invalida continuações assíncronas após parar, desmontar ou mudar a clínica. */
export function criarControleLocalCarga() {
  let geracao = 0;
  return {
    iniciar() {
      const token = ++geracao;
      return () => token === geracao;
    },
    interromper() {
      geracao++;
    },
  };
}

export type ProgressoCarga = {
  status: string;
  ocupado?: boolean;
  pronto?: boolean;
  prontos?: number;
  total?: number;
  erro?: string | null;
  aguardarMs?: number;
  aguardandoRitmo?: boolean;
  aguardandoDesfecho?: boolean;
  controle?: ControleCarga;
};

/** Espera de ritmo cancelável, sem bloquear o encerramento ou a troca de clínica. */
export async function aguardarCargaLocal(ms: number, vigente: () => boolean): Promise<void> {
  const fim = Date.now() + Math.max(0, ms);
  while (vigente() && Date.now() < fim) {
    await new Promise((resolve) => setTimeout(resolve, Math.min(250, fim - Date.now())));
  }
}

function esperaDoControle(c: CargaPersistida): number {
  const data = c.controle?.proximoDisparoEm ? Date.parse(c.controle.proximoDisparoEm) : NaN;
  const espera = Number.isFinite(data) ? data - Date.now() : (c.controle?.aguardarMs ?? 0);
  return Number.isFinite(espera) ? Math.max(0, Math.min(60000, espera)) : 0;
}

/** A UI só pede lotes enquanto o mesmo ciclo local continua autorizado. */
export async function conduzirCargaLocal(e: {
  vigente: () => boolean;
  ler: () => Promise<CargaPersistida>;
  preparar: () => Promise<ProgressoCarga>;
  executar: () => Promise<ProgressoCarga>;
  progresso: (r: ProgressoCarga) => void;
  aguardar?: (ms: number, vigente: () => boolean) => Promise<void>;
}): Promise<string> {
  if (!e.vigente()) return "interrompido";
  let carga = await e.ler();
  while (e.vigente() && cargaAtiva(carga)) {
    // O navegador apenas observa cargas novas. A fila já foi criada na transação de Iniciar.
    if (carga.controle?.servidor) return "servidor";
    if (carga.status === "executando" && carga.controle?.paralela)
      return conduzirCargaParalelaLocal(e, carga.controle.concorrencia ?? 1);
    // Uma página recarregada não disputa o lote vivo de outra página.
    if (carga.controle?.ocupado || carga.controle?.podeRetomar === false) return "ocupado";
    const espera = esperaDoControle(carga);
    if (espera > 0) {
      await (e.aguardar ?? aguardarCargaLocal)(espera, e.vigente);
      if (!e.vigente()) return "interrompido";
      carga = await e.ler();
      continue;
    }
    const r = await (carga.status === "preparando" ? e.preparar() : e.executar());
    if (!e.vigente()) return "interrompido";
    e.progresso(r);
    carga = await e.ler();
    if (!e.vigente()) return "interrompido";
    if (r.ocupado) return "ocupado";
    if (r.erro) return carga.status;
    // Compatível com a resposta de pacing mesmo se a leitura seguinte não trouxer o campo.
    if (r.aguardandoRitmo && r.aguardarMs && esperaDoControle(carga) === 0) {
      await (e.aguardar ?? aguardarCargaLocal)(Math.min(60000, r.aguardarMs), e.vigente);
      if (!e.vigente()) return "interrompido";
      carga = await e.ler();
    }
  }
  return e.vigente() ? carga.status : "interrompido";
}

/** Cada trabalhador chama uma server function independente; não há barreira entre rodadas. */
export async function conduzirCargaParalelaLocal(
  e: Parameters<typeof conduzirCargaLocal>[0],
  concorrencia: number,
): Promise<string> {
  let status = "executando";
  let falha: unknown = null;
  const vigente = () => e.vigente() && status === "executando" && !falha;
  const trabalhador = async () => {
    while (vigente()) {
      try {
        const r = await e.executar();
        if (!e.vigente()) return;
        e.progresso(r);
        if (r.status !== "executando") {
          status = r.status;
          return;
        }
        if (r.erro) throw new Error(r.erro);
        if (r.ocupado || r.aguardandoDesfecho || r.aguardandoRitmo)
          await (e.aguardar ?? aguardarCargaLocal)(
            Math.max(250, Math.min(60000, r.aguardarMs || 1000)),
            vigente,
          );
      } catch (erro) {
        falha = erro;
      }
    }
  };
  // Aguarda as chamadas iniciadas inclusive ao cancelar ou perder conexão.
  await Promise.allSettled(
    Array.from({ length: Math.max(1, Math.min(10, concorrencia)) }, trabalhador),
  );
  if (falha) throw falha;
  return e.vigente() ? status : "interrompido";
}
