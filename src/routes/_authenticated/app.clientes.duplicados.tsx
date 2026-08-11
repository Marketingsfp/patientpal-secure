import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ExternalLink, Merge } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useClinica } from "@/hooks/use-clinica";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/app/clientes/duplicados")({
  head: () => ({
    meta: [{ title: "Pacientes duplicados — conferência" }],
  }),
  component: DuplicadosPage,
  errorComponent: ({ error, reset }) => (
    <div className="p-6">
      <p className="text-destructive mb-3">Erro: {String(error)}</p>
      <Button onClick={() => reset()}>Tentar novamente</Button>
    </div>
  ),
  notFoundComponent: () => <div className="p-6">Página não encontrada.</div>,
});

type Grupo = {
  clinica_id: string;
  tipo: "cpf" | "telefone" | "nome_dn";
  chave: string;
  qtd: number;
  ids: string[];
  pacientes: Array<{
    id: string;
    nome: string;
    cpf: string | null;
    telefone: string | null;
    data_nascimento: string | null;
    codigo_prontuario: string | null;
    created_at: string;
  }>;
};

const TIPO_LABEL: Record<Grupo["tipo"], string> = {
  cpf: "Mesmo CPF",
  telefone: "Mesmo telefone",
  nome_dn: "Mesmo nome + nascimento",
};

/** Formata CPF apenas para exibição (000.000.000-00). */
function formatCPF(v?: string | null): string {
  const d = (v ?? "").replace(/\D/g, "");
  if (d.length !== 11) return v ?? "—";
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}

/** Formata telefone apenas para exibição ((21) 99532-4717). */
function formatPhone(v?: string | null): string {
  const d = (v ?? "").replace(/\D/g, "");
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return v ?? "—";
}

/** Chave do grupo formatada conforme o tipo de duplicidade. */
function formatChave(g: Grupo): string {
  if (g.tipo === "cpf") return formatCPF(g.chave);
  if (g.tipo === "telefone") return formatPhone(g.chave);
  const [nome, dn] = g.chave.split("|");
  return `${nome}${dn ? ` · ${dn.split("-").reverse().join("/")}` : ""}`;
}

function DuplicadosPage() {
  const { clinicaIds } = useClinica();
  const [grupos, setGrupos] = useState<Grupo[]>([]);
  const [loading, setLoading] = useState(false);
  const [tipo, setTipo] = useState<"" | Grupo["tipo"]>("");
  const [filtroNome, setFiltroNome] = useState("");
  const [sel, setSel] = useState<Record<string, Set<string>>>({});
  const [confirmKey, setConfirmKey] = useState<string | null>(null);
  const [merging, setMerging] = useState(false);

  const reload = () => {
    if (clinicaIds.length === 0) return;
    setLoading(true);
    supabase
      .rpc("listar_duplicados_pacientes", {
        _clinica_ids: clinicaIds,
        _tipo: tipo || undefined,
        _limite: 200,
      })
      .then(({ data, error }) => {
        if (error) console.error(error);
        setGrupos((data ?? []) as unknown as Grupo[]);
        setLoading(false);
      });
  };

  useEffect(reload, [clinicaIds, tipo]);

  const groupKey = (g: Grupo, i: number) => `${g.tipo}-${g.chave}-${i}`;

  const norm = (s: string) =>
    s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
  const gruposFiltrados = (() => {
    const q = norm(filtroNome);
    if (!q) return grupos;
    return grupos.filter((g) =>
      g.pacientes.some((p) => norm(p.nome ?? "").includes(q)),
    );
  })();

  const toggle = (gk: string, id: string) => {
    setSel((prev) => {
      const cur = new Set(prev[gk] ?? []);
      if (cur.has(id)) cur.delete(id); else cur.add(id);
      return { ...prev, [gk]: cur };
    });
  };

  const grupoAtual = confirmKey
    ? grupos.find((g, i) => groupKey(g, i) === confirmKey) ?? null
    : null;
  const selecionadosAtuais = confirmKey
    ? Array.from(sel[confirmKey] ?? [])
    : [];
  const pacientesSelecionados = grupoAtual
    ? grupoAtual.pacientes.filter((p) => selecionadosAtuais.includes(p.id))
    : [];
  // Vencedor previsto: menor codigo_prontuario numérico; empate = mais antigo
  const vencedorPrevisto = (() => {
    if (pacientesSelecionados.length < 2) return null;
    const withNum = pacientesSelecionados
      .map((p) => {
        const raw = p.codigo_prontuario ?? "";
        const isNum = /^\d+$/.test(raw);
        return { p, num: isNum ? Number(raw) : Number.POSITIVE_INFINITY, raw };
      })
      .sort((a, b) => {
        if (a.num !== b.num) return a.num - b.num;
        if (a.raw && b.raw && a.raw !== b.raw) return a.raw.localeCompare(b.raw);
        return (a.p.created_at ?? "").localeCompare(b.p.created_at ?? "");
      });
    return withNum[0]?.p ?? null;
  })();

  const executarMerge = async () => {
    if (!vencedorPrevisto || selecionadosAtuais.length < 2) return;
    setMerging(true);
    const { data, error } = await supabase.rpc("merge_pacientes", {
      _ids: selecionadosAtuais,
    });
    setMerging(false);
    if (error) {
      toast.error(error.message || "Não foi possível mesclar");
      return;
    }
    toast.success(`Pacientes mesclados. Vencedor: ${String(data).slice(0, 8)}…`);
    setConfirmKey(null);
    setSel({});
    reload();
  };

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Possíveis pacientes duplicados</h1>
          <p className="text-sm text-muted-foreground">
            Somente alerta. O sistema não faz merge automático — abra cada cadastro
            para conferir e ajustar manualmente.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Input
            value={filtroNome}
            onChange={(e) => setFiltroNome(e.target.value)}
            placeholder="Filtrar por nome…"
            className="h-9 w-64"
          />
          <select
            className="border rounded px-2 py-1 text-sm bg-background"
            value={tipo}
            onChange={(e) => setTipo(e.target.value as "" | Grupo["tipo"])}
          >
            <option value="">Todos</option>
            <option value="cpf">Mesmo CPF</option>
            <option value="telefone">Mesmo telefone</option>
            <option value="nome_dn">Mesmo nome + nascimento</option>
          </select>
        </div>
      </div>
      {loading && <p className="text-sm text-muted-foreground">Carregando…</p>}
      {!loading && gruposFiltrados.length === 0 && (
        <p className="text-sm text-muted-foreground">Nenhum grupo suspeito encontrado.</p>
      )}
      <div className="grid gap-3">
        {gruposFiltrados.map((g, i) => (
          <Card key={groupKey(g, i)} className="rounded-2xl border-border/50 shadow-2xs">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="bg-primary/10 text-primary font-medium px-3 py-1 rounded-full text-xs">
                  {TIPO_LABEL[g.tipo]}
                </span>
                <CardTitle className="text-base font-semibold tracking-tight">
                  {formatChave(g)}
                </CardTitle>
                <span className="text-xs text-muted-foreground">{g.qtd} cadastros</span>
              </div>
              <button
                type="button"
                disabled={(sel[groupKey(g, i)]?.size ?? 0) < 2}
                onClick={() => setConfirmKey(groupKey(g, i))}
                className="bg-primary hover:bg-primary/90 text-primary-foreground font-semibold px-4 py-2 rounded-xl text-xs flex items-center gap-2 shadow-2xs disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <Merge className="h-3.5 w-3.5" />
                Mesclar selecionados
                <span className="bg-primary-foreground/20 rounded-full px-1.5 py-0.5 text-[10px] font-bold">
                  {sel[groupKey(g, i)]?.size ?? 0}
                </span>
              </button>
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              <div>
                {g.pacientes.map((p) => (
                  <div
                    key={p.id}
                    className="bg-card border border-border/50 rounded-2xl p-4 shadow-2xs hover:shadow-xs transition-all flex items-center justify-between gap-4 mb-3"
                  >
                    <div className="flex items-center gap-3.5 min-w-0">
                    <Checkbox
                      checked={sel[groupKey(g, i)]?.has(p.id) ?? false}
                      onCheckedChange={() => toggle(groupKey(g, i), p.id)}
                    />
                    <div className="min-w-0">
                      <div className="text-base font-bold text-foreground truncate">{p.nome}</div>
                      <div className="text-xs text-muted-foreground font-mono mt-0.5">
                        CPF: {formatCPF(p.cpf)} · Tel: {formatPhone(p.telefone)} · Nasc.:{" "}
                        {p.data_nascimento?.split("-").reverse().join("/") ?? "—"}
                        {p.codigo_prontuario ? ` · Prontuário: ${p.codigo_prontuario}` : ""}
                      </div>
                    </div>
                    </div>
                    <Link
                      to="/app/clientes/$pacienteId/editar"
                      params={{ pacienteId: p.id }}
                      className="border border-border/60 hover:bg-muted font-medium text-xs rounded-xl px-3 py-1.5 flex items-center gap-1.5 text-foreground transition-colors whitespace-nowrap"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                      Abrir cadastro
                    </Link>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <AlertDialog open={!!confirmKey} onOpenChange={(o) => !o && setConfirmKey(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar merge de pacientes</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3 text-sm">
                <p>
                  Esta ação é <strong>irreversível</strong>. Todos os vínculos
                  (agenda, atendimentos, financeiro, contratos, prontuários,
                  cartões) dos cadastros perdedores serão movidos para o
                  vencedor, e os cadastros perdedores serão apagados.
                </p>
                {vencedorPrevisto && (
                  <div className="rounded border bg-muted/40 p-2">
                    <div className="font-medium">Vencedor (menor prontuário):</div>
                    <div>{vencedorPrevisto.nome}</div>
                    <div className="text-xs text-muted-foreground">
                      Prontuário {vencedorPrevisto.codigo_prontuario ?? "—"} •
                      CPF {vencedorPrevisto.cpf ?? "—"} • Tel {vencedorPrevisto.telefone ?? "—"}
                    </div>
                  </div>
                )}
                <div>
                  <div className="font-medium">Perdedores ({pacientesSelecionados.length - 1}):</div>
                  <ul className="list-disc pl-5">
                    {pacientesSelecionados
                      .filter((p) => p.id !== vencedorPrevisto?.id)
                      .map((p) => (
                        <li key={p.id}>
                          {p.nome} — Prontuário {p.codigo_prontuario ?? "—"}
                        </li>
                      ))}
                  </ul>
                </div>
                <p className="text-xs text-muted-foreground">
                  Campos vazios do vencedor (CPF, telefone, e-mail, data de nascimento)
                  serão preenchidos com dados dos perdedores. Números de prontuário
                  e demais identificadores legados não são alterados.
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={merging}>Cancelar</AlertDialogCancel>
            <AlertDialogAction disabled={merging} onClick={executarMerge}>
              {merging ? "Mesclando…" : "Confirmar merge"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}