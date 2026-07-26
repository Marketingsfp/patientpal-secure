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

export type ModalidadeConvenio = "cartao_consulta" | "cartao_desconto";

export interface VinculoConvenio {
  contratoId: string;
  convenioId: string;
  convenioNome: string;
  modalidade: ModalidadeConvenio;
}

/** Mapa paciente_id -> vínculo de convênio ativo na clínica. */
export type MapaConvenioPaciente = Map<string, VinculoConvenio>;

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

  const { data: contratos } = await supabase
    .from("contratos_assinatura")
    .select("id, paciente_id, convenio_id, cb_convenios(nome, modalidade)")
    .eq("clinica_id", clinicaId)
    .eq("status", "ativo")
    .limit(20000);

  const porContrato = new Map<string, VinculoConvenio>();
  for (const c of (contratos ?? []) as Array<Record<string, unknown>>) {
    const convenio = c.cb_convenios as { nome?: string; modalidade?: string } | null;
    if (!c.convenio_id) continue;
    const vinculo: VinculoConvenio = {
      contratoId: String(c.id),
      convenioId: String(c.convenio_id),
      convenioNome: convenio?.nome ?? "Convênio",
      modalidade: normalizarModalidade(convenio?.modalidade),
    };
    porContrato.set(vinculo.contratoId, vinculo);
    if (c.paciente_id) mapa.set(String(c.paciente_id), vinculo);
  }

  const ids = Array.from(porContrato.keys());
  for (let i = 0; i < ids.length; i += 200) {
    const lote = ids.slice(i, i + 200);
    const { data: deps } = await supabase
      .from("contrato_dependentes")
      .select("contrato_id, paciente_id")
      .eq("ativo", true)
      .in("contrato_id", lote);
    for (const d of (deps ?? []) as Array<{ contrato_id: string; paciente_id: string | null }>) {
      const v = porContrato.get(d.contrato_id);
      if (v && d.paciente_id && !mapa.has(d.paciente_id)) mapa.set(d.paciente_id, v);
    }
  }
  return mapa;
}

/** Busca o vínculo de convênio ativo de UM paciente (titular ou dependente). */
export async function buscarVinculoConvenio(
  clinicaId: string,
  pacienteId: string | null | undefined,
): Promise<VinculoConvenio | null> {
  if (!clinicaId || !pacienteId) return null;

  const { data: tit } = await supabase
    .from("contratos_assinatura")
    .select("id, convenio_id, cb_convenios(nome, modalidade)")
    .eq("clinica_id", clinicaId)
    .eq("status", "ativo")
    .eq("paciente_id", pacienteId)
    .limit(1);
  const linha = ((tit ?? [])[0] ?? null) as Record<string, unknown> | null;
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
      "contrato_id, contratos_assinatura!inner(id, clinica_id, status, convenio_id, cb_convenios(nome, modalidade))",
    )
    .eq("paciente_id", pacienteId)
    .eq("ativo", true)
    .limit(5);
  for (const d of (deps ?? []) as Array<Record<string, unknown>>) {
    const c = d.contratos_assinatura as Record<string, unknown> | null;
    if (!c) continue;
    if (c.clinica_id !== clinicaId || c.status !== "ativo" || !c.convenio_id) continue;
    const conv = c.cb_convenios as { nome?: string; modalidade?: string } | null;
    return {
      contratoId: String(c.id),
      convenioId: String(c.convenio_id),
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
