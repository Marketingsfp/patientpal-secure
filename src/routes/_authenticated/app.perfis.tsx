import { createFileRoute } from "@tanstack/react-router";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ShieldCheck, ConciergeBell, Wallet, DollarSign, HeartPulse } from "lucide-react";

export const Route = createFileRoute("/_authenticated/app/perfis")({
  component: PerfisPage,
  head: () => ({ meta: [{ title: "Perfis de Acesso — ClinicaOS" }] }),
});

const PERFIS = [
  {
    key: "admin",
    nome: "ADMIN",
    icon: ShieldCheck,
    descricao: "Acesso total ao sistema. Pode gerenciar unidades, equipe, perfis, configurações e todas as áreas operacionais e financeiras.",
    permissoes: ["Todas as funcionalidades", "Gestão de equipe e perfis", "Configurações e integrações", "Auditoria e LGPD"],
  },
  {
    key: "recepcao",
    nome: "RECEPÇÃO",
    icon: ConciergeBell,
    descricao: "Atendimento de pacientes na recepção: agendamentos, check-in, filas e cadastro de clientes.",
    permissoes: ["Agenda", "Recepção / Filas", "Clientes", "Fluxo do paciente", "Orçamentos"],
  },
  {
    key: "caixa",
    nome: "CAIXA",
    icon: Wallet,
    descricao: "Operação de caixa diário: recebimentos, pagamentos no balcão e fechamento de caixa.",
    permissoes: ["Caixa", "Recebimentos", "Pagamentos", "Fechamento diário"],
  },
  {
    key: "financeiro",
    nome: "FINANCEIRO",
    icon: DollarSign,
    descricao: "Gestão financeira completa: contas a pagar/receber, conciliação bancária, relatórios e BI.",
    permissoes: ["Financeiro completo", "Contas e categorias", "Boletos e NFS-e", "Relatórios e BI"],
  },
  {
    key: "enfermeiro",
    nome: "ENFERMEIRO",
    icon: HeartPulse,
    descricao: "Atuação clínica de enfermagem: triagem, alertas e acompanhamento de pacientes.",
    permissoes: ["Triagem - Enfermagem", "Alertas de enfermagem", "Prontuário (leitura)"],
  },
];

function PerfisPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Perfis de Acesso</h1>
        <p className="text-sm text-muted-foreground">
          Perfis disponíveis para atribuir aos usuários em <span className="font-medium">Cadastros &rarr; Equipe</span>.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {PERFIS.map((p) => {
          const Icon = p.icon;
          return (
            <Card key={p.key}>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Icon className="h-5 w-5 text-primary" />
                  {p.nome}
                  <Badge variant="secondary" className="ml-auto font-mono text-xs">{p.key}</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-sm text-muted-foreground">{p.descricao}</p>
                <div className="flex flex-wrap gap-1.5">
                  {p.permissoes.map((perm) => (
                    <Badge key={perm} variant="outline" className="font-normal">{perm}</Badge>
                  ))}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}