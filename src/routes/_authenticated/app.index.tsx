import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState, type ElementType } from "react";
import {
  Building2, Bell, CalendarDays, Users, RotateCcw, MessageCircle,
  CheckCircle2, Handshake, CreditCard, Banknote, Receipt, BadgeDollarSign, Stethoscope, BookOpen, Brain,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useClinica } from "@/hooks/use-clinica";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/_authenticated/app/")({
  component: DashboardPage,
  head: () => ({ meta: [{ title: "Painel — ClinicaOS" }] }),
});

const fmtMoney = (n: number) => n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtInt = (n: number) => n.toLocaleString("pt-BR");
const pct = (num: number, den: number) => (den > 0 ? `${((num / den) * 100).toFixed(1)}%` : "0%");

type Periodo = { de: string; ate: string };

const hojeISO = () => new Date().toISOString().slice(0, 10);

function DashboardPage() {
  const { memberships, clinicaAtual, loading } = useClinica();
  const podeVerFinanceiro = ["admin", "gestor", "financeiro"].includes(clinicaAtual?.role ?? "");
  const [periodo, setPeriodo] = useState<Periodo>({ de: hojeISO(), ate: hojeISO() });
  const [carregando, setCarregando] = useState(false);
  const [data, setData] = useState({
    alertas: [] as { id: string; mensagem: string }[],
    agend: { total: 0, atendidos: 0, faltas: 0, pagos: 0, naoPagos: 0, novos: 0, regulares: 0, retornos: 0, semAgenda: 0 },
    msgs: { enviadas: 0, respostas: 0, total: 0 },
    conf: { presencas: 0, ausencias: 0 },
    vendas: { total: 0, orcamentos: 0 },
    pagamentos: { realizado: 0, aPagar: 0 },
    recebimentos: { realizado: 0, aReceber: 0, qtdRealizado: 0, qtdAReceber: 0 },
    comissoes: { pagas: 0, pendentes: 0, percentReceita: 0 },
    porMedico: [] as { nome: string; total: number; pagos: number; novos: number }[],
  });

  const load = async () => {
    if (!clinicaAtual) return;
    setCarregando(true);
    const cid = clinicaAtual.clinica_id;
    const ini = new Date(`${periodo.de}T00:00:00`).toISOString();
    const fim = new Date(`${periodo.ate}T23:59:59`).toISOString();

    const [alertasR, agendR, lancR, atendR, medicosR, espR, medEspR] = await Promise.all([
      supabase.from("fin_alertas").select("id,mensagem").eq("clinica_id", cid).eq("lido", false).order("created_at", { ascending: false }).limit(5),
      supabase.from("agendamentos").select("id,status,medico_id,paciente_id,procedimento,inicio").eq("clinica_id", cid).gte("inicio", ini).lte("inicio", fim),
      supabase.from("fin_lancamentos").select("id,tipo,status,valor,medico_id").eq("clinica_id", cid).gte("data", periodo.de).lte("data", periodo.ate),
      supabase.from("fin_atendimentos").select("id,valor_total,valor_medico,medico_id,status").eq("clinica_id", cid).gte("data", periodo.de).lte("data", periodo.ate),
      supabase.from("medicos").select("id,nome").eq("clinica_id", cid).eq("ativo", true),
      supabase.from("especialidades").select("id,nome"),
      supabase.from("medico_especialidades").select("medico_id,especialidade_id"),
    ]);

    const ags = agendR.data ?? [];
    const lancs = lancR.data ?? [];
    const atends = atendR.data ?? [];
    const meds = medicosR.data ?? [];

    // Identifica médicos cuja especialidade é "Laboratório"
    // Regra de contagem: 1 paciente por GR/procedimento, exceto laboratório
    // (vários exames do mesmo paciente no mesmo dia contam como 1).
    const espLabIds = new Set(
      (espR.data ?? [])
        .filter(e => (e.nome ?? "").toLowerCase().includes("laborat"))
        .map(e => e.id),
    );
    const labMedicoIds = new Set<string>();
    for (const me of (medEspR.data ?? []) as Array<{ medico_id: string; especialidade_id: string }>) {
      if (espLabIds.has(me.especialidade_id)) labMedicoIds.add(me.medico_id);
    }
    const isLab = (a: { medico_id: string | null }) => !!a.medico_id && labMedicoIds.has(a.medico_id);
    const contarGRs = <T extends { medico_id: string | null; paciente_id?: string | null; inicio?: string | null; id: string }>(arr: T[]) => {
      const naoLab = arr.filter(x => !isLab(x)).length;
      const grupos = new Set<string>();
      for (const x of arr.filter(isLab)) {
        const dia = (x.inicio ?? "").slice(0, 10);
        grupos.add(`${x.paciente_id ?? x.id}|${dia}`);
      }
      return naoLab + grupos.size;
    };

    // Agendamentos (contagem por GR/procedimento, com regra de laboratório)
    const total = contarGRs(ags);
    const atendidos = contarGRs(ags.filter(a => a.status === "realizado"));
    const faltas = contarGRs(ags.filter(a => a.status === "faltou"));
    const retornos = contarGRs(ags.filter(a => (a.procedimento ?? "").toLowerCase().includes("retorno")));
    const semAgenda = ags.filter(a => !a.medico_id).length;

    // Novos x regulares (a partir de paciente_id em agendamentos do período vs histórico)
    const pacIds = Array.from(new Set(ags.map(a => a.paciente_id).filter(Boolean) as string[]));
    let novos = 0, regulares = 0;
    if (pacIds.length > 0) {
      const { data: hist } = await supabase
        .from("agendamentos").select("paciente_id,inicio")
        .eq("clinica_id", cid).in("paciente_id", pacIds).lt("inicio", ini);
      const setExistentes = new Set((hist ?? []).map(h => h.paciente_id));
      novos = pacIds.filter(p => !setExistentes.has(p)).length;
      regulares = pacIds.length - novos;
    }

    // Financeiro
    const receitas = lancs.filter(l => l.tipo === "receita");
    const despesas = lancs.filter(l => l.tipo === "despesa");
    const recebRealizado = receitas.filter(l => l.status === "confirmado").reduce((s, l) => s + Number(l.valor || 0), 0);
    const recebAReceber = receitas.filter(l => l.status === "pendente").reduce((s, l) => s + Number(l.valor || 0), 0);
    const qtdReceb = receitas.filter(l => l.status === "confirmado").length;
    const qtdAReceber = receitas.filter(l => l.status === "pendente").length;
    const pagRealizado = despesas.filter(l => l.status === "confirmado").reduce((s, l) => s + Number(l.valor || 0), 0);
    const pagAPagar = despesas.filter(l => l.status === "pendente").reduce((s, l) => s + Number(l.valor || 0), 0);

    const vendasTotal = atends.reduce((s, a) => s + Number(a.valor_total || 0), 0);
    const comissoesPagas = atends.reduce((s, a) => s + Number(a.valor_medico || 0), 0);

    // Pagamentos das senhas (pagos/não pagos): a partir de atendimentos status
    const pagos = atends.filter(a => a.status === "pago" || a.status === "realizado").length;
    const naoPagos = Math.max(0, total - pagos);

    // Por médico
    const porMedico = meds.map(m => {
      const agendados = ags.filter(a => a.medico_id === m.id);
      return {
        nome: m.nome,
        total: contarGRs(agendados),
        pagos: atends.filter(a => a.medico_id === m.id).length,
        novos: agendados.filter(a => a.paciente_id && pacIds.includes(a.paciente_id)).length,
      };
    }).sort((a, b) => b.total - a.total);

    setData({
      alertas: alertasR.data ?? [],
      agend: { total, atendidos, faltas, pagos, naoPagos, novos, regulares, retornos, semAgenda },
      msgs: { enviadas: 0, respostas: 0, total: 0 },
      conf: { presencas: atendidos, ausencias: faltas },
      vendas: { total: vendasTotal, orcamentos: 0 },
      pagamentos: { realizado: pagRealizado, aPagar: pagAPagar },
      recebimentos: { realizado: recebRealizado, aReceber: recebAReceber, qtdRealizado: qtdReceb, qtdAReceber },
      comissoes: { pagas: comissoesPagas, pendentes: 0, percentReceita: recebRealizado > 0 ? (comissoesPagas / recebRealizado) * 100 : 0 },
      porMedico,
    });
    setCarregando(false);
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [clinicaAtual?.clinica_id, periodo.de, periodo.ate]);

  if (loading) return <p className="text-muted-foreground">Carregando...</p>;

  if (memberships.length === 0) {
    return (
      <div className="mx-auto mt-12 max-w-xl text-center">
        <div className="mb-4 inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
          <Building2 className="h-7 w-7" />
        </div>
        <h1 className="text-2xl font-semibold">Bem-vindo ao ClinicaOS!</h1>
        <p className="mt-2 text-muted-foreground">Para começar, crie sua primeira clínica.</p>
        <Button asChild className="mt-6" size="lg"><Link to="/app/clinicas">Criar minha primeira clínica</Link></Button>
      </div>
    );
  }

  const a = data.agend;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Painel</h1>
          <p className="text-sm text-muted-foreground">{clinicaAtual?.clinica.nome} {carregando && "• atualizando…"}</p>
        </div>
        <div className="flex items-end gap-2">
          <div className="space-y-1">
            <Label className="text-xs">Período</Label>
            <Input type="date" value={periodo.de} onChange={(e) => setPeriodo(p => ({ ...p, de: e.target.value }))} className="w-40" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">até</Label>
            <Input type="date" value={periodo.ate} onChange={(e) => setPeriodo(p => ({ ...p, ate: e.target.value }))} className="w-40" />
          </div>
          <Button variant="outline" onClick={load}>Atualizar</Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {/* Informações rápidas — lembrete para a equipe */}
        <Card className="border-primary/30 bg-primary/5">
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center gap-2">
              <BookOpen className="h-5 w-5 text-primary" />
              <h3 className="font-semibold">Informações rápidas</h3>
            </div>
            <p className="text-xs text-muted-foreground">
              Tire dúvidas sobre médicos, horários e valores de exames sem precisar lembrar de cor.
            </p>
            <div className="flex gap-2">
              <Button asChild size="sm" variant="default" className="flex-1">
                <Link to="/app/consulta-rapida"><BookOpen className="h-4 w-4 mr-1" /> Abrir tabela</Link>
              </Button>
              <Button asChild size="sm" variant="outline" className="flex-1">
                <Link to="/app/nina"><Brain className="h-4 w-4 mr-1" /> Perguntar à Nina</Link>
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Alertas */}
        <KpiCard icon={Bell} title="Central de Alertas">
          {data.alertas.length === 0
            ? <p className="text-sm text-muted-foreground">Oba! Nenhum alerta.</p>
            : <ul className="space-y-1 text-sm">{data.alertas.map(al => <li key={al.id} className="truncate">• {al.mensagem}</li>)}</ul>}
        </KpiCard>

        <KpiCard icon={CalendarDays} title="Agendamentos" big={fmtInt(a.total)}>
          <SubGrid items={[
            { label: "Atendidos", value: fmtInt(a.atendidos), pct: pct(a.atendidos, a.total) },
            { label: "Faltas", value: fmtInt(a.faltas), pct: pct(a.faltas, a.total) },
            { label: "Pagos", value: fmtInt(a.pagos), pct: pct(a.pagos, a.total) },
            { label: "Não Pagos", value: fmtInt(a.naoPagos), pct: pct(a.naoPagos, a.total) },
          ]} />
        </KpiCard>

        <KpiCard icon={Users} title="Clientes Agendados" big={fmtInt(a.novos + a.regulares)}>
          <SubGrid items={[
            { label: "Novos", value: fmtInt(a.novos), pct: pct(a.novos, a.novos + a.regulares) },
            { label: "Regulares", value: fmtInt(a.regulares), pct: pct(a.regulares, a.novos + a.regulares) },
          ]} />
        </KpiCard>

        <KpiCard icon={RotateCcw} title="Retornos" big={fmtInt(a.retornos)}>
          <SubGrid items={[
            { label: "Sem Agenda", value: fmtInt(a.semAgenda) },
            { label: "Agendados", value: fmtInt(a.retornos) },
          ]} />
        </KpiCard>

        <KpiCard icon={MessageCircle} title="Mensagens Enviadas" big={fmtInt(data.msgs.enviadas)}>
          <SubGrid items={[
            { label: "Respostas", value: fmtInt(data.msgs.respostas) },
            { label: "Total", value: fmtInt(data.msgs.total) },
          ]} />
        </KpiCard>

        <KpiCard icon={CheckCircle2} title="Confirmações das Agendas" big={fmtInt(data.conf.presencas + data.conf.ausencias)}>
          <SubGrid items={[
            { label: "Presenças", value: fmtInt(data.conf.presencas), pct: pct(data.conf.presencas, data.conf.presencas + data.conf.ausencias) },
            { label: "Ausências", value: fmtInt(data.conf.ausencias), pct: pct(data.conf.ausencias, data.conf.presencas + data.conf.ausencias) },
          ]} />
        </KpiCard>

        {podeVerFinanceiro && (
        <KpiCard icon={Handshake} title="Vendas" big={fmtMoney(data.vendas.total)}>
          <SubGrid items={[
            { label: "Conversão", value: "—" },
            { label: "Orçamentos", value: fmtMoney(data.vendas.orcamentos) },
          ]} />
        </KpiCard>
        )}

        {podeVerFinanceiro && (
        <KpiCard icon={CreditCard} title="Pagamentos" big={fmtMoney(data.pagamentos.realizado + data.pagamentos.aPagar)}>
          <SubGrid items={[
            { label: "Realizado", value: fmtMoney(data.pagamentos.realizado) },
            { label: "À pagar", value: fmtMoney(data.pagamentos.aPagar) },
          ]} />
        </KpiCard>
        )}

        {podeVerFinanceiro && (
        <KpiCard icon={Banknote} title="Recebimentos" big={fmtMoney(data.recebimentos.realizado + data.recebimentos.aReceber)}>
          <SubGrid items={[
            { label: "Realizado", value: fmtMoney(data.recebimentos.realizado) },
            { label: "À receber", value: fmtMoney(data.recebimentos.aReceber) },
          ]} />
        </KpiCard>
        )}

        {podeVerFinanceiro && (
        <KpiCard icon={Receipt} title="Recebimentos Qtd." big={fmtInt(data.recebimentos.qtdRealizado + data.recebimentos.qtdAReceber)}>
          <SubGrid items={[
            { label: "Realizado", value: fmtInt(data.recebimentos.qtdRealizado) },
            { label: "À receber", value: fmtInt(data.recebimentos.qtdAReceber) },
          ]} />
        </KpiCard>
        )}

        {podeVerFinanceiro && (
        <KpiCard icon={BadgeDollarSign} title="Comissões Pagas" big={fmtMoney(data.comissoes.pagas)}>
          <SubGrid items={[
            { label: "% da Receita", value: `${data.comissoes.percentReceita.toFixed(1)}%` },
            { label: "Pendentes", value: fmtMoney(data.comissoes.pendentes) },
          ]} />
        </KpiCard>
        )}
      </div>

      {data.porMedico.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold tracking-wide text-muted-foreground uppercase mb-3">Total de Agendamentos por médico</h2>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {data.porMedico.map((m) => (
              <KpiCard key={m.nome} icon={Stethoscope} title={m.nome} big={fmtInt(m.total)} small>
                <SubGrid items={[
                  { label: "Pagos", value: fmtInt(m.pagos), pct: pct(m.pagos, m.total) },
                  { label: "Clientes Novos", value: fmtInt(m.novos), pct: pct(m.novos, m.total) },
                ]} />
              </KpiCard>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function KpiCard({ icon: Icon, title, big, small, children }: {
  icon: ElementType; title: string; big?: string; small?: boolean; children?: React.ReactNode;
}) {
  return (
    <Card className="overflow-hidden">
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Icon className="h-4 w-4 text-primary" />
            <span className={small ? "truncate max-w-[180px]" : ""}>{title}</span>
          </div>
          {big !== undefined && <div className="text-2xl font-semibold tabular-nums">{big}</div>}
        </div>
        {children && <div className="mt-4 pt-3 border-t border-border">{children}</div>}
      </CardContent>
    </Card>
  );
}

function SubGrid({ items }: { items: { label: string; value: string; pct?: string }[] }) {
  return (
    <div className="grid grid-cols-2 gap-3">
      {items.map((it) => (
        <div key={it.label}>
          <div className="text-xs text-muted-foreground">{it.label}</div>
          <div className="text-sm font-medium tabular-nums">
            {it.value}{it.pct && <span className="ml-1 text-xs text-muted-foreground">{it.pct}</span>}
          </div>
        </div>
      ))}
    </div>
  );
}
