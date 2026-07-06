import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowLeft, Stethoscope, Calendar, DollarSign, MapPin, Phone, Mail, CreditCard } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { formatDatePura, formatDateTime, calcularIdade } from "@/lib/date-utils";

export const Route = createFileRoute("/_authenticated/app/medico/$medicoId")({
  component: PerfilMedicoPage,
  head: () => ({ meta: [{ title: "Perfil do Médico — ClinicaOS" }] }),
});

interface MedicoFull {
  id: string; nome: string; crm: string; crm_uf: string; ativo: boolean;
  email: string | null; telefone: string | null; cpf: string | null; rg: string | null;
  data_nascimento: string | null; nacionalidade: string | null; estado_civil: string | null;
  cep: string | null; logradouro: string | null; numero: string | null; complemento: string | null;
  bairro: string | null; cidade: string | null; estado: string | null;
  banco: string | null; agencia: string | null; conta: string | null; pix_chave: string | null;
  tipo_repasse: string; percentual_repasse_padrao: number; valor_repasse_padrao: number | null;
  clinica_id: string;
  medico_especialidades: { especialidade: { nome: string } | null }[];
}

interface Agendamento {
  id: string; inicio: string; paciente_nome: string; procedimento: string | null; status: string;
}
interface Atendimento {
  id: string; data: string; procedimento: string | null; valor_total: number; valor_medico: number; status: string;
}

function fmtMoeda(v: number | null | undefined): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(v ?? 0));
}

function PerfilMedicoPage() {
  const { medicoId } = Route.useParams();
  const [medico, setMedico] = useState<MedicoFull | null>(null);
  const [agendamentos, setAgendamentos] = useState<Agendamento[]>([]);
  const [atendimentos, setAtendimentos] = useState<Atendimento[]>([]);
  const [loading, setLoading] = useState(true);
  const [drill, setDrill] = useState<null | "agend" | "faturado" | "repasse">(null);

  useEffect(() => {
    let cancel = false;
    async function load() {
      setLoading(true);
      const { data: med } = await supabase
        .from("medicos")
        .select("id, nome, crm, crm_uf, ativo, email, telefone, nacionalidade, estado_civil, cep, logradouro, numero, complemento, bairro, cidade, estado, tipo_repasse, percentual_repasse_padrao, valor_repasse_padrao, clinica_id, medico_especialidades(especialidade:especialidades(nome))")
        .eq("id", medicoId)
        .maybeSingle();
      if (cancel) return;
      let sens: any = {};
      try {
        const { data: s } = await supabase.rpc("medico_dados_sensiveis", { _medico_id: medicoId });
        sens = (s as any) ?? {};
      } catch { sens = {}; }
      setMedico(med ? ({ ...(med as any), cpf: sens.cpf ?? null, rg: sens.rg ?? null, data_nascimento: sens.data_nascimento ?? null, banco: sens.banco ?? null, agencia: sens.agencia ?? null, conta: sens.conta ?? null, pix_chave: sens.pix_chave ?? null } as MedicoFull) : null);

      const { data: ag } = await supabase
        .from("agendamentos")
        .select("id,inicio,paciente_nome,procedimento,status")
        .eq("medico_id", medicoId)
        .order("inicio", { ascending: false })
        .limit(50);
      if (!cancel) setAgendamentos((ag as Agendamento[]) ?? []);

      const { data: at } = await supabase
        .from("fin_atendimentos")
        .select("id,data,procedimento,valor_total,valor_medico,status")
        .eq("medico_id", medicoId)
        .order("data", { ascending: false })
        .limit(50);
      if (!cancel) setAtendimentos((at as Atendimento[]) ?? []);
      setLoading(false);
    }
    void load();
    return () => { cancel = true; };
  }, [medicoId]);

  if (loading) {
    return <div className="p-6 space-y-4"><Skeleton className="h-32 w-full" /><Skeleton className="h-64 w-full" /></div>;
  }
  if (!medico) {
    return (
      <div className="p-6 text-center space-y-4">
        <p className="text-muted-foreground">Médico não encontrado.</p>
        <Button asChild variant="outline"><Link to="/app/medicos" search={{ new: undefined, edit: undefined }}><ArrowLeft className="h-4 w-4 mr-2" />Voltar</Link></Button>
      </div>
    );
  }

  const totalRepasse = atendimentos.reduce((s, a) => s + Number(a.valor_medico ?? 0), 0);
  const totalFaturado = atendimentos.reduce((s, a) => s + Number(a.valor_total ?? 0), 0);
  const idade = calcularIdade(medico.data_nascimento);
  const especialidades = medico.medico_especialidades.map((e) => e.especialidade?.nome).filter(Boolean).join(", ") || "—";

  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto">
      <div className="flex items-center gap-3">
        <Button asChild variant="ghost" size="sm"><Link to="/app/medicos" search={{ new: undefined, edit: undefined }}><ArrowLeft className="h-4 w-4 mr-1" />Médicos</Link></Button>
      </div>

      <Card>
        <CardContent className="pt-6">
          <div className="flex items-start gap-4">
            <div className="rounded-full bg-primary/10 p-4"><Stethoscope className="h-8 w-8 text-primary" /></div>
            <div className="flex-1">
              <div className="flex items-center gap-3 flex-wrap">
                <h1 className="text-2xl font-bold">{medico.nome}</h1>
                <Badge variant={medico.ativo ? "default" : "secondary"}>{medico.ativo ? "Ativo" : "Inativo"}</Badge>
              </div>
              <p className="text-muted-foreground">CRM {medico.crm}/{medico.crm_uf} • {especialidades}</p>
              <div className="flex flex-wrap gap-4 mt-3 text-sm text-muted-foreground">
                {medico.email && <span className="flex items-center gap-1"><Mail className="h-3 w-3" />{medico.email}</span>}
                {medico.telefone && <span className="flex items-center gap-1"><Phone className="h-3 w-3" />{medico.telefone}</span>}
                {medico.cidade && <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{medico.cidade}/{medico.estado}</span>}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="cursor-pointer hover:bg-muted/50 transition-colors" onClick={() => setDrill("agend")}><CardContent className="pt-6"><div className="flex items-center gap-2 text-muted-foreground text-sm"><Calendar className="h-4 w-4" />Agendamentos</div><p className="text-2xl font-bold mt-1">{agendamentos.length}</p></CardContent></Card>
        <Card className="cursor-pointer hover:bg-muted/50 transition-colors" onClick={() => setDrill("faturado")}><CardContent className="pt-6"><div className="flex items-center gap-2 text-muted-foreground text-sm"><DollarSign className="h-4 w-4" />Faturado (últimos 50)</div><p className="text-2xl font-bold mt-1">{fmtMoeda(totalFaturado)}</p></CardContent></Card>
        <Card className="cursor-pointer hover:bg-muted/50 transition-colors" onClick={() => setDrill("repasse")}><CardContent className="pt-6"><div className="flex items-center gap-2 text-muted-foreground text-sm"><CreditCard className="h-4 w-4" />Repasse (últimos 50)</div><p className="text-2xl font-bold mt-1">{fmtMoeda(totalRepasse)}</p></CardContent></Card>
      </div>

      <Tabs defaultValue="dados">
        <TabsList>
          <TabsTrigger value="dados">Dados pessoais</TabsTrigger>
          <TabsTrigger value="financeiro">Financeiro / Repasse</TabsTrigger>
          <TabsTrigger value="agenda">Agenda</TabsTrigger>
          <TabsTrigger value="atendimentos">Atendimentos</TabsTrigger>
        </TabsList>

        <TabsContent value="dados">
          <Card><CardContent className="pt-6 grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
            <Info label="CPF" value={medico.cpf} />
            <Info label="RG" value={medico.rg} />
            <Info label="Nascimento" value={medico.data_nascimento ? `${formatDatePura(medico.data_nascimento)}${idade !== null ? ` (${idade} anos)` : ""}` : null} />
            <Info label="Estado civil" value={medico.estado_civil} />
            <Info label="Nacionalidade" value={medico.nacionalidade} />
            <Info label="Endereço" value={[medico.logradouro, medico.numero, medico.complemento, medico.bairro].filter(Boolean).join(", ") || null} />
            <Info label="Cidade/UF" value={medico.cidade ? `${medico.cidade}/${medico.estado ?? ""}` : null} />
            <Info label="CEP" value={medico.cep} />
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="financeiro">
          <Card><CardContent className="pt-6 grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
            <Info label="Tipo de repasse" value={medico.tipo_repasse === "percentual" ? `${medico.percentual_repasse_padrao}%` : fmtMoeda(medico.valor_repasse_padrao)} />
            <Info label="Banco" value={medico.banco} />
            <Info label="Agência" value={medico.agencia} />
            <Info label="Conta" value={medico.conta} />
            <Info label="Chave PIX" value={medico.pix_chave} />
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="agenda">
          <Card><CardContent className="pt-6">
            {agendamentos.length === 0 ? <p className="text-sm text-muted-foreground">Nenhum agendamento.</p> : (
              <Table>
                <TableHeader><TableRow><TableHead>Quando</TableHead><TableHead>Paciente</TableHead><TableHead>Procedimento</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
                <TableBody>{agendamentos.map((a) => (
                  <TableRow key={a.id}><TableCell>{formatDateTime(a.inicio)}</TableCell><TableCell>{a.paciente_nome}</TableCell><TableCell>{a.procedimento ?? "—"}</TableCell><TableCell><Badge variant="outline">{a.status}</Badge></TableCell></TableRow>
                ))}</TableBody>
              </Table>
            )}
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="atendimentos">
          <Card><CardContent className="pt-6">
            {atendimentos.length === 0 ? <p className="text-sm text-muted-foreground">Nenhum atendimento.</p> : (
              <Table>
                <TableHeader><TableRow><TableHead>Data</TableHead><TableHead>Procedimento</TableHead><TableHead>Total</TableHead><TableHead>Repasse</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
                <TableBody>{atendimentos.map((a) => (
                  <TableRow key={a.id}><TableCell>{formatDatePura(a.data)}</TableCell><TableCell>{a.procedimento ?? "—"}</TableCell><TableCell>{fmtMoeda(a.valor_total)}</TableCell><TableCell>{fmtMoeda(a.valor_medico)}</TableCell><TableCell><Badge variant="outline">{a.status}</Badge></TableCell></TableRow>
                ))}</TableBody>
              </Table>
            )}
          </CardContent></Card>
        </TabsContent>
      </Tabs>

      <Dialog open={!!drill} onOpenChange={(v) => { if (!v) setDrill(null); }}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>
              {drill === "agend" && "Agendamentos do médico"}
              {drill === "faturado" && "Atendimentos faturados (últimos 50)"}
              {drill === "repasse" && "Repasse por atendimento (últimos 50)"}
            </DialogTitle>
            <DialogDescription>Detalhamento dos registros.</DialogDescription>
          </DialogHeader>
          <div className="max-h-[60vh] overflow-auto">
            {drill === "agend" && (
              <Table>
                <TableHeader><TableRow><TableHead>Quando</TableHead><TableHead>Paciente</TableHead><TableHead>Procedimento</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
                <TableBody>{agendamentos.map((a) => (
                  <TableRow key={a.id}><TableCell>{formatDateTime(a.inicio)}</TableCell><TableCell>{a.paciente_nome}</TableCell><TableCell>{a.procedimento ?? "—"}</TableCell><TableCell><Badge variant="outline">{a.status}</Badge></TableCell></TableRow>
                ))}</TableBody>
              </Table>
            )}
            {(drill === "faturado" || drill === "repasse") && (
              <Table>
                <TableHeader><TableRow><TableHead>Data</TableHead><TableHead>Procedimento</TableHead><TableHead className="text-right">{drill === "faturado" ? "Valor total" : "Repasse"}</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
                <TableBody>{atendimentos.map((a) => (
                  <TableRow key={a.id}><TableCell>{formatDatePura(a.data)}</TableCell><TableCell>{a.procedimento ?? "—"}</TableCell><TableCell className="text-right font-semibold">{fmtMoeda(drill === "faturado" ? a.valor_total : a.valor_medico)}</TableCell><TableCell><Badge variant="outline">{a.status}</Badge></TableCell></TableRow>
                ))}</TableBody>
              </Table>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground uppercase tracking-wide">{label}</p>
      <p className="font-medium">{value || "—"}</p>
    </div>
  );
}
