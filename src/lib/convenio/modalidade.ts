/**
 * Detecção de convênio POR CADASTRO (contrato ativo), e não pelo texto da
 * descrição do lançamento.
 *
 * Regra de negócio (todas as clínicas): o paciente é considerado do convênio
 * quando está cadastrado num contrato ATIVO do Cartão Benefícios — como
 * titular ou como dependente ativo. A modalidade do convênio
 * (Cartão Consulta ou Cartão Desconto) vem do cadastro do convênio
 * (`cb_convenios.modalidade`) e é usada para escolher o repasse correto do
 * médico por serviço.
 *
 * O texto da descrição continua servindo apenas como último recurso, para
 * lançamentos antigos gravados antes desta mudança.
 */
import { supabase } from "@/integrations/supabase/client";
import {
  escolherContratoAtivo,
  LIMITE_CONTRATOS_CANDIDATOS,
} from "@/lib/convenio/escolher-contrato-ativo";

export type ModalidadeConvenio = "cartao_consulta" | "cartao_desconto";

export interface VinculoConvenio {
  contratoId: string;
  convenioId: string;
  convenioNome: string;
  modalidade: ModalidadeConvenio;
}

/** Mapa paciente_id -> vínculo de convênio ativo na clínica. */
export type MapaConvenioPaciente = Map<string, VinculoConvenio>;

/**
 * Tamanho da página do PostgREST. O servidor devolve no máximo 1000 linhas por
 * requisição, independentemente do `.limit()` pedido — um `.limit(20000)` volta
 * truncado e em silêncio.
 */
const PAGINA = 1000;

/**
 * Busca completa, de 1000 em 1000.
 *
 * `carregarMapaConvenioPacientes` pedia 20.000 contratos numa tacada só e
 * recebia 1.000. Com quase 1.900 contratos ativos, cerca de metade dos
 * pacientes de convênio ficava fora do mapa e era tratada como particular no
 * cálculo do repasse do médico (a coluna errada da grade de comissão).
 */
async function carregarPaginado<T>(
  montarQuery: (de: number, ate: number) => PromiseLike<{ data: unknown; error: unknown }>,
): Promise<T[]> {
  const out: T[] = [];
  for (let de = 0; ; de += PAGINA) {
    const { data, error } = await montarQuery(de, de + PAGINA - 1);
    if (error) break;
    const lote = (data ?? []) as T[];
    out.push(...lote);
    if (lote.length < PAGINA) break;
  }
  return out;
}

const normalizarModalidade = (v: unknown): ModalidadeConvenio =>
  v === "cartao_desconto" ? "cartao_desconto" : "cartao_consulta";

/**
 * Carrega, de uma vez, o vínculo de convênio ativo de todos os pacientes da
 * clínica (titulares e dependentes). Usado pelas telas que precisam decidir
 * repasse/cobrança em lote.
 */
export async function carregarMapaConvenioPacientes(
  clinicaId: string,
): Promise<MapaConvenioPaciente> {
  const mapa: MapaConvenioPaciente = new Map();
  if (!clinicaId) return mapa;

  const contratos = await carregarPaginado<Record<string, unknown>>((de, ate) =>
    supabase
      .from("contratos_assinatura")
      .select(
        "id, paciente_id, convenio_id, data_inicio, created_at, cb_convenios(nome, modalidade)",
      )
      .eq("clinica_id", clinicaId)
      .eq("status", "ativo")
      // Ordem fixa: sem ela o Postgres pode repetir ou pular linhas entre as
      // páginas, e o mapa sairia com buracos aleatórios a cada carregamento.
      // Ela serve à paginação, NÃO ao desempate — quem escolhe o contrato de
      // cada paciente é `escolherContratoAtivo`, mais abaixo.
      .order("id")
      .range(de, ate),
  );

  const porContrato = new Map<string, VinculoConvenio>();
  const linhaPorContrato = new Map<string, Record<string, unknown>>();
  // Candidatos por paciente, para desempatar depois com a mesma regra das
  // telas individuais. Antes o titular era gravado direto no mapa (o ÚLTIMO
  // contrato da página vencia) e o dependente só preenchia buraco (o PRIMEIRO
  // vencia) — nos dois casos, arbitrário.
  const candidatosTitular = new Map<string, Record<string, unknown>[]>();
  for (const c of contratos) {
    const convenio = c.cb_convenios as { nome?: string; modalidade?: string } | null;
    if (!c.convenio_id) continue;
    const vinculo: VinculoConvenio = {
      contratoId: String(c.id),
      convenioId: String(c.convenio_id),
      convenioNome: convenio?.nome ?? "Convênio",
      modalidade: normalizarModalidade(convenio?.modalidade),
    };
    porContrato.set(vinculo.contratoId, vinculo);
    linhaPorContrato.set(vinculo.contratoId, c);
    if (c.paciente_id) {
      const pid = String(c.paciente_id);
      const lista = candidatosTitular.get(pid);
      if (lista) lista.push(c);
      else candidatosTitular.set(pid, [c]);
    }
  }
  for (const [pid, lista] of candidatosTitular) {
    const escolhido = escolherContratoAtivo(lista);
    const v = escolhido ? porContrato.get(String(escolhido.id)) : null;
    if (v) mapa.set(pid, v);
  }

  const ids = Array.from(porContrato.keys());
  const candidatosDependente = new Map<string, Record<string, unknown>[]>();
  for (let i = 0; i < ids.length; i += 200) {
    const lote = ids.slice(i, i + 200);
    const deps = await carregarPaginado<{ contrato_id: string; paciente_id: string | null }>(
      (de, ate) =>
        supabase
          .from("contrato_dependentes")
          .select("contrato_id, paciente_id")
          .eq("ativo", true)
          .in("contrato_id", lote)
          .order("id")
          .range(de, ate),
    );
    for (const d of deps) {
      // Quem é titular de contrato ativo continua valendo pelo próprio
      // contrato, mesmo sendo dependente em outro.
      if (!d.paciente_id || mapa.has(d.paciente_id)) continue;
      const linha = linhaPorContrato.get(d.contrato_id);
      if (!linha) continue;
      const lista = candidatosDependente.get(d.paciente_id);
      if (lista) lista.push(linha);
      else candidatosDependente.set(d.paciente_id, [linha]);
    }
  }
  for (const [pid, lista] of candidatosDependente) {
    const escolhido = escolherContratoAtivo(lista);
    const v = escolhido ? porContrato.get(String(escolhido.id)) : null;
    if (v) mapa.set(pid, v);
  }
  return mapa;
}

/** Busca o vínculo de convênio ativo de UM paciente (titular ou dependente). */
export async function buscarVinculoConvenio(
  clinicaId: string,
  pacienteId: string | null | undefined,
): Promise<VinculoConvenio | null> {
  if (!clinicaId || !pacienteId) return null;

  // `.limit(1)` sem ordenação pegava um contrato ativo qualquer quando o
  // paciente tinha mais de um. Agora baixa os candidatos e desempata pela
  // mesma regra das outras telas: com convênio primeiro, depois o mais
  // recente. Sem isso, o repasse podia ser calculado pela modalidade de um
  // cartão e a cobrança feita pela tabela de outro.
  const { data: tit } = await supabase
    .from("contratos_assinatura")
    .select("id, convenio_id, data_inicio, created_at, cb_convenios(nome, modalidade)")
    .eq("clinica_id", clinicaId)
    .eq("status", "ativo")
    .eq("paciente_id", pacienteId)
    .order("data_inicio", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(LIMITE_CONTRATOS_CANDIDATOS);
  const linha = escolherContratoAtivo((tit ?? []) as Array<Record<string, unknown>>) as Record<
    string,
    unknown
  > | null;
  if (linha?.convenio_id) {
    const conv = linha.cb_convenios as { nome?: string; modalidade?: string } | null;
    return {
      contratoId: String(linha.id),
      convenioId: String(linha.convenio_id),
      convenioNome: conv?.nome ?? "Convênio",
      modalidade: normalizarModalidade(conv?.modalidade),
    };
  }

  const { data: deps } = await supabase
    .from("contrato_dependentes")
    .select(
      "contrato_id, contratos_assinatura!inner(id, clinica_id, status, convenio_id, data_inicio, created_at, cb_convenios(nome, modalidade))",
    )
    .eq("paciente_id", pacienteId)
    .eq("ativo", true)
    .limit(LIMITE_CONTRATOS_CANDIDATOS);
  // Antes devolvia o PRIMEIRO da lista que servisse; agora filtra todos os
  // que servem e deixa o desempate decidir qual vale.
  const candidatos = ((deps ?? []) as Array<Record<string, unknown>>)
    .map((d) => d.contratos_assinatura as Record<string, unknown> | null)
    .filter(
      (c): c is Record<string, unknown> =>
        !!c && c.clinica_id === clinicaId && c.status === "ativo" && !!c.convenio_id,
    );
  const escolhido = escolherContratoAtivo(candidatos);
  if (escolhido) {
    const conv = escolhido.cb_convenios as { nome?: string; modalidade?: string } | null;
    return {
      contratoId: String(escolhido.id),
      convenioId: String(escolhido.convenio_id),
      convenioNome: conv?.nome ?? "Convênio",
      modalidade: normalizarModalidade(conv?.modalidade),
    };
  }
  return null;
}

/**
 * Resolve a modalidade a aplicar num lançamento, na ordem:
 * 1) modalidade gravada no próprio lançamento (fonte da verdade histórica);
 * 2) contrato ativo do paciente (cadastro);
 * 3) null — quem chama pode então cair no fallback pelo texto.
 */
export function resolverModalidade(params: {
  modalidadeLancamento?: string | null;
  pacienteId?: string | null;
  mapa?: MapaConvenioPaciente | null;
}): ModalidadeConvenio | null {
  const { modalidadeLancamento, pacienteId, mapa } = params;
  if (modalidadeLancamento === "cartao_consulta" || modalidadeLancamento === "cartao_desconto") {
    return modalidadeLancamento;
  }
  if (pacienteId && mapa) return mapa.get(pacienteId)?.modalidade ?? null;
  return null;
}

/**
 * Carimba nos lançamentos financeiros dos agendamentos informados o convênio,
 * o contrato e a modalidade do paciente. Assim o repasse e os relatórios
 * passam a identificar o atendimento de convênio de forma estrutural, sem
 * depender do texto da descrição.
 */
export async function carimbarConvenioNosLancamentos(
  clinicaId: string,
  agendamentoIds: Array<string | null | undefined>,
): Promise<void> {
  const ids = agendamentoIds.filter(Boolean) as string[];
  if (!clinicaId || !ids.length) return;
  try {
    const { data: ags } = await supabase
      .from("agendamentos")
      .select("id, paciente_id")
      .eq("clinica_id", clinicaId)
      .in("id", ids);
    for (const ag of (ags ?? []) as Array<{ id: string; paciente_id: string | null }>) {
      const vinculo = await buscarVinculoConvenio(clinicaId, ag.paciente_id);
      if (!vinculo) continue;
      await supabase
        .from("fin_lancamentos")
        .update({
          convenio_id: vinculo.convenioId,
          contrato_id: vinculo.contratoId,
          convenio_modalidade: vinculo.modalidade,
        })
        .eq("clinica_id", clinicaId)
        .eq("agendamento_id", ag.id)
        .is("convenio_modalidade", null);
    }
  } catch {
    // Carimbo é complementar: nunca deve quebrar o fluxo de pagamento.
  }
}
