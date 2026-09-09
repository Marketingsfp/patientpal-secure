import { nomeContato } from "./rotulo-conversa";
/**
 * Central de Atenção — regras puras.
 *
 * Não cria contagem nova: recebe a MESMA fila de "Não atribuídas"
 * (`listarFilaHumana`) e o MESMO mapa de espera (`esperaConversas`, RPC
 * `atend_espera_por_conversa`) já usados na Inbox. Aqui só se combina,
 * classifica e ordena.
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


export type CategoriaAtencao = "nao_atribuida" | "critica" | "aguardando";

/** Linha da fila, como vem de `listarFilaHumana`. */
export interface LinhaFila {
  id: string;
  contato_nome?: string | null;
  whatsapp_profile_name?: string | null;
  contato_telefone?: string | null;
  handoff_motivo?: string | null;
  handoff_resumo?: string | null;
}

/**
 * "Não atribuída" tem definição própria: a Nina precisou de atendimento humano
 * e não havia atendente elegível online. Conversa sem responsável que NÃO veio
 * desse fluxo (ex.: aberta manualmente e ainda não assumida) não entra.
 * A marca do fluxo é o registro do handoff na própria conversa.
 */
export function veioDoHandoff(c: LinhaFila): boolean {
  return Boolean((c.handoff_motivo ?? "").trim() || (c.handoff_resumo ?? "").trim());
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
}

export interface ResumoAtencao {
  /** Conversas únicas que precisam de ação (não atribuídas ∪ espera crítica). */
  total: number;
  naoAtribuidas: number;
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
  /** Conversas sem responsável (fonte única: listarFilaHumana). */
  naoAtribuidas: LinhaFila[];
  /** conversaId -> instante da 1ª mensagem do paciente ainda sem resposta. */
  espera: Record<string, string>;
  /** Nomes conhecidos das conversas (Inbox). */
  nomes?: Record<string, string | null | undefined>;
  agora?: number;
  limiteItens?: number;
}): ResumoAtencao {
  const agora = args.agora ?? Date.now();
  const nomes = { ...(args.nomes ?? {}) };
  const fila = args.naoAtribuidas.filter(veioDoHandoff);
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
    });
  }

  const peso: Record<CategoriaAtencao, number> = { nao_atribuida: 0, critica: 1, aguardando: 2 };
  itens.sort((a, b) => peso[a.categoria] - peso[b.categoria] || b.minutos - a.minutos);

  return {
    total: unicas.size,
    naoAtribuidas: idsNaoAtribuidas.size,
    criticas: idsCriticas.size,
    aguardando,
    itens: itens.slice(0, args.limiteItens ?? 8),
    nivel: nivelAtencao(unicas.size),
  };
}

/**
 * Lista de uma categoria dentro da própria Central (não filtra a Inbox).
 * A ordem já vem por gravidade e tempo de espera.
 */
export function itensDaCategoria(itens: ItemAtencao[], categoria: CategoriaAtencao | null) {
  if (!categoria) return itens;
  if (categoria === "nao_atribuida") return itens.filter((i) => i.naoAtribuida);
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
