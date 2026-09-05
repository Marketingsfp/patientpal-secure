/**
 * Mensagens rápidas (comandos "/") — lista flutuante do composer.
 *
 * Não envia nada: apenas devolve o texto para o campo de mensagem, onde a
 * atendente revisa antes de enviar. Mensagem rápida ≠ template oficial do
 * WhatsApp/Meta.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Star, Zap } from "lucide-react";
import {
  filtrarRespostas,
  type RespostaRapida,
} from "@/lib/atendimento/respostas-rapidas";
import {
  alternarFavoritoResposta,
  listarRespostasRapidas,
} from "@/lib/atendimento/respostas-rapidas.functions";

export const EVENTO_RESPOSTAS_ATUALIZADAS = "respostas-rapidas:atualizadas";

/** Avisa as telas abertas que o cadastro mudou (invalida o cache local). */
export function notificarRespostasAtualizadas() {
  if (typeof window !== "undefined")
    window.dispatchEvent(new CustomEvent(EVENTO_RESPOSTAS_ATUALIZADAS));
}

export type DadosRespostas = {
  respostas: RespostaRapida[];
  favoritos: Set<string>;
  usos: Map<string, number>;
  recentes: string[];
  podeGerenciar: boolean;
  carregando: boolean;
  recarregar: () => void;
  favoritar: (id: string, favorito: boolean) => void;
};

/**
 * Carrega uma única vez por clínica e filtra localmente (sem requisição a
 * cada tecla). Recarrega quando o cadastro é alterado.
 */
export function useRespostasRapidas(clinicaId?: string | null): DadosRespostas {
  const listarFn = useServerFn(listarRespostasRapidas);
  const favFn = useServerFn(alternarFavoritoResposta);
  const [respostas, setRespostas] = useState<RespostaRapida[]>([]);
  const [favoritos, setFavoritos] = useState<Set<string>>(new Set());
  const [usos, setUsos] = useState<Map<string, number>>(new Map());
  const [recentes, setRecentes] = useState<string[]>([]);
  const [podeGerenciar, setPodeGerenciar] = useState(false);
  const [carregando, setCarregando] = useState(false);
  const [versao, setVersao] = useState(0);

  const recarregar = useCallback(() => setVersao((v) => v + 1), []);

  useEffect(() => {
    const h = () => recarregar();
    window.addEventListener(EVENTO_RESPOSTAS_ATUALIZADAS, h);
    return () => window.removeEventListener(EVENTO_RESPOSTAS_ATUALIZADAS, h);
  }, [recarregar]);

  useEffect(() => {
    if (!clinicaId) {
      setRespostas([]);
      return;
    }
    let cancel = false;
    setCarregando(true);
    void (async () => {
      try {
        const r = (await listarFn({ data: { clinicaId } })) as {
          respostas: RespostaRapida[];
          favoritos: string[];
          usos: Record<string, number>;
          recentes: string[];
          podeGerenciar: boolean;
        };
        if (cancel) return;
        setRespostas(r.respostas ?? []);
        setFavoritos(new Set(r.favoritos ?? []));
        setUsos(new Map(Object.entries(r.usos ?? {})));
        setRecentes(r.recentes ?? []);
        setPodeGerenciar(!!r.podeGerenciar);
      } catch (e) {
        console.error("[respostas-rapidas] falha ao carregar", e);
      } finally {
        if (!cancel) setCarregando(false);
      }
    })();
    return () => {
      cancel = true;
    };
  }, [clinicaId, listarFn, versao]);

  const favoritar = useCallback(
    (id: string, favorito: boolean) => {
      if (!clinicaId) return;
      setFavoritos((prev) => {
        const n = new Set(prev);
        if (favorito) n.add(id);
        else n.delete(id);
        return n;
      });
      void favFn({ data: { clinicaId, respostaId: id, favorito } }).catch((e) => {
        console.error("[respostas-rapidas] falha ao favoritar", e);
        recarregar();
      });
    },
    [clinicaId, favFn, recarregar],
  );

  return {
    respostas,
    favoritos,
    usos,
    recentes,
    podeGerenciar,
    carregando,
    recarregar,
    favoritar,
  };
}

/** Ordena/filtra para o termo digitado após a "/". */
export function useRespostasFiltradas(
  dados: DadosRespostas,
  termo: string,
  contexto?: readonly string[],
) {
  return useMemo(
    () =>
      filtrarRespostas(dados.respostas, termo, {
        favoritos: dados.favoritos,
        usos: dados.usos,
        recentes: dados.recentes,
        contexto,
      }).slice(0, 30),
    [dados.respostas, dados.favoritos, dados.usos, dados.recentes, termo, contexto],
  );
}

type Props = {
  itens: RespostaRapida[];
  indice: number;
  termo: string;
  favoritos: ReadonlySet<string>;
  onSelecionar: (r: RespostaRapida) => void;
  onIndice: (i: number) => void;
  onFavoritar: (id: string, favorito: boolean) => void;
};

export function ListaRespostasRapidas({
  itens,
  indice,
  termo,
  favoritos,
  onSelecionar,
  onIndice,
  onFavoritar,
}: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current?.querySelector<HTMLElement>(`[data-idx="${indice}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [indice]);

  return (
    <div
      className="absolute bottom-full left-0 z-50 mb-2 w-full max-w-xl overflow-hidden rounded-lg border border-atd-border bg-atd-surface shadow-lg"
      role="dialog"
      aria-label="Respostas rápidas"
    >
      <div className="flex items-center gap-2 border-b border-atd-border px-3 py-2 text-xs font-medium text-atd-ink-soft">
        <Zap className="h-3.5 w-3.5" aria-hidden="true" />
        Respostas rápidas
        <span className="ml-auto font-normal">↑ ↓ navegar · Enter inserir · Esc fechar</span>
      </div>
      <div
        aria-live="polite"
        className="sr-only"
      >{`${itens.length} respostas rápidas encontradas. Use as setas para navegar.`}</div>
      <div ref={ref} role="listbox" aria-label="Lista de respostas rápidas" className="max-h-72 overflow-auto py-1">
        {itens.length === 0 && (
          <p className="px-3 py-3 text-sm text-atd-ink-soft">
            {termo ? `Nenhuma resposta rápida para “/${termo}”.` : "Nenhuma resposta rápida cadastrada."}
          </p>
        )}
        {itens.map((r, i) => {
          const sel = i === indice;
          const fav = favoritos.has(r.id);
          return (
            <div
              key={r.id}
              data-idx={i}
              role="option"
              aria-selected={sel}
              tabIndex={-1}
              onMouseEnter={() => onIndice(i)}
              onMouseDown={(e) => {
                e.preventDefault();
                onSelecionar(r);
              }}
              className={`flex cursor-pointer items-center gap-2 px-3 py-2 text-sm ${
                sel ? "bg-atd-blue-tint text-atd-blue-ink" : "text-atd-ink"
              }`}
            >
              <span className="font-mono text-xs font-semibold">/{r.comando}</span>
              <span className="truncate text-atd-ink-soft">{r.nome}</span>
              {r.categoria && (
                <span className="ml-auto shrink-0 rounded border border-atd-border px-1.5 py-0.5 text-[10px] text-atd-ink-soft">
                  {r.categoria}
                </span>
              )}
              {r.escopo === "pessoal" && (
                <span className="shrink-0 text-[10px] text-atd-ink-soft">pessoal</span>
              )}
              <button
                type="button"
                aria-label={fav ? `Desfavoritar /${r.comando}` : `Favoritar /${r.comando}`}
                aria-pressed={fav}
                className="shrink-0 rounded p-1 hover:bg-atd-blue-tint"
                onMouseDown={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onFavoritar(r.id, !fav);
                }}
              >
                <Star
                  className={`h-3.5 w-3.5 ${fav ? "fill-current text-atd-warn-ink" : "text-atd-ink-soft"}`}
                  aria-hidden="true"
                />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
