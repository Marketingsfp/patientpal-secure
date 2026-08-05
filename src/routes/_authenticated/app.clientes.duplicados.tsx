import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
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
          <Card key={groupKey(g, i)}>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-2 flex-wrap">
                <Badge variant="outline">{TIPO_LABEL[g.tipo]}</Badge>
                <CardTitle className="text-base font-mono">{g.chave}</CardTitle>
                <span className="text-xs text-muted-foreground">{g.qtd} cadastros</span>
              </div>
              <Button
                size="sm"
                variant="default"
                disabled={(sel[groupKey(g, i)]?.size ?? 0) < 2}
                onClick={() => setConfirmKey(groupKey(g, i))}
              >
                Mesclar selecionados ({sel[groupKey(g, i)]?.size ?? 0})
              </Button>
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="divide-y">
                {g.pacientes.map((p) => (
                  <div key={p.id} className="py-2 flex items-center justify-between gap-3 text-sm">
                    <div className="flex items-center gap-3 min-w-0">
                    <Checkbox
                      checked={sel[groupKey(g, i)]?.has(p.id) ?? false}
                      onCheckedChange={() => toggle(groupKey(g, i), p.id)}
                    />
                    <div className="min-w-0">
                      <div className="font-medium truncate">{p.nome}</div>
                      <div className="text-xs text-muted-foreground">
                        CPF: {p.cpf ?? "—"} • Tel: {p.telefone ?? "—"} • Nasc.:{" "}
                        {p.data_nascimento?.split("-").reverse().join("/") ?? "—"}
                        {p.codigo_prontuario ? ` • Prontuário ${p.codigo_prontuario}` : ""}
                      </div>
                    </div>
                    </div>
                    <Link
                      to="/app/clientes/$pacienteId/editar"
                      params={{ pacienteId: p.id }}
                      className="text-xs underline whitespace-nowrap"
                    >
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