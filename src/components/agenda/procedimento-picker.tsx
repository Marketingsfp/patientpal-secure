import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Search, Star, Loader2 } from "lucide-react";

export type ProcedimentoOption = {
  id: string;
  nome: string;
  tipo?: string | null;
  grupo?: string | null;
  valor_padrao?: number | null;
  duracao_minutos?: number | null;
  codigo?: string | null;
};

type TopRow = {
  procedimento_id: string;
  nome: string;
  tipo: string | null;
  grupo: string | null;
  quantidade: number;
  ultimo_uso: string | null;
};

interface Props {
  clinicaId: string;
  especialidadeId?: string | null;
  tipo?: string | null;
  value?: ProcedimentoOption | null;
  onSelect: (p: ProcedimentoOption | null) => void;
  placeholder?: string;
  className?: string;
}

function normalizar(s: string) {
  return (s ?? "")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().trim();
}

export function ProcedimentoPicker({
  clinicaId, especialidadeId, tipo, value, onSelect, placeholder, className,
}: Props) {
  const [busca, setBusca] = useState("");
  const [lista, setLista] = useState<ProcedimentoOption[]>([]);
  const [top, setTop] = useState<TopRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [grupoFiltro, setGrupoFiltro] = useState<string | null>(null);

  // Carrega procedimentos ativos da clínica (uma vez por combinação)
  useEffect(() => {
    if (!clinicaId) return;
    setLoading(true);
    (async () => {
      let q = supabase
        .from("procedimentos")
        .select("id,nome,tipo,grupo,valor_padrao,duracao_minutos,codigo")
        .eq("clinica_id", clinicaId)
        .eq("ativo", true)
        .order("nome");
      if (tipo) q = q.eq("tipo", tipo);
      const { data } = await q;
      let arr = (data ?? []) as ProcedimentoOption[];
      if (especialidadeId) {
        const { data: pe } = await supabase
          .from("procedimento_especialidades")
          .select("procedimento_id")
          .eq("especialidade_id", especialidadeId);
        const ids = new Set((pe ?? []).map((r: any) => r.procedimento_id));
        if (ids.size > 0) arr = arr.filter(p => ids.has(p.id));
      }
      setLista(arr);
      setLoading(false);
    })();
  }, [clinicaId, especialidadeId, tipo]);

  // Top solicitados (cache 5min por queryKey)
  useEffect(() => {
    if (!clinicaId) return;
    (async () => {
      const { data } = await supabase.rpc("top_procedimentos_agendamento", {
        _clinica_id: clinicaId,
        _limit: 10,
        _janela_dias: 90,
        _especialidade_id: especialidadeId ?? undefined,
        _tipo: tipo ?? undefined,
      });
      setTop((data ?? []) as TopRow[]);
    })();
  }, [clinicaId, especialidadeId, tipo]);

  const grupos = useMemo(() => {
    const g = new Set<string>();
    for (const p of lista) if (p.grupo) g.add(p.grupo);
    return Array.from(g).sort();
  }, [lista]);

  const filtradas = useMemo(() => {
    const n = normalizar(busca);
    return lista.filter(p => {
      if (grupoFiltro && p.grupo !== grupoFiltro) return false;
      if (!n) return true;
      const alvo = normalizar(`${p.nome} ${p.codigo ?? ""} ${p.grupo ?? ""}`);
      return alvo.includes(n);
    }).slice(0, 200);
  }, [lista, busca, grupoFiltro]);

  return (
    <div className={className}>
      {value ? (
        <div className="flex items-center justify-between gap-2 rounded-md border p-2 text-sm">
          <div className="min-w-0">
            <div className="font-medium truncate">{value.nome}</div>
            <div className="text-xs text-muted-foreground truncate">
              {value.grupo ?? value.tipo ?? ""}
              {value.duracao_minutos ? ` · ${value.duracao_minutos}min` : ""}
            </div>
          </div>
          <Button size="sm" variant="ghost" onClick={() => onSelect(null)}>Trocar</Button>
        </div>
      ) : (
        <div className="space-y-2">
          {top.length > 0 && (
            <div className="rounded-md border p-2 bg-muted/40">
              <div className="text-[11px] font-semibold uppercase text-muted-foreground mb-1 flex items-center gap-1">
                <Star className="h-3 w-3" /> Mais solicitados
              </div>
              <div className="flex flex-wrap gap-1">
                {top.map(t => {
                  const p = lista.find(x => x.id === t.procedimento_id);
                  if (!p) return null;
                  return (
                    <Button
                      key={t.procedimento_id}
                      size="sm" variant="outline" className="h-7 text-xs"
                      onClick={() => onSelect(p)}
                    >
                      {p.nome}
                      <Badge variant="secondary" className="ml-1 text-[10px] px-1 py-0">{t.quantidade}</Badge>
                    </Button>
                  );
                })}
              </div>
            </div>
          )}

          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              autoFocus
              value={busca}
              onChange={e => setBusca(e.target.value)}
              placeholder={placeholder ?? "Buscar exame ou procedimento…"}
              className="pl-9"
            />
          </div>

          {grupos.length > 1 && (
            <div className="flex flex-wrap gap-1">
              <Button size="sm" variant={grupoFiltro === null ? "default" : "outline"} className="h-6 text-[11px]" onClick={() => setGrupoFiltro(null)}>Todos</Button>
              {grupos.map(g => (
                <Button key={g} size="sm" variant={grupoFiltro === g ? "default" : "outline"} className="h-6 text-[11px]" onClick={() => setGrupoFiltro(g)}>{g}</Button>
              ))}
            </div>
          )}

          <div className="max-h-64 overflow-auto rounded-md border">
            {loading && (
              <div className="p-3 text-sm text-muted-foreground flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
              </div>
            )}
            {!loading && filtradas.length === 0 && (
              <div className="p-3 text-sm text-muted-foreground">Nenhum procedimento encontrado.</div>
            )}
            {!loading && filtradas.map(p => (
              <button
                key={p.id}
                type="button"
                onClick={() => onSelect(p)}
                className="w-full text-left px-3 py-2 text-sm hover:bg-accent border-b last:border-b-0"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium truncate">{p.nome}</span>
                  {p.codigo && <span className="text-[10px] font-mono text-muted-foreground">{p.codigo}</span>}
                </div>
                <div className="text-xs text-muted-foreground">
                  {[p.grupo, p.tipo, p.duracao_minutos ? `${p.duracao_minutos}min` : null].filter(Boolean).join(" · ")}
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
