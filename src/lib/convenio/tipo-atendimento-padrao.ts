/**
 * Regra ÚNICA que decide se um atendimento nasce "convenio" ou "particular".
 *
 * O campo `agendamentos.tipo_atendimento` tem DEFAULT 'particular' no banco.
 * Quem não preenche o campo grava "Particular" — inclusive para paciente com
 * Cartão Benefícios ativo e em dia. A tela principal da Agenda já resolvia isso
 * com uma cópia desta lógica escrita direto dentro do componente
 * (`app.agenda.tsx`), mas as outras portas de entrada não tinham nada:
 *
 *   - Atendimento múltiplo — item nascia fixo em "particular";
 *   - Orçamento → Agendamento — a tela não enviava o campo e a função
 *     `converter_item_agendamento` caía no default;
 *   - Agendamento online/público — `agendar_online` e `agendar_publico` nem
 *     mencionavam a coluna.
 *
 * Levantamento de 20/08/2026: de 1.600 agendamentos de paciente com contrato
 * ativo, 1.457 estavam marcados "Particular", sendo 772 com o contrato em dia
 * (321 pacientes). O valor cobrado estava certo — o caixa aplica o desconto do
 * cartão mesmo com o atendimento marcado "Particular" —, o que quebrava era a
 * classificação e os relatórios.
 *
 * Esta função é a versão compartilhada da regra. A mesma decisão existe também
 * em SQL (`public.tipo_atendimento_padrao`), usada pelas funções do banco, para
 * que nenhum caminho dependa de o frontend lembrar de preencher o campo.
 */
import { supabase } from "@/integrations/supabase/client";
import { hojeLocalISODate } from "@/lib/convenio/info-convenio-paciente";

/**
 * Dias corridos de tolerância depois do vencimento da mensalidade. Dentro da
 * tolerância o convênio segue valendo — mesmo número usado por
 * `obterInfoConvenioPaciente` e pela tela da Agenda. Mudar aqui muda em todas
 * as portas de entrada de uma vez.
 */
export const DIAS_TOLERANCIA_MENSALIDADE = 5;

export type TipoAtendimentoPadrao = {
  tipo: "particular" | "convenio";
  /** Contrato ativo encontrado, quando existe (titular ou dependente). */
  contratoId: string | null;
  /** Nome do convênio para mostrar na tela. */
  convenioNome: string | null;
  /**
   * Contrato ativo que está sem convênio vinculado (`convenio_id` nulo). São
   * 245 contratos hoje. Eles CONTAM como convênio — o paciente pagou o cartão
   * —, mas o cadastro precisa de correção, então a tela avisa.
   */
  semConvenio: boolean;
  /** Parcelas vencidas além da tolerância. Maior que zero força "particular". */
  qtdAtrasadas: number;
};

const PARTICULAR: TipoAtendimentoPadrao = {
  tipo: "particular",
  contratoId: null,
  convenioNome: null,
  semConvenio: false,
  qtdAtrasadas: 0,
};

type LinhaContrato = {
  id?: unknown;
  convenio_id?: unknown;
  cb_convenios?: { nome?: string } | null;
};

const daLinha = (c: LinhaContrato) => ({
  id: String(c.id),
  convenioNome: c.cb_convenios?.nome ?? "Convênio",
  semConvenio: !c.convenio_id,
});

/**
 * Localiza o contrato ativo do paciente na clínica, como titular ou como
 * dependente ativo.
 *
 * Diferença importante em relação a `buscarVinculoConvenio` (de
 * `lib/convenio/modalidade.ts`): aquela função DESCARTA contratos com
 * `convenio_id` nulo, porque o objetivo dela é descobrir a modalidade do
 * convênio para calcular repasse. Para decidir particular × convênio isso é
 * errado — o paciente tem cartão pago mesmo que falte vincular o convênio no
 * cadastro. Eram 100 dos 772 atendimentos classificados errado.
 */
async function buscarContratoAtivo(clinicaId: string, pacienteId: string) {
  const { data: titulares } = await supabase
    .from("contratos_assinatura")
    .select("id, convenio_id, cb_convenios(nome)")
    .eq("clinica_id", clinicaId)
    .eq("status", "ativo")
    .eq("paciente_id", pacienteId)
    .limit(5);

  const listaTitular = ((titulares ?? []) as LinhaContrato[]).filter(Boolean);
  // Preferência por um contrato com convênio vinculado: se o paciente tiver
  // mais de um, o que está com o cadastro completo dá o nome correto na tela.
  const escolhido = listaTitular.find((c) => c.convenio_id) ?? listaTitular[0] ?? null;
  let contrato = escolhido ? daLinha(escolhido) : null;
  if (contrato && !contrato.semConvenio) return contrato;

  const { data: deps } = await supabase
    .from("contrato_dependentes")
    .select("contratos_assinatura!inner(id, clinica_id, status, convenio_id, cb_convenios(nome))")
    .eq("paciente_id", pacienteId)
    .eq("ativo", true)
    .limit(5);

  const ativos = (
    (deps ?? []) as Array<{
      contratos_assinatura?: LinhaContrato & { clinica_id?: unknown; status?: unknown };
    }>
  )
    .map((d) => d.contratos_assinatura)
    .filter(
      (c): c is LinhaContrato & { clinica_id: unknown; status: unknown } =>
        !!c && c.clinica_id === clinicaId && c.status === "ativo",
    );
  const candidato = ativos.find((c) => c.convenio_id) ?? ativos[0] ?? null;
  if (candidato) contrato = daLinha(candidato);
  return contrato;
}

/**
 * Decide o tipo do atendimento para um paciente.
 *
 * Nunca lança: qualquer falha de rede devolve "particular", que é o valor que o
 * banco gravaria de qualquer forma. Marcar convênio por engano custa dinheiro
 * (desconto indevido); manter particular só custa uma correção de rótulo.
 */
export async function detectarTipoAtendimentoPadrao(
  clinicaId: string | null | undefined,
  pacienteId: string | null | undefined,
): Promise<TipoAtendimentoPadrao> {
  if (!clinicaId || !pacienteId) return PARTICULAR;
  try {
    const contrato = await buscarContratoAtivo(clinicaId, pacienteId);
    if (!contrato) return PARTICULAR;

    const hojeStr = hojeLocalISODate();
    const { data: mens } = await supabase
      .from("contrato_mensalidades")
      .select("vencimento")
      .eq("contrato_id", contrato.id)
      .in("status", ["pendente", "aberto", "atrasado"])
      .lte("vencimento", hojeStr);

    const hojeMs = new Date(`${hojeStr}T00:00:00`).getTime();
    const qtdAtrasadas = ((mens ?? []) as Array<{ vencimento: string }>).filter((m) => {
      const dias = Math.floor(
        (hojeMs - new Date(`${String(m.vencimento)}T00:00:00`).getTime()) / 86400000,
      );
      return dias > DIAS_TOLERANCIA_MENSALIDADE;
    }).length;

    return {
      tipo: qtdAtrasadas === 0 ? "convenio" : "particular",
      contratoId: contrato.id,
      convenioNome: contrato.convenioNome,
      semConvenio: contrato.semConvenio,
      qtdAtrasadas,
    };
  } catch {
    return PARTICULAR;
  }
}
