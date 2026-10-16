// Fase 2 da Área do Paciente: documentos liberados, financeiro e resumo.
// Nada recebe paciente_id do navegador — tudo vem da sessão do servidor.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import {
  contarNovos,
  expiraLink,
  nomeForma,
  situacaoPagamento,
  somenteDoPaciente,
  type TipoLink,
} from "./regras-fase2";

const clinicaParam = z.string().max(64).optional().nullable();

async function srv() {
  return import("./portal.server");
}

async function lerDocumentos(s: { clinica_id: string; paciente_id: string }) {
  const { admin } = await srv();
  const db = await admin();
  const [docs, exames] = await Promise.all([
    db
      .from("documentos_emitidos")
      .select("id, clinica_id, paciente_id, tipo, titulo, created_at, liberado_paciente_em, medicos(nome)")
      .eq("clinica_id", s.clinica_id)
      .eq("paciente_id", s.paciente_id)
      .not("liberado_paciente_em", "is", null)
      .neq("tipo", "contrato")
      .order("created_at", { ascending: false })
      .limit(200),
    db
      .from("exame_resultados")
      .select("id, clinica_id, paciente_id, tipo_exame, data_coleta, created_at, liberado_paciente_em")
      .eq("clinica_id", s.clinica_id)
      .eq("paciente_id", s.paciente_id)
      .not("liberado_paciente_em", "is", null)
      .order("created_at", { ascending: false })
      .limit(200),
  ]);
  if (docs.error || exames.error) throw new Error("Não foi possível carregar seus documentos.");
  type D = {
    id: string;
    clinica_id: string;
    paciente_id: string | null;
    tipo: string;
    titulo: string;
    created_at: string;
    liberado_paciente_em: string | null;
    medicos: { nome: string | null } | null;
  };
  const d = somenteDoPaciente((docs.data ?? []) as unknown as D[], s, true).map((x) => ({
    id: x.id,
    origem: "documento" as const,
    tipo: x.tipo,
    titulo: x.titulo,
    data: x.created_at,
    profissional: x.medicos?.nome ?? null,
    liberadoEm: x.liberado_paciente_em as string,
  }));
  const e = somenteDoPaciente(exames.data ?? [], s, true).map((x) => ({
    id: x.id,
    origem: "exame" as const,
    tipo: "exame",
    titulo: x.tipo_exame,
    data: x.data_coleta ?? x.created_at,
    profissional: null,
    liberadoEm: x.liberado_paciente_em as string,
  }));
  return [...d, ...e].sort((a, b) => (a.data < b.data ? 1 : -1));
}

/** Último uso da sessão anterior (para "documentos novos"). */
async function ultimoAcessoAnterior(sessaoId: string, pacienteId: string, clinicaId: string) {
  const { admin } = await srv();
  const db = await admin();
  const { data: atual } = await db
    .from("portal_sessoes")
    .select("criado_em")
    .eq("id", sessaoId)
    .maybeSingle();
  if (!atual) return null;
  const { data } = await db
    .from("portal_sessoes")
    .select("ultimo_uso_em")
    .eq("paciente_id", pacienteId)
    .eq("clinica_id", clinicaId)
    .lt("criado_em", atual.criado_em)
    .order("criado_em", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data?.ultimo_uso_em ?? null;
}

export const meusDocumentos = createServerFn({ method: "POST" })
  .inputValidator((d: { clinica?: string | null }) => z.object({ clinica: clinicaParam }).parse(d))
  .handler(async ({ data }) => {
    const s = await srv();
    const sessao = await s.exigirSessao(data.clinica);
    const [itens, desde] = await Promise.all([
      lerDocumentos(sessao),
      ultimoAcessoAnterior(sessao.id, sessao.paciente_id, sessao.clinica_id),
    ]);
    await s.auditar({
      clinica_id: sessao.clinica_id,
      paciente_id: sessao.paciente_id,
      evento: "ver_documentos",
      detalhe: { quantidade: itens.length },
    });
    return {
      itens: itens.map((i) => ({
        ...i,
        novo: !desde || new Date(i.liberadoEm).getTime() > new Date(desde).getTime(),
      })),
    };
  });

export const meuFinanceiro = createServerFn({ method: "POST" })
  .inputValidator((d: { clinica?: string | null }) => z.object({ clinica: clinicaParam }).parse(d))
  .handler(async ({ data }) => {
    const s = await srv();
    const sessao = await s.exigirSessao(data.clinica);
    const db = await s.admin();
    const [lanc, notas] = await Promise.all([
      db
        .from("fin_lancamentos")
        .select("id, clinica_id, paciente_id, data, data_vencimento, descricao, valor, forma_pagamento, status")
        .eq("clinica_id", sessao.clinica_id)
        .eq("paciente_id", sessao.paciente_id)
        .eq("tipo", "receita")
        .order("data", { ascending: false })
        .limit(150),
      db
        .from("nfse")
        .select("id, clinica_id, paciente_id, numero, data_emissao, valor_servicos, url_pdf, url_xml")
        .eq("clinica_id", sessao.clinica_id)
        .eq("paciente_id", sessao.paciente_id)
        .eq("status", "emitida")
        .order("data_emissao", { ascending: false })
        .limit(100),
    ]);
    if (lanc.error || notas.error) throw new Error("Não foi possível carregar seu financeiro.");
    const pagamentos = somenteDoPaciente(lanc.data ?? [], sessao, false).map((l) => ({
      id: l.id,
      data: l.data,
      vencimento: l.data_vencimento,
      descricao: l.descricao,
      valor: Number(l.valor),
      forma: nomeForma(l.forma_pagamento),
      situacao: situacaoPagamento(l.status),
    }));
    const nfse = somenteDoPaciente(notas.data ?? [], sessao, false).map((n) => ({
      id: n.id,
      numero: n.numero,
      data: n.data_emissao,
      valor: Number(n.valor_servicos ?? 0),
      temPdf: !!n.url_pdf,
      temXml: !!n.url_xml,
    }));
    await s.auditar({
      clinica_id: sessao.clinica_id,
      paciente_id: sessao.paciente_id,
      evento: "ver_financeiro",
    });
    return {
      pagos: pagamentos.filter((p) => p.situacao !== "em_aberto"),
      emAberto: pagamentos.filter((p) => p.situacao === "em_aberto"),
      nfse,
    };
  });

export const resumoInicio = createServerFn({ method: "POST" })
  .inputValidator((d: { clinica?: string | null }) => z.object({ clinica: clinicaParam }).parse(d))
  .handler(async ({ data }) => {
    const s = await srv();
    const sessao = await s.exigirSessao(data.clinica);
    const db = await s.admin();
    const [prox, docs, desde, pend] = await Promise.all([
      db
        .from("agendamentos")
        .select("inicio, procedimento, medicos(nome)")
        .eq("clinica_id", sessao.clinica_id)
        .eq("paciente_id", sessao.paciente_id)
        .in("status", ["agendado", "confirmado"])
        .gt("inicio", new Date().toISOString())
        .order("inicio", { ascending: true })
        .limit(1)
        .maybeSingle(),
      lerDocumentos(sessao),
      ultimoAcessoAnterior(sessao.id, sessao.paciente_id, sessao.clinica_id),
      db
        .from("fin_lancamentos")
        .select("valor")
        .eq("clinica_id", sessao.clinica_id)
        .eq("paciente_id", sessao.paciente_id)
        .eq("tipo", "receita")
        .eq("status", "pendente")
        .limit(200),
    ]);
    const p = prox.data as unknown as {
      inicio: string;
      procedimento: string | null;
      medicos: { nome: string | null } | null;
    } | null;
    return {
      proxima: p
        ? { inicio: p.inicio, procedimento: p.procedimento, profissional: p.medicos?.nome ?? null }
        : null,
      documentosNovos: contarNovos(
        docs.map((d) => d.liberadoEm),
        desde,
      ),
      pendencias: {
        quantidade: (pend.data ?? []).length,
        total: (pend.data ?? []).reduce((t, r) => t + Number(r.valor || 0), 0),
      },
    };
  });

/** Link de download de 5 minutos, ligado à sessão atual. */
export const gerarLinkArquivo = createServerFn({ method: "POST" })
  .inputValidator(
    (d: { clinica?: string | null; tipo: TipoLink; id: string }) =>
      z
        .object({
          clinica: clinicaParam,
          tipo: z.enum(["documento", "exame", "recibo", "nfse_pdf", "nfse_xml"]),
          id: z.string().uuid(),
        })
        .parse(d) as { clinica?: string | null; tipo: TipoLink; id: string },
  )
  .handler(async ({ data }) => {
    const s = await srv();
    const sessao = await s.exigirSessao(data.clinica);
    const { carregarArquivo } = await import("./arquivos.server");
    const arq = await carregarArquivo(sessao, data.tipo, data.id, { conteudo: false });
    if (!arq) throw new Error("Este arquivo não está disponível.");
    const token = s.tokenAleatorio();
    const db = await s.admin();
    const { error } = await db.from("portal_links").insert({
      clinica_id: sessao.clinica_id,
      paciente_id: sessao.paciente_id,
      sessao_id: sessao.id,
      tipo: data.tipo,
      ref_id: data.id,
      token_hash: await s.hmac("link", token),
      expira_em: expiraLink(new Date()),
    });
    if (error) throw new Error("Não foi possível gerar o link agora.");
    await s.auditar({
      clinica_id: sessao.clinica_id,
      paciente_id: sessao.paciente_id,
      evento: "gerou_link",
      detalhe: { tipo: data.tipo, ref_id: data.id },
    });
    return { url: `/api/public/portal-arquivo?t=${encodeURIComponent(token)}` };
  });
