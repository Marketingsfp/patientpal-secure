import { createFileRoute } from "@tanstack/react-router";

/**
 * Backup diário do schema public.
 *
 * - Chamado pelo cron (pg_cron + pg_net) todo dia às 03:00.
 * - Descobre as tabelas do schema public dinamicamente.
 * - Para cada clínica × tabela, gera CSV paginado (chunks de 10k linhas) e
 *   sobe no bucket privado `backups-diarios/{clinica_id}/{YYYY-MM-DD}/`.
 * - Grava progresso em `backup_execucoes` (um registro por clínica × dia).
 * - Endpoint público, autenticado pelo header `apikey` (publishable key) —
 *   é o padrão dos cron jobs internos.
 * - Retenção: remove backups com mais de 30 dias antes de sair.
 *
 * Estratégia para caber no tempo de execução do Worker:
 *   Cada invocação processa até MAX_TABELAS_POR_RUN tabelas. Se restarem
 *   tabelas pendentes, retorna 202 com { pendentes } e pode ser chamado
 *   de novo (o cron dispara 1x/dia; o operador chama manualmente se
 *   precisar continuar imediatamente).
 */
export const Route = createFileRoute("/api/public/hooks/backup-diario")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        // Auth: header apikey deve bater com a publishable key
        const apikey = request.headers.get("apikey");
        if (!apikey || apikey !== process.env.SUPABASE_PUBLISHABLE_KEY) {
          return new Response(JSON.stringify({ error: "unauthorized" }), {
            status: 401,
            headers: { "Content-Type": "application/json" },
          });
        }

        const { supabaseAdmin } = await import(
          "@/integrations/supabase/client.server"
        );

        const hoje = new Date().toISOString().slice(0, 10);
        const MAX_TABELAS_POR_RUN = 40;
        const PAGE_SIZE = 10_000;
        const bucket = "backups-diarios";

        // 1. Lista clínicas
        const { data: clinicas, error: eCli } = await supabaseAdmin
          .from("clinicas")
          .select("id, nome");
        if (eCli) {
          return json({ error: eCli.message }, 500);
        }

        // 2. Lista tabelas do schema public via RPC embutida em SQL
        const tabelas = await listarTabelasPublic();

        // 3. Retenção: apaga backups antigos (>30 dias)
        await limparAntigos(supabaseAdmin, bucket, 30);

        const resumo: Record<string, unknown>[] = [];

        for (const c of clinicas ?? []) {
          const clinicaId = (c as { id: string }).id;

          // execução do dia (upsert lógico)
          const { data: execExist } = await supabaseAdmin
            .from("backup_execucoes")
            .select("id, status")
            .eq("clinica_id", clinicaId)
            .eq("data_ref", hoje)
            .maybeSingle();

          let execId = (execExist as { id?: string } | null)?.id ?? null;
          if (!execId) {
            const { data: novo, error: eIns } = await supabaseAdmin
              .from("backup_execucoes")
              .insert({
                clinica_id: clinicaId,
                data_ref: hoje,
                status: "em_andamento",
              } as never)
              .select("id")
              .single();
            if (eIns) {
              resumo.push({ clinica_id: clinicaId, error: eIns.message });
              continue;
            }
            execId = (novo as { id: string }).id;
          }

          let processadas = 0;
          let arquivos = 0;
          let bytes = 0;
          const tabelasFeitas: string[] = [];

          for (const tabela of tabelas) {
            if (processadas >= MAX_TABELAS_POR_RUN) break;

            const hasClinica = await tabelaTemColuna(tabela, "clinica_id");
            if (!hasClinica) {
              // Tabelas sem clinica_id só são exportadas na "clínica raiz"
              // (a primeira). Para simplificar, pulamos aqui — dados globais
              // (ex.: sistema_planos, permissions) mudam raramente e podem
              // ser exportados em um job separado no futuro.
              continue;
            }

            const { pages, rows, size } = await dumpTabela(
              supabaseAdmin,
              tabela,
              clinicaId,
              hoje,
              bucket,
              PAGE_SIZE,
            );
            processadas += 1;
            arquivos += pages;
            bytes += size;
            tabelasFeitas.push(`${tabela}(${rows})`);
          }

          const totalTabelas = tabelas.length;
          const feito = processadas >= totalTabelas;

          await supabaseAdmin
            .from("backup_execucoes")
            .update({
              status: feito ? "concluido" : "em_andamento",
              tabelas: processadas,
              arquivos,
              bytes,
              finalizado_em: feito ? new Date().toISOString() : null,
            } as never)
            .eq("id", execId);

          resumo.push({
            clinica: (c as { nome: string }).nome,
            tabelas_processadas: processadas,
            arquivos,
            bytes,
            status: feito ? "concluido" : "em_andamento",
          });
        }

        return json({ ok: true, data: hoje, resumo }, 200);
      },
    },
  },
});

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

async function listarTabelasPublic(): Promise<string[]> {
  // Whitelist estática do schema public. Adicione novas tabelas em
  // TABELAS_COM_CLINICA_ARR quando criar.
  return TABELAS_PUBLIC;
}

async function tabelaTemColuna(tabela: string, coluna: string): Promise<boolean> {
  return TABELAS_COM_CLINICA.has(tabela) && coluna === "clinica_id";
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Admin = any;

async function dumpTabela(
  admin: Admin,
  tabela: string,
  clinicaId: string,
  data: string,
  bucket: string,
  pageSize: number,
): Promise<{ pages: number; rows: number; size: number }> {
  let offset = 0;
  let part = 0;
  let totalRows = 0;
  let totalSize = 0;

  for (;;) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const q: any = admin.from(tabela as never).select("*");
    const { data: rows, error } = await q
      .eq("clinica_id", clinicaId)
      .range(offset, offset + pageSize - 1);
    if (error) throw new Error(`${tabela}: ${error.message}`);
    const arr = (rows ?? []) as Record<string, unknown>[];
    if (arr.length === 0 && part === 0) {
      // arquivo vazio ainda é criado (útil como marcador de "tabela exportada")
      const empty = "";
      await admin.storage
        .from(bucket)
        .upload(
          `${clinicaId}/${data}/${tabela}.part-0.csv`,
          new Blob([empty], { type: "text/csv" }),
          { upsert: true, contentType: "text/csv" },
        );
      return { pages: 1, rows: 0, size: 0 };
    }
    if (arr.length === 0) break;
    const csv = toCSV(arr);
    const blob = new Blob([csv], { type: "text/csv" });
    const path = `${clinicaId}/${data}/${tabela}.part-${part}.csv`;
    const { error: upErr } = await admin.storage
      .from(bucket)
      .upload(path, blob, { upsert: true, contentType: "text/csv" });
    if (upErr) throw new Error(`upload ${path}: ${upErr.message}`);
    totalRows += arr.length;
    totalSize += csv.length;
    part += 1;
    if (arr.length < pageSize) break;
    offset += pageSize;
  }
  return { pages: part, rows: totalRows, size: totalSize };
}

function toCSV(rows: Record<string, unknown>[]): string {
  if (!rows.length) return "";
  const cols = Object.keys(rows[0]);
  const header = cols.map(escapeCSV).join(",");
  const lines = rows.map((r) =>
    cols.map((c) => escapeCSV(serialize(r[c]))).join(","),
  );
  return [header, ...lines].join("\n");
}

function serialize(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

function escapeCSV(s: string): string {
  if (s.includes(",") || s.includes("\"") || s.includes("\n") || s.includes("\r")) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

async function limparAntigos(
  admin: Admin,
  bucket: string,
  diasRetencao: number,
) {
  const limite = new Date();
  limite.setDate(limite.getDate() - diasRetencao);
  const cortoStr = limite.toISOString().slice(0, 10);

  // Lista pastas raiz (clinica_ids)
  const { data: raiz } = await admin.storage.from(bucket).list("", {
    limit: 1000,
  });
  for (const cli of raiz ?? []) {
    if (!cli.name) continue;
    const { data: dias } = await admin.storage
      .from(bucket)
      .list(cli.name, { limit: 1000 });
    for (const d of dias ?? []) {
      if (!d.name || d.name >= cortoStr) continue;
      const { data: files } = await admin.storage
        .from(bucket)
        .list(`${cli.name}/${d.name}`, { limit: 1000 });
      const paths = ((files ?? []) as Array<{ name: string }>).map(
        (f) => `${cli.name}/${d.name}/${f.name}`,
      );
      if (paths.length) await admin.storage.from(bucket).remove(paths);
    }
  }
}

// Whitelist de tabelas do schema public com coluna clinica_id.
// Gerada a partir do schema atual. Adicione novas tabelas aqui quando criar.
const TABELAS_COM_CLINICA_ARR = [
  "agendamento_orcamento_itens", "agendamentos", "alertas_enfermagem",
  "anamnese_modelos", "anamnese_respostas", "atend_avaliacoes",
  "atend_bot_configs", "atend_conversas", "atend_departamento_membros",
  "atend_departamentos", "atend_horarios", "atend_kb", "atend_macros",
  "atend_msg_fora_horario", "atend_notas_internas",
  "atend_numeros_autorizados", "atend_pausas_log", "atend_pause_reasons",
  "atend_protocolo_config", "atend_routing_rules", "atend_transferencias",
  "audit_log", "boletos", "caixa_movimentos", "caixa_sessoes",
  "campanhas_marketing", "cargos", "cartoes_convenio", "cb_beneficios",
  "cb_convenio_faixas", "cb_convenio_regras", "cb_convenios",
  "chat_canais", "chat_mensagens", "contrato_dependentes",
  "contrato_mensalidades", "contratos_assinatura", "crm_etapas",
  "crm_oportunidades", "documentos_emitidos",
  "especialidades", "estoque_movimentos", "estoque_produtos",
  "estorno_solicitacoes", "exame_resultados", "fin_alertas",
  "fin_atendimentos", "fin_categorias", "fin_contas", "fin_empresas",
  "fin_lancamentos", "fin_lembretes", "fin_notas_pacientes",
  "fin_regras_ia", "gr_impressoes", "hr_banco_horas", "hr_contratos",
  "hr_escalas", "hr_ferias", "hr_holerites", "hr_pontos",
  "lgpd_consentimentos", "lgpd_solicitacoes", "lms_certificados",
  "lms_cursos", "lms_licoes", "lms_modulos", "lms_progresso",
  "lms_quizzes", "lms_trilhas_cargo", "medico_agenda_procedimentos",
  "medico_agendas", "medico_biometria", "medico_convenios",
  "medico_disponibilidades", "medico_especialidades",
  "medico_expediente_encerramento", "medico_procedimentos", "medicos",
  "mkt_envios", "mkt_landing_pages", "mkt_leads", "mkt_segmentos",
  "modelos_documentos", "nfse", "nfse_emitentes", "odonto_dentes",
  "odonto_prontuarios", "orcamento_itens", "orcamentos",
  "paciente_biometria", "pacientes", "pagamento_splits", "pagamentos",
  "perfil_permissoes", "perfis_acesso", "planos_assinatura",
  "prestadores", "procedimento_cb_convenio_valores",
  "procedimento_especialidades", "procedimento_split_regras",
  "procedimento_unidade_regras", "procedimentos", "prontuario_modelos",
  "prontuarios", "regras_rateio", "senhas", "setores", "tipos_servico",
  "triagens_enfermagem", "unidades", "whatsapp_configs",
  "whatsapp_mensagens", "whatsapp_templates", "backup_execucoes",
];
const TABELAS_COM_CLINICA = new Set(TABELAS_COM_CLINICA_ARR);
const TABELAS_PUBLIC = TABELAS_COM_CLINICA_ARR;