import { nomeContato } from "./rotulo-conversa";
/**
 * Central de Atenção — regras puras.
 *
 * Combina as filas global e individuais pelo estado real das conversas com
 * o mapa de espera da Inbox. Não altera atribuição, presença ou capacidade.
 */
import { faixaEsperaAtd, minutosDesde } from "./espera";

/** Filtros/ações que a Central dispara na Inbox (sem trocar de página). */
export const EVENTO_FILTRAR_ESPERA_CRITICA = "nina:filtrar-espera-critica";
export const FILTRO_ESPERA_CRITICA_KEY = "nina.inbox.filtrar-espera-critica";
export const EVENTO_ABRIR_CONVERSA = "nina:abrir-conversa";
export const ABRIR_CONVERSA_KEY = "nina.inbox.abrir-conversa";
/**
 * Mensagem específica que deve ficar visível ao abrir a conversa (id interno
 * da mensagem). Usada pelo "Ver conversa" de um erro reportado: só nesse caso
 * a Inbox posiciona o histórico na mensagem em vez de abrir no fim.
 */
export const ABRIR_MENSAGEM_KEY = "nina.inbox.abrir-mensagem";

/**
 * Pede à Inbox que abra uma conversa (e, opcionalmente, posicione o histórico
 * numa mensagem). Funciona vindo de outra página (guarda o pedido) e com a
 * Inbox já aberta (evento imediato). Não altera responsável, fila nem status.
 */
export function pedirAbrirConversa(pedido: { conversaId: string; mensagemId?: string | null }) {
  if (typeof window === "undefined") return;
  const { conversaId, mensagemId } = pedido;
  try {
    window.sessionStorage.setItem(ABRIR_CONVERSA_KEY, conversaId);
    if (mensagemId) window.sessionStorage.setItem(ABRIR_MENSAGEM_KEY, mensagemId);
    else window.sessionStorage.removeItem(ABRIR_MENSAGEM_KEY);
  } catch {
    /* sem armazenamento: o evento abaixo ainda atende a Inbox já montada */
  }
  window.dispatchEvent(
    new CustomEvent(EVENTO_ABRIR_CONVERSA, {
      detail: { id: conversaId, mensagemId: mensagemId ?? null },
    }),
  );
}

export type CategoriaAtencao =
  | "nao_atribuida"
  | "nao_atribuida_global"
  | "nao_atribuida_individual"
  | "critica"
  | "aguardando";

/** Estado da conversa usado para distinguir fila individual e global. */
export interface LinhaFila {
  id: string;
  contato_nome?: string | null;
  whatsapp_profile_name?: string | null;
  contato_telefone?: string | null;
  handoff_motivo?: string | null;
  handoff_resumo?: string | null;
  atribuida_user_id?: string | null;
  atendente_nome?: string | null;
  fila_pendente?: boolean;
  owner_type?: string | null;
  status?: string | null;
}

export function tipoFilaAtencao(c: LinhaFila): "individual" | "global" | null {
  if (c.status === "closed" || c.status === "finished" || c.owner_type === "AI") return null;
  if (!c.atribuida_user_id) return "global";
  return c.fila_pendente === true ? "individual" : null;
}

export interface ItemAtencao {
  id: string;
  nome: string;
  categoria: CategoriaAtencao;
  /** Minutos de espera do paciente (0 quando só falta responsável). */
  minutos: number;
  naoAtribuida: boolean;
  /** Espera do paciente já na faixa crítica (mesma fonte do Tempo de Espera). */
  critica: boolean;
  /** Paciente falou por último e a clínica ainda não respondeu. */
  aguardandoResposta: boolean;
  atendenteId?: string | null;
  atendenteNome?: string | null;
}

export interface FilaIndividualAtencao {
  atendenteId: string;
  nome: string;
  total: number;
}

export interface PausaAtencao {
  atendenteId: string;
  nome: string;
  inicio: string | null;
}

export interface ResumoAtencao {
  /** Conversas únicas que precisam de ação (não atribuídas ∪ espera crítica). */
  total: number;
  naoAtribuidas: number;
  naoAtribuidasGlobal: number;
  filasIndividuais: FilaIndividualAtencao[];
  criticas: number;
  /** Todo paciente aguardando resposta da clínica (inclui os críticos). */
  aguardando: number;
  itens: ItemAtencao[];
  nivel: 0 | 1 | 2 | 3;
}

export function nivelAtencao(total: number): 0 | 1 | 2 | 3 {
  if (total <= 0) return 0;
  if (total >= 10) return 3;
  if (total >= 5) return 2;
  return 1;
}

export function calcularAtencao(args: {
  /** Filas visíveis ao perfil: global sem responsável e individuais pendentes. */
  naoAtribuidas: LinhaFila[];
  /** Para atendentes: só o total global, sem expor detalhes de conversas alheias. */
  globalSemDetalhes?: number;
  /** conversaId -> instante da 1ª mensagem do paciente ainda sem resposta. */
  espera: Record<string, string>;
  /** Nomes conhecidos das conversas (Inbox). */
  nomes?: Record<string, string | null | undefined>;
  agora?: number;
  limiteItens?: number;
}): ResumoAtencao {
  const agora = args.agora ?? Date.now();
  const nomes = { ...(args.nomes ?? {}) };
  const fila = [
    ...new Map(
      args.naoAtribuidas.filter((c) => tipoFilaAtencao(c) !== null).map((c) => [c.id, c]),
    ).values(),
  ];
  const porConversa = new Map(fila.map((c) => [c.id, c]));
  const individuais = new Map<string, FilaIndividualAtencao>();
  const globalSemDetalhes = Math.max(0, args.globalSemDetalhes ?? 0);
  let naoAtribuidasGlobal = globalSemDetalhes;
  for (const c of fila) {
    if (tipoFilaAtencao(c) === "global") {
      naoAtribuidasGlobal += 1;
    } else if (c.atribuida_user_id) {
      const grupo = individuais.get(c.atribuida_user_id) ?? {
        atendenteId: c.atribuida_user_id,
        nome: c.atendente_nome?.trim() || "Atendente sem nome",
        total: 0,
      };
      grupo.total += 1;
      individuais.set(c.atribuida_user_id, grupo);
    }
  }
  // Identidade do contato WhatsApp — nunca o cadastro de paciente.
  for (const c of fila) {
    const n = nomeContato(c);
    if (n) nomes[c.id] = n;
  }

  const idsNaoAtribuidas = new Set(fila.map((c) => c.id));
  const idsCriticas = new Set<string>();
  let aguardando = 0;

  for (const [id, desde] of Object.entries(args.espera)) {
    if (!desde) continue;
    aguardando += 1;
    if (faixaEsperaAtd(minutosDesde(desde, agora)) === "critico") idsCriticas.add(id);
  }

  // Uma conversa não atribuída E crítica conta uma única vez no total.
  const unicas = new Set<string>([...idsNaoAtribuidas, ...idsCriticas]);

  const idsDetalhe = new Set<string>([...unicas, ...Object.keys(args.espera)]);
  const itens: ItemAtencao[] = [];
  for (const id of idsDetalhe) {
    const desde = args.espera[id];
    const minutos = desde ? minutosDesde(desde, agora) : 0;
    const naoAtribuida = idsNaoAtribuidas.has(id);
    const critica = idsCriticas.has(id);
    const categoria: CategoriaAtencao = naoAtribuida
      ? "nao_atribuida"
      : critica
        ? "critica"
        : "aguardando";
    itens.push({
      id,
      nome: nomes[id] || "Sem nome",
      categoria,
      minutos,
      naoAtribuida,
      critica,
      aguardandoResposta: Boolean(desde),
      atendenteId: naoAtribuida ? (porConversa.get(id)?.atribuida_user_id ?? null) : null,
      atendenteNome: naoAtribuida ? (porConversa.get(id)?.atendente_nome ?? null) : null,
    });
  }

  const peso: Record<CategoriaAtencao, number> = {
    nao_atribuida: 0,
    nao_atribuida_global: 0,
    nao_atribuida_individual: 0,
    critica: 1,
    aguardando: 2,
  };
  itens.sort((a, b) => peso[a.categoria] - peso[b.categoria] || b.minutos - a.minutos);

  return {
    total: unicas.size + globalSemDetalhes,
    naoAtribuidas: idsNaoAtribuidas.size + globalSemDetalhes,
    naoAtribuidasGlobal,
    filasIndividuais: [...individuais.values()].sort(
      (a, b) => a.nome.localeCompare(b.nome, "pt-BR") || a.atendenteId.localeCompare(b.atendenteId),
    ),
    criticas: idsCriticas.size,
    aguardando,
    itens: itens.slice(0, args.limiteItens ?? 8),
    nivel: nivelAtencao(unicas.size + globalSemDetalhes),
  };
}

/**
 * Lista de uma categoria dentro da própria Central (não filtra a Inbox).
 * A ordem já vem por gravidade e tempo de espera.
 */
export function itensDaCategoria(
  itens: ItemAtencao[],
  categoria: CategoriaAtencao | null,
  atendenteId?: string | null,
) {
  if (!categoria) return itens;
  if (categoria === "nao_atribuida") return itens.filter((i) => i.naoAtribuida);
  if (categoria === "nao_atribuida_global")
    return itens.filter((i) => i.naoAtribuida && !i.atendenteId);
  if (categoria === "nao_atribuida_individual")
    return itens.filter((i) => i.naoAtribuida && i.atendenteId === atendenteId);
  if (categoria === "critica") return itens.filter((i) => i.critica);
  return itens.filter((i) => i.aguardandoResposta);
}

/** Texto lido por leitores de tela no indicador do cabeçalho. */
export function rotuloCentral(r: ResumoAtencao): string {
  if (r.total <= 0) return "Central de Atenção. Nenhuma conversa precisa de atenção agora.";
  return `Central de Atenção. ${r.total} ${
    r.total === 1 ? "conversa precisa" : "conversas precisam"
  } de atenção. ${r.naoAtribuidas} não atribuídas e ${r.criticas} com tempo de espera crítico.`;
}
