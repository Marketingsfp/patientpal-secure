/**
 * Nina → Decisões do Jev (Etapa C). Lista somente leitura das decisões,
 * relatório de calibragem dos sinais de transferência e limites por clínica
 * (só administradores alteram). Identifica a conversa e o texto registrado em cada decisão.
 */
import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useClinica } from "@/hooks/use-clinica";
import { mostrarErro } from "@/lib/traduzir-erro";
import { FLAG_JEV, type FaseJev } from "@/lib/nina/jev";
import { idsConversasJev } from "@/lib/nina/jev-auditoria";
import { JevConversa, JevTextoAnalisado } from "@/components/nina/JevDecisaoContexto";
import { JevObservacaoIntencao } from "@/components/nina/JevObservacaoIntencao";
import {
  LIMITES_JEV_PADRAO,
  LIMITE_MAX,
  LIMITE_MIN,
  ROTULO_LIMITE,
  casosAcima,
  normalizarLimites,
  relatorioCalibragem,
  type LimitesJev,
  type SinalCalibragem,
} from "@/lib/nina/jev-limites";

export const Route = createFileRoute("/_authenticated/app/nina-jev")({
  head: () => ({
    meta: [
      { title: "Nina — Decisões do Jev" },
      {
        name: "description",
        content:
          "Decisões do Jev na Nina, calibragem dos sinais de transferência e limites por clínica.",
      },
      { property: "og:title", content: "Nina — Decisões do Jev" },
      {
        property: "og:description",
        content: "Painel de decisões e calibragem do Jev por clínica.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Pagina,
});

const ROTULO_FASE: Record<FaseJev, string> = {
  fase1_intencao: "Intenção",
  fase2_encaminhamento: "Transferência",
  fase3_especialidade: "Especialidade",
  fase4_cadastro: "Cadastro",
  fase5_avaliacao: "Avaliação",
  fase6_conferencia: "Conferência",
  fase7_escolha: "Sim / horário",
  fase8_motivo: "Motivo da transferência",
};
const ROTULO_SINAL: Record<SinalCalibragem, string> = {
  urgencia: "Urgência clínica",
  pedido_atendente: "Pedido de atendente",
  irritacao: "Irritação",
  entendimento: "Entendimento (abaixo de 0,5 conta como dúvida)",
};

type Decisao = {
  id: string;
  created_at: string;
  fase: FaseJev;
  teste: boolean;
  aplicada: boolean;
  latency_ms: number | null;
  erro: string | null;
  respostas: Record<string, any> | null;
  conversation_id: string | null;
  perguntas: unknown;
  numero_conversa?: number;
};

function resumoResposta(r: Record<string, any> | null): string {
  if (!r) return "—";
  return Object.entries(r)
    .filter(([k]) => !k.startsWith("_"))
    .map(([k, v]) => {
      if (typeof v?.choice === "string") {
        const p = v.probabilities?.[v.choice] ?? v.confidence;
        return `${k}: ${v.choice}${typeof p === "number" ? ` (${Math.round(p * 100)}%)` : ""}`;
      }
      if (typeof v?.noul === "number") return `${k}: ${v.noul.toFixed(2)}`;
      if (typeof v?.score === "number") return `${k}: ${v.score.toFixed(2)}`;
      return null;
    })
    .filter(Boolean)
    .join(" · ");
}

function Pagina() {
  const { clinicaAtual } = useClinica();
  const clinicaId = clinicaAtual?.clinica_id ?? null;
  const ehAdmin = clinicaAtual?.role === "admin";
  const [dias, setDias] = useState("7");
  const [fase, setFase] = useState<string>("todas");
  const [carregando, setCarregando] = useState(false);
  const [decisoes, setDecisoes] = useState<Decisao[]>([]);
  const [calib, setCalib] = useState<Array<Record<string, unknown> | null>>([]);
  const [limites, setLimites] = useState<LimitesJev>(LIMITES_JEV_PADRAO);
  const [editando, setEditando] = useState<Record<string, string>>({});
  const [salvando, setSalvando] = useState(false);
  const cargaAtual = useRef(0);
  const invalidarCarga = useCallback(() => {
    cargaAtual.current++;
  }, []);

  const carregar = useCallback(async () => {
    const carga = ++cargaAtual.current;
    if (!clinicaId) return;
    setCarregando(true);
    try {
      const desde = new Date(Date.now() - Number(dias) * 86_400_000).toISOString();
      let q = supabase
        .from("nina_jev_decisoes" as never)
        .select(
          "id,created_at,fase,teste,aplicada,latency_ms,erro,respostas,conversation_id,perguntas",
        )
        .eq("clinica_id", clinicaId)
        .gte("created_at", desde)
        .order("created_at", { ascending: false })
        .limit(300);
      if (fase !== "todas") q = q.eq("fase", fase);
      const [lista, c, l] = await Promise.all([
        q,
        supabase
          .from("nina_jev_decisoes" as never)
          .select("respostas")
          .eq("clinica_id", clinicaId)
          .eq("fase", "fase1_intencao")
          .gte("created_at", desde)
          .limit(5000),
        supabase
          .from("nina_jev_limites" as never)
          .select("*")
          .eq("clinica_id", clinicaId)
          .maybeSingle(),
      ]);
      if (lista.error) throw lista.error;
      const linhas = (lista.data ?? []) as unknown as Decisao[];
      const ids = idsConversasJev(linhas);
      const numeros = new Map<string, number>();
      // Uma consulta em lote, com sessão/RLS e clínica; sem acesso administrativo.
      if (ids.length) {
        const conversas = await supabase
          .from("atend_conversas")
          .select("id,numero_conversa")
          .eq("clinica_id", clinicaId)
          .in("id", ids);
        if (!conversas.error) {
          for (const conversa of conversas.data ?? [])
            numeros.set(conversa.id, conversa.numero_conversa);
        }
        // Mesmo sem permissão para consultar a conversa, seu ID auditado continua disponível.
      }
      if (carga !== cargaAtual.current) return;
      setDecisoes(
        linhas.map((d) => ({ ...d, numero_conversa: numeros.get(d.conversation_id ?? "") })),
      );
      setCalib(
        ((c.data ?? []) as Array<{ respostas: Record<string, unknown> | null }>).map(
          (x) => x.respostas,
        ),
      );
      const lim = normalizarLimites(l.data as never);
      setLimites(lim);
      setEditando(
        Object.fromEntries(Object.entries(lim).map(([k, v]) => [k, String(v).replace(".", ",")])),
      );
    } catch (e) {
      if (carga === cargaAtual.current) mostrarErro(e);
    } finally {
      if (carga === cargaAtual.current) setCarregando(false);
    }
  }, [clinicaId, dias, fase]);

  useEffect(() => {
    setDecisoes([]);
    setCalib([]);
    void carregar();
    return invalidarCarga;
  }, [carregar, invalidarCarga]);

  const relatorio = useMemo(() => relatorioCalibragem(calib), [calib]);
  const totais = useMemo(() => {
    const comErro = decisoes.filter((d) => d.erro).length;
    const lat = decisoes
      .map((d) => d.latency_ms)
      .filter((n): n is number => typeof n === "number")
      .sort((a, b) => a - b);
    return {
      total: decisoes.length,
      aplicadas: decisoes.filter((d) => d.aplicada).length,
      comErro,
      mediana: lat.length ? lat[Math.floor(lat.length / 2)] : null,
    };
  }, [decisoes]);

  async function salvarLimites() {
    if (!clinicaId) return;
    const novo: Record<string, number> = {};
    for (const k of Object.keys(LIMITES_JEV_PADRAO) as (keyof LimitesJev)[]) {
      const v = Number(String(editando[k] ?? "").replace(",", "."));
      if (!Number.isFinite(v) || v < LIMITE_MIN || v > LIMITE_MAX) {
        toast.error(`${ROTULO_LIMITE[k]}: use um valor entre 0,3 e 0,95.`);
        return;
      }
      novo[k] = v;
    }
    setSalvando(true);
    const { data: u } = await supabase.auth.getUser();
    const { error } = await supabase.from("nina_jev_limites" as never).upsert({
      clinica_id: clinicaId,
      ...novo,
      updated_by: u.user?.id ?? null,
      updated_at: new Date().toISOString(),
    } as never);
    setSalvando(false);
    if (error) return mostrarErro(error);
    toast.success("Limites salvos. Valem a partir da próxima mensagem.");
    void carregar();
  }

  const limiteDoSinal = (s: SinalCalibragem) => (s === "entendimento" ? null : limites[s]);

  return (
    <div className="space-y-4 p-4">
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <h1 className="text-xl font-semibold">Decisões do Jev</h1>
          <p className="text-sm text-muted-foreground">
            {clinicaAtual?.clinica?.nome ?? "Selecione uma clínica"}
          </p>
        </div>
        <div className="ml-auto flex flex-wrap items-end gap-2">
          <div>
            <Label>Período</Label>
            <Select value={dias} onValueChange={setDias}>
              <SelectTrigger className="w-36">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1">Últimas 24 h</SelectItem>
                <SelectItem value="7">Últimos 7 dias</SelectItem>
                <SelectItem value="30">Últimos 30 dias</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Fase</Label>
            <Select value={fase} onValueChange={setFase}>
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todas">Todas</SelectItem>
                {(Object.keys(FLAG_JEV) as FaseJev[]).map((f) => (
                  <SelectItem key={f} value={f}>
                    {ROTULO_FASE[f]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button variant="outline" onClick={() => void carregar()} disabled={carregando}>
            {carregando ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}{" "}
            Atualizar
          </Button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-4">
        {[
          ["Decisões", totais.total],
          ["Aplicadas", totais.aplicadas],
          ["Sem decisão (erro/demora)", totais.comErro],
          ["Tempo mediano", totais.mediana === null ? "—" : `${totais.mediana} ms`],
        ].map(([t, v]) => (
          <Card key={String(t)}>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">{t}</p>
              <p className="text-2xl font-semibold">{v}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Calibragem dos sinais de transferência</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          {relatorio.map((r) => {
            const max = Math.max(1, ...r.faixas.map((f) => f.casos));
            const lim = limiteDoSinal(r.sinal);
            return (
              <div key={r.sinal} className="space-y-1">
                <p className="text-sm font-medium">{ROTULO_SINAL[r.sinal]}</p>
                <p className="text-xs text-muted-foreground">
                  {r.total} mensagens
                  {lim !== null
                    ? ` · ${casosAcima(r, lim)} no limite atual (${String(lim).replace(".", ",")}) ou acima`
                    : ""}
                </p>
                {r.faixas.map((f) => (
                  <div key={f.de} className="flex items-center gap-2 text-xs">
                    <span className="w-16 tabular-nums">
                      {f.de.toFixed(1).replace(".", ",")}–{f.ate.toFixed(1).replace(".", ",")}
                    </span>
                    <div className="h-3 flex-1 rounded bg-muted">
                      <div
                        className={`h-3 rounded ${lim !== null && f.de >= lim - 1e-9 ? "bg-destructive" : "bg-primary"}`}
                        style={{ width: `${(f.casos / max) * 100}%` }}
                      />
                    </div>
                    <span className="w-10 text-right tabular-nums">{f.casos}</span>
                  </div>
                ))}
              </div>
            );
          })}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Limites desta clínica</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Valores entre 0,3 e 0,95. Possível regra de negócio — validar com a equipe da clínica.
            {!ehAdmin && " Somente administradores podem alterar."}
          </p>
          <div className="grid gap-3 md:grid-cols-2">
            {(Object.keys(LIMITES_JEV_PADRAO) as (keyof LimitesJev)[]).map((k) => (
              <div key={k}>
                <Label>
                  {ROTULO_LIMITE[k]}{" "}
                  <span className="text-muted-foreground">
                    (padrão {String(LIMITES_JEV_PADRAO[k]).replace(".", ",")})
                  </span>
                </Label>
                <Input
                  value={editando[k] ?? ""}
                  disabled={!ehAdmin}
                  inputMode="decimal"
                  onChange={(e) => setEditando((s) => ({ ...s, [k]: e.target.value }))}
                />
              </div>
            ))}
          </div>
          {ehAdmin && (
            <Button onClick={() => void salvarLimites()} disabled={salvando}>
              {salvando && <Loader2 className="h-4 w-4 animate-spin" />} Salvar limites
            </Button>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Decisões ({decisoes.length}
            {decisoes.length === 300 ? ", mais recentes" : ""})
          </CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <p className="mb-3 text-xs text-muted-foreground">
            A leitura ampliada orienta a Nina sobre múltiplos pedidos, horários habituais e vagas,
            alcance do aceite e correções. Abra o registro para ver a orientação do turno. Registros
            antigos em observação permanecem identificados; a coluna “Aplicada” se refere à decisão
            original.
          </p>
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-muted-foreground">
              <tr>
                <th className="p-2">Quando</th>
                <th className="p-2">Conversa</th>
                <th className="p-2">Texto analisado</th>
                <th className="p-2">Fase</th>
                <th className="p-2">Resposta</th>
                <th className="p-2">Aplicada</th>
                <th className="p-2">Tempo</th>
              </tr>
            </thead>
            <tbody>
              {decisoes.map((d) => (
                <tr key={d.id} className="border-t align-top">
                  <td className="p-2 whitespace-nowrap">
                    {new Date(d.created_at).toLocaleString("pt-BR")}
                    {d.teste && (
                      <Badge variant="outline" className="ml-1">
                        teste
                      </Badge>
                    )}
                  </td>
                  <td className="p-2">
                    <JevConversa id={d.conversation_id} numero={d.numero_conversa} />
                  </td>
                  <td className="p-2">
                    <JevTextoAnalisado perguntas={d.perguntas} />
                  </td>
                  <td className="p-2">{ROTULO_FASE[d.fase] ?? d.fase}</td>
                  <td className="p-2">
                    {d.erro ? (
                      <span className="text-muted-foreground">
                        Sem decisão: {d.erro.slice(0, 60)}
                      </span>
                    ) : (
                      resumoResposta(d.respostas)
                    )}
                    <JevObservacaoIntencao respostas={d.respostas} />
                  </td>
                  <td className="p-2">{d.aplicada ? "Sim" : "Não"}</td>
                  <td className="p-2 tabular-nums">{d.latency_ms ?? "—"} ms</td>
                </tr>
              ))}
              {decisoes.length === 0 && (
                <tr>
                  <td colSpan={7} className="p-4 text-center text-muted-foreground">
                    {carregando ? "Carregando decisões…" : "Nenhuma decisão no período."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
