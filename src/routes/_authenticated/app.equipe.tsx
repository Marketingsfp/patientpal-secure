import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useClinica } from "@/hooks/use-clinica";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const Route = createFileRoute("/_authenticated/app/equipe")({
  component: EquipePage,
  head: () => ({ meta: [{ title: "Equipe — ClinicaOS" }] }),
});

interface Membership { id: string; role: string; user_id: string; ativo: boolean }

function EquipePage() {
  const { clinicaAtual } = useClinica();
  const [team, setTeam] = useState<Membership[]>([]);

  useEffect(() => {
    if (!clinicaAtual) return;
    supabase.from("clinica_memberships")
      .select("id, role, user_id, ativo")
      .eq("clinica_id", clinicaAtual.clinica_id)
      .then(({ data }) => setTeam(data ?? []));
  }, [clinicaAtual]);

  if (!clinicaAtual) return <p className="text-muted-foreground">Selecione uma clínica primeiro.</p>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Equipe</h1>
        <p className="text-sm text-muted-foreground">Membros de {clinicaAtual.clinica.nome}</p>
      </div>
      {team.length === 0 ? (
        <Card><CardContent className="py-12 text-center text-muted-foreground">
          <Users className="h-8 w-8 mx-auto mb-2 opacity-50" /> Nenhum membro ainda.
        </CardContent></Card>
      ) : (
        <Card>
          <Table>
            <TableHeader><TableRow><TableHead>Usuário</TableHead><TableHead>Função</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
            <TableBody>
              {team.map((m) => (
                <TableRow key={m.id}>
                  <TableCell className="font-mono text-xs">{m.user_id}</TableCell>
                  <TableCell><Badge variant="secondary" className="capitalize">{m.role}</Badge></TableCell>
                  <TableCell>{m.ativo ? <Badge>Ativo</Badge> : <Badge variant="outline">Inativo</Badge>}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  );
}