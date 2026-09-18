import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useClinica } from "@/hooks/use-clinica";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import {
  ShieldCheck,
  ConciergeBell,
  Wallet,
  DollarSign,
  HeartPulse,
  Stethoscope,
  Briefcase,
  PhoneCall,
  ChevronDown,
  ChevronRight,
  CornerDownRight,
  RotateCcw,
  UserCog,
  Users,
  Save,
  Loader2,
} from "lucide-react";
import { perfilCanonico, PRESETS, type Acesso, type PerfilKey } from "@/lib/permissoes-presets";
import { diffDaPessoa } from "@/lib/permissoes-pessoa";
import { SUBMODULE_PARENT } from "@/lib/permissoes-rotas";
import { useClinicFeatureFlag } from "@/hooks/use-clinic-feature-flag";

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
    descricao:
      "Acesso total ao sistema. Pode gerenciar unidades, equipe, perfis, configurações e todas as áreas operacionais e financeiras.",
  },
  {
    key: "gestor",
    nome: "GESTOR",
    icon: Briefcase,
    descricao:
      "Gestão operacional da unidade: acompanha indicadores, equipe, agenda e financeiro, sem acesso a configurações sensíveis.",
  },
  {
    key: "medico",
    nome: "MÉDICO",
    icon: Stethoscope,
    descricao:
      "Profissional clínico: realiza atendimentos, prontuários, prescrições e visualiza seus repasses.",
  },
  {
    key: "recepcao",
    nome: "RECEPÇÃO",
    icon: ConciergeBell,
    descricao:
      "Atendimento de pacientes na recepção: agendamentos, check-in, filas e cadastro de clientes.",
  },
  {
    key: "caixa",
    nome: "CAIXA",
    icon: Wallet,
    descricao:
      "Operação de caixa diário: recebimentos, pagamentos no balcão e fechamento de caixa.",
  },
  {
    key: "financeiro",
    nome: "FINANCEIRO",
    icon: DollarSign,
    descricao:
      "Gestão financeira completa: contas a pagar/receber, conciliação bancária, relatórios e BI.",
  },
  {
    key: "enfermeiro",
    nome: "ENFERMEIRO",
    icon: HeartPulse,
    descricao: "Atuação clínica de enfermagem: triagem, alertas e acompanhamento de pacientes.",
  },
  {
    key: "telefonia",
    nome: "TELEFONIA",
    icon: PhoneCall,
    descricao: "Atendimento humano das conversas encaminhadas pela Nina.",
  },
];

type Modulo = {
  key: string;
  nome: string;
  descricao: string;
  /** Onde este módulo aparece no menu lateral (seção › item). */
  menu?: string;
  /**
   * Linha filha de outro módulo: enquanto ninguém mexer nela, ela vale o
   * mesmo que o módulo pai (ver SUBMODULE_PARENT em permissoes-rotas.ts).
   * Serve para telas que são um item de menu à parte, mas que sempre
   * andaram junto com a tela principal.
   */
  sub?: boolean;
};
type Grupo = { label: string; modulos: Modulo[] };

const SUBMODULOS_FINANCEIRO: Modulo[] = [
  {
    key: "financeiro-movcaixa",
    nome: "Financeiro › Mov. Caixa",
    descricao: "Aba Movimento de Caixa dentro do Financeiro",
    menu: "Gestão › Financeiro",
    sub: true,
  },
  {
    key: "financeiro-atendimentos",
    nome: "Financeiro › Atendimentos",
    descricao: "Aba Atendimentos/Repasse dentro do Financeiro",
    menu: "Gestão › Financeiro",
    sub: true,
  },
  {
    key: "financeiro-estorno",
    nome: "Financeiro › Estorno",
    descricao: "Aba Estorno dentro do Financeiro",
    menu: "Gestão › Financeiro",
    sub: true,
  },
];

// Os grupos abaixo seguem a mesma ordem e os mesmos nomes das seções do menu
// lateral (src/components/app-shell.tsx → navRows), para que quem procura um
// item do menu encontre a permissão dele no mesmo lugar. Toda linha com
// `menu` preenchido corresponde a um item que aparece no menu lateral; linha
// sem `menu` é tela aberta por dentro de outra.
//
// Linha marcada com `sub: true` herda o módulo logo acima enquanto ninguém a
// configurar — ela existe para que um item de menu que sempre andou junto de
// outro possa, quando a clínica quiser, ser fechado sozinho.
const GRUPOS_BASE: Grupo[] = [
  {
    label: "Operação",
    modulos: [
      {
        key: "dashboard",
        nome: "Dashboard",
        descricao: "Indicadores do dia da clínica",
        menu: "Operação › Dashboard",
      },
      {
        key: "agenda",
        nome: "Agenda",
        descricao: "Calendário e agendamentos",
        menu: "Operação › Agenda",
      },
      {
        key: "agenda-escala",
        nome: "Agenda › Escala e Horários",
        descricao: "Quadro de escala dos profissionais por dia",
        menu: "Operação › Escala e Horários",
        sub: true,
      },
      {
        key: "atendimento-multiplo",
        nome: "Atendimento Múltiplo",
        descricao: "Atendimentos e pagamentos agrupados",
        menu: "Operação › Atendimento Múltiplo",
      },
      {
        key: "checkin",
        nome: "Check-in",
        descricao: "Check-in de pacientes",
        menu: "Operação › Check-in",
      },
      {
        key: "caixa",
        nome: "Caixa",
        descricao: "Operação de caixa diário",
        menu: "Operação › Caixa",
      },
      {
        key: "chat",
        nome: "Chat interno",
        descricao: "Mensagens entre equipe",
        menu: "Operação › Chat interno",
      },
      {
        key: "clientes",
        nome: "Clientes",
        descricao: "Cadastro de pacientes",
        menu: "Operação › Clientes",
      },
      {
        key: "clientes-numeracao",
        nome: "Clientes › Numeração de Prontuário",
        descricao: "Ponteiro da numeração do arquivo físico de prontuários",
        menu: "Configurações › Numeração de Prontuário",
        sub: true,
      },
      {
        key: "painel-executivo",
        nome: "Painel Executivo",
        descricao: "Indicadores executivos da clínica",
        menu: "Operação › Painel Executivo",
      },
      {
        key: "fluxo",
        nome: "Fluxo do paciente",
        descricao: "Kanban de atendimento",
        menu: "Operação › Fluxo do paciente",
      },
      {
        key: "orcamentos",
        nome: "Orçamentos",
        descricao: "Propostas e orçamentos",
        menu: "Operação › Orçamentos",
      },
      {
        key: "recepcao",
        nome: "Recepção / Filas",
        descricao: "Check-in e filas",
        menu: "Operação › Recepção / Filas",
      },
      {
        key: "triagem-enfermagem",
        nome: "Triagem - Enfermagem",
        descricao: "Triagem inicial",
        menu: "Operação › Triagem - Enfermagem",
      },
      {
        key: "cartao-beneficios",
        nome: "Cartão Benefícios",
        descricao: "Planos, contratos, dependentes e conferência",
        menu: "Operação › Cartão Benefícios",
      },
      {
        key: "documentos",
        nome: "Documentos do paciente",
        descricao: "Anexos e arquivos clínicos",
        menu: "Operação › Documentos do paciente",
      },
      {
        key: "anamneses",
        nome: "Anamneses",
        descricao: "Modelos e respostas de anamnese",
        menu: "Operação › Anamneses",
      },
      {
        key: "hiperdia",
        nome: "Hiperdia",
        descricao: "Acompanhamento de hipertensos e diabéticos",
        menu: "Operação › Hiperdia",
      },
      {
        key: "consulta-ia",
        nome: "Apoio Clínico",
        descricao: "Análise de caso e suporte à decisão clínica",
        menu: "Operação › Apoio Clínico",
      },
      // "painel" saiu daqui: o Painel de Senhas é a rota pública /painel
      // (TV da recepção, fora da área logada), então ligar/desligar a chave
      // nunca teve efeito. A configuração dele está em Configurações ›
      // Painel & Totem, governada pela chave "painel-totem".
    ],
  },
  {
    label: "Gestão",
    modulos: [
      { key: "cargos", nome: "Cargos", descricao: "Cargos e funções", menu: "Gestão › Cargos" },
      {
        key: "financeiro",
        nome: "Financeiro",
        descricao: "Financeiro completo (BI, contas, lembretes, regras-IA)",
        menu: "Gestão › Financeiro",
      },
      // Os submódulos do Financeiro entram logo aqui quando a clínica liga a
      // flag `permissoes_financeiro_granular` (ver aplicaGranularidade).
      //
      // "funcionarios" foi removido daqui: era uma chave sem rota nenhuma no
      // ROUTE_TO_MODULE, então ligar/desligar não mudava nada. A listagem de
      // funcionários é governada por "hr-contratos" (grupo Recursos Humanos).
      // Linhas antigas dessa chave em `perfil_permissoes` são inertes.
      {
        key: "nfse",
        nome: "NFS-e",
        descricao: "Emissão e gestão de notas fiscais de serviço",
        menu: "Gestão › NFS-e",
      },
      {
        key: "nfse-config",
        nome: "NFS-e › Configuração",
        descricao: "Certificado, empresas emitentes e parâmetros da NFS-e",
        menu: "Gestão › Configuração NFS-e",
        sub: true,
      },
      {
        key: "relatorios",
        nome: "Relatórios",
        descricao: "Relatórios e BI",
        menu: "Gestão › Relatórios",
      },
      {
        key: "auditoria",
        nome: "Segurança & Compliance",
        descricao: "Auditoria e logs de acesso",
        menu: "Gestão › Segurança & Compliance",
      },
      {
        key: "setores",
        nome: "Setores",
        descricao: "Setores da clínica",
        menu: "Gestão › Setores",
      },
      {
        key: "boletos",
        nome: "Boletos",
        descricao: "Emissão e gestão de boletos",
        menu: "Gestão › Boletos",
      },
      {
        key: "contratos",
        nome: "Contratos de assinatura",
        descricao: "Cartão Benefícios e mensalidades",
        menu: "Gestão › Contratos de assinatura",
      },
      {
        key: "integration-secrets",
        nome: "Integrações",
        descricao: "Chaves e integrações externas",
        menu: "Gestão › Integrações",
      },
      {
        key: "lgpd",
        nome: "LGPD",
        descricao: "Gestão de privacidade",
        menu: "Gestão › LGPD",
      },
    ],
  },
  {
    label: "Cadastros",
    modulos: [
      {
        key: "equipe",
        nome: "Equipe",
        descricao: "Usuários do sistema",
        menu: "Cadastros › Médicos",
      },
      {
        key: "equipe-acessos",
        nome: "Equipe › Equipe e acessos",
        descricao: "Marca, pessoa a pessoa, quem é da gestão e quem autoriza",
        menu: "Cadastros › Equipe e acessos",
        sub: true,
      },
      {
        key: "perfis",
        nome: "Perfis de acesso",
        descricao: "Perfis e permissões (salvar continua restrito a administradores)",
        menu: "Cadastros › Perfis",
      },
      {
        key: "especialidades",
        nome: "Serviços",
        descricao: "Especialidades, tipos de serviço, procedimentos e recursos de enfermagem",
        menu: "Cadastros › Serviços",
      },
      {
        key: "tipos-servico",
        nome: "Tipos de serviço",
        descricao: "Classificação de serviços (aba de Serviços)",
      },
      {
        key: "procedimentos",
        nome: "Procedimentos",
        descricao: "Tabela de procedimentos (aba de Serviços)",
      },
      {
        key: "disponibilidades",
        nome: "Horários médicos",
        descricao: "Agenda dos médicos",
        menu: "Cadastros › Horários médicos",
      },
      {
        key: "prontuario-modelos",
        nome: "Modelos de Prontuário",
        descricao: "Templates clínicos",
        menu: "Cadastros › Modelos de Prontuário",
      },
      {
        key: "unidades",
        nome: "Unidades",
        descricao: "Clínicas / unidades",
        menu: "Cadastros › Unidades",
      },
      {
        key: "modelos-documentos",
        nome: "Modelos de Documentos",
        descricao: "Templates de documentos",
        menu: "Cadastros › Modelos de Documentos",
      },
      {
        key: "estoque",
        nome: "Estoque",
        descricao: "Produtos e movimentos",
        menu: "Cadastros › Estoque",
      },
      {
        key: "clientes-duplicados",
        nome: "Duplicados / Merge",
        descricao:
          "Conferência de cadastros duplicados (mesclar continua restrito a administradores)",
        menu: "Cadastros › Duplicados / Merge",
      },
      {
        key: "revisao-convenio",
        nome: "Revisão de convênio",
        descricao:
          "Corrige atendimentos antigos marcados como Particular apesar do cartão ativo e vincula convênio a contratos incompletos",
        menu: "Cadastros › Revisão de convênio",
      },
      {
        key: "medicos",
        nome: "Médicos (ficha)",
        descricao: "Ficha do profissional, aberta por dentro de outras telas",
      },
      // "planos" saiu daqui: a tela /app/planos só redireciona para
      // Cartão Benefícios › Convênios, que é governada pela chave
      // "cartao-beneficios". A linha antiga em `perfil_permissoes` é inerte.
    ],
  },
  {
    label: "Marketing",
    modulos: [
      {
        key: "mkt-leads",
        nome: "Leads",
        descricao: "Base de leads (entrada do menu Marketing)",
        menu: "Marketing › Marketing",
      },
      {
        key: "campanhas",
        nome: "Campanhas",
        descricao: "Campanhas de marketing",
        menu: "Marketing › Campanhas",
      },
      {
        key: "mkt-envios",
        nome: "Envios",
        descricao: "Disparos em massa",
        menu: "Marketing › Envios",
      },
      {
        key: "mkt-landing",
        nome: "Landing Pages",
        descricao: "Páginas de captura",
        menu: "Marketing › Landing Pages",
      },
      {
        key: "mkt-segmentos",
        nome: "Segmentos",
        descricao: "Segmentação de público",
        menu: "Marketing › Segmentos",
      },
    ],
  },
  {
    label: "Recursos Humanos",
    modulos: [
      {
        key: "hr-ponto",
        nome: "Bater ponto",
        descricao: "Registro de ponto",
        menu: "Recursos Humanos › Marcação de ponto",
      },
      {
        key: "hr-contratos",
        nome: "Funcionários / Contratos",
        descricao: "Cadastro e contratos dos funcionários",
        menu: "Recursos Humanos › Funcionários",
      },
      {
        key: "hr-ferias",
        nome: "Férias",
        descricao: "Gestão de férias",
        menu: "Recursos Humanos › Férias",
      },
      {
        key: "hr-holerites",
        nome: "Holerites",
        descricao: "Holerites e folha",
        menu: "Recursos Humanos › Holerites",
      },
      {
        key: "treinamentos",
        nome: "Treinamentos",
        descricao: "Trilhas de aprendizado",
        menu: "Recursos Humanos › Treinamentos",
      },
      {
        key: "lms-admin",
        nome: "Cursos (admin)",
        descricao: "Administração de cursos",
        menu: "Recursos Humanos › Cursos (admin)",
      },
    ],
  },
  {
    label: "Inteligência",
    modulos: [
      {
        key: "atendimento-ia",
        nome: "Atendimento médico",
        descricao: "Fila do médico e prontuário",
        menu: "Inteligência › Meus Pacientes — Atendimento",
      },
      {
        key: "prontuarios",
        nome: "Prontuários — Histórico",
        descricao: "Histórico clínico de todos os pacientes",
        menu: "Inteligência › Prontuários — Histórico",
      },
      { key: "crm", nome: "CRM", descricao: "Oportunidades e leads", menu: "Inteligência › CRM" },
      {
        key: "alertas-enfermagem",
        nome: "Enfermeira IA — Alertas",
        descricao: "Alertas automáticos",
        menu: "Inteligência › Enfermeira IA — Alertas",
      },
      {
        key: "consulta-rapida",
        nome: "Informações rápidas",
        descricao: "Consulta a tabelas",
        menu: "Inteligência › Informações rápidas",
      },
      {
        key: "consulta-rapida-valores",
        nome: "Informações rápidas › Tabela de valores",
        descricao: "Consulta de preços do balcão",
        menu: "Operação › Tabela de valores",
        sub: true,
      },
      {
        key: "odontologia",
        nome: "Odontologia",
        descricao: "Odontograma e prontuário odontológico",
        menu: "Inteligência › Odontologia › Odontograma & Prontuário",
      },
      {
        key: "odontologia-orcamentos",
        nome: "Odontologia › Orçamentos",
        descricao: "Orçamentos do plano odontológico",
        menu: "Inteligência › Odontologia › Orçamentos de Odonto",
        sub: true,
      },
      {
        key: "fisioterapia",
        nome: "Fisioterapia",
        descricao: "Mapa corporal e avaliação",
        menu: "Inteligência › Fisioterapia › Mapa Corporal & Avaliação",
      },
      {
        key: "fisioterapia-pacotes",
        nome: "Fisioterapia › Pacotes de Sessões",
        descricao: "Pacotes e controle de sessões",
        menu: "Inteligência › Fisioterapia › Pacotes de Sessões",
        sub: true,
      },
      {
        key: "exames-resultados",
        nome: "Resultados de Exames",
        descricao: "Laudos e resultados",
        menu: "Inteligência › Resultados de Exames",
      },
    ],
  },
  {
    // Portal OS ZAP (atendimento por WhatsApp) e portal Coach. No menu lateral
    // essas telas ficam nas seções Atendimento, Nina, Configurações do
    // WhatsApp e Treinamento, que só aparecem dentro desses portais.
    label: "WhatsApp — OS ZAP e Coach",
    modulos: [
      {
        key: "nina",
        nome: "Nina — WhatsApp",
        descricao:
          "Conversas, mensagens prontas, base de conhecimentos, homologação e configuração do WhatsApp",
        menu: "OS ZAP › Atendimento, Nina e Configurações do WhatsApp",
      },
      {
        key: "nina-aprendizado",
        nome: "Nina › Revisão de Aprendizados",
        descricao: "Fila de aprendizados reportados, para aprovar ou recusar",
        menu: "OS ZAP › Nina › Revisão de Aprendizados",
        sub: true,
      },
      {
        key: "nina-metricas",
        nome: "Nina › Métricas de Aprendizado",
        descricao: "Indicadores de acerto e evolução da Nina",
        menu: "OS ZAP › Nina › Métricas de Aprendizado",
        sub: true,
      },
      {
        key: "nina-arquitetura",
        nome: "Nina › Arquitetura",
        descricao: "Mapa interno das funções e instruções da Nina",
        menu: "OS ZAP › Nina › Arquitetura",
        sub: true,
      },
      {
        key: "coach",
        nome: "Coach WhatsApp",
        descricao: "Treinamento de atendentes (ver = só o próprio; editar = painel da gestora)",
        menu: "Treinamento › Coach WhatsApp",
      },
    ],
  },
  {
    // Espelha a seção "Configurações" do menu lateral. A tela
    // "Voz & Áudio (TTS)" não entra aqui de propósito: ela é restrita a
    // administradores da clínica (ADMIN_ONLY_ROUTES), regra mais forte que
    // qualquer configuração desta matriz.
    label: "Configurações",
    modulos: [
      {
        key: "painel-totem",
        nome: "Painel & Totem",
        descricao: "Configuração do painel de senhas e do totem de autoatendimento",
        menu: "Configurações › Painel & Totem",
      },
      {
        key: "clinicas",
        nome: "Clínicas",
        descricao: "Cadastro de clínicas (multi-empresa)",
        menu: "Configurações › Clínicas",
      },
      {
        key: "backups",
        nome: "Backups",
        descricao: "Geração e download de cópias de segurança do banco",
        menu: "Configurações › Backups",
      },
    ],
  },
];

/**
 * Acesso que um módulo tem "de fábrica" para um perfil.
 *
 * Um submódulo sem valor próprio no preset vale o mesmo que o pai — é a
 * mesma regra que o sistema aplica em tempo de execução (moduloPermitido em
 * permissoes-rotas.ts). Sem isso, a tela mostraria "Sem" para uma tela que
 * o perfil na verdade abre, e o gestor salvaria esse "Sem" sem querer,
 * tirando um acesso que ninguém pediu para tirar.
 */
function acessoPadrao(preset: Partial<Record<string, Acesso>>, modulo: string): Acesso {
  const proprio = preset[modulo];
  if (proprio) return proprio;
  const pai = SUBMODULE_PARENT[modulo];
  if (pai) return (preset[pai] ?? "none") as Acesso;
  return "none";
}

function aplicaGranularidade(grupos: Grupo[], granular: boolean): Grupo[] {
  if (!granular) return grupos;
  return grupos.map((g) => {
    if (g.label !== "Gestão") return g;
    const idx = g.modulos.findIndex((m) => m.key === "financeiro");
    if (idx < 0) return g;
    const novos = [...g.modulos];
    novos.splice(idx + 1, 0, ...SUBMODULOS_FINANCEIRO);
    return { ...g, modulos: novos };
  });
}

function buildInitialState(todosModulos: string[]): Record<PerfilKey, Record<string, Acesso>> {
  const out = {} as Record<PerfilKey, Record<string, Acesso>>;
  for (const p of PERFIS) {
    const preset = PRESETS[p.key];
    out[p.key] = Object.fromEntries(todosModulos.map((k) => [k, acessoPadrao(preset, k)]));
  }
  return out;
}

const ROTULO_ACESSO: Record<Acesso, string> = {
  none: "Sem",
  read: "Leitura",
  write: "Edição",
};

/** Uma pessoa com vínculo na clínica, para a aba "Por pessoa". */
type Pessoa = { userId: string; nome: string; role: PerfilKey | null; roleBruto: string };

function PerfisPage() {
  const { clinicaAtual } = useClinica();
  const clinicaId = clinicaAtual?.clinica_id ?? null;
  const { enabled: financeiroGranular } = useClinicFeatureFlag("permissoes_financeiro_granular");
  const GRUPOS = useMemo(
    () => aplicaGranularidade(GRUPOS_BASE, financeiroGranular),
    [financeiroGranular],
  );
  const TODOS_MODULOS = useMemo(() => GRUPOS.flatMap((g) => g.modulos.map((m) => m.key)), [GRUPOS]);
  // Deliberadamente hardcoded para role === "admin", e NÃO
  // usePodeEscrever("perfis") — quem gerencia permissões precisa ser um
  // admin de verdade, mesmo que a matriz configure "perfis: Edição" para
  // outro perfil. Sem essa trava, um perfil não-admin com edição em
  // "Perfis de acesso" poderia se auto-promover a qualquer nível de
  // acesso no sistema.
  const podeAdministrar = clinicaAtual?.role === "admin";
  const [tab, setTab] = useState<"perfis" | "permissoes">("perfis");
  const [perfilSel, setPerfilSel] = useState<PerfilKey>("admin");
  const [matriz, setMatriz] = useState<Record<PerfilKey, Record<string, Acesso>>>(() =>
    buildInitialState(GRUPOS_BASE.flatMap((g) => g.modulos.map((m) => m.key))),
  );

  // Quando a granularidade muda (flag carrega), garante que as novas chaves
  // apareçam na matriz com o valor padrão herdado do pai.
  useEffect(() => {
    setMatriz((prev) => {
      const next = { ...prev } as Record<PerfilKey, Record<string, Acesso>>;
      for (const p of PERFIS) {
        const preset = PRESETS[p.key];
        const atual = next[p.key] ?? {};
        const novo: Record<string, Acesso> = { ...atual };
        for (const k of TODOS_MODULOS) {
          if (!(k in novo)) novo[k] = acessoPadrao(preset, k);
        }
        next[p.key] = novo;
      }
      return next;
    });
  }, [TODOS_MODULOS]);
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(GRUPOS.map((g) => [g.label, true])),
  );
  const [perfilIds, setPerfilIds] = useState<Record<PerfilKey, string>>(
    {} as Record<PerfilKey, string>,
  );
  // --- Aba "Por pessoa" -------------------------------------------------
  // `modo` escolhe o que a grade está editando: a regra do cargo (que vale
  // para todo mundo daquele perfil) ou a exceção de UMA pessoa.
  const [modo, setModo] = useState<"perfil" | "pessoa">("perfil");
  const [pessoas, setPessoas] = useState<Pessoa[]>([]);
  const [pessoaSel, setPessoaSel] = useState<string>("");
  // Só o que está DIFERENTE do cargo. Módulo que segue o cargo não aparece
  // aqui — é assim que mudar o perfil depois continua alcançando quem nunca
  // foi personalizado naquele módulo.
  const [overridesPessoa, setOverridesPessoa] = useState<Record<string, Acesso>>({});
  // O que estava gravado quando a pessoa foi carregada, para saber quais
  // linhas precisam ser APAGADAS ao voltarem para o padrão do cargo.
  const [overridesSalvos, setOverridesSalvos] = useState<string[]>([]);
  const [carregandoPessoa, setCarregandoPessoa] = useState(false);
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
                // Base antes de aplicar as linhas do banco. Módulos que TÊM
                // linha salva são sobrescritos logo abaixo; os que não têm
                // ficam com o padrão do perfil (preset), espelhando o que o
                // `usePermissoes` concede em tempo de execução. Antes esta
                // base era "none", então um módulo novo (ex.: Hiperdia)
                // aparecia como "Sem" aqui mesmo estando liberado no padrão.
                // Submódulo sem valor próprio herda o pai, pela mesma razão.
                const preset = PRESETS[chave];
                next[chave] = Object.fromEntries(
                  TODOS_MODULOS.map((k) => [k, acessoPadrao(preset, k)]),
                );
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

  // Lista de quem tem vínculo com a clínica. Mesmo caminho da tela "Equipe e
  // acessos": o vínculo vem de `clinica_memberships` e o nome de `profiles`.
  useEffect(() => {
    if (!clinicaId || !podeAdministrar) return;
    let cancelado = false;
    void (async () => {
      try {
        const { data: mems, error } = await supabase
          .from("clinica_memberships")
          .select("user_id, role, ativo")
          .eq("clinica_id", clinicaId)
          .eq("ativo", true);
        if (error) throw error;
        const linhas = (mems ?? []) as Array<{ user_id: string; role: string }>;
        const ids = [...new Set(linhas.map((l) => l.user_id))];
        const nomes = new Map<string, string>();
        if (ids.length > 0) {
          const { data: profs } = await supabase.from("profiles").select("id, nome").in("id", ids);
          for (const p of (profs ?? []) as Array<{ id: string; nome: string | null }>) {
            if (p.nome) nomes.set(p.id, p.nome);
          }
        }
        if (cancelado) return;
        setPessoas(
          linhas
            .map((l) => ({
              userId: l.user_id,
              // Vínculo sem nome preenchido continua na lista: sumir com a
              // pessoa esconderia justamente o cadastro que precisa de conserto.
              nome: nomes.get(l.user_id) ?? "(sem nome cadastrado)",
              role: perfilCanonico(l.role),
              roleBruto: l.role,
            }))
            .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR")),
        );
      } catch (e) {
        console.error("[perfis] erro carregando pessoas", e);
      }
    })();
    return () => {
      cancelado = true;
    };
  }, [clinicaId, podeAdministrar]);

  // Exceções já gravadas da pessoa escolhida.
  useEffect(() => {
    if (!clinicaId || !pessoaSel) {
      setOverridesPessoa({});
      setOverridesSalvos([]);
      return;
    }
    let cancelado = false;
    setCarregandoPessoa(true);
    void (async () => {
      try {
        const { data, error } = await supabase
          .from("usuario_permissoes")
          .select("modulo, acesso")
          .eq("clinica_id", clinicaId)
          .eq("user_id", pessoaSel);
        if (error) throw error;
        if (cancelado) return;
        const mapa: Record<string, Acesso> = {};
        for (const row of (data ?? []) as Array<{ modulo: string; acesso: Acesso }>) {
          mapa[row.modulo] = row.acesso;
        }
        setOverridesPessoa(mapa);
        setOverridesSalvos(Object.keys(mapa));
      } catch (e) {
        console.error("[perfis] erro carregando exceções da pessoa", e);
        toast.error("Falha ao carregar as exceções desta pessoa", {
          description: e instanceof Error ? e.message : String(e),
        });
      } finally {
        if (!cancelado) setCarregandoPessoa(false);
      }
    })();
    return () => {
      cancelado = true;
    };
  }, [clinicaId, pessoaSel]);

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

      // FASE 3 — quem recebe handoff da Nina é o PERFIL Telefonia. Ao salvar
      // esse perfil, quem já está Online pode ter virado elegível: reavaliamos
      // a fila de "Não atribuídas" na hora, em vez de esperar o heartbeat.
      // O pool é sempre lido ao vivo no banco e conversas já atribuídas nunca
      // são retiradas de ninguém.
      if (clinicaId && perfilSel === "telefonia") {
        try {
          const { distribuirFilaPendentes } = await import("@/lib/atendimento.functions");
          const r = await distribuirFilaPendentes({ data: { clinicaId } });
          if (r.distribuidas > 0) {
            toast.success(
              `${r.distribuidas} conversa(s) da fila foram distribuídas para a Telefonia.`,
            );
          }
        } catch (e) {
          console.error("[perfis] falha ao reavaliar fila após salvar", e);
        }
      }
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

  const pessoa = useMemo(
    () => pessoas.find((p) => p.userId === pessoaSel) ?? null,
    [pessoas, pessoaSel],
  );

  // O que a pessoa herda do cargo dela — exatamente a mesma grade que a aba
  // "Por cargo" mostra para aquele perfil.
  const basePessoa = useMemo<Record<string, Acesso>>(() => {
    if (!pessoa?.role) return Object.fromEntries(TODOS_MODULOS.map((k) => [k, "none" as Acesso]));
    return matriz[pessoa.role] ?? {};
  }, [pessoa, matriz, TODOS_MODULOS]);

  // O que a pessoa realmente enxerga: o cargo, com as exceções por cima.
  const efetivoPessoa = useMemo<Record<string, Acesso>>(
    () => ({ ...basePessoa, ...overridesPessoa }),
    [basePessoa, overridesPessoa],
  );

  const editandoPessoa = modo === "pessoa";
  const bloqueado =
    !podeAdministrar || loading || saving || carregandoPessoa || (modo === "pessoa" && !pessoaSel);
  const valores = editandoPessoa ? efetivoPessoa : matriz[perfilSel];
  const acessosMostrados = TODOS_MODULOS.filter((k) => valores[k] && valores[k] !== "none").length;
  const totalPersonalizado = Object.keys(overridesPessoa).length;
  // Admin não passa pela matriz em lugar nenhum do sistema (o app libera tudo
  // para ele antes de consultar permissão). Personalizar um admin não teria
  // efeito, e o aviso na tela evita alguém achar que fechou um acesso.
  const pessoaEhAdmin = pessoa?.role === "admin";

  const setAcesso = (modulo: string, valor: Acesso) => {
    if (editandoPessoa) {
      setOverridesPessoa((prev) => {
        const proximo = { ...prev };
        // Voltou a valer o mesmo que o cargo: deixa de ser exceção.
        if (valor === (basePessoa[modulo] ?? "none")) delete proximo[modulo];
        else proximo[modulo] = valor;
        return proximo;
      });
      return;
    }
    setMatriz((prev) => ({
      ...prev,
      [perfilSel]: { ...prev[perfilSel], [modulo]: valor },
    }));
  };

  /** Devolve um módulo ao que o cargo da pessoa manda. */
  const voltarAoPadrao = (modulo: string) => {
    setOverridesPessoa((prev) => {
      const proximo = { ...prev };
      delete proximo[modulo];
      return proximo;
    });
  };

  const aplicarTodos = (valor: Acesso) => {
    if (editandoPessoa) {
      setOverridesPessoa(
        Object.fromEntries(
          TODOS_MODULOS.filter((k) => valor !== (basePessoa[k] ?? "none")).map((k) => [k, valor]),
        ),
      );
      return;
    }
    setMatriz((prev) => ({
      ...prev,
      [perfilSel]: Object.fromEntries(TODOS_MODULOS.map((k) => [k, valor])),
    }));
  };

  /** Apaga todas as exceções: a pessoa volta a ser igual ao cargo dela. */
  const limparPersonalizacao = () => setOverridesPessoa({});

  const salvarPessoa = async () => {
    if (!podeAdministrar) {
      toast.error("Somente administradores podem alterar permissões.");
      return;
    }
    if (!clinicaId || !pessoaSel) return;
    setSaving(true);
    try {
      // O que grava e o que apaga sai de `diffDaPessoa` (testada): vira linha
      // no banco só o módulo diferente do cargo, e o que voltou ao padrão é
      // APAGADO — gravar o valor igual congelaria a pessoa se o cargo mudasse.
      const { gravar, apagar: paraApagar } = diffDaPessoa(
        TODOS_MODULOS,
        basePessoa,
        efetivoPessoa,
        overridesSalvos,
      );
      const paraGravar = gravar.map(({ modulo, acesso }) => ({
        clinica_id: clinicaId,
        user_id: pessoaSel,
        modulo,
        acesso,
      }));
      if (paraGravar.length > 0) {
        const { error } = await supabase
          .from("usuario_permissoes")
          .upsert(paraGravar, { onConflict: "clinica_id,user_id,modulo" });
        if (error) throw error;
      }
      if (paraApagar.length > 0) {
        const { error } = await supabase
          .from("usuario_permissoes")
          .delete()
          .eq("clinica_id", clinicaId)
          .eq("user_id", pessoaSel)
          .in("modulo", paraApagar);
        if (error) throw error;
      }
      setOverridesSalvos(Object.keys(overridesPessoa));
      toast.success(
        paraGravar.length === 0
          ? "Exceções removidas: esta pessoa voltou a seguir o cargo."
          : `Permissões de ${pessoa?.nome ?? "pessoa"} salvas (${paraGravar.length} exceção(ões)).`,
      );
    } catch (e) {
      console.error("[perfis] erro salvando exceções da pessoa", e);
      toast.error("Falha ao salvar", {
        description: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setSaving(false);
    }
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
                        onClick={() => {
                          setPerfilSel(p.key);
                          setTab("permissoes");
                        }}
                      >
                        <TableCell>
                          <Icon className="h-5 w-5 text-primary" />
                        </TableCell>
                        <TableCell className="font-medium">{p.nome}</TableCell>
                        <TableCell>
                          <Badge variant="secondary" className="font-mono text-xs">
                            {p.key}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {p.descricao}
                        </TableCell>
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
            <CardHeader className="pb-3 space-y-3">
              {/* Nível da configuração: a regra do cargo ou a exceção de uma
                  pessoa. Fica antes de tudo porque muda o significado da
                  grade inteira que vem abaixo. */}
              <div className="space-y-1.5">
                <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                  Configurar acesso
                </Label>
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant={modo === "perfil" ? "default" : "outline"}
                    onClick={() => setModo("perfil")}
                  >
                    <Users className="h-4 w-4 mr-2" />
                    Por cargo (vale para todos)
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant={modo === "pessoa" ? "default" : "outline"}
                    onClick={() => setModo("pessoa")}
                  >
                    <UserCog className="h-4 w-4 mr-2" />
                    Por pessoa (exceção)
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  {editandoPessoa
                    ? "Vale só para a pessoa escolhida. Cada módulo começa igual ao cargo dela; o que você mudar aqui passa na frente do cargo."
                    : "Vale para todo mundo que tem este cargo, menos quem tiver exceção própria na aba Por pessoa."}
                </p>
              </div>

              <div className="flex flex-wrap items-end justify-between gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                    {editandoPessoa ? "Pessoa" : "Perfil"}
                  </Label>
                  {editandoPessoa ? (
                    <Select value={pessoaSel} onValueChange={setPessoaSel}>
                      <SelectTrigger className="w-80">
                        <SelectValue placeholder="Escolha o funcionário ou médico" />
                      </SelectTrigger>
                      <SelectContent>
                        {pessoas.map((p) => (
                          <SelectItem key={p.userId} value={p.userId}>
                            {p.nome} — {PERFIS.find((x) => x.key === p.role)?.nome ?? p.roleBruto}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Select value={perfilSel} onValueChange={(v) => setPerfilSel(v as PerfilKey)}>
                      <SelectTrigger className="w-64">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {PERFIS.map((p) => (
                          <SelectItem key={p.key} value={p.key}>
                            {p.nome}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-sm">
                    Acessos: <span className="ml-1 font-semibold">{acessosMostrados}</span> /{" "}
                    {totalModulos}
                  </Badge>
                  {editandoPessoa && (
                    <Badge
                      variant={totalPersonalizado > 0 ? "default" : "secondary"}
                      className="text-sm"
                    >
                      Personalizados: {totalPersonalizado}
                    </Badge>
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => aplicarTodos("read")}
                    disabled={bloqueado}
                  >
                    Tudo Leitura
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => aplicarTodos("write")}
                    disabled={bloqueado}
                  >
                    Tudo Edição
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => aplicarTodos("none")}
                    disabled={bloqueado}
                  >
                    Limpar
                  </Button>
                  {editandoPessoa && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={limparPersonalizacao}
                      disabled={bloqueado || totalPersonalizado === 0}
                      title="Apaga todas as exceções: a pessoa volta a seguir o cargo dela"
                    >
                      <RotateCcw className="h-4 w-4 mr-2" />
                      Voltar tudo ao cargo
                    </Button>
                  )}
                  <Button
                    size="sm"
                    onClick={editandoPessoa ? salvarPessoa : salvar}
                    disabled={bloqueado || (editandoPessoa ? false : !perfilIds[perfilSel])}
                  >
                    {saving ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Save className="h-4 w-4 mr-2" />
                    )}
                    Salvar
                  </Button>
                </div>
              </div>

              {editandoPessoa && !pessoaSel && (
                <p className="text-xs text-muted-foreground">
                  Escolha a pessoa acima para ver e mudar o acesso dela.
                </p>
              )}
              {editandoPessoa && pessoaEhAdmin && (
                <p className="text-xs font-medium text-amber-600 dark:text-amber-500">
                  Atenção: quem tem o cargo ADMINISTRADOR enxerga o sistema inteiro, e exceção
                  nenhuma o limita. Para fechar um acesso desta pessoa, troque o cargo dela em
                  Cadastros › Equipe e acessos.
                </p>
              )}
            </CardHeader>
          </Card>

          {(editandoPessoa && !pessoaSel ? [] : GRUPOS).map((grupo) => {
            const open = openGroups[grupo.label] ?? true;
            const ativos = grupo.modulos.filter((m) => valores[m.key] !== "none").length;
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
                        {open ? (
                          <ChevronDown className="h-4 w-4" />
                        ) : (
                          <ChevronRight className="h-4 w-4" />
                        )}
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
                          const val = valores[m.key];
                          const personalizado = editandoPessoa && m.key in overridesPessoa;
                          return (
                            <TableRow
                              key={m.key}
                              className={personalizado ? "bg-primary/5" : undefined}
                            >
                              <TableCell className={m.sub ? "pl-8 font-medium" : "font-medium"}>
                                <span className="flex items-center gap-2">
                                  {m.sub && (
                                    <CornerDownRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                                  )}
                                  {m.nome}
                                </span>
                                {/* Onde a tela aparece no menu lateral: é assim
                                    que o gestor liga uma linha desta matriz ao
                                    item que ele vê (ou deixa de ver) no menu. */}
                                {m.menu ? (
                                  <span className="mt-0.5 block text-xs font-normal text-muted-foreground">
                                    Menu: {m.menu}
                                  </span>
                                ) : (
                                  <span className="mt-0.5 block text-xs font-normal text-muted-foreground">
                                    Sem item no menu lateral
                                  </span>
                                )}
                              </TableCell>
                              <TableCell className="text-sm text-muted-foreground">
                                {m.descricao}
                                {m.sub && (
                                  <span className="mt-0.5 block text-xs">
                                    Enquanto ficar igual à linha de cima, acompanha ela
                                    automaticamente.
                                  </span>
                                )}
                                {personalizado && (
                                  <span className="mt-1 flex flex-wrap items-center gap-2 text-xs">
                                    <Badge variant="default" className="text-[10px]">
                                      Personalizado
                                    </Badge>
                                    <span className="text-muted-foreground">
                                      no cargo é &ldquo;{ROTULO_ACESSO[basePessoa[m.key] ?? "none"]}
                                      &rdquo;
                                    </span>
                                    <button
                                      type="button"
                                      onClick={() => voltarAoPadrao(m.key)}
                                      disabled={!podeAdministrar}
                                      className="inline-flex items-center gap-1 underline underline-offset-2 hover:text-foreground disabled:opacity-50"
                                    >
                                      <RotateCcw className="h-3 w-3" />
                                      voltar ao cargo
                                    </button>
                                  </span>
                                )}
                              </TableCell>
                              <TableCell>
                                <RadioGroup
                                  value={val}
                                  onValueChange={(v) => setAcesso(m.key, v as Acesso)}
                                  disabled={!podeAdministrar || carregandoPessoa}
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

          {(loading || carregandoPessoa) && (
            <p className="text-xs text-muted-foreground flex items-center gap-2">
              <Loader2 className="h-3 w-3 animate-spin" /> Carregando permissões…
            </p>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
