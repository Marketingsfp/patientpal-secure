import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  ChevronDown,
  Headphones,
  Loader2,
  MessageSquare,
  Search,
  Users,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { formatDuracao } from "@/lib/coach/study-time";

type Mensagem = { role: "cliente" | "atendente"; content: string };

type SessaoRow = {
  id: string;
  atendente: string;
  created_at: string;
  nota: number;
  resumo: string | null;
  cenario: string | null;
  modo: string | null;
  duracao_seg: number | null;
};

const dataHora = (iso: string) =>
  new Date(iso).toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });

const notaCor = (n: number) =>
  n >= 8 ? "text-[color:var(--success)]" : n >= 6 ? "text-primary" : "text-destructive";

type Filtro = "tudo" | "texto" | "voz";

/**
 * Histórico completo de conversas (WhatsApp) e ligações feitas pelas atendentes,
 * com a transcrição integral de cada treinamento — visão da gestora.
 */
export function HistoricoGestor({ clinicaId }: { clinicaId: string | null }) {
  const [rows, setRows] = useState<SessaoRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [selecionada, setSelecionada] = useState<string | null>(null);
  const [busca, setBusca] = useState("");
  const [filtro, setFiltro] = useState<Filtro>("tudo");
  const [aberto, setAberto] = useState<string | null>(null);
  const [conversa, setConversa] = useState<Record<string, Mensagem[]>>({});
  const [carregandoConversa, setCarregandoConversa] = useState<string | null>(null);

  /** Busca a transcrição só quando a gestora abre a sessão. */
  const abrirSessao = async (id: string) => {
    if (aberto === id) {
      setAberto(null);
      return;
    }
    setAberto(id);
    if (conversa[id]) return;
    setCarregandoConversa(id);
    const { data } = await supabase
      .from("coach_roleplay_sessions")
      .select("mensagens")
      .eq("id", id)
      .maybeSingle();
    setConversa((c) => ({ ...c, [id]: ((data?.mensagens ?? []) as Mensagem[]) || [] }));
    setCarregandoConversa(null);
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      let q = supabase
        .from("coach_roleplay_sessions")
        // Lista leve: a transcrição (coluna pesada) só é buscada ao abrir a
        // sessão. Antes vinham 1.000 conversas inteiras de uma vez.
        .select("id,atendente,created_at,nota,resumo,cenario,modo,duracao_seg")
        .order("created_at", { ascending: false })
        .limit(300);
      if (clinicaId) q = q.eq("clinica_id", clinicaId);
      const { data } = await q;
      if (cancelled) return;
      setRows((data ?? []) as unknown as SessaoRow[]);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [clinicaId]);

  const atendentes = useMemo(() => {
    const map = new Map<string, SessaoRow[]>();
    for (const r of rows) {
      const arr = map.get(r.atendente) ?? [];
      arr.push(r);
      map.set(r.atendente, arr);
    }
    return Array.from(map.entries())
      .map(([nome, items]) => ({
        nome,
        items,
        conversas: items.filter((i) => (i.modo ?? "voz") === "texto").length,
        ligacoes: items.filter((i) => (i.modo ?? "voz") !== "texto").length,
        media:
          items.reduce((s, i) => s + (Number(i.nota) || 0), 0) / Math.max(items.length, 1),
        ultima: items[0]?.created_at,
      }))
      .filter((a) => a.nome.toLowerCase().includes(busca.trim().toLowerCase()))
      .sort((a, b) => (a.nome > b.nome ? 1 : -1));
  }, [rows, busca]);

  const detalhe = selecionada ? atendentes.find((a) => a.nome === selecionada) : null;

  if (loading) {
    return (
      <div className="rounded-xl border bg-card p-10 flex items-center justify-center text-muted-foreground text-sm shadow-sm">
        <Loader2 className="h-4 w-4 animate-spin mr-2" /> Carregando histórico das atendentes…
      </div>
    );
  }

  if (detalhe) {
    const itens = detalhe.items.filter(
      (i) => filtro === "tudo" || (i.modo ?? "voz") === (filtro === "texto" ? "texto" : "voz"),
    );
    return (
      <div className="rounded-xl border bg-card p-5 shadow-sm">
        <div className="flex items-start justify-between gap-3 flex-wrap mb-5">
          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              size="sm"
              className="rounded-full"
              onClick={() => setSelecionada(null)}
            >
              <ArrowLeft className="h-4 w-4 mr-1" /> Voltar
            </Button>
            <div>
              <h2 className="text-xl font-semibold tracking-tight">{detalhe.nome}</h2>
              <p className="text-xs text-muted-foreground">
                {detalhe.conversas} conversas · {detalhe.ligacoes} ligações · média{" "}
                {detalhe.media.toFixed(1)}
              </p>
            </div>
          </div>
          <div className="flex gap-1.5">
            {(
              [
                { id: "tudo" as Filtro, label: "Tudo" },
                { id: "texto" as Filtro, label: "Conversas" },
                { id: "voz" as Filtro, label: "Ligações" },
              ]
            ).map((f) => (
              <button
                key={f.id}
                onClick={() => setFiltro(f.id)}
                className={`text-xs rounded-full px-3 py-1.5 border transition-colors ${
                  filtro === f.id
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-background hover:bg-secondary"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {itens.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">
            Nenhum registro deste tipo para esta atendente.
          </p>
        ) : (
          <div className="space-y-2">
            {itens.map((r) => {
              const open = aberto === r.id;
              const texto = (r.modo ?? "voz") === "texto";
              return (
                <div key={r.id} className="rounded-2xl border overflow-hidden">
                  <button
                    onClick={() => void abrirSessao(r.id)}
                    className="w-full text-left px-4 py-3 flex items-center gap-3 hover:bg-secondary/50 transition-colors"
                  >
                    <span className="h-9 w-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
                      {texto ? (
                        <MessageSquare className="h-4 w-4" />
                      ) : (
                        <Headphones className="h-4 w-4" />
                      )}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium truncate">
                        {r.cenario || (texto ? "Conversa de WhatsApp" : "Ligação")}
                      </span>
                      <span className="block text-xs text-muted-foreground">
                        {dataHora(r.created_at)} · {texto ? "WhatsApp" : "ligação"}
                        {r.duracao_seg ? ` · ${formatDuracao(r.duracao_seg)}` : ""}
                      </span>
                    </span>
                    <span
                      className={`text-lg font-bold shrink-0 ${notaCor(Number(r.nota) || 0)}`}
                    >
                      {(Number(r.nota) || 0).toFixed(1)}
                    </span>
                    <ChevronDown
                      className={`h-4 w-4 text-muted-foreground shrink-0 transition-transform ${open ? "rotate-180" : ""}`}
                    />
                  </button>
                  {open && (
                    <div className="px-4 pb-4 pt-3 border-t bg-secondary/20 space-y-3">
                      {r.resumo && <p className="text-sm">{r.resumo}</p>}
                      {carregandoConversa === r.id ? (
                        <p className="text-sm text-muted-foreground">Carregando a conversa…</p>
                      ) : (conversa[r.id] ?? []).length === 0 ? (
                        <p className="text-sm text-muted-foreground">
                          Esta sessão foi registrada sem a transcrição.
                        </p>
                      ) : (
                        <div className="rounded-2xl border bg-background p-3 space-y-1.5 max-h-96 overflow-y-auto">
                          {(conversa[r.id] ?? []).map((m, i) => (
                            <div
                              key={i}
                              className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm shadow-sm ${
                                m.role === "atendente"
                                  ? "ml-auto rounded-tr-sm bg-primary/15"
                                  : "rounded-tl-sm bg-card border"
                              }`}
                            >
                              <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-0.5">
                                {m.role === "atendente" ? detalhe.nome : "Cliente (IA)"}
                              </div>
                              <p className="whitespace-pre-wrap">{m.content}</p>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="rounded-xl border bg-card p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3 flex-wrap mb-5">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
            <Users className="h-5 w-5 text-primary" /> Conversas & ligações das atendentes
          </h2>
          <p className="text-sm text-muted-foreground">
            Abra qualquer atendente para ler a transcrição completa de cada treinamento.
          </p>
        </div>
        <div className="relative w-full sm:w-64">
          <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar atendente…"
            className="pl-9 rounded-full"
          />
        </div>
      </div>

      {atendentes.length === 0 ? (
        <p className="text-sm text-muted-foreground py-8 text-center">
          Nenhuma conversa ou ligação registrada ainda nesta clínica.
        </p>
      ) : (
        <div className="grid sm:grid-cols-2 gap-3">
          {atendentes.map((a) => (
            <button
              key={a.nome}
              type="button"
              onClick={() => {
                setSelecionada(a.nome);
                setFiltro("tudo");
                setAberto(null);
              }}
              className="text-left rounded-2xl border bg-secondary/30 hover:bg-secondary p-4 transition-colors flex items-center gap-3"
            >
              <div
                className="h-11 w-11 rounded-full flex items-center justify-center text-base font-bold text-white shrink-0"
                style={{ background: "var(--gradient-hero)" }}
              >
                {a.nome.charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-semibold truncate">{a.nome}</p>
                <p className="text-xs text-muted-foreground">
                  {a.conversas} conversas · {a.ligacoes} ligações
                  {a.ultima ? ` · último em ${dataHora(a.ultima)}` : ""}
                </p>
              </div>
              <div className={`text-xl font-bold shrink-0 ${notaCor(a.media)}`}>
                {a.media.toFixed(1)}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
