/** Orquestração comum aos transportes real e homologação; nenhuma IA ou efeito externo aqui. */
import { decidirEspera, montarTurnoPaciente } from "./burst";
import { derivarResponsavel, type ConversaCiclo } from "../atendimento/ciclo-responsabilidade";

export class ErroAgrupamentoNina extends Error {
  readonly codigo = "NINA_AGRUPAMENTO_PENDENTE";
  constructor(
    mensagem: string,
    readonly podeRepetirEntrada = true,
  ) {
    super(mensagem);
    this.name = "ErroAgrupamentoNina";
  }
}
export type EntradaAgrupamento = {
  clinicaId: string;
  telefone: string;
  conversaId?: string | null;
  mensagemId?: string | null;
  textoAtual: string;
  /** Compatibilidade de chamada; nunca é autorização de consumo de mensagens. */
  mensagensFallback?: string[];
  sessaoTeste?: { leadId: string; cicloId: string };
};
export type ReservaTurno = { chave: string; token: string };
export function estadoAutorizaTurno(
  entrada: EntradaAgrupamento,
  estado: {
    conversa: (ConversaCiclo & { id: string }) | null;
    ninaDesativada: boolean;
    lead?: { conversa_id: string | null; ciclo_id: string | null; telefone_sessao: string } | null;
  },
): boolean {
  if (!estado.conversa || estado.ninaDesativada || derivarResponsavel(estado.conversa) !== "NINA")
    return false;
  if (entrada.conversaId && estado.conversa.id !== entrada.conversaId) return false;
  return (
    !entrada.sessaoTeste ||
    Boolean(
      estado.lead &&
      estado.lead.conversa_id === estado.conversa.id &&
      estado.lead.ciclo_id === entrada.sessaoTeste.cicloId &&
      estado.lead.telefone_sessao === entrada.telefone,
    )
  );
}
export type TurnoAgrupado = {
  batchId: string;
  mensagens: string[];
  texto: string;
  lock: ReservaTurno;
  revisao: number;
};
export type DependenciasAgrupamento = {
  registrar: () => Promise<{ batchId: string; revision: number; primeiraMs: number }>;
  adquirir: (batchId: string) => Promise<ReservaTurno | null>;
  validarConversa: () => Promise<boolean>;
  reivindicar: (batchId: string, revision: number, forcar: boolean) => Promise<string[] | null>;
  lerMensagens: (ids: string[]) => Promise<{ id: string; texto: string }[]>;
  lerRevisao: () => Promise<number>;
  iniciar: (batchId: string, lock: ReservaTurno) => Promise<boolean>;
  concluir: (batchId: string, lock: ReservaTurno, motivo: string) => Promise<void>;
  liberar: (lock: ReservaTurno) => Promise<void>;
  esperar?: (ms: number) => Promise<void>;
  agora?: () => number;
};

/** Só devolve turno com lote persistido, mensagens comprovadas e início reservado atomicamente. */
export async function agruparTurnoPersistido(
  entrada: EntradaAgrupamento,
  d: DependenciasAgrupamento,
): Promise<TurnoAgrupado | null> {
  if (!entrada.mensagemId || !entrada.telefone)
    throw new ErroAgrupamentoNina("A entrada precisa estar persistida antes de iniciar a Nina.");
  const registro = await d.registrar();
  if (!registro.batchId)
    throw new ErroAgrupamentoNina(
      "Não foi possível reservar o lote. A mensagem permanece pendente.",
    );
  const { esperaMs, forcar } = decidirEspera((d.agora ?? Date.now)(), registro.primeiraMs);
  await (d.esperar ?? ((ms) => new Promise<void>((r) => setTimeout(r, ms))))(esperaMs);
  const lock = await d.adquirir(registro.batchId);
  if (!lock)
    throw new ErroAgrupamentoNina(
      "A conversa continua ocupada. A entrada permanece no lote para retomada.",
    );
  let entregueAoChamador = false;
  try {
    const revisao = await d.lerRevisao();
    if (!Number.isInteger(revisao) || revisao <= 0)
      throw new ErroAgrupamentoNina(
        "Não foi possível confirmar a revisão da conversa. Nenhuma geração iniciada.",
      );
    const ids = await d.reivindicar(registro.batchId, registro.revision, forcar);
    // Duplicata, lote já consumido ou mensagem mais nova responsável pelo lote.
    if (!ids) return null;
    if (!(await d.validarConversa())) {
      await d.concluir(
        registro.batchId,
        lock,
        "Conversa/sessão mudou enquanto aguardava a trava; nenhuma geração iniciada.",
      );
      return null;
    }
    const mensagens = await d.lerMensagens(ids);
    if (
      !ids.length ||
      mensagens.length !== ids.length ||
      new Set(mensagens.map((m) => m.id)).size !== ids.length
    )
      throw new ErroAgrupamentoNina(
        "Não foi possível comprovar todas as mensagens do lote. Nenhuma geração iniciada.",
      );
    const porId = new Map(mensagens.map((m) => [m.id, m.texto]));
    if (ids.some((id) => !porId.get(id)?.trim()))
      throw new ErroAgrupamentoNina(
        "O lote tem mensagem sem conteúdo recuperável. Nenhuma geração iniciada.",
      );
    if ((await d.lerRevisao()) !== revisao)
      throw new ErroAgrupamentoNina(
        "Chegou uma entrada durante a montagem do lote. A entrada permanece pendente para reagrupar.",
      );
    // O marcador precede modelo/ferramentas. Se o worker morrer depois daqui,
    // recuperação registra incerteza e nunca reproduz automaticamente seus efeitos.
    if (!(await d.iniciar(registro.batchId, lock)))
      throw new ErroAgrupamentoNina("A reserva do lote não autoriza uma nova execução.", false);
    entregueAoChamador = true;
    return {
      batchId: registro.batchId,
      mensagens: ids,
      texto: montarTurnoPaciente(ids.map((id) => porId.get(id)!)),
      lock,
      revisao,
    };
  } finally {
    if (!entregueAoChamador) await d.liberar(lock);
  }
}
