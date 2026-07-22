import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useClinica } from "@/hooks/use-clinica";
import { usePodeEscrever } from "@/hooks/use-permissoes";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Users, Plus, Pencil, Search, Trash2 } from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { mostrarErro } from "@/lib/traduzir-erro";
import { formatDatePura } from "@/lib/date-utils";
export const Route = createFileRoute("/_authenticated/app/hr-contratos")({
  component: ContratosPage,
  head: () => ({ meta: [{ title: "Funcionários — ClinicaOS" }] }),
  validateSearch: (search: Record<string, unknown>) => ({
    new: search.new === "1" || search.new === 1 ? "1" : undefined,
    edit: typeof search.edit === "string" ? search.edit : undefined,
  }),
});

interface Contrato {
  id: string; numero: number; funcionario_nome: string; cpf: string | null; clinica_id: string;
  cargo_id: string | null; setor_id: string | null; unidade_id: string | null;
  regime: string; carga_horaria_semanal: number; salario: number;
  data_admissao: string; data_demissao: string | null; status: string;
  user_id: string | null; sexo?: string | null;
}
interface Ref { id: string; nome: string }

function ContratosPage() {
  const { clinicaAtual } = useClinica();
  const podeEscrever = usePodeEscrever("hr-contratos");
  const { new: autoNew, edit: autoEdit } = Route.useSearch();
  const navigate = useNavigate();
  const [rows, setRows] = useState<Contrato[]>([]);
  const [cargos, setCargos] = useState<Ref[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [toDelete, setToDelete] = useState<Contrato | null>(null);
  const [deleting, setDeleting] = useState(false);

  async function load() {
    if (!clinicaAtual) return;
    setLoading(true);
    const [c, cg] = await Promise.all([
      supabase.from("hr_contratos").select("*").eq("clinica_id", clinicaAtual.clinica_id).order("funcionario_nome", { ascending: true }),
      supabase.from("cargos").select("id,nome").eq("clinica_id", clinicaAtual.clinica_id).eq("ativo", true).order("nome"),
    ]);
    if (c.error) mostrarErro(c.error);
    setRows((c.data ?? []) as Contrato[]);
    setCargos((cg.data ?? []) as Ref[]);
    setLoading(false);
  }
  useEffect(() => { void load(); }, [clinicaAtual?.clinica_id]);

  useEffect(() => {
    if (autoNew === "1" && clinicaAtual) {
      if (podeEscrever) void navigate({ to: "/app/hr-contratos/$id", params: { id: "novo" } });
      void navigate({ to: "/app/hr-contratos", search: {}, replace: true });
    }
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [autoNew, clinicaAtual?.clinica_id]);

  useEffect(() => {
    if (!autoEdit || !clinicaAtual || loading || !podeEscrever) return;
    const existing = rows.find(r => r.user_id === autoEdit);
    if (existing) {
      void navigate({ to: "/app/hr-contratos/$id", params: { id: existing.id } });
    } else {
      void navigate({ to: "/app/hr-contratos/$id", params: { id: "novo" }, search: { prefillUserId: autoEdit } });
    }
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [autoEdit, clinicaAtual?.clinica_id, loading]);

  const filtered = rows.filter(r => r.funcionario_nome.toLowerCase().includes(q.toLowerCase()));

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center gap-3">
        <Users className="h-6 w-6 text-primary" />
        <div className="flex-1">
          <h1 className="text-xl font-bold">Funcionários</h1>
          <p className="text-sm text-muted-foreground">Contratos de trabalho da clínica.</p>
        </div>
        {podeEscrever && (
          <Button onClick={() => navigate({ to: "/app/hr-contratos/$id", params: { id: "novo" } })}>
            <Plus className="h-4 w-4 mr-1" /> Novo funcionário
          </Button>
        )}
      </div>

      <Card className="p-3">
        <div className="relative">
          <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input className="pl-9" placeholder="Buscar..." value={q} onChange={e => setQ(e.target.value)} />
        </div>
      </Card>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Funcionário</TableHead>
              <TableHead>Cargo</TableHead>
              <TableHead className="w-28">Regime</TableHead>
              <TableHead className="w-32 text-right">Salário</TableHead>
              <TableHead className="w-32">Admissão</TableHead>
              <TableHead className="w-24">Situação</TableHead>
              <TableHead className="w-20 text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={7} className="text-center py-6 text-muted-foreground">Carregando…</TableCell></TableRow>
            ) : filtered.length === 0 ? (
              <TableRow><TableCell colSpan={7} className="text-center py-6 text-muted-foreground">Nenhum funcionário cadastrado.</TableCell></TableRow>
            ) : filtered.map(r => (
              <TableRow key={r.id}>
                <TableCell className="font-medium">{r.funcionario_nome}</TableCell>
                <TableCell className="text-sm text-muted-foreground">{cargos.find(c => c.id === r.cargo_id)?.nome ?? "-"}</TableCell>
                <TableCell className="text-sm uppercase">{r.regime}</TableCell>
                <TableCell className="text-right">{Number(r.salario).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</TableCell>
                <TableCell className="text-sm">{formatDatePura(r.data_admissao)}</TableCell>
                <TableCell><Badge variant={r.status === "ativo" ? "default" : "secondary"}>{r.status}</Badge></TableCell>
                <TableCell className="text-right">
                  {podeEscrever && (
                    <TooltipProvider delayDuration={200}>
                      <div className="flex items-center justify-end gap-1">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button size="icon" variant="ghost" onClick={() => navigate({ to: "/app/hr-contratos/$id", params: { id: r.id } })} aria-label="Editar funcionário">
                              <Pencil className="h-4 w-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Editar funcionário</TooltipContent>
                        </Tooltip>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button size="icon" variant="ghost" onClick={() => setToDelete(r)} aria-label="Excluir funcionário" className="text-destructive hover:text-destructive">
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Excluir funcionário</TooltipContent>
                        </Tooltip>
                      </div>
                    </TooltipProvider>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      <AlertDialog open={!!toDelete} onOpenChange={(o) => { if (!o) setToDelete(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir funcionário</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir o contrato de <strong>{toDelete?.funcionario_nome}</strong>? Esta ação não pode ser desfeita. O login de acesso (se houver) não será removido.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={deleting}
              onClick={async (e) => {
                e.preventDefault();
                if (!toDelete) return;
                setDeleting(true);
                const { error } = await supabase.from("hr_contratos").delete().eq("id", toDelete.id);
                setDeleting(false);
                if (error) { mostrarErro(error); return; }
                toast.success("Funcionário excluído");
                setToDelete(null);
                void load();
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? "Excluindo…" : "Excluir"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}