/**
 * Passos da bateria por profissional no executor da carga (servidor).
 *
 * Nunca reinicia o lead: a regra da homologação só permite isso no início da
 * carga. Ao fim de cada cenário, a vaga ocupada pelo teste volta a ficar livre,
 * com os mesmos campos que a agenda usa para uma vaga limpa.
 */
import type { CargaPersistida } from "./carga-controle";
import {
  avaliarCenarioBateria,
  consultasDoCatalogo,
  itemBateria,
  type CenarioBateria,
  type ConfigBateria,
  type ConsultaCatalogo,
  type FatosCenarioBateria,
  type ItemBateria,
  type ProfissionalCatalogo,
} from "./carga-bateria";
import type { RespostaPacienteLuna, TurnoConversaLuna } from "./carga-redacao-luna.server";

export type PacienteLuna = (
  cenario: CenarioBateria,
  historico: TurnoConversaLuna[],
) => Promise<RespostaPacienteLuna>;

const ORIGEM_TESTE = "nina_homologacao";
const pad = (n: number) => String(n).padStart(2, "0");

/** Desfaz exatamente o que o agendamento da Nina grava sobre a vaga (paciente-tools.server). */
export const VAGA_LIVRE = {
  paciente_id: null,
  paciente_nome: "DISPONIVEL",
  status: "agendado",
  procedimento: null,
  observacoes: null,
  data_pagamento: null,
  orcamento_id: null,
  tipo_atendimento: "particular",
  forma_pagamento_prevista: null,
  is_mock_data: false,
  origem_integracao: null,
  id_externo: null,
} as const;

function itensDaCarga(carga: CargaPersistida): ItemBateria[] {
  return (Array.isArray(carga.plano) ? carga.plano : [])
    .map(itemBateria)
    .filter((i): i is ItemBateria => Boolean(i));
}

function cenarioDoItem(bateria: ConfigBateria, item: ItemBateria): CenarioBateria {
  const cenario = bateria.cenarios.find((c) => c.id === item.cenarioId);
  if (!cenario) throw new Error(`Lead ${pad(item.leadIndice)}: cenário não encontrado na bateria.`);
  return cenario;
}

/** Resultados já gravados das mensagens deste cenário, na ordem da conversa. */
function turnosGravados(
  carga: CargaPersistida,
  item: ItemBateria,
  amostras: any[],
  antesDe?: number,
) {
  return itensDaCarga(carga)
    .filter(
      (p) =>
        p.cenarioId === item.cenarioId &&
        p.tipo === "turno" &&
        (antesDe === undefined || p.ordemNoCenario < antesDe),
    )
    .sort((a, b) => a.ordemNoCenario - b.ordemNoCenario)
    .map((p) => amostras.find((a) => a.indice === p.indice))
    .filter(Boolean) as any[];
}

async function historicoConversa(
  admin: any,
  clinicaId: string,
  conversaId: string,
): Promise<TurnoConversaLuna[]> {
  const { data, error } = await admin
    .from("whatsapp_mensagens")
    .select("direction, body, enviada_por, created_at")
    .eq("clinica_id", clinicaId)
    .eq("conversa_id", conversaId)
    .order("created_at", { ascending: true })
    .limit(80);
  if (error) throw new Error("Não foi possível ler a conversa do cenário.");
  return ((data ?? []) as any[])
    .filter((m) => String(m.body ?? "").trim() && m.enviada_por !== "sistema")
    .map((m) => ({
      autor: m.direction === "out" ? ("nina" as const) : ("paciente" as const),
      texto: String(m.body),
    }));
}

export type DecisaoTurnoBateria =
  | { tipo: "aguardar"; ms: number }
  | { tipo: "dispensar"; resultado: Record<string, unknown> }
  | { tipo: "enviar"; texto: string; resultado: Record<string, unknown> };

/** Encerra o cenário cedo quando já terminou; senão, a Luna escreve a próxima mensagem. */
export async function decidirTurnoBateria(e: {
  admin: any;
  carga: CargaPersistida;
  bateria: ConfigBateria;
  item: ItemBateria;
  amostras: any[];
  lead: { conversa_id: string | null; resolvido_em: string | null };
  agora: number;
  paciente: PacienteLuna;
}): Promise<DecisaoTurnoBateria> {
  const cenario = cenarioDoItem(e.bateria, e.item);
  const base = { tipo: "turno", cenarioId: cenario.id };
  const anteriores = turnosGravados(e.carga, e.item, e.amostras, e.item.ordemNoCenario);
  const ultima = anteriores.at(-1);
  const fim = anteriores.some((a) => a.status === "dispensado")
    ? "cenario_encerrado"
    : ultima && ["erro", "timeout"].includes(ultima.status)
      ? "erro_tecnico"
      : ultima && (ultima.status === "cancelado" || ultima.resultado?.transferida === true)
        ? "encaminhado"
        : null;
  if (fim) return { tipo: "dispensar", resultado: { ...base, fim } };
  if (e.item.ordemNoCenario === 0) {
    // Primeira mensagem só numa conversa nova, e só depois da espera após o reinício da carga.
    if (e.lead.conversa_id)
      throw new Error(
        `Lead ${pad(e.item.leadIndice)}: a conversa já estava aberta antes da primeira mensagem da bateria. Inicie um novo teste.`,
      );
    const reinicio = Date.parse(e.lead.resolvido_em ?? "");
    const falta = Number.isFinite(reinicio)
      ? reinicio + e.bateria.esperaAposReinicioMs - e.agora
      : 0;
    if (falta > 0) return { tipo: "aguardar", ms: falta };
  }
  const historico = e.lead.conversa_id
    ? await historicoConversa(e.admin, e.carga.clinica_id, e.lead.conversa_id)
    : [];
  const r = await e.paciente(cenario, historico);
  const luna = { entrada: r.tokens.entrada, saida: r.tokens.saida };
  if (r.acao === "encerrar")
    return { tipo: "dispensar", resultado: { ...base, fim: r.motivo, luna } };
  return { tipo: "enviar", texto: r.texto, resultado: { ...base, luna } };
}

async function agendamentosDaConversa(admin: any, clinicaId: string, conversaId: string) {
  const { data, error } = await admin
    .from("agendamentos")
    .select("id, medico_id, inicio, procedimento, paciente_nome")
    .eq("clinica_id", clinicaId)
    .eq("origem_integracao", ORIGEM_TESTE)
    .eq("is_mock_data", true)
    .like("id_externo", `${conversaId}|%`);
  if (error) throw new Error("Não foi possível conferir os agendamentos do cenário.");
  return (data ?? []) as {
    id: string;
    medico_id: string | null;
    inicio: string | null;
    procedimento: string | null;
  }[];
}

/** Fatos lidos do banco antes de devolver a vaga; nada aqui altera dados. */
export async function verificarCenarioBateria(e: {
  admin: any;
  carga: CargaPersistida;
  bateria: ConfigBateria;
  item: ItemBateria;
  amostras: any[];
}): Promise<Record<string, unknown>> {
  const cenario = cenarioDoItem(e.bateria, e.item);
  const turnos = turnosGravados(e.carga, e.item, e.amostras);
  const enviados = turnos.filter((a) => a.status !== "dispensado");
  const conversaId: string | null = turnos.find((a) => a.conversa_id)?.conversa_id ?? null;
  const fatos: FatosCenarioBateria = {
    respostasNina: [],
    mensagensPaciente: [],
    agendamentos: [],
    encaminhada: turnos.some((a) => a.status === "cancelado" || a.resultado?.transferida === true),
    errosTecnicos: turnos.filter((a) => ["erro", "timeout"].includes(a.status)).length,
    fim:
      turnos.find((a) => a.status === "dispensado")?.resultado?.fim ??
      (enviados.length ? "limite_de_mensagens" : null),
    latenciasMs: enviados
      .filter((a) => a.status === "ok" && Number.isFinite(a.latencia_ms))
      .map((a) => Number(a.latencia_ms)),
  };
  let agendamentos: Awaited<ReturnType<typeof agendamentosDaConversa>> = [];
  if (conversaId) {
    const historico = await historicoConversa(e.admin, e.carga.clinica_id, conversaId);
    fatos.respostasNina = historico.filter((t) => t.autor === "nina").map((t) => t.texto);
    fatos.mensagensPaciente = historico.filter((t) => t.autor === "paciente").map((t) => t.texto);
    agendamentos = await agendamentosDaConversa(e.admin, e.carga.clinica_id, conversaId);
    fatos.agendamentos = agendamentos.map((a) => ({
      medicoId: a.medico_id,
      inicio: a.inicio,
      procedimento: a.procedimento,
    }));
    if (!fatos.encaminhada) {
      const { data, error } = await e.admin
        .from("atend_conversa_eventos")
        .select("id")
        .eq("conversa_id", conversaId)
        .eq("evento", "HANDOFF_SOLICITADO")
        .limit(1);
      if (error) throw new Error("Não foi possível conferir o encaminhamento do cenário.");
      fatos.encaminhada = Boolean(data?.length);
    }
  }
  const avaliacao = avaliarCenarioBateria(cenario, fatos);
  const media = fatos.latenciasMs.length
    ? Math.round(fatos.latenciasMs.reduce((s, v) => s + v, 0) / fatos.latenciasMs.length)
    : null;
  return {
    status: "verificado",
    conversa_id: conversaId,
    erro: null,
    mensagem: `${avaliacao.resultado}: ${cenario.titulo}`.slice(0, 300),
    resultado: {
      tipo: "verificar",
      cenarioId: cenario.id,
      avaliacao,
      agendamentos: agendamentos.map((a) => ({
        id: a.id,
        medicoId: a.medico_id,
        inicio: a.inicio,
        procedimento: a.procedimento,
      })),
      encaminhada: fatos.encaminhada,
      errosTecnicos: fatos.errosTecnicos,
      fim: fatos.fim,
      mensagensEnviadas: enviados.length,
      latenciaMediaMs: media,
    },
  };
}

/** Só alcança agendamentos de teste desta conversa; a vaga volta a DISPONIVEL (sem acento, como o agendar da Nina exige), nada é apagado. */
export async function devolverVagasDaConversa(
  admin: any,
  clinicaId: string,
  conversaId: string,
): Promise<{ devolvidas: number; pendentes: number }> {
  const alvo = await agendamentosDaConversa(admin, clinicaId, conversaId);
  if (!alvo.length) return { devolvidas: 0, pendentes: 0 };
  const { data, error } = await admin
    .from("agendamentos")
    .update(VAGA_LIVRE)
    .eq("clinica_id", clinicaId)
    .eq("origem_integracao", ORIGEM_TESTE)
    .eq("is_mock_data", true)
    .like("id_externo", `${conversaId}|%`)
    .like("paciente_nome", "[TESTE NINA]%")
    .select("id");
  if (error) throw new Error(`Não foi possível devolver a vaga de teste: ${error.message}`);
  const restantes = await agendamentosDaConversa(admin, clinicaId, conversaId);
  return { devolvidas: (data ?? []).length, pendentes: restantes.length };
}

export async function devolverCenarioBateria(e: {
  admin: any;
  carga: CargaPersistida;
  bateria: ConfigBateria;
  item: ItemBateria;
  amostras: any[];
}): Promise<Record<string, unknown>> {
  const cenario = cenarioDoItem(e.bateria, e.item);
  const conversaId: string | null =
    turnosGravados(e.carga, e.item, e.amostras).find((a) => a.conversa_id)?.conversa_id ?? null;
  const r = conversaId
    ? await devolverVagasDaConversa(e.admin, e.carga.clinica_id, conversaId)
    : { devolvidas: 0, pendentes: 0 };
  // Parar é mais seguro do que seguir ocupando horários reais da agenda.
  if (r.pendentes)
    throw new Error(
      `Lead ${pad(e.item.leadIndice)}: ${r.pendentes} vaga(s) de teste não voltaram a ficar livres. O teste foi interrompido; use "Devolver vagas" no relatório.`,
    );
  return {
    status: "devolvido",
    conversa_id: conversaId,
    erro: null,
    mensagem: `${r.devolvidas} vaga(s) devolvida(s): ${cenario.titulo}`.slice(0, 300),
    resultado: { tipo: "devolver", cenarioId: cenario.id, vagasDevolvidas: r.devolvidas },
  };
}

async function conversasDaCarga(admin: any, carga: CargaPersistida): Promise<string[]> {
  const { data, error } = await admin
    .from("nina_teste_carga_amostras")
    .select("conversa_id")
    .eq("clinica_id", carga.clinica_id)
    .eq("carga_id", carga.id);
  if (error) throw new Error("Não foi possível ler as conversas do teste.");
  return [...new Set(((data ?? []) as any[]).map((a) => a.conversa_id).filter(Boolean))];
}

/** Todas as conversas do teste: usado ao encerrar antes do fim e pelo botão do relatório. */
export async function devolverVagasBateria(admin: any, carga: CargaPersistida) {
  const conversas = await conversasDaCarga(admin, carga);
  let devolvidas = 0;
  let pendentes = 0;
  for (const conversaId of conversas) {
    const r = await devolverVagasDaConversa(admin, carga.clinica_id, conversaId);
    devolvidas += r.devolvidas;
    pendentes += r.pendentes;
  }
  return { conversas: conversas.length, devolvidas, pendentes };
}

/** Vagas ainda ocupadas por agendamentos de teste das conversas do teste (só leitura). */
export async function vagasPendentesBateria(admin: any, carga: CargaPersistida) {
  let pendentes = 0;
  for (const conversaId of await conversasDaCarga(admin, carga))
    pendentes += (await agendamentosDaConversa(admin, carga.clinica_id, conversaId)).length;
  return pendentes;
}

export async function consultasPublicadasBateria(clinicaId: string): Promise<ConsultaCatalogo[]> {
  const { lerPublicados, COLUNAS_PROFISSIONAL } = await import("./catalogo-turno.server");
  const profissionais = await lerPublicados<ProfissionalCatalogo>(
    "nina_cat_profissionais",
    `${COLUNAS_PROFISSIONAL}, medico_id`,
    clinicaId,
  );
  return consultasDoCatalogo(profissionais);
}

/** Vagas livres por médico na janela da previsão (contagem, sem ler pacientes). */
export async function vagasPorMedicoBateria(
  admin: any,
  clinicaId: string,
  medicoIds: string[],
  dias: number,
  agora = Date.now(),
): Promise<Record<string, number | null>> {
  const inicio = new Date(agora).toISOString();
  const fim = new Date(agora + dias * 86_400_000).toISOString();
  const resultado: Record<string, number | null> = {};
  const ids = [...new Set(medicoIds)];
  for (let i = 0; i < ids.length; i += 8)
    await Promise.all(
      ids.slice(i, i + 8).map(async (medicoId) => {
        const { count, error } = await admin
          .from("agendamentos")
          .select("id", { count: "exact", head: true })
          .eq("clinica_id", clinicaId)
          .eq("medico_id", medicoId)
          .in("paciente_nome", ["DISPONÍVEL", "DISPONIVEL"])
          .gte("inicio", inicio)
          .lt("inicio", fim);
        resultado[medicoId] = error ? null : (count ?? 0);
      }),
    );
  return resultado;
}

/** Último resultado de cada profissional nas baterias anteriores, para montar o próximo lote. */
export async function resultadosAnterioresBateria(admin: any, clinicaId: string) {
  const { data: cargas, error } = await admin
    .from("nina_teste_carga")
    .select("id, created_at, config")
    .eq("clinica_id", clinicaId)
    .not("config->_bateria", "is", null)
    .order("created_at", { ascending: false })
    .limit(30);
  if (error || !cargas?.length) return {};
  const { data: amostras } = await admin
    .from("nina_teste_carga_amostras")
    .select("carga_id, resultado, created_at")
    .eq("clinica_id", clinicaId)
    .eq("status", "verificado")
    .in(
      "carga_id",
      (cargas as any[]).map((c) => c.id),
    );
  const porProfissional: Record<string, { em: string; resultado: string }> = {};
  for (const a of ((amostras ?? []) as any[]).sort((x, y) =>
    String(y.created_at).localeCompare(String(x.created_at)),
  )) {
    const carga = (cargas as any[]).find((c) => c.id === a.carga_id);
    const cenario = carga?.config?._bateria?.cenarios?.find(
      (c: any) => c.id === a.resultado?.cenarioId,
    );
    if (cenario && !porProfissional[cenario.profissionalId])
      porProfissional[cenario.profissionalId] = {
        em: a.created_at,
        resultado: a.resultado?.avaliacao?.resultado ?? "inconclusivo",
      };
  }
  return porProfissional;
}
