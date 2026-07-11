import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowLeft, User, Briefcase, Clock, Palmtree, Phone, Mail, KeyRound, Pencil } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useServerFn } from "@tanstack/react-start";
import { getFuncionarioLogin } from "@/lib/equipe.functions";
import { useClinica } from "@/hooks/use-clinica";
import { usePodeEscrever } from "@/hooks/use-permissoes";
import { FuncionarioFormDialog } from "@/components/funcionarios/FuncionarioFormDialog";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDatePura, formatDateTime } from "@/lib/date-utils";

export const Route = createFileRoute("/_authenticated/app/funcionario/$userId")({
  component: PerfilFuncionarioPage,
  head: () => ({ meta: [{ title: "Perfil do Funcionário — ClinicaOS" }] }),
});

interface Profile { id: string; nome: string; telefone: string | null; telefone2: string | null; avatar_url: string | null }
interface Membership { clinica_id: string; role: string; ativo: boolean; clinica: { nome: string } | null }
interface Contrato {
  id: string; numero: number | null; regime: string | null; data_inicio: string | null; data_fim: string | null;
  status: string | null; salario: number | null; cargo: { nome: string } | null; setor: { nome: string } | null;
}
interface Ponto { id: string; tipo: string; registrado_em: string; unidade: { nome: string } | null }
interface Ferias { id: string; inicio: string; fim: string; status: string; periodo_aquisitivo_inicio: string | null; periodo_aquisitivo_fim: string | null }
interface Holerite { id: string; competencia: string; liquido: number | null; status: string }

function fmtMoeda(v: number | null | undefined): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(v ?? 0));
}

function PerfilFuncionarioPage() {
  const { userId } = Route.useParams();
  const { clinicaAtual } = useClinica();
  const podeEscrever = usePodeEscrever("equipe");
  const getLoginFn = useServerFn(getFuncionarioLogin);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [memberships, setMemberships] = useState<Membership[]>([]);
  const [contratos, setContratos] = useState<Contrato[]>([]);
  const [pontos, setPontos] = useState<Ponto[]>([]);
  const [ferias, setFerias] = useState<Ferias[]>([]);
  const [holerites, setHolerites] = useState<Holerite[]>([]);
  const [loading, setLoading] = useState(true);
  const [editOpen, setEditOpen] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancel = false;
    async function load() {
      setLoading(true);
      const [{ data: prof }, { data: mems }, { data: ct }, { data: pt }] = await Promise.all([
        supabase.from("profiles").select("id,nome,telefone,telefone2,avatar_url").eq("id", userId).maybeSingle(),
        supabase.from("clinica_memberships").select("clinica_id,role,ativo,clinica:clinicas(nome)").eq("user_id", userId),
        supabase.from("hr_contratos").select("id,numero,regime,data_inicio,data_fim,status,salario,cargo:cargos(nome),setor:setores(nome)").eq("user_id", userId).order("data_inicio", { ascending: false }),
        supabase.from("hr_pontos").select("id,tipo,registrado_em,unidade:unidades(nome)").eq("user_id", userId).order("registrado_em", { ascending: false }).limit(30),
      ]);
      if (cancel) return;
      setProfile((prof as Profile) ?? null);
      setMemberships((mems as unknown as Membership[]) ?? []);
      setContratos((ct as unknown as Contrato[]) ?? []);
      setPontos((pt as unknown as Ponto[]) ?? []);

      const contratoIds = ((ct as unknown as Contrato[]) ?? []).map((c) => c.id);
      if (contratoIds.length > 0) {
        const [{ data: fr }, { data: hl }] = await Promise.all([
          supabase.from("hr_ferias").select("id,inicio,fim,status,periodo_aquisitivo_inicio,periodo_aquisitivo_fim").in("contrato_id", contratoIds).order("inicio", { ascending: false }),
          supabase.from("hr_holerites").select("id,competencia,liquido,status").in("contrato_id", contratoIds).order("competencia", { ascending: false }).limit(24),
        ]);
        if (!cancel) {
          setFerias((fr as unknown as Ferias[]) ?? []);
          setHolerites((hl as unknown as Holerite[]) ?? []);
        }
      }

      // Tenta obter email se for o próprio usuário
      const { data: auth } = await supabase.auth.getUser();
      if (!cancel && auth.user && auth.user.id === userId) setEmail(auth.user.email ?? null);
      // Caso contrário, tenta via server fn (requer gestor)
      else if (!cancel && clinicaAtual) {
        try {
          const res = await getLoginFn({ data: { clinicaId: clinicaAtual.clinica_id, userId } });
          if (!cancel) setEmail((res as { email: string | null })?.email ?? null);
        } catch { /* sem permissão: ignora */ }
      }
      setLoading(false);
    }
    void load();
    return () => { cancel = true; };
  }, [userId, clinicaAtual?.clinica_id, reloadKey]);

  if (loading) {
    return <div className="p-6 space-y-4"><Skeleton className="h-32 w-full" /><Skeleton className="h-64 w-full" /></div>;
  }
  if (!profile) {
    return (
      <div className="p-6 text-center space-y-4">
        <p className="text-muted-foreground">Funcionário não encontrado ou sem permissão de visualização.</p>
        <Button asChild variant="outline"><Link to="/app/equipe"><ArrowLeft className="h-4 w-4 mr-2" />Voltar</Link></Button>
      </div>
    );
  }

  const contratoAtivo = contratos.find((c) => c.status === "ativo") ?? contratos[0];

  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto">
      <div className="flex items-center gap-3">
        <Button asChild variant="ghost" size="sm"><Link to="/app/equipe"><ArrowLeft className="h-4 w-4 mr-1" />Equipe</Link></Button>
      </div>

      <Card>
        <CardContent className="pt-6">
          <div className="flex items-start gap-4">
            {profile.avatar_url ? (
              <img src={profile.avatar_url} alt={profile.nome} className="h-16 w-16 rounded-full object-cover" />
            ) : (
              <div className="rounded-full bg-primary/10 p-4"><User className="h-8 w-8 text-primary" /></div>
            )}
            <div className="flex-1">
              <div className="flex items-center gap-3 flex-wrap">
                <h1 className="text-2xl font-bold">{profile.nome}</h1>
                {contratoAtivo?.cargo?.nome && <Badge variant="secondary">{contratoAtivo.cargo.nome}</Badge>}
              </div>
              <div className="flex flex-wrap gap-4 mt-3 text-sm text-muted-foreground">
                {email && <span className="flex items-center gap-1"><Mail className="h-3 w-3" />{email}</span>}
                {profile.telefone && <span className="flex items-center gap-1"><Phone className="h-3 w-3" />{profile.telefone}</span>}
                {profile.telefone2 && <span className="flex items-center gap-1"><Phone className="h-3 w-3" />{profile.telefone2}</span>}
              </div>
              <div className="flex flex-wrap gap-2 mt-3">
                {memberships.map((m) => (
                  <Badge key={m.clinica_id} variant="outline">{m.clinica?.nome ?? "?"} • {m.role}</Badge>
                ))}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="contratos">
        <TabsList>
          <TabsTrigger value="login"><KeyRound className="h-4 w-4 mr-1" />Login e Perfil</TabsTrigger>
          <TabsTrigger value="contratos"><Briefcase className="h-4 w-4 mr-1" />Contratos</TabsTrigger>
          <TabsTrigger value="ponto"><Clock className="h-4 w-4 mr-1" />Ponto</TabsTrigger>
          <TabsTrigger value="ferias"><Palmtree className="h-4 w-4 mr-1" />Férias</TabsTrigger>
          <TabsTrigger value="holerites">Holerites</TabsTrigger>
        </TabsList>

        <TabsContent value="login">
          <Card><CardContent className="pt-6 space-y-4">
            <div className="grid sm:grid-cols-2 gap-4 text-sm">
              <div>
                <div className="text-muted-foreground text-xs uppercase tracking-wide">Nome</div>
                <div className="font-medium">{profile.nome}</div>
              </div>
              <div>
                <div className="text-muted-foreground text-xs uppercase tracking-wide">E-mail de login</div>
                <div className="font-medium">{email ?? <span className="text-muted-foreground">Sem login cadastrado</span>}</div>
              </div>
              <div>
                <div className="text-muted-foreground text-xs uppercase tracking-wide">Telefone</div>
                <div className="font-medium">{profile.telefone ?? "—"}</div>
              </div>
              <div>
                <div className="text-muted-foreground text-xs uppercase tracking-wide">Telefone 2</div>
                <div className="font-medium">{profile.telefone2 ?? "—"}</div>
              </div>
              <div>
                <div className="text-muted-foreground text-xs uppercase tracking-wide">Perfis de acesso</div>
                <div className="flex flex-wrap gap-2 mt-1">
                  {memberships.length === 0 ? <span className="text-muted-foreground">—</span> : memberships.map((m) => (
                    <Badge key={m.clinica_id} variant={m.ativo ? "default" : "outline"}>
                      {m.clinica?.nome ?? "?"} • {m.role}{m.ativo ? "" : " (inativo)"}
                    </Badge>
                  ))}
                </div>
              </div>
            </div>
            {clinicaAtual && podeEscrever && (
              <div className="pt-2">
                <Button onClick={() => setEditOpen(true)} variant="outline" size="sm">
                  <Pencil className="h-4 w-4 mr-1" /> Editar cadastro
                </Button>
              </div>
            )}
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="contratos">
          <Card><CardContent className="pt-6">
            {contratos.length === 0 ? <p className="text-sm text-muted-foreground">Nenhum contrato.</p> : (
              <Table>
                <TableHeader><TableRow><TableHead>Nº</TableHead><TableHead>Regime</TableHead><TableHead>Cargo</TableHead><TableHead>Setor</TableHead><TableHead>Início</TableHead><TableHead>Fim</TableHead><TableHead>Salário</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
                <TableBody>{contratos.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell>#{c.numero ?? "—"}</TableCell>
                    <TableCell>{c.regime ?? "—"}</TableCell>
                    <TableCell>{c.cargo?.nome ?? "—"}</TableCell>
                    <TableCell>{c.setor?.nome ?? "—"}</TableCell>
                    <TableCell>{c.data_inicio ? formatDatePura(c.data_inicio) : "—"}</TableCell>
                    <TableCell>{c.data_fim ? formatDatePura(c.data_fim) : "—"}</TableCell>
                    <TableCell>{fmtMoeda(c.salario)}</TableCell>
                    <TableCell><Badge variant={c.status === "ativo" ? "default" : "outline"}>{c.status ?? "—"}</Badge></TableCell>
                  </TableRow>
                ))}</TableBody>
              </Table>
            )}
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="ponto">
          <Card><CardContent className="pt-6">
            {pontos.length === 0 ? <p className="text-sm text-muted-foreground">Nenhum registro de ponto.</p> : (
              <Table>
                <TableHeader><TableRow><TableHead>Quando</TableHead><TableHead>Tipo</TableHead><TableHead>Unidade</TableHead></TableRow></TableHeader>
                <TableBody>{pontos.map((p) => (
                  <TableRow key={p.id}><TableCell>{formatDateTime(p.registrado_em)}</TableCell><TableCell><Badge variant="outline">{p.tipo}</Badge></TableCell><TableCell>{p.unidade?.nome ?? "—"}</TableCell></TableRow>
                ))}</TableBody>
              </Table>
            )}
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="ferias">
          <Card><CardContent className="pt-6">
            {ferias.length === 0 ? <p className="text-sm text-muted-foreground">Nenhum período de férias.</p> : (
              <Table>
                <TableHeader><TableRow><TableHead>Período aquisitivo</TableHead><TableHead>Início</TableHead><TableHead>Fim</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
                <TableBody>{ferias.map((f) => (
                  <TableRow key={f.id}>
                    <TableCell>{f.periodo_aquisitivo_inicio ? `${formatDatePura(f.periodo_aquisitivo_inicio)} – ${formatDatePura(f.periodo_aquisitivo_fim)}` : "—"}</TableCell>
                    <TableCell>{formatDatePura(f.inicio)}</TableCell>
                    <TableCell>{formatDatePura(f.fim)}</TableCell>
                    <TableCell><Badge variant="outline">{f.status}</Badge></TableCell>
                  </TableRow>
                ))}</TableBody>
              </Table>
            )}
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="holerites">
          <Card><CardContent className="pt-6">
            {holerites.length === 0 ? <p className="text-sm text-muted-foreground">Nenhum holerite.</p> : (
              <Table>
                <TableHeader><TableRow><TableHead>Competência</TableHead><TableHead>Valor líquido</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
                <TableBody>{holerites.map((h) => (
                  <TableRow key={h.id}><TableCell>{h.competencia}</TableCell><TableCell>{fmtMoeda(h.liquido)}</TableCell><TableCell><Badge variant="outline">{h.status}</Badge></TableCell></TableRow>
                ))}</TableBody>
              </Table>
            )}
          </CardContent></Card>
        </TabsContent>
      </Tabs>

      {clinicaAtual && podeEscrever && (
        <FuncionarioFormDialog
          open={editOpen}
          onOpenChange={setEditOpen}
          clinicaId={clinicaAtual.clinica_id}
          editingUserId={userId}
          onSaved={() => setReloadKey((k) => k + 1)}
        />
      )}
    </div>
  );
}