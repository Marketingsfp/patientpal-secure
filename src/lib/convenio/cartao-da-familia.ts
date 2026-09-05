/**
 * Aviso de "existe cartão pago na família, mas este paciente não está nele".
 *
 * O caso que motivou isto (05/09/2026, apurado na base de produção): a esposa
 * chegou para consulta e a recepção viu o valor particular cheio. O marido
 * tinha o CARTÃO CONSULTA + SEGUROS pago em dia, mas ela não constava como
 * dependente desse contrato — constava como titular de um SEGUNDO contrato da
 * mesma família, com as parcelas em aberto desde julho. O sistema respondeu
 * certo (contrato em atraso = Particular), só que a atendente não tinha como
 * saber disso olhando a tela: para ela o paciente "tinha cartão" e o desconto
 * havia sumido. O acerto levou três tentativas de salvar o contrato e a
 * inclusão manual de duas dependentes, tudo com o paciente esperando no balcão.
 *
 * O aviso não muda preço nenhum e não desbloqueia benefício: a cobrança
 * continua saindo Particular enquanto o cadastro estiver como está. Ele existe
 * para transformar um "o desconto sumiu" em "falta incluir esta pessoa no
 * cartão do fulano", que a recepção resolve na hora.
 *
 * Quem é "família" aqui é decidido pelos dados, não por sobrenome: são as
 * pessoas que já dividem algum contrato com o paciente — o titular do cartão em
 * que ele é (ou foi) dependente, e os dependentes do cartão em que ele é
 * titular. Sobrenome igual não vira vínculo: numa base com centenas de milhares
 * de pacientes isso encheria a tela de aviso errado.
 */
import { supabase } from "@/integrations/supabase/client";
import { DIAS_TOLERANCIA_MENSALIDADE } from "@/lib/cb-regras";
import { hojeLocalISODate } from "@/lib/convenio/info-convenio-paciente";

/** Teto de linhas por consulta — a tela não pode travar procurando parentesco. */
const LIMITE_BUSCA = 20;

export interface CartaoDaFamilia {
  contratoId: string;
  /** Número impresso no cartão, quando o contrato tem um. */
  numero: number | null;
  titularNome: string;
  convenioNome: string;
}

/** Uma parcela vista pela régua de atraso: só o vencimento importa. */
export interface ParcelaEmAberto {
  vencimento: string;
}

/**
 * Contrato candidato a "cartão pago da família", já com as parcelas em aberto
 * que a consulta trouxe. Separado da busca no banco para poder ser testado.
 */
export interface CandidatoFamilia extends CartaoDaFamilia {
  parcelasEmAberto: ParcelaEmAberto[];
}

/**
 * Um contrato está em dia quando nenhuma parcela em aberto passou da tolerância
 * de 5 dias corridos. É a MESMA régua de `obterInfoConvenioPaciente` e de
 * `detectarTipoAtendimentoPadrao` — se divergisse, a tela prometeria um
 * desconto que o caixa não daria.
 *
 * As datas são comparadas como texto ISO de propósito: `new Date("2026-08-10")`
 * é lido como UTC e, no Brasil, volta como dia 9.
 */
export function contratoEmDia(
  parcelasEmAberto: ParcelaEmAberto[],
  hojeIso: string,
  diasTolerancia: number = DIAS_TOLERANCIA_MENSALIDADE,
): boolean {
  const corte = new Date(`${hojeIso}T00:00:00`);
  corte.setDate(corte.getDate() - diasTolerancia);
  const pad = (n: number) => String(n).padStart(2, "0");
  const corteIso = `${corte.getFullYear()}-${pad(corte.getMonth() + 1)}-${pad(corte.getDate())}`;
  return !parcelasEmAberto.some((p) => String(p.vencimento).slice(0, 10) < corteIso);
}

/**
 * Entre os cartões da família, escolhe o que vale a pena mostrar: o primeiro
 * que está em dia. Devolve `null` quando a família inteira está em atraso —
 * nesse caso não há nada a sugerir, o valor cheio é o certo para todo mundo.
 */
export function escolherCartaoDaFamilia(
  candidatos: CandidatoFamilia[],
  hojeIso: string,
): CartaoDaFamilia | null {
  const emDia = candidatos.find((c) => contratoEmDia(c.parcelasEmAberto, hojeIso));
  if (!emDia) return null;
  const { contratoId, numero, titularNome, convenioNome } = emDia;
  return { contratoId, numero, titularNome, convenioNome };
}

/** Ids dos contratos em que o paciente aparece, como titular ou dependente. */
async function contratosDoPaciente(clinicaId: string, pacienteId: string): Promise<string[]> {
  const [{ data: comoTitular }, { data: comoDependente }] = await Promise.all([
    supabase
      .from("contratos_assinatura")
      .select("id")
      .eq("clinica_id", clinicaId)
      .eq("paciente_id", pacienteId)
      .limit(LIMITE_BUSCA),
    supabase
      .from("contrato_dependentes")
      .select("contrato_id")
      .eq("paciente_id", pacienteId)
      .limit(LIMITE_BUSCA),
  ]);
  const ids = [
    ...((comoTitular ?? []) as Array<{ id: string }>).map((c) => c.id),
    ...((comoDependente ?? []) as Array<{ contrato_id: string }>).map((d) => d.contrato_id),
  ];
  return Array.from(new Set(ids.filter(Boolean)));
}

/**
 * Pacientes que dividem algum contrato com ele — o titular desses contratos e
 * os dependentes ativos deles. O próprio paciente sai da lista.
 */
async function pessoasDaFamilia(
  clinicaId: string,
  pacienteId: string,
  contratoIds: string[],
): Promise<string[]> {
  if (contratoIds.length === 0) return [];
  const [{ data: titulares }, { data: deps }] = await Promise.all([
    supabase
      .from("contratos_assinatura")
      .select("paciente_id")
      .eq("clinica_id", clinicaId)
      .in("id", contratoIds)
      .limit(LIMITE_BUSCA),
    supabase
      .from("contrato_dependentes")
      .select("paciente_id")
      .in("contrato_id", contratoIds)
      .eq("ativo", true)
      .limit(LIMITE_BUSCA * 2),
  ]);
  const ids = [
    ...((titulares ?? []) as Array<{ paciente_id: string | null }>).map((t) => t.paciente_id),
    ...((deps ?? []) as Array<{ paciente_id: string | null }>).map((d) => d.paciente_id),
  ];
  return Array.from(new Set(ids.filter((id): id is string => !!id && id !== pacienteId)));
}

/**
 * Procura um cartão ativo, com convênio vinculado e em dia, pertencente a
 * alguém da família do paciente — e do qual o paciente NÃO é beneficiário.
 *
 * Devolve `null` (e a tela não mostra nada) sempre que o aviso não teria o que
 * acrescentar: sem família cadastrada, sem cartão em dia por perto, ou quando o
 * paciente já é beneficiário do cartão encontrado.
 *
 * Nunca lança. É um aviso informativo — falha de rede não pode impedir a
 * recepção de marcar o atendimento.
 */
export async function buscarCartaoPagoDaFamilia(params: {
  clinicaId: string | null | undefined;
  pacienteId: string | null | undefined;
}): Promise<CartaoDaFamilia | null> {
  const { clinicaId, pacienteId } = params;
  if (!clinicaId || !pacienteId) return null;
  try {
    const contratoIds = await contratosDoPaciente(clinicaId, pacienteId);
    const familia = await pessoasDaFamilia(clinicaId, pacienteId, contratoIds);
    if (familia.length === 0) return null;

    // Contratos ativos com convênio pertencentes a alguém da família. O
    // `titular_apenas_financeiro` do titular não importa aqui: o contrato serve
    // aos dependentes, que é justamente onde o paciente entraria.
    const { data: contratos } = await supabase
      .from("contratos_assinatura")
      .select("id, numero, paciente_nome, convenio_id, cb_convenios(nome)")
      .eq("clinica_id", clinicaId)
      .eq("status", "ativo")
      .not("convenio_id", "is", null)
      .in("paciente_id", familia)
      .order("data_inicio", { ascending: false })
      .limit(LIMITE_BUSCA);

    type Linha = {
      id: string;
      numero: number | null;
      paciente_nome: string | null;
      cb_convenios: { nome: string } | null;
    };
    const linhas = ((contratos ?? []) as unknown as Linha[]).filter(Boolean);
    if (linhas.length === 0) return null;

    // O paciente já é dependente ativo de algum deles? Então não há o que
    // sugerir: o desconto dele já vem (ou já deveria vir) daquele cartão.
    const idsCandidatos = linhas.map((l) => l.id);
    const { data: jaDependente } = await supabase
      .from("contrato_dependentes")
      .select("contrato_id")
      .eq("paciente_id", pacienteId)
      .eq("ativo", true)
      .in("contrato_id", idsCandidatos)
      .limit(LIMITE_BUSCA);
    const jaVinculado = new Set(
      ((jaDependente ?? []) as Array<{ contrato_id: string }>).map((d) => d.contrato_id),
    );
    const restantes = linhas.filter((l) => !jaVinculado.has(l.id));
    if (restantes.length === 0) return null;

    const { data: mens } = await supabase
      .from("contrato_mensalidades")
      .select("contrato_id, vencimento")
      .in(
        "contrato_id",
        restantes.map((l) => l.id),
      )
      .in("status", ["pendente", "aberto", "atrasado"]);
    const porContrato = new Map<string, ParcelaEmAberto[]>();
    for (const m of (mens ?? []) as Array<{ contrato_id: string; vencimento: string }>) {
      const lista = porContrato.get(m.contrato_id) ?? [];
      lista.push({ vencimento: m.vencimento });
      porContrato.set(m.contrato_id, lista);
    }

    return escolherCartaoDaFamilia(
      restantes.map((l) => ({
        contratoId: l.id,
        numero: l.numero ?? null,
        titularNome: l.paciente_nome ?? "titular",
        convenioNome: l.cb_convenios?.nome ?? "Convênio",
        parcelasEmAberto: porContrato.get(l.id) ?? [],
      })),
      hojeLocalISODate(),
    );
  } catch {
    return null;
  }
}
