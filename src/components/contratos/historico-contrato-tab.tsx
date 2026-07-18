import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Card } from "@/components/ui/card";
import {
  FilePlus2,
  RefreshCw,
  UserPlus,
  UserMinus,
  Pencil,
  DollarSign,
  XCircle,
  Clock,
  User as UserIcon,
  History as HistoryIcon,
} from "lucide-react";
import { mostrarErro } from "@/lib/traduzir-erro";

type Evento = {
  id: string;
  ts: string;
  tipo: string;
  action: string;
  user_id: string | null;
  user_nome: string | null;
  user_email: string | null;
  dados_antes: Record<string, unknown> | null;
  dados_depois: Record<string, unknown> | null;
  extra: string | null;
};

// Rótulos amigáveis para campos técnicos
const LABELS_CONTRATO: Record<string, string> = {
  valor_mensalidade: "Valor mensal",
  taxa_adesao: "Taxa de adesão",
  taxa_inclusao_dependente: "Taxa de inclusão",
  dia_vencimento: "Dia de vencimento",
  data_inicio: "Data de início",
  data_fim: "Data de término",
  status: "Status",
  faixa_id: "Faixa (nº de pessoas)",
  convenio_id: "Convênio",
  apenas_titular_financeiro: "Apenas titular financeiro",
  observacoes: "Observações",
  sem_carencia: "Isenção de carência",
  sem_carencia_motivo: "Motivo da isenção",
  numero_renovacoes: "Nº de renovações",
  contrato_origem_id: "Contrato de origem",
  paciente_id: "Titular",
  cartao_convenio_id: "Cartão",
};
const LABELS_MENS: Record<string, string> = {
  vencimento: "Vencimento",
  valor: "Valor",
  status: "Status",
  pago_em: "Pago em",
  observacoes: "Observações",
};
// Campos ignorados na diff (ruído)
const IGNORAR = new Set([
  "updated_at",
  "created_at",
  "numero",
  "id",
  "clinica_id",
  "sem_carencia_por",
  "sem_carencia_em",
]);

function fmtDataHora(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}
function fmtRelativo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return "agora";
  if (min < 60) return `há ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `há ${h}h`;
  const d = Math.floor(h / 24);
  if (d < 30) return `há ${d}d`;
  const m = Math.floor(d / 30);
  if (m < 12) return `há ${m} ${m === 1 ? "mês" : "meses"}`;
  return `há ${Math.floor(m / 12)} ${Math.floor(m / 12) === 1 ? "ano" : "anos"}`;
}
function fmtValor(v: unknown): string {
  if (v === null || v === undefined || v === "") return "—";
  if (typeof v === "boolean") return v ? "Sim" : "Não";
  if (typeof v === "number") return String(v);
  const s = String(v);
  // dinheiro-like
  if (/^\d+(\.\d+)?$/.test(s) && s.includes(".")) {
    const n = Number(s);
    if (!Number.isNaN(n)) return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  }
  // ISO date
  if (/^\d{4}-\d{2}-\d{2}(T|$)/.test(s)) {
    try {
      return new Date(s).toLocaleDateString("pt-BR");
    } catch { /* noop */ }
  }
  return s;
}
function fmtDinheiro(v: unknown): string {
  const n = Number(v ?? 0);
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function diffCampos(
  antes: Record<string, unknown> | null,
  depois: Record<string, unknown> | null,
  labels: Record<string, string>,
): { campo: string; label: string; de: string; para: string }[] {
  const out: { campo: string; label: string; de: string; para: string }[] = [];
  const chaves = new Set([
    ...Object.keys(antes ?? {}),
    ...Object.keys(depois ?? {}),
  ]);
  for (const k of chaves) {
    if (IGNORAR.has(k)) continue;
    const a = antes?.[k] ?? null;
    const b = depois?.[k] ?? null;
    if (JSON.stringify(a) === JSON.stringify(b)) continue;
    // Ignora quando ambos são valor "vazio equivalente"
    if ((a === null || a === "") && (b === null || b === "")) continue;
    out.push({
      campo: k,
      label: labels[k] ?? k,
      de: fmtValor(a),
      para: fmtValor(b),
    });
  }
  return out;
}

type Grupo = "contrato" | "renovacao" | "dependentes" | "mensalidades";
function grupoDe(tipo: string): Grupo {
  if (tipo.startsWith("dependente")) return "dependentes";
  if (tipo === "renovacao") return "renovacao";
  if (tipo === "mensalidade_alterada") return "mensalidades";
  return "contrato";
}

function IconeEvento({ tipo }: { tipo: string }) {
  const cls = "h-4 w-4";
  if (tipo === "contrato_criado") return <FilePlus2 className={`${cls} text-emerald-600`} />;
  if (tipo === "contrato_excluido") return <XCircle className={`${cls} text-destructive`} />;
  if (tipo === "contrato_alterado") return <Pencil className={`${cls} text-blue-600`} />;
  if (tipo === "renovacao") return <RefreshCw className={`${cls} text-purple-600`} />;
  if (tipo === "dependente_incluido" || tipo === "dependente_incluido_legado")
    return <UserPlus className={`${cls} text-emerald-600`} />;
  if (tipo === "dependente_excluido" || tipo === "dependente_excluido_legado")
    return <UserMinus className={`${cls} text-rose-600`} />;
  if (tipo === "mensalidade_alterada") return <DollarSign className={`${cls} text-amber-600`} />;
  return <Pencil className={cls} />;
}

function TituloEvento(e: Evento): string {
  switch (e.tipo) {
    case "contrato_criado":
      return "Contrato criado";
    case "contrato_excluido":
      return "Contrato removido";
    case "contrato_alterado":
      return "Contrato alterado";
    case "renovacao": {
      const dd = e.dados_depois ?? {};
      const t = (dd.tipo as string) || "";
      return t === "troca_plano" ? "Renovação com troca de plano" : "Renovação do contrato";
    }
    case "dependente_incluido":
    case "dependente_incluido_legado":
      return `Dependente incluído${e.extra ? ` — ${e.extra}` : ""}`;
    case "dependente_excluido":
    case "dependente_excluido_legado":
      return `Dependente removido${e.extra ? ` — ${e.extra}` : ""}`;
    case "mensalidade_alterada":
      return `Mensalidade alterada${e.extra ? ` (parcela ${e.extra})` : ""}`;
    default:
      return e.tipo;
  }
}

function CorpoEvento({ evento }: { evento: Evento }) {
  const { tipo, dados_antes, dados_depois } = evento;

  if (tipo === "contrato_criado") {
    const d = dados_depois ?? {};
    return (
      <div className="text-xs text-muted-foreground grid gap-1 sm:grid-cols-2">
        <div>Valor mensal: <strong>{fmtDinheiro(d.valor_mensalidade)}</strong></div>
        <div>Taxa de adesão: <strong>{fmtDinheiro(d.taxa_adesao)}</strong></div>
        <div>Início: <strong>{fmtValor(d.data_inicio)}</strong></div>
        <div>Término: <strong>{fmtValor(d.data_fim)}</strong></div>
        <div>Dia de vencimento: <strong>{String(d.dia_vencimento ?? "—")}</strong></div>
        <div>Status: <strong>{fmtValor(d.status)}</strong></div>
      </div>
    );
  }

  if (tipo === "renovacao") {
    const d = dados_depois ?? {};
    const deps = Array.isArray(d.dependentes_incluidos) ? d.dependentes_incluidos : [];
    return (
      <div className="text-xs text-muted-foreground space-y-1">
        <div>
          Tipo:{" "}
          <strong>{d.tipo === "troca_plano" ? "Troca de plano" : "Extensão"}</strong>{" "}
          · Parcelas geradas: <strong>{String(d.parcelas_geradas ?? 0)}</strong>
        </div>
        <div>
          Período: <strong>{fmtValor(d.periodo_inicio)}</strong> → <strong>{fmtValor(d.periodo_fim)}</strong>
        </div>
        <div>
          Valor: <strong>{fmtDinheiro(d.valor_anterior)}</strong> →{" "}
          <strong>{fmtDinheiro(d.valor_novo)}</strong>
        </div>
        {deps.length > 0 && (
          <div>Dependentes incluídos no ato: <strong>{deps.length}</strong></div>
        )}
        {d.observacao ? <div>Obs.: {String(d.observacao)}</div> : null}
      </div>
    );
  }

  if (tipo === "dependente_incluido" || tipo === "dependente_incluido_legado") {
    const d = dados_depois ?? {};
    return (
      <div className="text-xs text-muted-foreground">
        Parentesco: <strong>{fmtValor(d.parentesco) || "—"}</strong> ·
        Tipo: <strong>{fmtValor(d.tipo)}</strong>
        {tipo.endsWith("_legado") && (
          <div className="italic mt-1">Registro anterior à auditoria — usuário não disponível.</div>
        )}
      </div>
    );
  }
  if (tipo === "dependente_excluido" || tipo === "dependente_excluido_legado") {
    const d = dados_antes ?? {};
    return (
      <div className="text-xs text-muted-foreground">
        Parentesco: <strong>{fmtValor(d.parentesco) || "—"}</strong>
        {tipo.endsWith("_legado") && (
          <div className="italic mt-1">Registro anterior à auditoria — usuário não disponível.</div>
        )}
      </div>
    );
  }

  if (tipo === "contrato_alterado") {
    const diffs = diffCampos(dados_antes, dados_depois, LABELS_CONTRATO);
    if (diffs.length === 0) {
      return <div className="text-xs text-muted-foreground italic">Sem alterações relevantes.</div>;
    }
    return (
      <ul className="text-xs space-y-1">
        {diffs.map((d) => (
          <li key={d.campo}>
            <span className="text-muted-foreground">{d.label}:</span>{" "}
            <span className="line-through text-rose-600">{d.de}</span>{" "}
            <span className="text-muted-foreground">→</span>{" "}
            <span className="text-emerald-700 font-medium">{d.para}</span>
          </li>
        ))}
      </ul>
    );
  }

  if (tipo === "mensalidade_alterada") {
    const diffs = diffCampos(dados_antes, dados_depois, LABELS_MENS);
    if (diffs.length === 0) {
      return <div className="text-xs text-muted-foreground italic">Sem alterações relevantes.</div>;
    }
    return (
      <ul className="text-xs space-y-1">
        {diffs.map((d) => (
          <li key={d.campo}>
            <span className="text-muted-foreground">{d.label}:</span>{" "}
            <span className="line-through text-rose-600">{d.de}</span>{" "}
            <span className="text-muted-foreground">→</span>{" "}
            <span className="text-emerald-700 font-medium">{d.para}</span>
          </li>
        ))}
      </ul>
    );
  }

  return null;
}

export function HistoricoContratoTab({ contratoId }: { contratoId: string }) {
  const [loading, setLoading] = useState(true);
  const [eventos, setEventos] = useState<Evento[]>([]);
  const [busca, setBusca] = useState("");
  const [filtros, setFiltros] = useState<Record<Grupo, boolean>>({
    contrato: true,
    renovacao: true,
    dependentes: true,
    mensalidades: true,
  });

  useEffect(() => {
    let cancel = false;
    (async () => {
      setLoading(true);
      const { data, error } = await supabase.rpc("contrato_historico" as never, {
        _contrato_id: contratoId,
      } as never);
      if (cancel) return;
      if (error) {
        mostrarErro(error);
        setEventos([]);
      } else {
        setEventos((data as Evento[]) ?? []);
      }
      setLoading(false);
    })();
    return () => {
      cancel = true;
    };
  }, [contratoId]);

  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return eventos.filter((e) => {
      const g = grupoDe(e.tipo);
      if (!filtros[g]) return false;
      if (!q) return true;
      const hay = [
        TituloEvento(e),
        e.user_nome ?? "",
        e.user_email ?? "",
        e.extra ?? "",
        JSON.stringify(e.dados_antes ?? {}),
        JSON.stringify(e.dados_depois ?? {}),
      ]
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [eventos, busca, filtros]);

  function toggle(g: Grupo) {
    setFiltros((f) => ({ ...f, [g]: !f[g] }));
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Input
          className="max-w-xs"
          placeholder="Buscar por nome, campo ou usuário…"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
        />
        <div className="flex flex-wrap gap-3 text-sm">
          {(
            [
              ["contrato", "Contrato"],
              ["renovacao", "Renovações"],
              ["dependentes", "Dependentes"],
              ["mensalidades", "Mensalidades"],
            ] as [Grupo, string][]
          ).map(([g, label]) => (
            <label key={g} className="flex items-center gap-1.5 cursor-pointer">
              <Checkbox checked={filtros[g]} onCheckedChange={() => toggle(g)} />
              {label}
            </label>
          ))}
        </div>
        <div className="ml-auto text-xs text-muted-foreground flex items-center gap-1">
          <HistoryIcon className="h-3.5 w-3.5" />
          {filtrados.length} de {eventos.length} evento{eventos.length === 1 ? "" : "s"}
        </div>
      </div>

      {loading ? (
        <div className="text-sm text-muted-foreground">Carregando histórico…</div>
      ) : filtrados.length === 0 ? (
        <Card className="p-6 text-center text-sm text-muted-foreground">
          Nenhum evento encontrado para os filtros atuais.
        </Card>
      ) : (
        <ol className="relative border-l border-border pl-6 space-y-4">
          {filtrados.map((e) => (
            <li key={e.id} className="relative">
              <span className="absolute -left-[33px] top-1 flex h-6 w-6 items-center justify-center rounded-full bg-background border border-border">
                <IconeEvento tipo={e.tipo} />
              </span>
              <div className="rounded-md border bg-card p-3">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <div className="font-medium text-sm">{TituloEvento(e)}</div>
                  <div
                    className="text-xs text-muted-foreground flex items-center gap-1"
                    title={fmtDataHora(e.ts)}
                  >
                    <Clock className="h-3 w-3" />
                    {fmtRelativo(e.ts)} · {fmtDataHora(e.ts)}
                  </div>
                </div>
                <div className="mt-1 mb-2 flex items-center gap-2 text-xs text-muted-foreground">
                  <UserIcon className="h-3 w-3" />
                  {e.user_nome || e.user_email ? (
                    <>
                      <span className="font-medium text-foreground">
                        {e.user_nome || e.user_email}
                      </span>
                      {e.user_email && e.user_nome && e.user_email !== e.user_nome && (
                        <span>({e.user_email})</span>
                      )}
                    </>
                  ) : (
                    <span className="italic">Usuário não identificado</span>
                  )}
                  <Badge variant="outline" className="ml-auto text-[10px]">
                    {grupoDe(e.tipo)}
                  </Badge>
                </div>
                <CorpoEvento evento={e} />
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}