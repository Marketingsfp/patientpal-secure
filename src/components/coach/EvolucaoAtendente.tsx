import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Loader2, TrendingDown, TrendingUp, LineChart } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

type Row = { nota: number; created_at: string; melhorias: string[] | null; modo: string | null };

const STOP = new Set([
  "a","o","as","os","de","da","do","das","dos","e","em","no","na","nos","nas","um","uma","para",
  "por","com","que","se","ao","aos","à","às","mais","menos","não","nao","sem","ou","the","você",
  "voce","seu","sua","seus","suas","foi","ser","est","este","esta","isso","como","ainda","muito",
  "deve","precisa","faltou","falta","pouco","sempre","nunca","apenas","durante","sobre","antes",
  "depois","quando","cliente","paciente","atendente","atendimento","conversa","ligacao","ligação",
]);

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 3 && !STOP.has(w));

/** Agrupa textos de melhoria por sobreposição de palavras-chave. */
function recorrentes(textos: string[], max = 3) {
  const grupos: { chave: Set<string>; exemplos: string[] }[] = [];
  for (const t of textos) {
    const tokens = new Set(norm(t));
    if (tokens.size === 0) continue;
    const alvo = grupos.find((g) => {
      let comuns = 0;
      tokens.forEach((w) => {
        if (g.chave.has(w)) comuns++;
      });
      return comuns >= 2;
    });
    if (alvo) {
      tokens.forEach((w) => alvo.chave.add(w));
      alvo.exemplos.push(t);
    } else {
      grupos.push({ chave: tokens, exemplos: [t] });
    }
  }
  return grupos
    .sort((a, b) => b.exemplos.length - a.exemplos.length)
    .slice(0, max)
    .map((g) => ({ texto: g.exemplos[0], vezes: g.exemplos.length }));
}

function Sparkline({ notas }: { notas: number[] }) {
  const w = 100;
  const h = 34;
  if (notas.length < 2) return null;
  const pts = notas.map((n, i) => {
    const x = (i / (notas.length - 1)) * w;
    const y = h - (Math.max(0, Math.min(10, n)) / 10) * h;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const yMeta = h - (6 / 10) * h;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-10" preserveAspectRatio="none">
      <polyline
        points={`0,${h} ${pts.join(" ")} ${w},${h}`}
        fill="var(--primary)"
        opacity="0.12"
        stroke="none"
      />
      {/* meta mínima 6,0 */}
      <line
        x1="0"
        x2={w}
        y1={yMeta}
        y2={yMeta}
        stroke="var(--warning)"
        strokeWidth="1"
        strokeDasharray="4 3"
        vectorEffect="non-scaling-stroke"
      />
      <polyline
        points={pts.join(" ")}
        fill="none"
        stroke="var(--primary)"
        strokeWidth="1.8"
        strokeLinejoin="round"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

/** Mini painel de evolução na home da atendente: notas recentes e erros que se repetem. */
export function EvolucaoAtendente({ atendente }: { atendente: string }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("coach_roleplay_sessions")
        .select("nota,created_at,melhorias,modo")
        .eq("atendente", atendente)
        .order("created_at", { ascending: false })
        .limit(40);
      if (cancelled) return;
      setRows((data ?? []) as unknown as Row[]);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [atendente]);

  const dados = useMemo(() => {
    const ordenadas = [...rows].reverse();
    const ultimas = ordenadas.slice(-5);
    const notas = ultimas.map((r) => Number(r.nota) || 0);
    const anteriores = ordenadas.slice(-10, -5).map((r) => Number(r.nota) || 0);
    const media = (a: number[]) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0);
    const foco = recorrentes(
      rows.flatMap((r) => (Array.isArray(r.melhorias) ? r.melhorias : [])).map(String),
    );
    return {
      notas,
      media: media(notas),
      delta: anteriores.length ? media(notas) - media(anteriores) : 0,
      foco,
      total: rows.length,
    };
  }, [rows]);

  if (loading) {
    return (
      <div className="rounded-3xl border bg-card p-6 shadow-[var(--shadow-card)] flex items-center justify-center text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin mr-2" /> Carregando sua evolução…
      </div>
    );
  }

  if (dados.total === 0) return null;

  const subindo = dados.delta >= 0;

  return (
    <div className="rounded-3xl border bg-card p-6 md:p-8 shadow-[var(--shadow-card)]">
      <h2 className="text-xl font-semibold tracking-tight flex items-center gap-2">
        <LineChart className="h-4 w-4 text-primary" /> Sua evolução
      </h2>

      <div className="mt-5 grid sm:grid-cols-[minmax(0,1fr)_auto] gap-5 items-end">
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground mb-1">
            Nota nos últimos {dados.notas.length}{" "}
            {dados.notas.length === 1 ? "atendimento" : "atendimentos"}
          </p>
          <Sparkline notas={dados.notas} />
          <div className="mt-2 flex gap-1.5">
            {dados.notas.map((n, i) => (
              <span
                key={i}
                className="rounded-md bg-secondary px-2 py-0.5 text-[11px] font-medium tabular-nums"
              >
                {n.toFixed(1)}
              </span>
            ))}
          </div>
        </div>
        <div className="text-right">
          <p className="text-3xl font-bold leading-none tabular-nums">{dados.media.toFixed(1)}</p>
          <p
            className={`text-[11px] mt-1 inline-flex items-center gap-1 ${
              subindo ? "text-[color:var(--success)]" : "text-destructive"
            }`}
          >
            {subindo ? (
              <TrendingUp className="h-3 w-3" />
            ) : (
              <TrendingDown className="h-3 w-3" />
            )}
            {dados.delta === 0
              ? "média atual"
              : `${subindo ? "+" : ""}${dados.delta.toFixed(1)} vs. anteriores`}
          </p>
        </div>
      </div>

      {dados.foco.length > 0 && (
        <div className="mt-6 border-t pt-5">
          <p className="text-sm font-medium flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-destructive" /> Seus pontos que mais se repetem
          </p>
          <ul className="mt-3 space-y-2">
            {dados.foco.map((f, i) => (
              <li key={i} className="flex items-start gap-3 rounded-xl border p-3">
                <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-destructive/10 text-destructive text-xs font-bold">
                  {i + 1}
                </span>
                <div className="min-w-0">
                  <p className="text-sm">{f.texto}</p>
                  <p className="text-xs text-muted-foreground">
                    apareceu {f.vezes} {f.vezes === 1 ? "vez" : "vezes"}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
