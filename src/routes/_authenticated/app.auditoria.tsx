import { hojeBR } from "@/lib/date-utils";
import { createFileRoute } from "@tanstack/react-router";
import { SectionTabs, SEGURANCA_TABS, SEGURANCA_META } from "@/components/section-tabs";
import { useEffect, useMemo, useState } from "react";
import { Download, ShieldCheck, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { mostrarErro } from "@/lib/traduzir-erro";
import { supabase } from "@/integrations/supabase/client";
import { useClinica } from "@/hooks/use-clinica";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { exportToExcel } from "@/lib/export-csv";

import { DateInputBR } from "@/components/ui/date-input-br";
import { prontuarioExibicao } from "@/lib/prontuario";
import { brl, fmtDate } from "@/lib/financeiro/format";
export const Route = createFileRoute("/_authenticated/app/auditoria")({
  component: PageWithTabs,
  head: () => ({ meta: [{ title: "Auditoria — ClinicaOS" }] }),
});

interface AuditRow {
  id: string;
  user_email: string | null;
  user_id: string | null;
  table_name: string;
  record_id: string | null;
  action: string;
  dados_antes: Record<string, unknown> | null;
  dados_depois: Record<string, unknown> | null;
  created_at: string;
}

const ACTION_LABEL: Record<string, string> = {
  INSERT: "Criou",
  UPDATE: "Alterou",
  DELETE: "Excluiu",
  DESFAZER_BAIXA: "Desfez baixa",
  ESTORNO_REPASSE: "Estornou repasse",
  NINA_AGENDAR: "Nina agendou",
  NINA_CADASTRO_RESOLVIDO: "Nina vinculou cadastro",
  NINA_TOOL: "Nina consultou",
  NINA_CONSULTAR_DISPONIBILIDADE: "Nina consultou",
  NINA_CONSULTAR_PRIMEIRO_DISPONIVEL: "Nina consultou",
  NINA_IDENTIFICAR_PACIENTE: "Nina identificou",
  NINA_PROXIMA_VAGA: "Nina consultou",
  NINA_VERIFICAR_HORARIO: "Nina consultou",
  NINA_INSTRUCOES_PUBLICACAO: "Publicou instruções",
  NINA_INSTRUCOES_RASCUNHO: "Salvou rascunho",
  NINA_INSTRUCOES_RESTAURACAO: "Restaurou instruções",
  NINA_FONTE_CONSULTA_ALTERADA: "Alterou fonte",
  NINA_VOZ_ALTERADA: "Alterou voz",
  NINA_VOZ_PREVIA: "Ouviu prévia",
};
const ACTION_COLOR: Record<string, string> = {
  INSERT: "bg-emerald-100 text-emerald-700",
  UPDATE: "bg-amber-100 text-amber-700",
  DELETE: "bg-rose-100 text-rose-700",
  DESFAZER_BAIXA: "bg-rose-100 text-rose-700",
  ESTORNO_REPASSE: "bg-rose-100 text-rose-700",
};
const ACTION_COLOR_PADRAO = "bg-slate-100 text-slate-700";
// Ações oferecidas no filtro (as NINA_* agrupadas não entram — são consultas da IA)
const ACOES_FILTRO = ["INSERT", "UPDATE", "DELETE", "DESFAZER_BAIXA", "ESTORNO_REPASSE"];
function labelAcao(a: string): string {
  return ACTION_LABEL[a] ?? a.replace(/_/g, " ").toLowerCase();
}
function corAcao(a: string): string {
  return ACTION_COLOR[a] ?? ACTION_COLOR_PADRAO;
}

// Rótulos amigáveis para nomes técnicos de tabelas e colunas
const TABLE_LABEL: Record<string, string> = {
  agendamentos: "Agendamento",
  pacientes: "Paciente",
  medicos: "Médico",
  fin_lancamentos: "Lançamento financeiro",
  fin_atendimentos: "Atendimento financeiro",
  contratos_assinatura: "Contrato",
  contrato_mensalidades: "Mensalidade do contrato",
  contrato_dependentes: "Dependente do contrato",
  orcamentos: "Orçamento",
  orcamento_itens: "Item de orçamento",
  pagamentos: "Pagamento",
  caixa_sessoes: "Sessão de caixa",
  caixa_movimentos: "Movimento de caixa",
  triagens_enfermagem: "Triagem de enfermagem",
  prontuarios: "Prontuário",
  senhas: "Senha",
  nfse: "Nota fiscal (NFS-e)",
  estorno_solicitacoes: "Pedido de estorno",
  gr_impressoes: "Impressão de GR",
  medico_disponibilidades: "Grade do médico",
  perfil_permissoes: "Permissão de perfil",
  perfis_acesso: "Perfil de acesso",
  usuario_permissoes: "Permissão de usuário",
  usuario_alcadas: "Alçada de usuário",
  user_roles: "Papel de usuário",
  clinica_memberships: "Acesso à unidade",
  cb_convenios: "Convênio do cartão",
  cb_convenio_regras: "Regra do cartão",
  cb_convenio_faixas: "Faixa do cartão",
  procedimento_cb_convenio_valores: "Valor de serviço no cartão",
  prontuario_sequencia: "Numeração de prontuário",
  especialidades: "Especialidade",
  especialidade_unidade: "Especialidade na unidade",
  fin_categorias: "Categoria financeira",
  fin_contas: "Conta financeira",
  medico_repasse_laudo: "Repasse de laudo",
  planos_assinatura: "Plano do cartão",
  clinicas: "Unidade",
  nina_cat_servicos: "Nina — serviço",
  nina_cat_profissionais: "Nina — profissional",
  nina_ferramenta: "Nina — consulta",
  nina_instrucoes_versoes: "Nina — instruções",
  clinica_feature_flags: "Configuração da unidade",
  atend_departamentos: "Departamento de atendimento",
  atend_departamento_atendentes: "Atendente de departamento",
  fisio_sessoes: "Sessão de fisioterapia",
  prontuario_modelos: "Modelo de prontuário",
};

const FIELD_LABEL: Record<string, string> = {
  inicio: "Início",
  fim: "Fim",
  status: "Status",
  observacoes: "Observações",
  procedimento: "Procedimento",
  fluxo_etapa: "Etapa",
  prioridade: "Prioridade",
  paciente_id: "Paciente",
  medico_id: "Médico",
  agenda_id: "Agenda",
  clinica_id: "Clínica",
  pacote_id: "Pacote",
  ficha_numero: "Ficha",
  executado_em: "Executado em",
  orcamento_id: "Orçamento",
  valor: "Valor",
  valor_total: "Valor total",
  valor_pago: "Valor pago",
  desconto: "Desconto",
  forma_pagamento: "Forma de pagamento",
  data_vencimento: "Vencimento",
  data_pagamento: "Pago em",
  competencia: "Competência",
  numero_parcela: "Parcela",
  ativo: "Ativo",
  nome: "Nome",
  cpf: "CPF",
  telefone: "Telefone",
  email: "E-mail",
  data_nascimento: "Nascimento",
  repasse_pago: "Repasse pago",
  repasse_valor: "Valor do repasse",
};

// Campos técnicos que não interessam ao operador
const CAMPOS_OCULTOS = new Set([
  "id",
  "created_at",
  "updated_at",
  "criado_por",
  "atualizado_por",
  "clinica_id",
  "search_tsv",
  "nome_norm",
]);

function labelTabela(t: string): string {
  return TABLE_LABEL[t] ?? t.replace(/_/g, " ");
}
function labelCampo(c: string): string {
  return FIELD_LABEL[c] ?? c.replace(/_/g, " ").replace(/^./, (s) => s.toUpperCase());
}
function formatValor(v: unknown): string {
  if (v === null || v === undefined || v === "") return "—";
  if (typeof v === "boolean") return v ? "Sim" : "Não";
  if (typeof v === "string") {
    // Data ISO
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(v)) {
      const d = new Date(v);
      if (!isNaN(d.getTime())) return d.toLocaleString("pt-BR");
    }
    if (/^\d{4}-\d{2}-\d{2}$/.test(v)) {
      const [y, m, d] = v.split("-");
      return `${d}/${m}/${y}`;
    }
    // UUID → encurta
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-/.test(v)) return v.slice(0, 8) + "…";
    return v;
  }
  if (typeof v === "number") return String(v);
  return JSON.stringify(v);
}

// Campos UUID que devem ser resolvidos para nomes humanos
const FK_TABELA: Record<string, string> = {
  medico_id: "medicos",
  paciente_id: "pacientes",
  agendamento_id: "agendamentos",
  orcamento_id: "orcamentos",
  contrato_id: "contratos_assinatura",
};

function formatValorComNome(v: unknown, campo: string, nomes: Record<string, string>): string {
  if (typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-/.test(v)) {
    const nome = nomes[v];
    if (nome) return nome;
  }
  return formatValor(v);
}

async function resolverNomes(
  rows: Diff[],
  tabela: string,
  rowRecordId: string | null,
): Promise<Record<string, string>> {
  const mapa: Record<string, Set<string>> = {};
  const add = (campo: string, val: unknown) => {
    if (typeof val !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-/.test(val)) return;
    const alvo = FK_TABELA[campo];
    if (!alvo) return;
    (mapa[alvo] ??= new Set()).add(val);
  };
  for (const d of rows) {
    add(d.campo, d.antes);
    add(d.campo, d.depois);
  }
  // Se a própria tabela do registro tem um "nome" ou "paciente_nome", também busca
  if (
    rowRecordId &&
    (tabela === "medicos" || tabela === "pacientes" || tabela === "agendamentos")
  ) {
    (mapa[tabela] ??= new Set()).add(rowRecordId);
  }
  const nomes: Record<string, string> = {};
  await Promise.all(
    Object.entries(mapa).map(async ([tab, set]) => {
      const ids = Array.from(set);
      if (ids.length === 0) return;
      if (tab === "medicos") {
        const { data } = await supabase.from("medicos").select("id, nome").in("id", ids);
        ((data ?? []) as unknown as Array<{ id: string; nome: string }>).forEach((r) => {
          nomes[r.id] = `Dr(a). ${r.nome}`;
        });
      } else if (tab === "pacientes") {
        const { data } = await supabase
          .from("pacientes")
          .select("id, nome, codigo_prontuario, codigo_prontuario_anterior")
          .in("id", ids);
        (
          (data ?? []) as unknown as Array<{
            id: string;
            nome: string;
            codigo_prontuario: string | null;
            codigo_prontuario_anterior: string | null;
          }>
        ).forEach((r) => {
          const pront = prontuarioExibicao(r);
          nomes[r.id] = pront ? `${r.nome} (#${pront})` : r.nome;
        });
      } else if (tab === "agendamentos") {
        const { data } = await supabase
          .from("agendamentos")
          .select("id, paciente_nome, inicio")
          .in("id", ids);
        (
          (data ?? []) as unknown as Array<{
            id: string;
            paciente_nome: string | null;
            inicio: string;
          }>
        ).forEach((r) => {
          const dt = new Date(r.inicio).toLocaleString("pt-BR");
          nomes[r.id] = `${r.paciente_nome ?? "Agendamento"} — ${dt}`;
        });
      } else if (tab === "orcamentos") {
        const { data } = await supabase.from("orcamentos").select("id, numero").in("id", ids);
        ((data ?? []) as unknown as Array<{ id: string; numero: number | null }>).forEach((r) => {
          nomes[r.id] = r.numero ? `Orçamento #${r.numero}` : "Orçamento";
        });
      } else if (tab === "contratos_assinatura") {
        const { data } = await supabase
          .from("contratos_assinatura")
          .select("id, numero")
          .in("id", ids);
        ((data ?? []) as unknown as Array<{ id: string; numero: string | null }>).forEach((r) => {
          nomes[r.id] = r.numero ? `Contrato ${r.numero}` : "Contrato";
        });
      }
    }),
  );
  return nomes;
}

interface Diff {
  campo: string;
  antes: unknown;
  depois: unknown;
}
function computarDiff(
  antes: Record<string, unknown> | null,
  depois: Record<string, unknown> | null,
): Diff[] {
  const a = antes ?? {};
  const d = depois ?? {};
  const keys = new Set([...Object.keys(a), ...Object.keys(d)]);
  const out: Diff[] = [];
  for (const k of keys) {
    if (CAMPOS_OCULTOS.has(k)) continue;
    const va = a[k];
    const vd = d[k];
    if (JSON.stringify(va) === JSON.stringify(vd)) continue;
    out.push({ campo: k, antes: va, depois: vd });
  }
  return out.sort((x, y) => labelCampo(x.campo).localeCompare(labelCampo(y.campo)));
}

function camposRelevantes(obj: Record<string, unknown> | null): Diff[] {
  if (!obj) return [];
  return Object.entries(obj)
    .filter(([k, v]) => !CAMPOS_OCULTOS.has(k) && v !== null && v !== "")
    .map(([k, v]) => ({ campo: k, antes: undefined, depois: v }))
    .sort((x, y) => labelCampo(x.campo).localeCompare(labelCampo(y.campo)));
}

async function resolverNomesLista(rows: AuditRow[]): Promise<Record<string, string>> {
  const medicos = new Set<string>();
  const pacientes = new Set<string>();
  const agendamentos = new Set<string>();
  const contratos = new Set<string>();
  const orcamentos = new Set<string>();
  for (const r of rows) {
    // Lê antes e depois: numa troca de médico/paciente os dois lados entram no resumo
    const pick = (k: string, set: Set<string>) => {
      for (const obj of [r.dados_antes, r.dados_depois]) {
        const v = obj?.[k];
        if (typeof v === "string" && /^[0-9a-f]{8}-/.test(v)) set.add(v);
      }
    };
    pick("medico_id", medicos);
    pick("paciente_id", pacientes);
    pick("agendamento_id", agendamentos);
    pick("contrato_id", contratos);
    pick("orcamento_id", orcamentos);
    if (r.record_id && /^[0-9a-f]{8}-/.test(r.record_id)) {
      if (r.table_name === "medicos") medicos.add(r.record_id);
      else if (r.table_name === "pacientes") pacientes.add(r.record_id);
      else if (r.table_name === "agendamentos") agendamentos.add(r.record_id);
      else if (r.table_name === "contratos_assinatura") contratos.add(r.record_id);
      else if (r.table_name === "orcamentos") orcamentos.add(r.record_id);
    }
  }
  const nomes: Record<string, string> = {};
  await Promise.all([
    medicos.size
      ? supabase
          .from("medicos")
          .select("id, nome")
          .in("id", Array.from(medicos))
          .then(({ data }) => {
            ((data ?? []) as Array<{ id: string; nome: string }>).forEach((r) => {
              nomes[r.id] = `Dr(a). ${r.nome}`;
            });
          })
      : Promise.resolve(),
    pacientes.size
      ? supabase
          .from("pacientes")
          .select("id, nome, codigo_prontuario, codigo_prontuario_anterior")
          .in("id", Array.from(pacientes))
          .then(({ data }) => {
            (
              (data ?? []) as Array<{
                id: string;
                nome: string;
                codigo_prontuario: string | null;
                codigo_prontuario_anterior: string | null;
              }>
            ).forEach((r) => {
              const pront = prontuarioExibicao(r);
              nomes[r.id] = pront ? `${r.nome} (#${pront})` : r.nome;
            });
          })
      : Promise.resolve(),
    agendamentos.size
      ? supabase
          .from("agendamentos")
          .select("id, paciente_nome, inicio, medico_id")
          .in("id", Array.from(agendamentos))
          .then(({ data }) => {
            (
              (data ?? []) as Array<{
                id: string;
                paciente_nome: string | null;
                inicio: string;
                medico_id: string | null;
              }>
            ).forEach((r) => {
              const dt = new Date(r.inicio).toLocaleString("pt-BR");
              nomes[r.id] = `${r.paciente_nome ?? "Agendamento"} — ${dt}`;
            });
          })
      : Promise.resolve(),
    contratos.size
      ? supabase
          .from("contratos_assinatura")
          .select("id, numero")
          .in("id", Array.from(contratos))
          .then(({ data }) => {
            (
              (data ?? []) as unknown as Array<{ id: string; numero: string | number | null }>
            ).forEach((r) => {
              nomes[r.id] = r.numero ? `Contrato ${r.numero}` : "Contrato";
            });
          })
      : Promise.resolve(),
    orcamentos.size
      ? supabase
          .from("orcamentos")
          .select("id, numero")
          .in("id", Array.from(orcamentos))
          .then(({ data }) => {
            ((data ?? []) as Array<{ id: string; numero: number | null }>).forEach((r) => {
              nomes[r.id] = r.numero ? `Orçamento #${r.numero}` : "Orçamento";
            });
          })
      : Promise.resolve(),
  ]);
  return nomes;
}

// ---------------------------------------------------------------------------
// Identificação amigável do registro e resumo da alteração, montados a partir
// da "foto" gravada na própria linha de auditoria (funciona também para
// registros que já foram excluídos).
// ---------------------------------------------------------------------------

type Snap = Record<string, unknown>;

function snapDe(row: AuditRow): Snap {
  return { ...(row.dados_antes ?? {}), ...(row.dados_depois ?? {}) };
}
function txt(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s === "" ? null : s;
}
function dinheiro(v: unknown): string | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? brl(n) : null;
}
function dataCurta(v: unknown): string | null {
  const s = txt(v);
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return fmtDate(s);
  const d = new Date(s);
  if (isNaN(d.getTime())) return null;
  return d.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}
function juntar(...partes: Array<string | null | undefined | false>): string {
  return partes.filter(Boolean).join(" — ");
}
function legivel(v: unknown): string | null {
  const s = txt(v);
  return s ? s.replace(/_/g, " ").toLowerCase() : null;
}

const DIA_SEMANA = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

const TIPO_MOV_CAIXA: Record<string, string> = {
  abertura: "Abertura",
  recebimento: "Recebimento",
  estorno: "Estorno",
  sangria: "Sangria",
  registro: "Registro",
  fechamento: "Fechamento",
  suprimento: "Suprimento",
  transferencia: "Transferência",
};

/** Texto principal da coluna Registro: o que é este registro, em linguagem de balcão. */
function descreverRegistro(row: AuditRow, nomes: Record<string, string>): string | null {
  const s = snapDe(row);
  const id = row.record_id;
  const nomeDe = (k: string) => {
    const v = s[k];
    return typeof v === "string" ? (nomes[v] ?? null) : null;
  };
  switch (row.table_name) {
    case "agendamentos":
      return (
        (id ? nomes[id] : null) ??
        juntar(txt(s.paciente_nome) ?? "Agendamento", dataCurta(s.inicio))
      );
    case "pacientes":
      return (id ? nomes[id] : null) ?? txt(s.nome);
    case "medicos":
      return (id ? nomes[id] : null) ?? (txt(s.nome) ? `Dr(a). ${txt(s.nome)}` : null);
    case "fin_lancamentos":
      return juntar(
        s.tipo === "despesa" ? "Despesa" : s.tipo === "receita" ? "Receita" : "Lançamento",
        dinheiro(s.valor),
        legivel(s.forma_pagamento),
        txt(s.descricao),
      );
    case "fin_atendimentos":
      return juntar(
        txt(s.procedimento) ?? "Atendimento",
        dinheiro(s.valor_total),
        fmtDate(txt(s.data)),
      );
    case "caixa_movimentos":
      return juntar(
        TIPO_MOV_CAIXA[String(s.tipo)] ?? legivel(s.tipo) ?? "Movimento",
        dinheiro(s.valor),
        legivel(s.forma_pagamento),
        txt(s.descricao),
      );
    case "caixa_sessoes":
      return juntar(
        `Caixa de ${txt(s.user_nome) ?? "operador"}`,
        dataCurta(s.aberto_em) && `aberto em ${dataCurta(s.aberto_em)}`,
      );
    case "contrato_mensalidades":
      return juntar(
        s.taxa_adesao === true ? "Taxa de adesão" : `Parcela ${txt(s.numero_parcela) ?? "?"}`,
        dinheiro(s.valor),
        txt(s.vencimento) && `venc. ${fmtDate(txt(s.vencimento))}`,
      );
    case "contratos_assinatura":
      return juntar(`Contrato ${txt(s.numero) ?? ""}`.trim(), txt(s.paciente_nome));
    case "contrato_dependentes":
      return juntar(`Dependente ${txt(s.paciente_nome) ?? ""}`.trim(), legivel(s.parentesco));
    case "orcamentos":
      return juntar(
        (id ? nomes[id] : null) ?? (txt(s.numero) ? `Orçamento #${txt(s.numero)}` : "Orçamento"),
        txt(s.paciente_nome),
        dinheiro(s.valor_total),
      );
    case "orcamento_itens":
      return juntar(txt(s.descricao) ?? "Item", dinheiro(s.valor_total), nomeDe("orcamento_id"));
    case "nfse":
      return juntar(
        txt(s.numero) ? `NFS-e nº ${txt(s.numero)}` : "NFS-e (sem número)",
        dinheiro(s.valor_servicos),
        txt(s.tomador_nome),
      );
    case "estorno_solicitacoes":
      return juntar("Estorno", dinheiro(s.valor), txt(s.paciente_nome), txt(s.descricao));
    case "gr_impressoes":
      return juntar(
        `GR ficha ${txt(s.ficha_numero) ?? "?"}`,
        txt(s.via_numero) && `${txt(s.via_numero)}ª via`,
        nomeDe("agendamento_id"),
      );
    case "medico_disponibilidades":
      return juntar(
        "Grade",
        typeof s.dia_semana === "number" ? DIA_SEMANA[s.dia_semana] : null,
        txt(s.hora_inicio) &&
          `${String(s.hora_inicio).slice(0, 5)}–${String(s.hora_fim ?? "").slice(0, 5)}`,
      );
    case "prontuarios":
      return juntar("Prontuário", fmtDate(txt(s.data)));
    case "perfil_permissoes":
      return juntar(`Módulo ${txt(s.modulo) ?? "?"}`, legivel(s.acesso));
    case "prontuario_sequencia":
      return txt(s.proximo) ? `Próximo nº ${txt(s.proximo)}` : null;
    case "cb_convenio_regras":
      return juntar(txt(s.nome_padrao) ?? legivel(s.tipo) ?? "Regra", dinheiro(s.valor));
    case "procedimento_cb_convenio_valores":
      return juntar("Valor no cartão", dinheiro(s.valor_dinheiro));
    case "nina_ferramenta":
      return legivel(s.ferramenta);
    default:
      return txt(s.nome) ?? txt(s.descricao) ?? txt(s.paciente_nome) ?? null;
  }
}

// Campos que mudam sozinhos (trava de edição, carimbos) e não dizem nada ao operador
const CAMPOS_RUIDO = new Set([
  ...CAMPOS_OCULTOS,
  "edit_lock_at",
  "edit_lock_by",
  "edit_lock_by_nome",
  "fluxo_atualizado_em",
  "atualizado_em",
  "status_alterado_em",
  "status_alterado_por",
  "status_fin_em",
  "status_op_em",
  "telefone_norm",
  "telefone2_norm",
  "cpf_digits",
  "credito_revisado_em",
  "consultado_em",
]);

// No resumo da lista, estes campos aparecem só como "alterado", sem o conteúdo
// (dado clínico, documento pessoal, biometria, dados bancários, blocos técnicos).
// O conteúdo continua no "Ver", para quem tem acesso à auditoria.
const CAMPOS_SEM_VALOR_NO_RESUMO = new Set([
  "queixa_principal",
  "historia_doenca",
  "exame_fisico",
  "hipotese_diagnostica",
  "conduta",
  "prescricao",
  "cpf",
  "rg",
  "data_nascimento",
  "face_descriptor",
  "assinatura_svg",
  "agencia",
  "conta",
  "pix_chave",
  "payload_envio",
  "payload_resposta",
  "token_publico",
  "composicao_pagamento",
  "valores_formas",
  "valores_pagamento",
]);

function ehCampoDinheiro(c: string): boolean {
  return (
    c === "valor" ||
    c.startsWith("valor_") ||
    ["desconto", "juros", "multa", "credito_limite", "sinal_valor", "diferenca"].includes(c)
  );
}

function valorResumo(campo: string, v: unknown, nomes: Record<string, string>): string {
  if (v === null || v === undefined || v === "") return "vazio";
  const emReais = ehCampoDinheiro(campo) ? dinheiro(v) : null;
  if (emReais) return emReais;
  if (typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-/.test(v)) return nomes[v] ?? "outro";
  if (typeof v === "string" && /^[a-z0-9_]+$/.test(v) && v.includes("_"))
    return v.replace(/_/g, " ");
  const f = formatValor(v);
  return f.length > 40 ? f.slice(0, 40) + "…" : f;
}

/** Frase curta da coluna Resumo — o que mudou, sem precisar abrir o "Ver". */
function resumirAlteracao(row: AuditRow, nomes: Record<string, string>): string {
  if (row.action === "INSERT") return "Registro criado";
  if (row.action === "DELETE") return "Registro excluído";
  if (row.action !== "UPDATE") return labelAcao(row.action);

  const diff = computarDiff(row.dados_antes, row.dados_depois);
  const uteis = diff.filter((d) => !CAMPOS_RUIDO.has(d.campo));
  if (uteis.length === 0) {
    return diff.some((d) => d.campo.startsWith("edit_lock"))
      ? "Abriu/fechou a ficha para edição (nada mudou)"
      : "Nenhum campo visível mudou";
  }
  // Status e valores primeiro: é o que a gestão costuma procurar
  const prioridade = (c: string) => (c === "status" ? 0 : ehCampoDinheiro(c) ? 1 : 2);
  const ordenados = [...uteis].sort((a, b) => prioridade(a.campo) - prioridade(b.campo));
  const MAX = 3;
  const frases = ordenados.slice(0, MAX).map((d) => {
    const rotulo = labelCampo(d.campo);
    if (CAMPOS_SEM_VALOR_NO_RESUMO.has(d.campo)) return `${rotulo} alterado`;
    return `${rotulo}: ${valorResumo(d.campo, d.antes, nomes)} → ${valorResumo(d.campo, d.depois, nomes)}`;
  });
  const resto = ordenados.length - MAX;
  return frases.join(" · ") + (resto > 0 ? ` · +${resto} ${resto === 1 ? "campo" : "campos"}` : "");
}

function RegistroCell({ row, nomes }: { row: AuditRow; nomes: Record<string, string> }) {
  const principal = descreverRegistro(row, nomes);
  const merged = { ...(row.dados_antes ?? {}), ...(row.dados_depois ?? {}) } as Record<
    string,
    unknown
  >;
  const medicoId = typeof merged.medico_id === "string" ? merged.medico_id : null;
  const pacienteId = typeof merged.paciente_id === "string" ? merged.paciente_id : null;
  const medico = medicoId ? nomes[medicoId] : null;
  const paciente = pacienteId ? nomes[pacienteId] : null;
  const extras: string[] = [];
  if (medico && !principal?.includes("Dr")) extras.push(medico);
  // Evita repetir o paciente quando o texto principal já traz o nome dele
  if (paciente && !principal?.includes(paciente.split(" (#")[0])) extras.push(paciente);
  const idCurto = row.record_id ? row.record_id.slice(0, 8) : null;
  const titulo = [principal, ...extras].filter(Boolean).join("\n");
  return (
    <div className="flex flex-col min-w-0" title={titulo || undefined}>
      <span className="truncate">
        {principal ?? `${labelTabela(row.table_name)} sem descrição`}
      </span>
      {extras.length > 0 && (
        <span className="text-xs text-muted-foreground truncate">{extras.join(" · ")}</span>
      )}
      {idCurto && (
        <span
          className="text-[10px] text-muted-foreground/70 font-mono"
          title={row.record_id ?? ""}
        >
          ID {idCurto}
        </span>
      )}
    </div>
  );
}

function Page() {
  const { clinicaAtual } = useClinica();
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [tabela, setTabela] = useState<string>("all");
  const [acao, setAcao] = useState<string>("all");
  const [usuario, setUsuario] = useState("");
  const [dataIni, setDataIni] = useState("");
  const [dataFim, setDataFim] = useState("");
  const [detalhe, setDetalhe] = useState<AuditRow | null>(null);
  const [nomesLista, setNomesLista] = useState<Record<string, string>>({});

  const load = async () => {
    if (!clinicaAtual) return;
    setLoading(true);
    let q = supabase
      .from("audit_log" as never)
      .select("*")
      .eq("clinica_id", clinicaAtual.clinica_id)
      .order("created_at", { ascending: false })
      .limit(1000);
    if (tabela !== "all") q = q.eq("table_name", tabela);
    if (acao !== "all") q = q.eq("action", acao);
    if (usuario) q = q.ilike("user_email", `%${usuario}%`);
    if (dataIni) q = q.gte("created_at", new Date(`${dataIni}T00:00:00`).toISOString());
    if (dataFim) q = q.lte("created_at", new Date(`${dataFim}T23:59:59`).toISOString());
    const { data, error } = await q;
    setLoading(false);
    if (error) {
      mostrarErro(error);
      return;
    }
    const list = (data as unknown as AuditRow[]) ?? [];
    setRows(list);
    void resolverNomesLista(list).then(setNomesLista);
  };

  useEffect(() => {
    void load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [clinicaAtual?.clinica_id]);

  // Lista fixa de tipos conhecidos + os que vierem na consulta: assim o filtro
  // não "encolhe" para um item só depois que você filtra por um tipo.
  const tabelasUnicas = useMemo(
    () =>
      Array.from(new Set([...Object.keys(TABLE_LABEL), ...rows.map((r) => r.table_name)])).sort(
        (a, b) => labelTabela(a).localeCompare(labelTabela(b)),
      ),
    [rows],
  );

  const exportar = () => {
    if (rows.length === 0) {
      toast.error("Sem dados para exportar");
      return;
    }
    exportToExcel(
      rows.map((r) => ({
        data: new Date(r.created_at).toLocaleString("pt-BR"),
        usuario: r.user_email ?? "—",
        acao: labelAcao(r.action),
        tabela: labelTabela(r.table_name),
        registro: descreverRegistro(r, nomesLista) ?? "",
        resumo: resumirAlteracao(r, nomesLista),
        registro_id: r.record_id ?? "",
        dados_antes: r.dados_antes ? JSON.stringify(r.dados_antes) : "",
        dados_depois: r.dados_depois ? JSON.stringify(r.dados_depois) : "",
      })),
      `auditoria_${hojeBR()}`,
      [
        { key: "data", label: "Data/Hora" },
        { key: "usuario", label: "Usuário" },
        { key: "acao", label: "Ação" },
        { key: "tabela", label: "Tipo de registro" },
        { key: "registro", label: "Registro" },
        { key: "resumo", label: "Resumo" },
        { key: "registro_id", label: "ID do registro" },
        { key: "dados_antes", label: "Dados antes" },
        { key: "dados_depois", label: "Dados depois" },
      ],
    );
  };

  if (!clinicaAtual) return <p className="text-muted-foreground">Selecione uma clínica.</p>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <ShieldCheck className="h-6 w-6 text-primary" /> Auditoria de uso
          </h1>
          <p className="text-sm text-muted-foreground">
            Histórico de alterações no sistema — {clinicaAtual.clinica.nome}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => void load()} disabled={loading}>
            <RefreshCw className="h-4 w-4 mr-1" /> Atualizar
          </Button>
          <Button onClick={exportar}>
            <Download className="h-4 w-4 mr-1" /> Baixar Excel
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="py-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          <div>
            <Label htmlFor="aud-filtro-tipo" className="text-xs">
              Tipo de registro
            </Label>
            <Select value={tabela} onValueChange={setTabela}>
              <SelectTrigger id="aud-filtro-tipo">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os tipos</SelectItem>
                {tabelasUnicas.map((t) => (
                  <SelectItem key={t} value={t}>
                    {labelTabela(t)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="aud-filtro-acao" className="text-xs">
              O que foi feito
            </Label>
            <Select value={acao} onValueChange={setAcao}>
              <SelectTrigger id="aud-filtro-acao">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas as ações</SelectItem>
                {ACOES_FILTRO.map((a) => (
                  <SelectItem key={a} value={a}>
                    {labelAcao(a)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="aud-filtro-usuario" className="text-xs">
              Quem fez (e-mail do usuário)
            </Label>
            <Input
              id="aud-filtro-usuario"
              value={usuario}
              onChange={(e) => setUsuario(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && void load()}
              placeholder="Digite parte do e-mail"
            />
          </div>
          <div>
            <Label className="text-xs">Data inicial</Label>
            <DateInputBR value={dataIni} onChange={(e) => setDataIni(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">Data final</Label>
            <DateInputBR value={dataFim} onChange={(e) => setDataFim(e.target.value)} />
          </div>
          <div className="sm:col-span-2 lg:col-span-5 flex items-center justify-between gap-2 flex-wrap">
            <p className="text-xs text-muted-foreground">
              Mostra até 1.000 registros, do mais recente para o mais antigo. Escolha os filtros e
              clique em Aplicar filtros.
            </p>
            <Button onClick={() => void load()}>Aplicar filtros</Button>
          </div>
        </CardContent>
      </Card>

      <div className="border rounded-lg overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-40">Data/Hora</TableHead>
              <TableHead>Usuário</TableHead>
              <TableHead className="w-24">Ação</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead>Registro</TableHead>
              <TableHead>Resumo</TableHead>
              <TableHead className="text-right">Detalhes</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                  Carregando…
                </TableCell>
              </TableRow>
            ) : rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                  Nenhum registro de auditoria encontrado.
                </TableCell>
              </TableRow>
            ) : (
              rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="text-sm">
                    {new Date(r.created_at).toLocaleString("pt-BR")}
                  </TableCell>
                  <TableCell className="text-sm">{r.user_email ?? "—"}</TableCell>
                  <TableCell>
                    <Badge className={corAcao(r.action)}>{labelAcao(r.action)}</Badge>
                  </TableCell>
                  <TableCell className="text-sm">{labelTabela(r.table_name)}</TableCell>
                  <TableCell className="text-sm max-w-[300px]">
                    <RegistroCell row={r} nomes={nomesLista} />
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground min-w-[220px] max-w-[380px]">
                    <span className="line-clamp-2">{resumirAlteracao(r, nomesLista)}</span>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button size="sm" variant="ghost" onClick={() => setDetalhe(r)}>
                      Ver
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={!!detalhe} onOpenChange={(o) => !o && setDetalhe(null)}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-auto">
          <DialogHeader>
            <DialogTitle>Detalhes da alteração</DialogTitle>
          </DialogHeader>
          {detalhe && <DetalheAlteracao row={detalhe} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function DetalheAlteracao({ row }: { row: AuditRow }) {
  const [verBruto, setVerBruto] = useState(false);
  const [nomes, setNomes] = useState<Record<string, string>>({});
  const diff = row.action === "UPDATE" ? computarDiff(row.dados_antes, row.dados_depois) : [];
  const criados = row.action === "INSERT" ? camposRelevantes(row.dados_depois) : [];
  const excluidos = row.action === "DELETE" ? camposRelevantes(row.dados_antes) : [];

  useEffect(() => {
    let cancel = false;
    const todos = [...diff, ...criados, ...excluidos];
    void resolverNomes(todos, row.table_name, row.record_id).then((n) => {
      if (!cancel) setNomes(n);
    });
    return () => {
      cancel = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [row.id]);

  const contexto = row.record_id ? nomes[row.record_id] : null;

  const resumo =
    row.action === "INSERT"
      ? `Criou um registro em ${labelTabela(row.table_name)}.`
      : row.action === "DELETE"
        ? `Excluiu um registro de ${labelTabela(row.table_name)}.`
        : diff.length === 0
          ? `Alterou um registro em ${labelTabela(row.table_name)} (sem mudanças de campo detectadas).`
          : `Alterou ${diff.length} ${diff.length === 1 ? "campo" : "campos"} em ${labelTabela(row.table_name)}.`;

  return (
    <div className="space-y-4 text-sm">
      <div className="rounded-lg border bg-muted/40 p-3 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <Badge className={corAcao(row.action)}>{labelAcao(row.action)}</Badge>
          <span className="font-medium">{labelTabela(row.table_name)}</span>
          {contexto && <span className="text-muted-foreground">— {contexto}</span>}
        </div>
        <div className="text-muted-foreground">{resumo}</div>
        <div className="text-xs text-muted-foreground pt-1">
          Por <span className="text-foreground">{row.user_email ?? "Sistema"}</span> em{" "}
          {new Date(row.created_at).toLocaleString("pt-BR")}
        </div>
      </div>

      {row.action === "UPDATE" && diff.length > 0 && (
        <div className="rounded-lg border overflow-hidden">
          <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)_minmax(0,1.2fr)] text-xs uppercase tracking-wide bg-muted/60 px-3 py-2">
            <div>Campo</div>
            <div>Antes</div>
            <div>Depois</div>
          </div>
          {diff.map((d) => (
            <div
              key={d.campo}
              className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)_minmax(0,1.2fr)] px-3 py-2 border-t items-start gap-2"
            >
              <div className="font-medium">{labelCampo(d.campo)}</div>
              <div className="text-rose-700 break-words">
                {formatValorComNome(d.antes, d.campo, nomes)}
              </div>
              <div className="text-emerald-700 break-words">
                {formatValorComNome(d.depois, d.campo, nomes)}
              </div>
            </div>
          ))}
        </div>
      )}

      {(criados.length > 0 || excluidos.length > 0) && (
        <div className="rounded-lg border overflow-hidden">
          <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,2fr)] text-xs uppercase tracking-wide bg-muted/60 px-3 py-2">
            <div>Campo</div>
            <div>Valor</div>
          </div>
          {(criados.length > 0 ? criados : excluidos).map((d) => (
            <div
              key={d.campo}
              className="grid grid-cols-[minmax(0,1fr)_minmax(0,2fr)] px-3 py-2 border-t items-start gap-2"
            >
              <div className="font-medium">{labelCampo(d.campo)}</div>
              <div className="break-words">
                {formatValorComNome(row.action === "INSERT" ? d.depois : d.antes, d.campo, nomes)}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="flex justify-end">
        <Button size="sm" variant="ghost" onClick={() => setVerBruto((v) => !v)}>
          {verBruto ? "Ocultar dados técnicos" : "Ver dados técnicos"}
        </Button>
      </div>
      {verBruto && (
        <div className="space-y-2">
          {row.dados_antes && (
            <div>
              <div className="text-xs font-semibold text-muted-foreground mb-1">Antes (bruto)</div>
              <pre className="bg-muted p-3 rounded text-xs overflow-auto">
                {JSON.stringify(row.dados_antes, null, 2)}
              </pre>
            </div>
          )}
          {row.dados_depois && (
            <div>
              <div className="text-xs font-semibold text-muted-foreground mb-1">Depois (bruto)</div>
              <pre className="bg-muted p-3 rounded text-xs overflow-auto">
                {JSON.stringify(row.dados_depois, null, 2)}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function PageWithTabs() {
  return (
    <>
      <SectionTabs title={SEGURANCA_META.title} icon={SEGURANCA_META.icon} tabs={SEGURANCA_TABS} />
      <Page />
    </>
  );
}
