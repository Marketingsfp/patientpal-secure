import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useClinica } from "@/hooks/use-clinica";
import { toast } from "sonner";
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
  ChevronDown, ChevronRight, Save, Loader2,
} from "lucide-react";
import { PRESETS, type Acesso, type PerfilKey } from "@/lib/permissoes-presets";

export const Route = createFileRoute("/_authenticated/app/perfis")({
  component: PerfisPage,
  head: () => ({ meta: [{ title: "Perfis de Acesso — ClinicaOS" }] }),
});

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
      { key: "checkin", nome: "Check-in", descricao: "Check-in de pacientes" },
      { key: "caixa", nome: "Caixa", descricao: "Operação de caixa diário" },
      { key: "chat", nome: "Chat interno", descricao: "Mensagens entre equipe" },
      { key: "clientes", nome: "Clientes", descricao: "Cadastro de pacientes" },
      { key: "dashboard", nome: "Dashboard", descricao: "Indicadores da clínica" },
      { key: "fluxo", nome: "Fluxo do paciente", descricao: "Kanban de atendimento" },
      { key: "orcamentos", nome: "Orçamentos", descricao: "Propostas e orçamentos" },
      { key: "recepcao", nome: "Recepção / Filas", descricao: "Check-in e filas" },
      { key: "triagem-enfermagem", nome: "Triagem - Enfermagem", descricao: "Triagem inicial" },
      { key: "cartao-beneficios", nome: "Cartão Benefícios", descricao: "Planos e contratos" },
      { key: "painel", nome: "Painel de Senhas", descricao: "Painel público de chamadas" },
      { key: "documentos", nome: "Documentos do paciente", descricao: "Anexos e arquivos clínicos" },
      { key: "atendimento-multiplo", nome: "Atendimento Múltiplo", descricao: "Atendimentos e pagamentos agrupados" },
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
      { key: "anamneses", nome: "Anamneses", descricao: "Modelos e respostas de anamnese" },
      { key: "exames-resultados", nome: "Resultados de Exames", descricao: "Laudos e resultados" },
    ],
  },
  {
    label: "Marketing",
    modulos: [
      { key: "mkt-leads", nome: "Leads", descricao: "Base de leads (entrada do menu Marketing)" },
      { key: "campanhas", nome: "Campanhas", descricao: "Campanhas de marketing" },
      { key: "mkt-envios", nome: "Envios", descricao: "Disparos em massa" },
      { key: "mkt-landing", nome: "Landing Pages", descricao: "Páginas de captura" },
      { key: "mkt-segmentos", nome: "Segmentos", descricao: "Segmentação de público" },
    ],
  },
  {
    label: "Cadastros",
    modulos: [
      { key: "equipe", nome: "Equipe", descricao: "Usuários do sistema" },
      { key: "especialidades", nome: "Serviços", descricao: "Especialidades, tipos de serviço, procedimentos e recursos de enfermagem" },
      { key: "disponibilidades", nome: "Horários médicos", descricao: "Agenda dos médicos" },
      { key: "prontuario-modelos", nome: "Modelos de Prontuário", descricao: "Templates clínicos" },
      { key: "perfis", nome: "Perfis de acesso", descricao: "Perfis e permissões" },
      { key: "unidades", nome: "Unidades", descricao: "Clínicas / unidades" },
      { key: "medicos", nome: "Médicos", descricao: "Cadastro de médicos" },
      { key: "procedimentos", nome: "Procedimentos", descricao: "Tabela de procedimentos" },
      { key: "planos", nome: "Planos / Convênios", descricao: "Planos de saúde e convênios" },
      { key: "estoque", nome: "Estoque", descricao: "Produtos e movimentos" },
      { key: "modelos-documentos", nome: "Modelos de Documentos", descricao: "Templates de documentos" },
      { key: "clinicas", nome: "Clínicas", descricao: "Cadastro de clínicas (multi-empresa)" },
      { key: "tipos-servico", nome: "Tipos de serviço", descricao: "Classificação de serviços" },
      { key: "enfermagem-recursos", nome: "Recursos de enfermagem", descricao: "Recursos operacionais de enfermagem" },
    ],
  },
  {
    label: "RH",
    modulos: [
      { key: "hr-ponto", nome: "Bater ponto", descricao: "Registro de ponto" },
      { key: "hr-contratos", nome: "Contratos de RH", descricao: "Contratos dos funcionários" },
      { key: "hr-ferias", nome: "Férias", descricao: "Gestão de férias" },
      { key: "hr-holerites", nome: "Holerites", descricao: "Holerites e folha" },
      { key: "treinamentos", nome: "Treinamentos", descricao: "Trilhas de aprendizado" },
      { key: "lms-admin", nome: "Cursos (admin)", descricao: "Administração de cursos" },
    ],
  },
  {
    label: "Gestão",
    modulos: [
      { key: "cargos", nome: "Cargos", descricao: "Cargos e funções" },
      { key: "financeiro", nome: "Financeiro", descricao: "Financeiro completo (BI, contas, lembretes, regras-IA)" },
      { key: "funcionarios", nome: "Funcionários", descricao: "Listagem operacional de funcionários" },
      { key: "relatorios", nome: "Relatórios", descricao: "Relatórios e BI" },
      { key: "auditoria", nome: "Segurança & Compliance", descricao: "Auditoria, logs e LGPD" },
      { key: "setores", nome: "Setores", descricao: "Setores da clínica" },
      { key: "boletos", nome: "Boletos", descricao: "Emissão e gestão de boletos" },
      { key: "contratos", nome: "Contratos de assinatura", descricao: "Cartão Benefícios e mensalidades" },
      { key: "nfse", nome: "NFS-e", descricao: "Notas fiscais de serviço" },
      { key: "integration-secrets", nome: "Integrações", descricao: "Chaves e integrações externas" },
      { key: "lgpd", nome: "LGPD", descricao: "Gestão de privacidade" },
      { key: "painel-executivo", nome: "Painel Executivo", descricao: "Indicadores executivos da clínica" },
    ],
  },
];

const TODOS_MODULOS = GRUPOS.flatMap((g) => g.modulos.map((m) => m.key));

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
  const { clinicaAtual } = useClinica();
  const clinicaId = clinicaAtual?.clinica_id ?? null;
  // Deliberadamente hardcoded para role === "admin", e NÃO
  // usePodeEscrever("perfis") — quem gerencia permissões precisa ser um
  // admin de verdade, mesmo que a matriz configure "perfis: Edição" para
  // outro perfil. Sem essa trava, um perfil não-admin com edição em
  // "Perfis de acesso" poderia se auto-promover a qualquer nível de
  // acesso no sistema.
  const podeAdministrar = clinicaAtual?.role === "admin";
  const [tab, setTab] = useState<"perfis" | "permissoes">("perfis");
  const [perfilSel, setPerfilSel] = useState<PerfilKey>("admin");
  const [matriz, setMatriz] = useState<Record<PerfilKey, Record<string, Acesso>>>(buildInitialState);
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(
    () => Object.fromEntries(GRUPOS.map((g) => [g.label, true])),
  );
  const [perfilIds, setPerfilIds] = useState<Record<PerfilKey, string>>({} as Record<PerfilKey, string>);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const loadedClinicRef = useRef<string | null>(null);

  useEffect(() => {
    if (!clinicaId || loadedClinicRef.current === clinicaId) return;
    loadedClinicRef.current = clinicaId;
    void (async () => {
      setLoading(true);
      try {
        const upsertRows = PERFIS.map((p) => ({
          clinica_id: clinicaId,
          chave: p.key,
          nome: p.nome,
          descricao: p.descricao,
          sistema: true,
          ativo: true,
        }));
        const { error: upErr } = await supabase
          .from("perfis_acesso")
          .upsert(upsertRows, { onConflict: "clinica_id,chave", ignoreDuplicates: true });
        if (upErr) throw upErr;

        const { data: perfis, error: pErr } = await supabase
          .from("perfis_acesso")
          .select("id, chave")
          .eq("clinica_id", clinicaId);
        if (pErr) throw pErr;

        const ids: Record<string, string> = {};
        for (const p of perfis ?? []) ids[p.chave] = p.id;
        setPerfilIds(ids as Record<PerfilKey, string>);

        const perfilIdList = (perfis ?? []).map((p) => p.id);
        if (perfilIdList.length > 0) {
          const { data: perms, error: permErr } = await supabase
            .from("perfil_permissoes")
            .select("perfil_id, modulo, acesso")
            .in("perfil_id", perfilIdList);
          if (permErr) throw permErr;

          const idToChave: Record<string, PerfilKey> = {};
          for (const p of perfis ?? []) idToChave[p.id] = p.chave as PerfilKey;

          setMatriz((prev) => {
            const next = { ...prev } as Record<PerfilKey, Record<string, Acesso>>;
            const seen: Record<string, boolean> = {};
            for (const row of perms ?? []) {
              const chave = idToChave[row.perfil_id];
              if (!chave) continue;
              if (!seen[chave]) {
                next[chave] = Object.fromEntries(TODOS_MODULOS.map((k) => [k, "none" as Acesso]));
                seen[chave] = true;
              }
              next[chave][row.modulo] = row.acesso as Acesso;
            }
            return next;
          });
        }
      } catch (e) {
        console.error("[perfis] load error", e);
        toast.error("Falha ao carregar perfis", {
          description: e instanceof Error ? e.message : String(e),
        });
      } finally {
        setLoading(false);
      }
    })();
  }, [clinicaId]);

  const salvar = async () => {
    if (!podeAdministrar) {
      toast.error("Somente administradores podem alterar permissões.");
      return;
    }
    const perfilId = perfilIds[perfilSel];
    if (!perfilId) {
      toast.error("Perfil ainda não foi inicializado.");
      return;
    }
    setSaving(true);
    try {
      const rows = TODOS_MODULOS.map((modulo) => ({
        perfil_id: perfilId,
        modulo,
        acesso: matriz[perfilSel][modulo],
      }));
      const { error } = await supabase
        .from("perfil_permissoes")
        .upsert(rows, { onConflict: "perfil_id,modulo" });
      if (error) throw error;
      toast.success("Permissões salvas");
    } catch (e) {
      console.error("[perfis] save error", e);
      toast.error("Falha ao salvar", {
        description: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setSaving(false);
    }
  };

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
                  <Button variant="outline" size="sm" onClick={() => aplicarTodos("read")} disabled={!podeAdministrar || loading || saving}>Tudo Leitura</Button>
                  <Button variant="outline" size="sm" onClick={() => aplicarTodos("write")} disabled={!podeAdministrar || loading || saving}>Tudo Edição</Button>
                  <Button variant="outline" size="sm" onClick={() => aplicarTodos("none")} disabled={!podeAdministrar || loading || saving}>Limpar</Button>
                  <Button size="sm" onClick={salvar} disabled={!podeAdministrar || loading || saving || !perfilIds[perfilSel]}>
                    {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
                    Salvar
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
                                  disabled={!podeAdministrar}
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

          {loading && (
            <p className="text-xs text-muted-foreground flex items-center gap-2">
              <Loader2 className="h-3 w-3 animate-spin" /> Carregando permissões…
            </p>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
