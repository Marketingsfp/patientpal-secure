import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Target, TrendingUp, TrendingDown, Wallet, Stethoscope, AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useClinica } from "@/hooks/use-clinica";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  projetarMes,
  serieTendencia,
  simularCrescimento,
  type DiaCaixa,
  type EntradaProjecao,
  type ResultadoProjecao,
} from "@/lib/financeiro/projecao";
import { MiniLineChart } from "@/components/charts/MiniLineChart";

export const Route = createFileRoute("/_authenticated/app/financeiro/projecao")({
  component: Page,
  head: () => ({ meta: [{ title: "Projeção — Financeiro" }] }),
});

const fmt = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const iso = (d: Date) => d.toLocaleDateString("en-CA");

/** O banco devolve no máximo 1.000 linhas por consulta. */
const PAGINA = 1000;
const MAX_PAGINAS = 50;

async function paginado<T>(montar: () => any): Promise<T[]> {
  const out: T[] = [];
  for (let p = 0; p < MAX_PAGINAS; p++) {
    const { data, error } = await montar().range(p * PAGINA, (p + 1) * PAGINA - 1);
    if (error) throw error;
    const lote = (data ?? []) as T[];
    out.push(...lote);
    if (lote.length < PAGINA) break;
  }
  return out;
}

type LancRow = { data: string; tipo: string; valor: number; status: string };
type AtendRow = { data: string; valor_total: number | null; status: string };

function Page() {
  const { clinicaAtual } = useClinica();
  const [loading, setLoading] = useState(true);
  const [dias, setDias] = useState<DiaCaixa[]>([]);
  const [meta, setMeta] = useState<number>(0);
  /** Receita confirmada do mês anterior fechado — base das metas de crescimento. */
  const [baseMesAnterior, setBaseMesAnterior] = useState(0);

  const hoje = useMemo(() => new Date(), []);
  const inicio = useMemo(() => iso(new Date(hoje.getFullYear(), hoje.getMonth(), 1)), [hoje]);
  const fim = useMemo(() => iso(new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0)), [hoje]);
  const hojeIso = useMemo(() => iso(hoje), [hoje]);

  const mesAnterior = useMemo(() => {
    const ini = new Date(hoje.getFullYear(), hoje.getMonth() - 1, 1);
    return {
      de: iso(ini),
      ate: iso(new Date(hoje.getFullYear(), hoje.getMonth(), 0)),
      nome: ini.toLocaleDateString("pt-BR", { month: "long", year: "numeric" }),
    };
  }, [hoje]);

  const chaveMeta = clinicaAtual ? `fin-meta-${clinicaAtual.clinica_id}-${inicio}` : "";

  useEffect(() => {
    if (!chaveMeta) return;
    const salvo = Number(localStorage.getItem(chaveMeta) ?? 0);
    setMeta(Number.isFinite(salvo) ? salvo : 0);
  }, [chaveMeta]);

  useEffect(() => {
    (async () => {
      if (!clinicaAtual) return;
      setLoading(true);
      try {
        const [lancs, atends] = await Promise.all([
          paginado<LancRow>(() =>
            supabase
              .from("fin_lancamentos")
              .select("data, tipo, valor, status")
              .eq("clinica_id", clinicaAtual.clinica_id)
              .eq("status", "confirmado")
              .gte("data", inicio)
              .lte("data", hojeIso)
              .order("data")
              .order("id"),
          ),
          paginado<AtendRow>(() =>
            supabase
              .from("fin_atendimentos")
              .select("data, valor_total, status")
              .eq("clinica_id", clinicaAtual.clinica_id)
              .gte("data", inicio)
              .lte("data", hojeIso)
              .order("data")
              .order("id"),
          ),
        ]);

        const mapa = new Map<string, DiaCaixa>();
        const pegar = (data: string) => {
          const d = String(data).slice(0, 10);
          let linha = mapa.get(d);
          if (!linha) {
            linha = { data: d, receita: 0, despesa: 0, atendimentos: 0 };
            mapa.set(d, linha);
          }
          return linha;
        };

        for (const l of lancs) {
          const linha = pegar(l.data);
          const v = Number(l.valor) || 0;
          if (l.tipo === "receita") {
            linha.receita += v;
            // Mesma régua das outras telas: cada pagamento conta 1 atendimento.
            linha.atendimentos += 1;
          } else if (l.tipo === "despesa") {
            linha.despesa += v;
          }
        }
        // Cortesias: atendidos sem cobrança, contam na produção.
        for (const a of atends) {
          if (a.status === "cancelado") continue;
          if ((Number(a.valor_total) || 0) > 0) continue;
          pegar(a.data).atendimentos += 1;
        }

        setDias([...mapa.values()].sort((x, y) => x.data.localeCompare(y.data)));
      } finally {
        setLoading(false);
      }
    })();
  }, [clinicaAtual?.clinica_id, inicio, hojeIso]);

  const r: ResultadoProjecao = useMemo(
    () => projetarMes({ inicio, fim, hoje: hojeIso, dias, meta: meta || undefined }),
    [inicio, fim, hojeIso, dias, meta],
  );

  const salvarMeta = (valor: number) => {
    setMeta(valor);
    if (chaveMeta) localStorage.setItem(chaveMeta, String(valor));
  };

  const confiancaTexto =
    r.confianca === "alta"
      ? "Estimativa firme — já há bastante movimento no mês."
      : r.confianca === "media"
        ? "Estimativa razoável — poucos dias de movimento ainda."
        : "Estimativa fraca — o mês mal começou.";

  const Bloco = ({
    label,
    realizado,
    projetado,
    icon: Icon,
    color,
  }: {
    label: string;
    realizado: string;
    projetado: string;
    icon: typeof Wallet;
    color: string;
  }) => (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm text-muted-foreground">{label}</p>
            <p className="text-2xl font-semibold mt-1">{loading ? "..." : projetado}</p>
            <p className="text-xs text-muted-foreground mt-2">
              Já realizado: <span className="font-medium text-foreground">{realizado}</span>
            </p>
          </div>
          <div className={`h-10 w-10 shrink-0 rounded-lg flex items-center justify-center ${color}`}>
            <Icon className="h-5 w-5" />
          </div>
        </div>
      </CardContent>
    </Card>
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold flex items-center gap-2">
          <Target className="h-6 w-6 text-primary" />
          Projeção do mês
        </h1>
        <p className="text-sm text-muted-foreground">
          Fechamento estimado de {inicio.slice(8)}/{inicio.slice(5, 7)} a {fim.slice(8)}/
          {fim.slice(5, 7)} · {r.diasCorridos} dia(s) corridos, {r.diasRestantes} pela frente ·{" "}
          {confiancaTexto}
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Bloco
          label="Receita projetada"
          projetado={fmt(r.projetado.receita)}
          realizado={fmt(r.realizado.receita)}
          icon={TrendingUp}
          color="bg-green-500/10 text-green-600"
        />
        <Bloco
          label="Despesa projetada"
          projetado={fmt(r.projetado.despesa)}
          realizado={fmt(r.realizado.despesa)}
          icon={TrendingDown}
          color="bg-red-500/10 text-red-600"
        />
        <Bloco
          label="Saldo projetado"
          projetado={fmt(r.projetado.saldo)}
          realizado={fmt(r.realizado.saldo)}
          icon={Wallet}
          color="bg-primary/10 text-primary"
        />
        <Bloco
          label="Atendimentos projetados"
          projetado={String(r.projetado.atendimentos)}
          realizado={String(r.realizado.atendimentos)}
          icon={Stethoscope}
          color="bg-blue-500/10 text-blue-600"
        />
      </div>

      <Card>
        <CardContent className="pt-6 space-y-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div className="space-y-1">
              <Label htmlFor="meta">Meta de receita do mês</Label>
              <Input
                id="meta"
                type="number"
                min={0}
                step={1000}
                className="w-56"
                value={meta || ""}
                placeholder="Ex.: 500000"
                onChange={(ev) => salvarMeta(Number(ev.target.value) || 0)}
              />
              <p className="text-xs text-muted-foreground">
                Fica guardada neste navegador, por clínica e por mês.
              </p>
            </div>
            <div className="text-sm">
              <p className="text-muted-foreground">
                Ritmo atual: <span className="font-medium text-foreground">{fmt(r.mediaDiaria)}</span>{" "}
                e {r.mediaAtendimentosDia} atendimento(s) por dia de movimento.
              </p>
            </div>
          </div>

          {r.meta ? (
            <div className="rounded-lg border p-4 text-sm space-y-1">
              <p className="font-medium">
                {r.meta.alcancavel
                  ? "No ritmo de hoje, a meta é alcançada."
                  : "No ritmo de hoje, a meta não é alcançada."}
              </p>
              <p className="text-muted-foreground">
                Faltam {fmt(r.meta.falta)} para a meta de {fmt(r.meta.meta)}.
              </p>
              <p className="text-muted-foreground">
                Precisa entrar {fmt(r.meta.porDiaRestante)} por dia de movimento restante — cerca de{" "}
                {r.meta.atendimentosPorDia} atendimento(s) por dia no ticket atual de{" "}
                {fmt(r.realizado.ticket)}.
              </p>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              Informe uma meta para ver quanto falta e quantos atendimentos por dia são necessários.
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-500" />O que dá para melhorar
          </h2>
          {loading ? (
            <p className="text-sm text-muted-foreground mt-3">Carregando...</p>
          ) : r.pontos.length === 0 ? (
            <p className="text-sm text-muted-foreground mt-3">
              Nenhum ponto de atenção no ritmo deste mês.
            </p>
          ) : (
            <ul className="mt-3 space-y-3">
              {r.pontos.map((p) => (
                <li key={p.id} className="rounded-lg border p-3">
                  <p
                    className={
                      p.gravidade === "alta"
                        ? "font-medium text-red-600"
                        : p.gravidade === "media"
                          ? "font-medium text-amber-600"
                          : "font-medium"
                    }
                  >
                    {p.titulo}
                  </p>
                  <p className="text-sm text-muted-foreground mt-0.5">{p.detalhe}</p>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
