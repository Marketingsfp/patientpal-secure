import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import {
  ShieldCheck, ConciergeBell, Wallet, DollarSign, HeartPulse, Stethoscope, Briefcase,
  ChevronDown, ChevronRight, Save,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/app/perfis")({
  component: PerfisPage,
  head: () => ({ meta: [{ title: "Perfis de Acesso — ClinicaOS" }] }),
});

type PerfilKey = "admin" | "gestor" | "medico" | "recepcao" | "caixa" | "financeiro" | "enfermeiro";
type Acesso = "none" | "read" | "write";

const PERFIS: Array<{
  key: PerfilKey;
  nome: string;
  icon: typeof ShieldCheck;
  descricao: string;
}> = [
  {
    key: "admin",
    nome: "ADMIN",
    icon: ShieldCheck,
    descricao: "Acesso total ao sistema. Pode gerenciar unidades, equipe, perfis, configurações e todas as áreas operacionais e financeiras.",
  },
  {
    key: "gestor",
    nome: "GESTOR",
    icon: Briefcase,
    descricao: "Gestão operacional da unidade: acompanha indicadores, equipe, agenda e financeiro, sem acesso a configurações sensíveis.",
  },
  {
    key: "medico",
    nome: "MÉDICO",
    icon: Stethoscope,
    descricao: "Profissional clínico: realiza atendimentos, prontuários, prescrições e visualiza seus repasses.",
  },
  {
    key: "recepcao",
    nome: "RECEPÇÃO",
    icon: ConciergeBell,
    descricao: "Atendimento de pacientes na recepção: agendamentos, check-in, filas e cadastro de clientes.",
  },
  {
    key: "caixa",
    nome: "CAIXA",
    icon: Wallet,
    descricao: "Operação de caixa diário: recebimentos, pagamentos no balcão e fechamento de caixa.",
  },
  {
    key: "financeiro",
    nome: "FINANCEIRO",
    icon: DollarSign,
    descricao: "Gestão financeira completa: contas a pagar/receber, conciliação bancária, relatórios e BI.",
  },
  {
    key: "enfermeiro",
    nome: "ENFERMEIRO",
    icon: HeartPulse,
    descricao: "Atuação clínica de enfermagem: triagem, alertas e acompanhamento de pacientes.",
  },
];

type Modulo = { key: string; nome: string; descricao: string };
type Grupo = { label: string; modulos: Modulo[] };

const GRUPOS: Grupo[] = [
  {
    label: "Operação",
    modulos: [
      { key: "agenda", nome: "Agenda", descricao: "Calendário e agendamentos" },
      { key: "anamneses", nome: "Anamneses", descricao: "Modelos e respostas de anamnese" },
      { key: "caixa", nome: "Caixa", descricao: "Operação de caixa diário" },
      { key: "cartao-beneficios", nome: "Cartão Benefícios", descricao: "Planos e contratos" },
      { key: "chat", nome: "Chat interno", descricao: "Mensagens entre equipe" },
      { key: "checkin", nome: "Check-in", descricao: "Check-in de pacientes" },
      { key: "clientes", nome: "Clientes", descricao: "Cadastro de pacientes" },
      { key: "dashboard", nome: "Dashboard", descricao: "Indicadores da clínica" },
      { key: "documentos", nome: "Documentos", descricao: "Documentos do paciente" },
      { key: "fluxo", nome: "Fluxo do paciente", descricao: "Kanban de atendimento" },
      { key: "orcamentos", nome: "Orçamentos", descricao: "Propostas e orçamentos" },
      { key: "painel", nome: "Painel de Senhas", descricao: "Painel público de chamadas" },
      { key: "recepcao", nome: "Recepção / Filas", descricao: "Check-in e filas" },
      { key: "triagem-enfermagem", nome: "Triagem - Enfermagem", descricao: "Triagem inicial" },
    ],
  },
  {
    label: "Inteligência",
    modulos: [
      { key: "atendimento-ia", nome: "Atendimento médico", descricao: "Atendimento com IA" },
      { key: "crm", nome: "CRM", descricao: "Oportunidades e leads" },
      { key: "alertas-enfermagem", nome: "Enfermeira IA — Alertas", descricao: "Alertas automáticos" },
      { key: "consulta-rapida", nome: "Informações rápidas", descricao: "Consulta a tabelas" },
      { key: "nina", nome: "Nina — WhatsApp", descricao: "Conversas WhatsApp" },
      { key: "odontologia", nome: "Odontologia", descricao: "Odontograma e plano" },
      { key: "prontuarios", nome: "Prontuários", descricao: "Prontuários clínicos" },
      { key: "exames-resultados", nome: "Resultados de Exames", descricao: "Laudos e resultados" },
    ],
  },
  {
    label: "Marketing",
    modulos: [
      { key: "campanhas", nome: "Campanhas", descricao: "Campanhas de marketing" },
      { key: "mkt-envios", nome: "Envios", descricao: "Disparos em massa" },
      { key: "mkt-landing", nome: "Landing Pages", descricao: "Páginas de captura" },
      { key: "mkt-leads", nome: "Leads", descricao: "Base de leads" },
      { key: "mkt-segmentos", nome: "Segmentos", descricao: "Segmentação de público" },
    ],
  },
  {
    label: "Cadastros",
    modulos: [
      { key: "cargos", nome: "Cargos", descricao: "Cargos e funções" },
      { key: "clinicas", nome: "Clínicas", descricao: "Cadastro de clínicas" },
      { key: "equipe", nome: "Equipe", descricao: "Usuários do sistema" },
      { key: "especialidades", nome: "Especialidades", descricao: "Especialidades médicas" },
      { key: "estoque", nome: "Estoque", descricao: "Produtos e movimentos" },
      { key: "hr-contratos", nome: "Funcionários", descricao: "Cadastro de RH" },
      { key: "funcionarios", nome: "Funcionários (lista)", descricao: "Listagem operacional de funcionários" },
      { key: "disponibilidades", nome: "Horários médicos", descricao: "Agenda dos médicos" },
      { key: "medicos", nome: "Médicos", descricao: "Cadastro de médicos" },
      { key: "modelos-documentos", nome: "Modelos de Documentos", descricao: "Templates de documentos" },
      { key: "prontuario-modelos", nome: "Modelos de Prontuário", descricao: "Templates clínicos" },
      { key: "perfis", nome: "Perfis", descricao: "Perfis de acesso" },
      { key: "planos", nome: "Planos / Convênios", descricao: "Planos de saúde e convênios" },
      { key: "procedimentos", nome: "Procedimentos", descricao: "Tabela de procedimentos" },
      { key: "setores", nome: "Setores", descricao: "Setores da clínica" },
      { key: "unidades", nome: "Unidades", descricao: "Clínicas / unidades" },
    ],
  },
  {
    label: "Gestão",
    modulos: [
      { key: "auditoria", nome: "Auditoria", descricao: "Logs e auditoria" },
      { key: "boletos", nome: "Boletos", descricao: "Emissão e gestão de boletos" },
      { key: "contratos", nome: "Contratos", descricao: "Contratos de assinatura" },
      { key: "financeiro", nome: "Financeiro", descricao: "Financeiro completo" },
      { key: "integration-secrets", nome: "Integrações", descricao: "Chaves e integrações" },
      { key: "lgpd", nome: "LGPD", descricao: "Gestão de privacidade" },
      { key: "nfse", nome: "NFS-e", descricao: "Notas fiscais de serviço" },
      { key: "relatorios", nome: "Relatórios", descricao: "Relatórios e BI" },
    ],
  },
  {
    label: "RH",
    modulos: [
      { key: "hr-ponto", nome: "Bater ponto", descricao: "Registro de ponto" },
      { key: "lms-admin", nome: "Cursos (admin)", descricao: "Administração de cursos" },
      { key: "hr-ferias", nome: "Férias", descricao: "Gestão de férias" },
      { key: "hr-holerites", nome: "Holerites", descricao: "Holerites e folha" },
      { key: "treinamentos", nome: "Treinamentos", descricao: "Trilhas de aprendizado" },
    ],
  },
  {
    label: "Sistema",
    modulos: [
      { key: "configuracoes", nome: "Configurações", descricao: "Configurações gerais" },
      { key: "perfil-proprio", nome: "Perfil próprio", descricao: "Dados do próprio usuário" },
    ],
  },
];

const TODOS_MODULOS = GRUPOS.flatMap((g) => g.modulos.map((m) => m.key));

// Sugestão inicial (mock) por perfil
const PRESETS: Record<PerfilKey, Partial<Record<string, Acesso>>> = {
  admin: Object.fromEntries(TODOS_MODULOS.map((k) => [k, "write" as Acesso])),
  gestor: {
    dashboard: "write", agenda: "write", fluxo: "write", clientes: "write",
    recepcao: "read", orcamentos: "read", caixa: "read", financeiro: "read",
    relatorios: "write", auditoria: "read", equipe: "write", "hr-contratos": "read",
    cargos: "read", setores: "read", unidades: "read", medicos: "read",
    especialidades: "read", procedimentos: "read",
  },
  medico: {
    agenda: "write", "atendimento-ia": "write", "exames-resultados": "read",
    "consulta-rapida": "read", "perfil-proprio": "write", "prontuario-modelos": "read",
    odontologia: "write", prontuarios: "write", anamneses: "write",
    documentos: "write",
  },
  recepcao: {
    agenda: "write", recepcao: "write", clientes: "write", fluxo: "write",
    orcamentos: "write", "consulta-rapida": "read", "perfil-proprio": "write",
    checkin: "write", painel: "write", anamneses: "write", documentos: "read",
  },
  caixa: {
    caixa: "write", clientes: "read", recepcao: "read", financeiro: "read",
    "consulta-rapida": "read", "perfil-proprio": "write",
    boletos: "write",
  },
  financeiro: {
    financeiro: "write", caixa: "read", relatorios: "write", orcamentos: "read",
    clientes: "read", "cartao-beneficios": "write", "perfil-proprio": "write",
    boletos: "write", nfse: "write", contratos: "write", planos: "read",
  },
  enfermeiro: {
    "triagem-enfermagem": "write", "alertas-enfermagem": "write",
    agenda: "read", clientes: "read", "consulta-rapida": "read",
    "atendimento-ia": "read", "perfil-proprio": "write",
    anamneses: "write", prontuarios: "read", estoque: "read",
  },
};

function buildInitialState(): Record<PerfilKey, Record<string, Acesso>> {
  const out = {} as Record<PerfilKey, Record<string, Acesso>>;
  for (const p of PERFIS) {
    const preset = PRESETS[p.key];
    out[p.key] = Object.fromEntries(
      TODOS_MODULOS.map((k) => [k, (preset[k] ?? "none") as Acesso]),
    );
  }
  return out;
}

function PerfisPage() {
  const [tab, setTab] = useState<"perfis" | "permissoes">("perfis");
  const [perfilSel, setPerfilSel] = useState<PerfilKey>("admin");
  const [matriz, setMatriz] = useState<Record<PerfilKey, Record<string, Acesso>>>(buildInitialState);
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(
    () => Object.fromEntries(GRUPOS.map((g) => [g.label, true])),
  );

  const contagens = useMemo(() => {
    const out = {} as Record<PerfilKey, number>;
    for (const p of PERFIS) {
      out[p.key] = Object.values(matriz[p.key]).filter((v) => v !== "none").length;
    }
    return out;
  }, [matriz]);

  const totalModulos = TODOS_MODULOS.length;
  const acessosPerfil = contagens[perfilSel];

  const setAcesso = (modulo: string, valor: Acesso) => {
    setMatriz((prev) => ({
      ...prev,
      [perfilSel]: { ...prev[perfilSel], [modulo]: valor },
    }));
  };

  const aplicarTodos = (valor: Acesso) => {
    setMatriz((prev) => ({
      ...prev,
      [perfilSel]: Object.fromEntries(TODOS_MODULOS.map((k) => [k, valor])),
    }));
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Perfis de Acesso</h1>
        <p className="text-sm text-muted-foreground">
          Gerencie os perfis e suas permissões por módulo do sistema.
        </p>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as "perfis" | "permissoes")}>
        <TabsList>
          <TabsTrigger value="perfis">Perfis</TabsTrigger>
          <TabsTrigger value="permissoes">Permissões</TabsTrigger>
        </TabsList>

        <TabsContent value="perfis" className="mt-4">
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12"></TableHead>
                    <TableHead>Perfil</TableHead>
                    <TableHead className="w-28">Chave</TableHead>
                    <TableHead>Descrição</TableHead>
                    <TableHead className="w-32 text-right">Acessos</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {PERFIS.map((p) => {
                    const Icon = p.icon;
                    return (
                      <TableRow
                        key={p.key}
                        className="cursor-pointer"
                        onClick={() => { setPerfilSel(p.key); setTab("permissoes"); }}
                      >
                        <TableCell><Icon className="h-5 w-5 text-primary" /></TableCell>
                        <TableCell className="font-medium">{p.nome}</TableCell>
                        <TableCell>
                          <Badge variant="secondary" className="font-mono text-xs">{p.key}</Badge>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">{p.descricao}</TableCell>
                        <TableCell className="text-right text-sm">
                          <span className="font-medium">{contagens[p.key]}</span>
                          <span className="text-muted-foreground"> / {totalModulos}</span>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="permissoes" className="mt-4 space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs uppercase tracking-wide text-muted-foreground">Perfil</Label>
                  <Select value={perfilSel} onValueChange={(v) => setPerfilSel(v as PerfilKey)}>
                    <SelectTrigger className="w-64"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {PERFIS.map((p) => (
                        <SelectItem key={p.key} value={p.key}>{p.nome}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-sm">
                    Acessos: <span className="ml-1 font-semibold">{acessosPerfil}</span> / {totalModulos}
                  </Badge>
                  <Button variant="outline" size="sm" onClick={() => aplicarTodos("read")}>Tudo Leitura</Button>
                  <Button variant="outline" size="sm" onClick={() => aplicarTodos("write")}>Tudo Edição</Button>
                  <Button variant="outline" size="sm" onClick={() => aplicarTodos("none")}>Limpar</Button>
                  <Button size="sm" disabled title="Apenas pré-visualização">
                    <Save className="h-4 w-4 mr-2" /> Salvar
                  </Button>
                </div>
              </div>
            </CardHeader>
          </Card>

          {GRUPOS.map((grupo) => {
            const open = openGroups[grupo.label] ?? true;
            const ativos = grupo.modulos.filter((m) => matriz[perfilSel][m.key] !== "none").length;
            return (
              <Card key={grupo.label} className="overflow-hidden">
                <Collapsible
                  open={open}
                  onOpenChange={(o) => setOpenGroups((p) => ({ ...p, [grupo.label]: o }))}
                >
                  <CollapsibleTrigger asChild>
                    <button
                      type="button"
                      className="w-full flex items-center justify-between px-4 py-3 hover:bg-muted/50 transition-colors"
                    >
                      <div className="flex items-center gap-2">
                        {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                        <span className="font-semibold">{grupo.label}</span>
                      </div>
                      <Badge variant="secondary" className="text-xs">
                        {ativos} / {grupo.modulos.length}
                      </Badge>
                    </button>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-1/3">Módulo</TableHead>
                          <TableHead>Descrição</TableHead>
                          <TableHead className="w-[320px] text-right">Acesso</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {grupo.modulos.map((m) => {
                          const val = matriz[perfilSel][m.key];
                          return (
                            <TableRow key={m.key}>
                              <TableCell className="font-medium">{m.nome}</TableCell>
                              <TableCell className="text-sm text-muted-foreground">{m.descricao}</TableCell>
                              <TableCell>
                                <RadioGroup
                                  value={val}
                                  onValueChange={(v) => setAcesso(m.key, v as Acesso)}
                                  className="flex items-center justify-end gap-4"
                                >
                                  <label className="flex items-center gap-1.5 text-sm cursor-pointer">
                                    <RadioGroupItem value="none" id={`${m.key}-none`} />
                                    <span className="text-muted-foreground">Sem</span>
                                  </label>
                                  <label className="flex items-center gap-1.5 text-sm cursor-pointer">
                                    <RadioGroupItem value="read" id={`${m.key}-read`} />
                                    <span>Leitura</span>
                                  </label>
                                  <label className="flex items-center gap-1.5 text-sm cursor-pointer">
                                    <RadioGroupItem value="write" id={`${m.key}-write`} />
                                    <span>Edição</span>
                                  </label>
                                </RadioGroup>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </CollapsibleContent>
                </Collapsible>
              </Card>
            );
          })}

          <p className="text-xs text-muted-foreground">
            Pré-visualização: as alterações ainda não são salvas no banco. Aprove o formato para que eu habilite a persistência.
          </p>
        </TabsContent>
      </Tabs>
    </div>
  );
}