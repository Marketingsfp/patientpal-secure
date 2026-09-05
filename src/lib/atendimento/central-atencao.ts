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

export type CategoriaAtencao = "nao_atribuida" | "critica" | "aguardando";

export interface ItemAtencao {
  id: string;
  nome: string;
  categoria: CategoriaAtencao;
  /** Minutos de espera do paciente (0 quando só falta responsável). */
  minutos: number;
  naoAtribuida: boolean;
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
  naoAtribuidas: Array<{ id: string; contato_nome?: string | null }>;
  /** conversaId -> instante da 1ª mensagem do paciente ainda sem resposta. */
  espera: Record<string, string>;
  /** Nomes conhecidos das conversas (Inbox). */
  nomes?: Record<string, string | null | undefined>;
  agora?: number;
  limiteItens?: number;
}): ResumoAtencao {
  const agora = args.agora ?? Date.now();
  const nomes = { ...(args.nomes ?? {}) };
  for (const c of args.naoAtribuidas) if (c.contato_nome) nomes[c.id] = c.contato_nome;

  const idsNaoAtribuidas = new Set(args.naoAtribuidas.map((c) => c.id));
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
    const categoria: CategoriaAtencao = naoAtribuida
      ? "nao_atribuida"
      : idsCriticas.has(id)
        ? "critica"
        : "aguardando";
    itens.push({ id, nome: nomes[id] || "Sem nome", categoria, minutos, naoAtribuida });
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

/** Texto lido por leitores de tela no indicador do cabeçalho. */
export function rotuloCentral(r: ResumoAtencao): string {
  if (r.total <= 0) return "Central de Atenção. Nenhuma conversa precisa de atenção agora.";
  return `Central de Atenção. ${r.total} ${
    r.total === 1 ? "conversa precisa" : "conversas precisam"
  } de atenção. ${r.naoAtribuidas} não atribuídas e ${r.criticas} com tempo de espera crítico.`;
}
