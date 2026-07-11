import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Plus, Pencil, Users } from "lucide-react";
import { useClinica } from "@/hooks/use-clinica";
import { usePodeEscrever } from "@/hooks/use-permissoes";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { FuncionarioDadosDialog } from "@/components/funcionarios/FuncionarioDadosDialog";

export const Route = createFileRoute("/_authenticated/app/funcionarios")({
  component: FuncionariosPage,
  head: () => ({ meta: [{ title: "Funcionários — ClinicaOS" }] }),
});

interface Row {
  id: string;
  funcionario_nome: string;
  cargo: string | null;
  setor: string | null;
  status: string;
  user_id: string | null;
}

function FuncionariosPage() {
  const { clinicaAtual } = useClinica();
  const podeEscrever = usePodeEscrever("funcionarios");
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [dialog, setDialog] = useState<{ open: boolean; id?: string | null }>({ open: false, id: null });
  const [busca, setBusca] = useState("");
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (!clinicaAtual) return;
    setLoading(true);
    void supabase
      .from("hr_contratos")
      .select("id, funcionario_nome, status, user_id, cargo:cargos(nome), setor:setores(nome)")
      .eq("clinica_id", clinicaAtual.clinica_id)
      .order("funcionario_nome")
      .then(({ data }) => {
        const list: Row[] = ((data ?? []) as any[]).map((r) => ({
          id: r.id,
          funcionario_nome: r.funcionario_nome,
          cargo: r.cargo?.nome ?? null,
          setor: r.setor?.nome ?? null,
          status: r.status,
          user_id: r.user_id,
        }));
        setRows(list);
        setLoading(false);
      });
  }, [clinicaAtual?.clinica_id, reloadKey]);

  if (!clinicaAtual) return <p className="text-muted-foreground">Selecione uma clínica primeiro.</p>;

  const q = busca.trim().toLowerCase();
  const filtrados = q
    ? rows.filter((r) =>
        r.funcionario_nome.toLowerCase().includes(q) ||
        (r.cargo ?? "").toLowerCase().includes(q) ||
        (r.setor ?? "").toLowerCase().includes(q))
    : rows;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Funcionários</h1>
          <p className="text-sm text-muted-foreground">
            Cadastro completo de funcionários de {clinicaAtual.clinica.nome}.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Input
            placeholder="Buscar por nome, cargo ou setor…"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            className="w-full sm:w-72"
          />
          {podeEscrever && (
            <Button onClick={() => setDialog({ open: true, id: null })}>
              <Plus className="h-4 w-4 mr-2" /> Novo funcionário
            </Button>
          )}
        </div>
      </div>

      {loading ? (
        <Card><CardContent className="py-12 text-center text-muted-foreground">Carregando…</CardContent></Card>
      ) : filtrados.length === 0 ? (
        <Card><CardContent className="py-12 text-center text-muted-foreground">
          <Users className="h-8 w-8 mx-auto mb-2 opacity-50" /> Nenhum funcionário cadastrado.
        </CardContent></Card>
      ) : (
        <Card>
          <Table>
            <TableHeader><TableRow>
              <TableHead>Nome</TableHead>
              <TableHead>Cargo</TableHead>
              <TableHead>Setor</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Acesso</TableHead>
              <TableHead className="w-16 text-right">Ações</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {filtrados.map((r) => (
                <TableRow key={r.id}>
                  <TableCell>{r.funcionario_nome}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{r.cargo ?? "—"}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{r.setor ?? "—"}</TableCell>
                  <TableCell><Badge variant={r.status === "ativo" ? "default" : "outline"} className="capitalize">{r.status}</Badge></TableCell>
                  <TableCell>
                    {r.user_id
                      ? <Badge variant="secondary">Vinculado</Badge>
                      : <Badge variant="outline">Sem login</Badge>}
                  </TableCell>
                  <TableCell className="text-right">
                    {podeEscrever && (
                      <Button size="icon" variant="ghost" onClick={() => setDialog({ open: true, id: r.id })}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      <FuncionarioDadosDialog
        open={dialog.open}
        onOpenChange={(o) => setDialog((s) => ({ ...s, open: o }))}
        clinicaId={clinicaAtual.clinica_id}
        editingContratoId={dialog.id ?? null}
        onSaved={() => setReloadKey((k) => k + 1)}
      />
    </div>
  );
}