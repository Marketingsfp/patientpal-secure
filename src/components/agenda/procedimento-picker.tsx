import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Search, Star, Loader2 } from "lucide-react";
import { pickTop60 } from "@/lib/procedimento/laboratorio-top60";
import { ordenarPorRelevancia } from "@/lib/busca/relevancia";

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
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

export function ProcedimentoPicker({
  clinicaId,
  especialidadeId,
  tipo,
  value,
  onSelect,
  placeholder,
  className,
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
      // O PostgREST corta a resposta em 1000 linhas. O catálogo da clínica
      // passa de 4.500 serviços ativos, e sem este laço tudo o que ficava
      // depois da milésima linha em ordem alfabética simplesmente não era
      // baixado — era por isso que "CONSULTA" (linha ~1.300) nunca aparecia
      // na busca, por mais que estivesse cadastrada e ativa.
      const pageSize = 1000;
      let arr: ProcedimentoOption[] = [];
      for (let from = 0; ; from += pageSize) {
        let q = supabase
          .from("procedimentos")
          .select("id,nome,tipo,grupo,valor_padrao,duracao_minutos,codigo")
          .eq("clinica_id", clinicaId)
          .eq("ativo", true)
          .order("nome")
          .range(from, from + pageSize - 1);
        if (tipo) q = q.eq("tipo", tipo);
        const { data, error } = await q;
        if (error) break;
        const page = (data ?? []) as ProcedimentoOption[];
        arr.push(...page);
        if (page.length < pageSize) break;
      }
      if (especialidadeId) {
        const { data: pe } = await supabase
          .from("procedimento_especialidades")
          .select("procedimento_id")
          .eq("especialidade_id", especialidadeId);
        const ids = new Set((pe ?? []).map((r: any) => r.procedimento_id));
        if (ids.size > 0) arr = arr.filter((p) => ids.has(p.id));
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

  // Bloco "Laboratório — Top 60": exames laboratoriais mais comuns que
  // existem no cadastro da clínica. É apenas acesso rápido; a busca normal
  // continua alcançando todos os procedimentos.
  const [mostrarTop60, setMostrarTop60] = useState(false);
  const top60Lab = useMemo(() => pickTop60(lista), [lista]);

  const filtradas = useMemo(() => {
    const doGrupo = grupoFiltro ? lista.filter((p) => p.grupo === grupoFiltro) : lista;
    if (!normalizar(busca)) return doGrupo.slice(0, 200);
    // Ordena por relevância ANTES de cortar em 200: assim o serviço de nome
    // igual ao que foi digitado nunca fica de fora do corte.
    const porNome = ordenarPorRelevancia(doGrupo, busca, (p) => p.nome);
    const jaTem = new Set(porNome.map((p) => p.id));
    // Código e grupo continuam pesquisáveis, mas só depois dos nomes.
    const porCodigoOuGrupo = ordenarPorRelevancia(
      doGrupo.filter((p) => !jaTem.has(p.id)),
      busca,
      (p) => `${p.codigo ?? ""} ${p.grupo ?? ""}`,
    );
    return [...porNome, ...porCodigoOuGrupo].slice(0, 200);
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
          <Button size="sm" variant="ghost" onClick={() => onSelect(null)}>
            Trocar
          </Button>
        </div>
      ) : (
        <div className="space-y-2">
          {top.length > 0 && (
            <div className="rounded-md border p-2 bg-muted/40">
              <div className="text-[12px] font-semibold uppercase text-muted-foreground mb-1 flex items-center gap-1">
                <Star className="h-3 w-3" /> Mais solicitados
              </div>
              <div className="flex flex-wrap gap-1">
                {top.map((t) => {
                  const p = lista.find((x) => x.id === t.procedimento_id);
                  if (!p) return null;
                  return (
                    <Button
                      key={t.procedimento_id}
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs"
                      onClick={() => onSelect(p)}
                    >
                      {p.nome}
                      <Badge variant="secondary" className="ml-1 text-[11px] px-1 py-0">
                        {t.quantidade}
                      </Badge>
                    </Button>
                  );
                })}
              </div>
            </div>
          )}

          {top60Lab.length > 0 && (
            <div className="rounded-md border p-2 bg-muted/40">
              <div className="flex items-center justify-between mb-1">
                <div className="text-[12px] font-semibold uppercase text-muted-foreground flex items-center gap-1">
                  🧪 Laboratório — Top 60
                  <Badge variant="secondary" className="ml-1 text-[11px] px-1 py-0">
                    {top60Lab.length}
                  </Badge>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="h-6 text-[12px]"
                  onClick={() => setMostrarTop60((v) => !v)}
                >
                  {mostrarTop60 ? "ocultar" : "mostrar"}
                </Button>
              </div>
              {mostrarTop60 && (
                <div className="flex flex-wrap gap-1 max-h-40 overflow-auto">
                  {top60Lab.map(({ item, proc }) => (
                    <Button
                      key={proc.id}
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs"
                      title={proc.nome}
                      onClick={() => onSelect(proc)}
                    >
                      {item.label}
                    </Button>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              autoFocus
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder={placeholder ?? "Buscar exame ou procedimento…"}
              className="pl-9"
            />
          </div>

          {grupos.length > 1 && (
            <div className="flex flex-wrap gap-1">
              <Button
                size="sm"
                variant={grupoFiltro === null ? "default" : "outline"}
                className="h-6 text-[12px]"
                onClick={() => setGrupoFiltro(null)}
              >
                Todos
              </Button>
              {grupos.map((g) => (
                <Button
                  key={g}
                  size="sm"
                  variant={grupoFiltro === g ? "default" : "outline"}
                  className="h-6 text-[12px]"
                  onClick={() => setGrupoFiltro(g)}
                >
                  {g}
                </Button>
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
              <div className="p-3 text-sm text-muted-foreground">
                Nenhum procedimento encontrado.
              </div>
            )}
            {!loading &&
              filtradas.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => onSelect(p)}
                  className="w-full text-left px-3 py-2 text-sm hover:bg-accent border-b last:border-b-0"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium truncate">{p.nome}</span>
                    {p.codigo && (
                      <span className="text-[11px] font-mono text-muted-foreground">
                        {p.codigo}
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {[p.grupo, p.tipo, p.duracao_minutos ? `${p.duracao_minutos}min` : null]
                      .filter(Boolean)
                      .join(" · ")}
                  </div>
                </button>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}
