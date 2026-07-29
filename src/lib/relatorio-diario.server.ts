import { supabaseAdmin } from "@/integrations/supabase/client.server";

/** Janela padrão do relatório diário (horário de Brasília). */
export const JANELA_INICIO = "07:00";
export const JANELA_FIM = "19:00";

export interface EntradaRelatorio {
  id: string;
  data: string;
  hora: string;
  titulo: string;
  descricao: string | null;
  area: string | null;
  tipo: string;
  chave_loop: string | null;
  loop_manual: boolean;
  loop_motivo: string | null;
  origem: string;
}

export interface LoopDetectado {
  chave: string;
  titulo: string;
  ocorrencias: number;
  manual: boolean;
  motivo: string | null;
  datas: string[];
}

export interface RelatorioDiario {
  data: string;
  janela: string;
  total: number;
  porTipo: Array<{ tipo: string; total: number }>;
  porArea: Array<{ area: string; total: number }>;
  entradas: EntradaRelatorio[];
  loops: LoopDetectado[];
  resumo: string;
  texto: string;
}

export function dataHojeSP(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
}

function normalizarChave(e: { chave_loop: string | null; titulo: string }): string {
  const base = e.chave_loop?.trim() || e.titulo;
  return base
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const ROTULO_TIPO: Record<string, string> = {
  correcao: "Correção",
  melhoria: "Melhoria",
  novo: "Novidade",
  banco: "Banco de dados",
  ajuste: "Ajuste",
  investigacao: "Investigação",
  documento: "Documento",
};

export function rotuloTipo(t: string) {
  return ROTULO_TIPO[t] ?? t;
}

function contar(itens: string[]) {
  const m = new Map<string, number>();
  for (const i of itens) m.set(i, (m.get(i) ?? 0) + 1);
  return [...m.entries()]
    .map(([k, total]) => ({ k, total }))
    .sort((a, b) => b.total - a.total);
}

/**
 * Monta o relatório de um dia (07:00–19:00 por padrão).
 *
 * Loops de erro são detectados de duas formas:
 *  - manualmente, quando alguém marca a entrada como "loop";
 *  - automaticamente, quando a mesma chave/assunto aparece 2+ vezes
 *    nos últimos 30 dias.
 */
export async function montarRelatorioDiario(
  data: string,
  inicio = JANELA_INICIO,
  fim = JANELA_FIM,
): Promise<RelatorioDiario> {
  const { data: doDia, error } = await supabaseAdmin
    .from("dev_relatorio_entradas")
    .select(
      "id, data, hora, titulo, descricao, area, tipo, chave_loop, loop_manual, loop_motivo, origem",
    )
    .eq("data", data)
    .gte("hora", `${inicio}:00`)
    .lte("hora", `${fim}:59`)
    .order("hora", { ascending: true });
  if (error) throw new Error(error.message);
  const entradas = (doDia ?? []) as unknown as EntradaRelatorio[];

  // Histórico dos últimos 30 dias para detectar repetição
  const desde = new Date(`${data}T12:00:00Z`);
  desde.setDate(desde.getDate() - 30);
  const desdeStr = desde.toISOString().slice(0, 10);
  const { data: hist } = await supabaseAdmin
    .from("dev_relatorio_entradas")
    .select("data, titulo, chave_loop")
    .gte("data", desdeStr)
    .lte("data", data);
  const historico = (hist ?? []) as unknown as Array<{
    data: string;
    titulo: string;
    chave_loop: string | null;
  }>;

  const ocorrencias = new Map<string, string[]>();
  for (const h of historico) {
    const k = normalizarChave(h);
    if (!k) continue;
    ocorrencias.set(k, [...(ocorrencias.get(k) ?? []), h.data]);
  }

  const loops: LoopDetectado[] = [];
  const vistos = new Set<string>();
  for (const e of entradas) {
    const k = normalizarChave(e);
    if (!k || vistos.has(k)) continue;
    const datas = [...new Set(ocorrencias.get(k) ?? [])].sort();
    const repetido = datas.length >= 2;
    if (!repetido && !e.loop_manual) continue;
    vistos.add(k);
    loops.push({
      chave: e.chave_loop?.trim() || e.titulo,
      titulo: e.titulo,
      ocorrencias: Math.max(datas.length, e.loop_manual ? 1 : 0),
      manual: e.loop_manual,
      motivo: e.loop_motivo,
      datas,
    });
  }

  const porTipo = contar(entradas.map((e) => e.tipo)).map((x) => ({ tipo: x.k, total: x.total }));
  const porArea = contar(entradas.map((e) => e.area || "Geral")).map((x) => ({
    area: x.k,
    total: x.total,
  }));

  const [a, m, d] = data.split("-");
  const dataBr = `${d}/${m}/${a}`;

  const resumo = entradas.length
    ? `Entre ${inicio} e ${fim} do dia ${dataBr} foram registradas ${entradas.length} alteração(ões)` +
      (porArea.length ? `, com destaque para ${porArea[0].area} (${porArea[0].total}).` : ".") +
      (loops.length
        ? ` ${loops.length} assunto(s) apareceram como possível loop de erro.`
        : " Nenhum loop de erro identificado.")
    : `Nenhuma alteração registrada entre ${inicio} e ${fim} do dia ${dataBr}.`;

  const linhas: string[] = [];
  linhas.push(`*Relatório diário — ${dataBr} (${inicio} às ${fim})*`);
  linhas.push("");
  linhas.push(resumo);
  if (entradas.length) {
    linhas.push("");
    linhas.push("*O que mudou*");
    for (const e of entradas) {
      const hora = e.hora.slice(0, 5);
      const area = e.area ? ` — ${e.area}` : "";
      linhas.push(`• ${hora} · ${rotuloTipo(e.tipo)}${area}: ${e.titulo}`);
      if (e.descricao) linhas.push(`   ${e.descricao}`);
    }
  }
  if (loops.length) {
    linhas.push("");
    linhas.push("*Loops de erro (assuntos que voltaram)*");
    for (const l of loops) {
      const marca = l.manual ? "marcado manualmente" : `${l.datas.length}x em 30 dias`;
      linhas.push(`• ${l.titulo} (${marca})`);
      if (l.motivo) linhas.push(`   ${l.motivo}`);
    }
  }
  linhas.push("");
  linhas.push("_Enviado automaticamente pelo ClinicaOS às 20:00._");

  return {
    data,
    janela: `${inicio}–${fim}`,
    total: entradas.length,
    porTipo,
    porArea,
    entradas,
    loops,
    resumo,
    texto: linhas.join("\n"),
  };
}

/** Envia o relatório do dia para todos os destinatários ativos e registra o envio. */
export async function enviarRelatorioWhatsApp(data: string) {
  const { loadWhatsAppConfig, metaSendText } = await import("./whatsapp.server");

  const rel = await montarRelatorioDiario(data);

  const { data: dests } = await supabaseAdmin
    .from("dev_relatorio_destinatarios")
    .select("nome, telefone")
    .eq("ativo", true);
  const destinatarios = (dests ?? []) as unknown as Array<{ nome: string; telefone: string }>;

  if (!destinatarios.length) {
    await supabaseAdmin.from("dev_relatorio_envios").insert({
      data,
      status: "sem_destinatarios",
      destinatarios: 0,
      mensagem: rel.texto,
    } as never);
    return { enviados: 0, erros: ["Nenhum destinatário ativo cadastrado"], texto: rel.texto };
  }

  // Usa a configuração de WhatsApp ativa (qualquer clínica com número ativo).
  const { data: cfgs } = await supabaseAdmin
    .from("whatsapp_configs")
    .select("clinica_id")
    .eq("ativo", true)
    .limit(1);
  const clinicaId = ((cfgs ?? []) as Array<{ clinica_id: string }>)[0]?.clinica_id;
  const cfg = clinicaId ? await loadWhatsAppConfig(clinicaId) : null;

  if (!cfg?.phone_number_id || !cfg.access_token) {
    await supabaseAdmin.from("dev_relatorio_envios").insert({
      data,
      status: "erro",
      destinatarios: 0,
      mensagem: rel.texto,
      erro: "WhatsApp não configurado",
    } as never);
    return { enviados: 0, erros: ["WhatsApp não configurado"], texto: rel.texto };
  }

  const erros: string[] = [];
  let enviados = 0;
  for (const d of destinatarios) {
    const to = d.telefone.replace(/\D/g, "");
    if (!to) {
      erros.push(`${d.nome}: telefone inválido`);
      continue;
    }
    try {
      await metaSendText(cfg.phone_number_id, cfg.access_token, to, rel.texto);
      enviados++;
    } catch (e) {
      erros.push(`${d.nome}: ${(e as Error).message}`);
    }
  }

  await supabaseAdmin.from("dev_relatorio_envios").insert({
    data,
    status: erros.length ? (enviados ? "parcial" : "erro") : "ok",
    destinatarios: enviados,
    mensagem: rel.texto,
    erro: erros.length ? erros.join(" | ") : null,
  } as never);

  return { enviados, erros, texto: rel.texto };
}