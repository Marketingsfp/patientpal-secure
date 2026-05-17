import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Users, Plus, Pencil } from "lucide-react";
import { useClinica } from "@/hooks/use-clinica";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { listarEquipe, cadastrarUsuario, editarMembro } from "@/lib/equipe.functions";

export const Route = createFileRoute("/_authenticated/app/equipe")({
  component: EquipePage,
  head: () => ({ meta: [{ title: "Equipe — ClinicaOS" }] }),
});

interface Membership {
  id: string;
  role: string;
  user_id: string;
  ativo: boolean;
  nome: string | null;
  email: string | null;
}

const ROLES = ["admin", "gestor", "medico", "enfermeiro", "recepcao", "financeiro"] as const;
type RoleT = (typeof ROLES)[number];

function EquipePage() {
  const { clinicaAtual } = useClinica();
  const [team, setTeam] = useState<Membership[]>([]);
  const [loading, setLoading] = useState(false);
  const [openNovo, setOpenNovo] = useState(false);
  const [editing, setEditing] = useState<Membership | null>(null);
  const [saving, setSaving] = useState(false);

  const [novo, setNovo] = useState({ nome: "", email: "", password: "", role: "recepcao" as RoleT });
  const [edit, setEdit] = useState({ nome: "", role: "recepcao" as RoleT, ativo: true, novaSenha: "" });

  const fnList = useServerFn(listarEquipe);
  const fnCreate = useServerFn(cadastrarUsuario);
  const fnEdit = useServerFn(editarMembro);

  const carregar = useCallback(async () => {
    if (!clinicaAtual) return;
    setLoading(true);
    try {
      const data = await fnList({ data: { clinicaId: clinicaAtual.clinica_id } });
      setTeam(data as Membership[]);
    } catch (e: any) {
      toast.error(e?.message ?? "Erro ao carregar equipe");
    } finally {
      setLoading(false);
    }
  }, [clinicaAtual, fnList]);

  useEffect(() => { carregar(); }, [carregar]);

  const abrirNovo = () => {
    setNovo({ nome: "", email: "", password: "", role: "recepcao" });
    setOpenNovo(true);
  };

  const salvarNovo = async () => {
    if (!clinicaAtual) return;
    if (!novo.nome || !novo.email || novo.password.length < 6) {
      toast.error("Preencha nome, email e senha (mín. 6 caracteres)");
      return;
    }
    setSaving(true);
    try {
      await fnCreate({ data: { clinicaId: clinicaAtual.clinica_id, ...novo } });
      toast.success("Usuário cadastrado e liberado para acessar o sistema");
      setOpenNovo(false);
      carregar();
    } catch (e: any) {
      toast.error(e?.message ?? "Erro ao cadastrar");
    } finally {
      setSaving(false);
    }
  };

  const abrirEdit = (m: Membership) => {
    setEditing(m);
    setEdit({ nome: m.nome ?? "", role: (m.role as RoleT) ?? "recepcao", ativo: m.ativo, novaSenha: "" });
  };

  const salvarEdit = async () => {
    if (!clinicaAtual || !editing) return;
    setSaving(true);
    try {
      await fnEdit({
        data: {
          clinicaId: clinicaAtual.clinica_id,
          membershipId: editing.id,
          role: edit.role,
          ativo: edit.ativo,
          nome: edit.nome || undefined,
          novaSenha: edit.novaSenha || undefined,
        },
      });
      toast.success("Membro atualizado");
      setEditing(null);
      carregar();
    } catch (e: any) {
      toast.error(e?.message ?? "Erro ao salvar");
    } finally {
      setSaving(false);
    }
  };

  if (!clinicaAtual) return <p className="text-muted-foreground">Selecione uma clínica primeiro.</p>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Equipe</h1>
          <p className="text-sm text-muted-foreground">Membros de {clinicaAtual.clinica.nome}. Quem for cadastrado aqui terá acesso ao sistema.</p>
        </div>
        <Button onClick={abrirNovo}><Plus className="h-4 w-4 mr-2" /> Novo usuário</Button>
      </div>
      {loading ? (
        <Card><CardContent className="py-12 text-center text-muted-foreground">Carregando…</CardContent></Card>
      ) : team.length === 0 ? (
        <Card><CardContent className="py-12 text-center text-muted-foreground">
          <Users className="h-8 w-8 mx-auto mb-2 opacity-50" /> Nenhum membro ainda.
        </CardContent></Card>
      ) : (
        <Card>
          <Table>
            <TableHeader><TableRow>
              <TableHead>Nome</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Função</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-16 text-right">Ações</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {team.map((m) => (
                <TableRow key={m.id}>
                  <TableCell>{m.nome ?? <span className="text-muted-foreground">—</span>}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{m.email ?? "—"}</TableCell>
                  <TableCell><Badge variant="secondary" className="capitalize">{m.role}</Badge></TableCell>
                  <TableCell>{m.ativo ? <Badge>Ativo</Badge> : <Badge variant="outline">Inativo</Badge>}</TableCell>
                  <TableCell className="text-right">
                    <Button size="icon" variant="ghost" onClick={() => abrirEdit(m)}><Pencil className="h-4 w-4" /></Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      {/* Novo usuário */}
      <Dialog open={openNovo} onOpenChange={setOpenNovo}>
        <DialogContent>
          <DialogHeader><DialogTitle>Cadastrar usuário</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Nome</Label><Input value={novo.nome} onChange={(e) => setNovo({ ...novo, nome: e.target.value })} /></div>
            <div><Label>Email</Label><Input type="email" value={novo.email} onChange={(e) => setNovo({ ...novo, email: e.target.value })} /></div>
            <div><Label>Senha inicial</Label><Input type="text" value={novo.password} onChange={(e) => setNovo({ ...novo, password: e.target.value })} placeholder="Mínimo 6 caracteres" /></div>
            <div>
              <Label>Função</Label>
              <Select value={novo.role} onValueChange={(v) => setNovo({ ...novo, role: v as RoleT })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{ROLES.map((r) => <SelectItem key={r} value={r} className="capitalize">{r}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpenNovo(false)}>Cancelar</Button>
            <Button onClick={salvarNovo} disabled={saving}>{saving ? "Salvando…" : "Cadastrar"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Editar */}
      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Editar membro</DialogTitle></DialogHeader>
          {editing && (
            <div className="space-y-3">
              <div className="text-sm text-muted-foreground">{editing.email}</div>
              <div><Label>Nome</Label><Input value={edit.nome} onChange={(e) => setEdit({ ...edit, nome: e.target.value })} /></div>
              <div>
                <Label>Função</Label>
                <Select value={edit.role} onValueChange={(v) => setEdit({ ...edit, role: v as RoleT })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{ROLES.map((r) => <SelectItem key={r} value={r} className="capitalize">{r}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="flex items-center justify-between rounded border p-3">
                <div>
                  <Label>Acesso ativo</Label>
                  <p className="text-xs text-muted-foreground">Desative para bloquear o acesso desse usuário.</p>
                </div>
                <Switch checked={edit.ativo} onCheckedChange={(v) => setEdit({ ...edit, ativo: v })} />
              </div>
              <div><Label>Nova senha (opcional)</Label><Input type="text" value={edit.novaSenha} onChange={(e) => setEdit({ ...edit, novaSenha: e.target.value })} placeholder="Deixe em branco para manter" /></div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>Cancelar</Button>
            <Button onClick={salvarEdit} disabled={saving}>{saving ? "Salvando…" : "Salvar"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}