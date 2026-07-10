import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Users, Search, Plus, Trash2, AlertCircle, CheckCircle2, X } from "lucide-react";
import { toast } from "sonner";
import { mostrarErro } from "@/lib/traduzir-erro";
import { supabase } from "@/integrations/supabase/client";
import { useClinica } from "@/hooks/use-clinica";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { PatientSearchInput, type PatientOption } from "@/components/patient-search-input";

export const Route = createFileRoute("/_authenticated/app/cartao-beneficios/dependentes")({
  component: DependentesPage,
  head: () => ({ meta: [{ title: "Dependentes — Cartão Benefícios" }] }),
});

type Contrato = {
  id: string;
  numero: number;
  paciente_id: string;
  paciente_nome: string;
  status: string;
  plano_id: string | null;
  convenio_id: string | null;
};
type Dep = {
  id: string;
  contrato_id: string;
  paciente_id: string;
  paciente_nome: string;
  parentesco: string | null;
};

type Filter = "todos" | "sem" | "com";

function DependentesPage() {
  const { clinicaAtual } = useClinica();
  const [loading, setLoading] = useState(true);
  const [contratos, setContratos] = useState<Contrato[]>([]);
  const [deps, setDeps] = useState<Dep[]>([]);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("sem");

  // Modal de adicionar
  const [openTitular, setOpenTitular] = useState<Contrato | null>(null);
  const [novoDep, setNovoDep] = useState<PatientOption | null>(null);
  const [parentesco, setParentesco] = useState("");
  const [saving, setSaving] = useState(false);
  const [drill, setDrill] = useState<null | "total" | "com" | "sem" | "totalDeps">(null);

  const load = async () => {
    if (!clinicaAtual) return;
    setLoading(true);
    const cid = clinicaAtual.clinica_id;
    // Pagina contratos (Supabase limita a 1000 por request)
    const cList: Contrato[] = [];
    const PAGE = 1000;
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await supabase
        .from("contratos_assinatura")
        .select("id, numero, paciente_id, paciente_nome, status, plano_id, convenio_id")
        .eq("clinica_id", cid)
        .neq("status", "cancelado")
        .order("paciente_nome")
        .range(from, from + PAGE - 1);
      if (error) {
        mostrarErro(error);
        break;
      }
      const batch = (data ?? []) as Contrato[];
      cList.push(...batch);
      if (batch.length < PAGE) break;
    }
    // Pagina dependentes via join filtrando pela clínica do contrato
    const dList: Dep[] = [];
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await supabase
        .from("contrato_dependentes")
        .select(
          "id, contrato_id, paciente_id, paciente_nome, parentesco, contratos_assinatura!inner(clinica_id)",
        )
        .eq("contratos_assinatura.clinica_id", cid)
        .eq("ativo", true)
        .range(from, from + PAGE - 1);
      if (error) {
        mostrarErro(error);
        break;
      }
      const batch = (data ?? []) as Dep[];
      dList.push(...batch);
      if (batch.length < PAGE) break;
    }
    setContratos(cList);
    setDeps(dList);
    setLoading(false);
  };

  useEffect(() => {
    void load(); /* eslint-disable-next-line */
  }, [clinicaAtual?.clinica_id]);

  const depsPorContrato = useMemo(() => {
    const m = new Map<string, Dep[]>();
    for (const d of deps) {
      const arr = m.get(d.contrato_id) ?? [];
      arr.push(d);
      m.set(d.contrato_id, arr);
    }
    return m;
  }, [deps]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return contratos.filter((c) => {
      const has = (depsPorContrato.get(c.id)?.length ?? 0) > 0;
      if (filter === "sem" && has) return false;
      if (filter === "com" && !has) return false;
      if (q && !c.paciente_nome.toLowerCase().includes(q) && !String(c.numero).includes(q))
        return false;
      return true;
    });
  }, [contratos, depsPorContrato, search, filter]);

  const stats = useMemo(() => {
    const total = contratos.length;
    const com = contratos.filter((c) => (depsPorContrato.get(c.id)?.length ?? 0) > 0).length;
    return { total, com, sem: total - com, totalDeps: deps.length };
  }, [contratos, depsPorContrato, deps]);

  const adicionar = async () => {
    if (!openTitular || !novoDep) return;
    setSaving(true);
    const { error } = await supabase.from("contrato_dependentes").insert({
      contrato_id: openTitular.id,
      paciente_id: novoDep.id,
      paciente_nome: novoDep.nome,
      parentesco: parentesco.trim() || null,
      ativo: true,
    });
    setSaving(false);
    if (error) {
      mostrarErro(error);
      return;
    }
    toast.success("Dependente adicionado.");
    setNovoDep(null);
    setParentesco("");
    await load();
  };

  const fecharModal = () => {
    setOpenTitular(null);
    setNovoDep(null);
    setParentesco("");
  };

  const remover = async (depId: string) => {
    if (!confirm("Excluir este dependente?")) return;
    const { error } = await supabase
      .from("contrato_dependentes")
      .update({ ativo: false, excluido_em: new Date().toISOString().slice(0, 10) })
      .eq("id", depId);
    if (error) {
      mostrarErro(error);
      return;
    }
    toast.success("Dependente removido.");
    await load();
  };

  if (!clinicaAtual) return <p className="text-sm text-muted-foreground">Selecione uma clínica.</p>;

  const depsDoModal = openTitular ? (depsPorContrato.get(openTitular.id) ?? []) : [];

  return (
    <div className="space-y-4">
      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KPI
          onClick={() => setDrill("total")}
          label="Titulares (contratos)"
          value={stats.total}
          icon={<Users className="h-4 w-4" />}
        />
        <KPI
          onClick={() => setDrill("com")}
          label="Com dependentes"
          value={stats.com}
          icon={<CheckCircle2 className="h-4 w-4 text-green-600" />}
        />
        <KPI
          onClick={() => setDrill("sem")}
          label="Sem dependentes"
          value={stats.sem}
          icon={<AlertCircle className="h-4 w-4 text-orange-600" />}
        />
        <KPI
          onClick={() => setDrill("totalDeps")}
          label="Total de dependentes"
          value={stats.totalDeps}
          icon={<Users className="h-4 w-4 text-primary" />}
        />
      </div>

      {/* Filtros */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Search className="h-4 w-4" /> Buscar titular
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-3 items-end">
            <div className="flex-1 min-w-[220px]">
              <Label>Nome ou nº do contrato</Label>
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Digite o nome do titular…"
                autoFocus
              />
            </div>
            <div className="flex gap-1">
              <Button
                size="sm"
                variant={filter === "sem" ? "default" : "outline"}
                onClick={() => setFilter("sem")}
              >
                Sem dependentes ({stats.sem})
              </Button>
              <Button
                size="sm"
                variant={filter === "com" ? "default" : "outline"}
                onClick={() => setFilter("com")}
              >
                Com dependentes ({stats.com})
              </Button>
              <Button
                size="sm"
                variant={filter === "todos" ? "default" : "outline"}
                onClick={() => setFilter("todos")}
              >
                Todos ({stats.total})
              </Button>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Dica: use o filtro <b>Sem dependentes</b> para fazer o mutirão de cadastro família por
            família.
          </p>
        </CardContent>
      </Card>

      {/* Lista */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">
            {loading ? "Carregando…" : `${filtered.length} titular(es)`}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {filtered.length === 0 && !loading ? (
            <p className="text-sm text-muted-foreground p-6 text-center">
              Nenhum titular encontrado com este filtro.
            </p>
          ) : (
            <ul className="divide-y">
              {filtered.slice(0, 200).map((c) => {
                const dList = depsPorContrato.get(c.id) ?? [];
                return (
                  <li
                    key={c.id}
                    className="p-3 flex flex-wrap items-center gap-3 hover:bg-muted/30"
                  >
                    <div className="flex-1 min-w-[240px]">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium">{c.paciente_nome}</span>
                        <Badge variant="outline" className="text-xs">
                          #{c.numero}
                        </Badge>
                        {dList.length === 0 ? (
                          <Badge variant="secondary" className="text-xs gap-1">
                            <AlertCircle className="h-3 w-3" /> sem dependentes
                          </Badge>
                        ) : (
                          <Badge className="text-xs bg-green-600 text-white">
                            {dList.length} dep.
                          </Badge>
                        )}
                      </div>
                      {dList.length > 0 && (
                        <div className="text-xs text-muted-foreground mt-1">
                          {dList
                            .map(
                              (d) =>
                                `${d.paciente_nome}${d.parentesco ? ` (${d.parentesco})` : ""}`,
                            )
                            .join(" · ")}
                        </div>
                      )}
                    </div>
                    <Button size="sm" onClick={() => setOpenTitular(c)}>
                      <Plus className="h-4 w-4 mr-1" /> Adicionar dependente
                    </Button>
                  </li>
                );
              })}
              {filtered.length > 200 && (
                <li className="p-3 text-xs text-muted-foreground text-center">
                  Mostrando 200 de {filtered.length}. Refine a busca para ver mais.
                </li>
              )}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* Modal */}
      <Dialog
        open={openTitular !== null}
        onOpenChange={(o) => {
          if (!o) fecharModal();
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Dependentes de {openTitular?.paciente_nome}</DialogTitle>
          </DialogHeader>

          {depsDoModal.length > 0 && (
            <div className="space-y-1.5 max-h-40 overflow-auto border rounded-md p-2 bg-muted/20">
              <p className="text-xs font-semibold text-muted-foreground mb-1">
                Já cadastrados ({depsDoModal.length})
              </p>
              {depsDoModal.map((d) => (
                <div
                  key={d.id}
                  className="flex items-center justify-between text-sm bg-background rounded px-2 py-1"
                >
                  <span>
                    {d.paciente_nome}
                    {d.parentesco && (
                      <span className="text-xs text-muted-foreground ml-2">({d.parentesco})</span>
                    )}
                  </span>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-6 w-6"
                    onClick={() => remover(d.id)}
                  >
                    <Trash2 className="h-3 w-3 text-destructive" />
                  </Button>
                </div>
              ))}
            </div>
          )}

          <div className="space-y-3 pt-2 border-t">
            <p className="text-sm font-semibold">Adicionar novo dependente</p>
            <div className="space-y-1.5">
              <Label>Paciente</Label>
              <PatientSearchInput value={novoDep} onSelect={setNovoDep} />
              <p className="text-xs text-muted-foreground">
                Se ainda não estiver cadastrado, abra Clientes → Novo paciente primeiro.
              </p>
            </div>
            <div className="space-y-1.5">
              <Label>Parentesco</Label>
              <Input
                value={parentesco}
                onChange={(e) => setParentesco(e.target.value)}
                placeholder="Filho(a), Cônjuge, Pai/Mãe…"
              />
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={fecharModal}>
              <X className="h-4 w-4 mr-1" /> Fechar
            </Button>
            <Button onClick={adicionar} disabled={!novoDep || saving}>
              <Plus className="h-4 w-4 mr-1" /> {saving ? "Salvando…" : "Adicionar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Drill-down KPIs */}
      <Dialog
        open={drill !== null}
        onOpenChange={(o) => {
          if (!o) setDrill(null);
        }}
      >
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>
              {drill === "total" && `Todos os titulares (${stats.total})`}
              {drill === "com" && `Titulares com dependentes (${stats.com})`}
              {drill === "sem" && `Titulares sem dependentes (${stats.sem})`}
              {drill === "totalDeps" && `Todos os dependentes (${stats.totalDeps})`}
            </DialogTitle>
          </DialogHeader>
          <div className="overflow-auto flex-1">
            {drill === "totalDeps" ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Dependente</TableHead>
                    <TableHead>Titular</TableHead>
                    <TableHead>Parentesco</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {deps.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={3} className="text-center text-muted-foreground py-6">
                        Nenhum registro.
                      </TableCell>
                    </TableRow>
                  ) : null}
                  {deps.map((d) => {
                    const titular = contratos.find((c) => c.id === d.contrato_id);
                    return (
                      <TableRow key={d.id}>
                        <TableCell>{d.paciente_nome}</TableCell>
                        <TableCell>{titular?.paciente_nome ?? "—"}</TableCell>
                        <TableCell>{d.parentesco ?? "—"}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            ) : drill ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Titular</TableHead>
                    <TableHead>Nº</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Dependentes</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(() => {
                    const lista = contratos.filter((c) => {
                      const has = (depsPorContrato.get(c.id)?.length ?? 0) > 0;
                      if (drill === "com") return has;
                      if (drill === "sem") return !has;
                      return true;
                    });
                    if (lista.length === 0)
                      return (
                        <TableRow>
                          <TableCell colSpan={4} className="text-center text-muted-foreground py-6">
                            Nenhum registro.
                          </TableCell>
                        </TableRow>
                      );
                    return lista.map((c) => (
                      <TableRow key={c.id}>
                        <TableCell>{c.paciente_nome}</TableCell>
                        <TableCell>#{c.numero}</TableCell>
                        <TableCell>
                          <Badge variant="outline">{c.status}</Badge>
                        </TableCell>
                        <TableCell className="text-right font-semibold">
                          {depsPorContrato.get(c.id)?.length ?? 0}
                        </TableCell>
                      </TableRow>
                    ));
                  })()}
                </TableBody>
              </Table>
            ) : null}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function KPI({
  label,
  value,
  icon,
  onClick,
}: {
  label: string;
  value: number | string;
  icon: React.ReactNode;
  onClick?: () => void;
}) {
  return (
    <Card
      onClick={onClick}
      className={onClick ? "cursor-pointer hover:bg-muted/50 transition-colors" : ""}
    >
      <CardContent className="p-4">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {icon}
          {label}
        </div>
        <div className="text-2xl font-bold mt-1">{value}</div>
      </CardContent>
    </Card>
  );
}
