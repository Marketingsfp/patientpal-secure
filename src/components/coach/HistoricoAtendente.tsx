import { useEffect, useMemo, useState } from "react";
import {
  ChevronDown,
  ClipboardCheck,
  Headphones,
  Lightbulb,
  Loader2,
  MessageSquare,
  Sparkles,
  ThumbsDown,
  ThumbsUp,
  History,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { formatDuracao } from "@/lib/coach/study-time";

type Questao = {
  pergunta: string;
  alternativas: string[];
  correta: number;
  explicacao?: string;
};

type RoleplayRow = {
  id: string;
  created_at: string;
  nota: number;
  resumo: string;
  acertos: string[] | null;
  melhorias: string[] | null;
  dica_pratica: string | null;
  cenario: string | null;
  modo: string | null;
  duracao_seg: number | null;
};

type ProvaRow = {
  id: string;
  created_at: string;
  nota: number;
  acertos: number;
  total: number;
  questoes: Questao[] | null;
  respostas: number[] | null;
};

type AnaliseRow = {
  id: string;
  created_at: string;
  titulo: string;
  pontuacao: number;
  tipo_entrada: string;
  resultado: {
    resumo?: string;
    pontos_positivos?: string[];
    pontos_negativos?: string[];
  } | null;
};

type Item =
  | { kind: "roleplay"; data: RoleplayRow }
  | { kind: "prova"; data: ProvaRow }
  | { kind: "analise"; data: AnaliseRow };

const dataHora = (iso: string) =>
  new Date(iso).toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });

const notaCor = (n: number) =>
  n >= 8 ? "text-[color:var(--success)]" : n >= 6 ? "text-primary" : "text-destructive";

type Filtro = "tudo" | "roleplay" | "prova" | "analise";

export function HistoricoAtendente({
  atendente,
  clinicaId,
}: {
  atendente: string;
  clinicaId: string | null;
}) {
  const [roleplays, setRoleplays] = useState<RoleplayRow[]>([]);
  const [provas, setProvas] = useState<ProvaRow[]>([]);
  const [analises, setAnalises] = useState<AnaliseRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtro, setFiltro] = useState<Filtro>("tudo");
  const [aberto, setAberto] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!clinicaId) {
        setLoading(false);
        return;
      }
      setLoading(true);
      const [r, p, a] = await Promise.all([
        supabase
          .from("coach_roleplay_sessions")
          .select(
            "id,created_at,nota,resumo,acertos,melhorias,dica_pratica,cenario,modo,duracao_seg",
          )
          .eq("clinica_id", clinicaId)
          .eq("atendente", atendente)
          .order("created_at", { ascending: false })
          .limit(100),
        supabase
          .from("coach_provas")
          .select("id,created_at,nota,acertos,total,questoes,respostas")
          .eq("clinica_id", clinicaId)
          .eq("atendente", atendente)
          .order("created_at", { ascending: false })
          .limit(50),
        supabase
          .from("coach_analises")
          .select("id,created_at,titulo,pontuacao,tipo_entrada,resultado")
          .eq("clinica_id", clinicaId)
          .eq("atendente", atendente)
          .order("created_at", { ascending: false })
          .limit(50),
      ]);
      if (cancelled) return;
      setRoleplays((r.data ?? []) as unknown as RoleplayRow[]);
      setProvas((p.data ?? []) as unknown as ProvaRow[]);
      setAnalises((a.data ?? []) as unknown as AnaliseRow[]);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [atendente, clinicaId]);

  const itens = useMemo<Item[]>(() => {
    const all: Item[] = [
      ...roleplays.map((data) => ({ kind: "roleplay" as const, data })),
      ...provas.map((data) => ({ kind: "prova" as const, data })),
      ...analises.map((data) => ({ kind: "analise" as const, data })),
    ];
    return all
      .filter((i) => filtro === "tudo" || i.kind === filtro)
      .sort((x, y) => (x.data.created_at < y.data.created_at ? 1 : -1));
  }, [roleplays, provas, analises, filtro]);

  const filtros: { id: Filtro; label: string; n: number }[] = [
    { id: "tudo", label: "Tudo", n: roleplays.length + provas.length + analises.length },
    { id: "roleplay", label: "Treinos", n: roleplays.length },
    { id: "prova", label: "Provas", n: provas.length },
    { id: "analise", label: "Atendimentos reais", n: analises.length },
  ];

  return (
    <div className="rounded-3xl border bg-card p-6 md:p-8 shadow-[var(--shadow-card)]">
      <div className="flex items-start justify-between gap-3 flex-wrap mb-4">
        <div>
          <h2 className="text-xl font-semibold tracking-tight flex items-center gap-2">
            <History className="h-4 w-4 text-primary" /> Meu histórico e feedbacks
          </h2>
          <p className="text-xs text-muted-foreground mt-1">
            Todos os treinos, provas e atendimentos avaliados — toque para ver o feedback completo.
          </p>
        </div>
        <div className="flex gap-1.5 flex-wrap">
          {filtros.map((f) => (
            <button
              key={f.id}
              onClick={() => setFiltro(f.id)}
              className={`text-xs rounded-full px-3 py-1.5 border transition-colors ${
                filtro === f.id
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-background hover:bg-secondary"
              }`}
            >
              {f.label} · {f.n}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-8 text-muted-foreground text-sm">
          <Loader2 className="h-4 w-4 animate-spin mr-2" /> Carregando histórico…
        </div>
      ) : itens.length === 0 ? (
        <p className="text-sm text-muted-foreground py-6 text-center">
          Nada por aqui ainda. Faça um treino ou a prova para gerar seus primeiros feedbacks.
        </p>
      ) : (
        <div className="space-y-2">
          {itens.map((item) => {
            const id = `${item.kind}-${item.data.id}`;
            const open = aberto === id;
            return (
              <div key={id} className="rounded-2xl border overflow-hidden">
                <button
                  onClick={() => setAberto(open ? null : id)}
                  className="w-full text-left px-4 py-3 flex items-center gap-3 hover:bg-secondary/50 transition-colors"
                >
                  <span className="h-9 w-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
                    {item.kind === "prova" ? (
                      <ClipboardCheck className="h-4 w-4" />
                    ) : item.kind === "analise" ? (
                      <Sparkles className="h-4 w-4" />
                    ) : (item.data as RoleplayRow).modo === "texto" ? (
                      <MessageSquare className="h-4 w-4" />
                    ) : (
                      <Headphones className="h-4 w-4" />
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium truncate">{titulo(item)}</span>
                    <span className="block text-xs text-muted-foreground">
                      {dataHora(item.data.created_at)} · {subtitulo(item)}
                    </span>
                  </span>
                  <span className={`text-lg font-bold shrink-0 ${notaCor(nota(item))}`}>
                    {nota(item).toFixed(1)}
                  </span>
                  <ChevronDown
                    className={`h-4 w-4 text-muted-foreground shrink-0 transition-transform ${open ? "rotate-180" : ""}`}
                  />
                </button>
                {open && (
                  <div className="px-4 pb-4 pt-1 border-t bg-secondary/20">
                    {item.kind === "roleplay" && <FeedbackRoleplay r={item.data} />}
                    {item.kind === "prova" && <FeedbackProvaHist p={item.data} />}
                    {item.kind === "analise" && <FeedbackAnalise a={item.data} />}
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

function nota(item: Item) {
  return Number(
    item.kind === "analise" ? (item.data as AnaliseRow).pontuacao : (item.data as RoleplayRow).nota,
  ) || 0;
}

function titulo(item: Item) {
  if (item.kind === "prova") return "Prova de conversão";
  if (item.kind === "analise") return (item.data as AnaliseRow).titulo;
  const r = item.data as RoleplayRow;
  return r.cenario || (r.modo === "texto" ? "Treino de WhatsApp" : "Treino de ligação");
}

function subtitulo(item: Item) {
  if (item.kind === "prova") {
    const p = item.data as ProvaRow;
    return `${p.acertos} de ${p.total} acertos`;
  }
  if (item.kind === "analise") {
    const a = item.data as AnaliseRow;
    return a.tipo_entrada === "audio" ? "ligação analisada" : "conversa analisada";
  }
  const r = item.data as RoleplayRow;
  const modo = r.modo === "texto" ? "WhatsApp" : "ligação";
  return r.duracao_seg ? `${modo} · ${formatDuracao(r.duracao_seg)}` : modo;
}

function Lista({
  titulo,
  itens,
  tom,
}: {
  titulo: string;
  itens: string[];
  tom: "bom" | "ruim";
}) {
  if (!itens.length) return null;
  return (
    <div className="mt-3">
      <p className="text-xs font-semibold flex items-center gap-1.5 mb-1">
        {tom === "bom" ? (
          <ThumbsUp className="h-3.5 w-3.5 text-[color:var(--success)]" />
        ) : (
          <ThumbsDown className="h-3.5 w-3.5 text-destructive" />
        )}
        {titulo}
      </p>
      <ul className="space-y-1">
        {itens.map((t, i) => (
          <li key={i} className="text-sm text-muted-foreground pl-5 relative">
            <span className="absolute left-0 top-[0.45rem] h-1.5 w-1.5 rounded-full bg-muted-foreground/50" />
            {t}
          </li>
        ))}
      </ul>
    </div>
  );
}

function FeedbackRoleplay({ r }: { r: RoleplayRow }) {
  return (
    <div className="pt-3">
      {r.resumo && <p className="text-sm">{r.resumo}</p>}
      <Lista titulo="O que você fez bem" itens={r.acertos ?? []} tom="bom" />
      <Lista titulo="O que melhorar" itens={r.melhorias ?? []} tom="ruim" />
      {r.dica_pratica && (
        <div className="mt-3 rounded-xl border bg-background p-3 text-sm flex gap-2">
          <Lightbulb className="h-4 w-4 text-primary shrink-0 mt-0.5" />
          <span>{r.dica_pratica}</span>
        </div>
      )}
    </div>
  );
}

function FeedbackAnalise({ a }: { a: AnaliseRow }) {
  const res = a.resultado ?? {};
  return (
    <div className="pt-3">
      {res.resumo && <p className="text-sm">{res.resumo}</p>}
      <Lista titulo="Pontos positivos" itens={res.pontos_positivos ?? []} tom="bom" />
      <Lista titulo="Pontos a melhorar" itens={res.pontos_negativos ?? []} tom="ruim" />
    </div>
  );
}

function FeedbackProvaHist({ p }: { p: ProvaRow }) {
  const questoes = p.questoes ?? [];
  const respostas = p.respostas ?? [];
  if (!questoes.length)
    return <p className="pt-3 text-sm text-muted-foreground">Sem detalhes desta prova.</p>;
  return (
    <div className="pt-3 space-y-3">
      {questoes.map((q, i) => {
        const escolhida = respostas[i];
        const ok = escolhida === q.correta;
        return (
          <div key={i} className="rounded-xl border bg-background p-3">
            <div className="flex items-start justify-between gap-2">
              <p className="text-sm font-medium">
                {i + 1}. {q.pergunta}
              </p>
              <Badge
                className={`shrink-0 border-0 ${ok ? "bg-success/15 text-[color:var(--success)]" : "bg-destructive/10 text-destructive"}`}
              >
                {ok ? "acerto" : "erro"}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              Sua resposta:{" "}
              <span className={ok ? "" : "text-destructive"}>
                {typeof escolhida === "number" && q.alternativas[escolhida]
                  ? q.alternativas[escolhida]
                  : "sem resposta"}
              </span>
            </p>
            {!ok && (
              <p className="text-xs text-[color:var(--success)] mt-1">
                Correta: {q.alternativas[q.correta]}
              </p>
            )}
            {q.explicacao && (
              <p className="text-xs text-muted-foreground mt-2 flex gap-1.5">
                <Lightbulb className="h-3.5 w-3.5 text-primary shrink-0 mt-0.5" />
                {q.explicacao}
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}
