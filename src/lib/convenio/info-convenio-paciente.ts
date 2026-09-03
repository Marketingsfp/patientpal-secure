/**
 * Motor único de preço de convênio do Cartão Benefícios.
 *
 * Vivia dentro de `app.agenda.tsx` e por isso só a Agenda conseguia usá-lo: o
 * Caixa calculava o preço por conta própria, com uma versão reduzida da regra
 * dentro da função `fila_caixa_hoje` do banco. As duas contas divergiam —
 * dependente do contrato não recebia desconto no caixa, benefício com cota era
 * ignorado e o preço de cartão saía igual ao de dinheiro. Extraído para cá sem
 * mudança de comportamento, para que Agenda e Caixa cobrem exatamente o mesmo
 * valor.
 */
import { supabase } from "@/integrations/supabase/client";
import {
  calcularAvisoLimitePendentes,
  deveBloquearPorLimitePendente,
} from "@/lib/agenda/aviso-limite-pendentes";
import {
  escolherContratoAtivo,
  LIMITE_CONTRATOS_CANDIDATOS,
} from "@/lib/convenio/escolher-contrato-ativo";
import { DIAS_TOLERANCIA_MENSALIDADE } from "@/lib/cb-regras";

/**
 * Data de hoje no fuso LOCAL, formato "YYYY-MM-DD". `new Date().toISOString()`
 * converte para UTC — no Brasil (UTC-3), a partir das ~21h já retorna a data
 * de amanhã, o que adiantava em 1 dia a contagem de atraso de mensalidade
 * (e a restrição do convênio) nas últimas horas de cada dia.
 */
export const hojeLocalISODate = (): string => {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

export const primeiroValorValido = (...valores: unknown[]) => {
  const numeros = valores.map((valor) => Number(valor)).filter((valor) => Number.isFinite(valor));
  return numeros.find((valor) => valor > 0) ?? numeros[0] ?? 0;
};

export const valorCartaoProcedimento = (proc: any) =>
  primeiroValorValido(
    proc?.valor_cartao_credito,
    proc?.valor_cartao_debito,
    proc?.valor_cartao,
    proc?.valor_padrao,
  );

export type DescontoConvenio =
  | { tipo: "percentual"; valor: number; percentualOutros?: number }
  | { tipo: "valor"; valor: number }
  | { tipo: "gratuidade"; valor: 0 }
  | { tipo: "valor_fixo"; valor: number; valorOutros: number };

export type ConvenioInfo = {
  convenioNome: string;
  /** true quando não há parcela vencida há MAIS de 5 dias — inclui o caso "em carência" (≤5 dias), que funciona normalmente. */
  emDia: boolean;
  /** Parcelas vencidas há mais de 5 dias (tolerância). Só isso bloqueia o convênio. */
  parcelasAtrasadas: number;
  desconto: DescontoConvenio | null;
  avisoLimite?: string;
  bloquear?: boolean;
  /** Contrato com parcela(s) vencida(s) dentro da tolerância de 5 dias — informativo, não restringe benefício algum. */
  emCarencia?: boolean;
  /** Dias restantes de tolerância na parcela vencida mais crítica. */
  diasCarenciaRestantes?: number | null;
  /** Acréscimo configurado no convênio para pagamentos não-dinheiro. */
  acrescimoCartao?: {
    modo: "percentual" | "valor_fixo" | null;
    percentual: number;
    valor: number;
  } | null;
};

export async function obterInfoConvenioPaciente(params: {
  clinicaId: string;
  pacienteId: string | null | undefined;
  medicoId: string | null | undefined;
  procedimentoNome: string;
  agendamentoId?: string | null;
  dataRef?: string | null; // ISO do agendamento (para checar limite no dia)
}): Promise<ConvenioInfo | null> {
  const { clinicaId, pacienteId, medicoId, procedimentoNome, agendamentoId, dataRef } = params;
  if (!pacienteId) return null;

  // 1) Contrato ativo: paciente como titular OU dependente ativo
  const { data: titularContratos } = await supabase
    .from("contratos_assinatura")
    .select(
      "id,convenio_id,contrato_origem_id,numero_renovacoes,sem_carencia,data_inicio,renovado_em,created_at,titular_apenas_financeiro,cb_convenios(nome)",
    )
    .eq("clinica_id", clinicaId)
    .eq("status", "ativo")
    .eq("paciente_id", pacienteId)
    // Titular que só paga não é beneficiário: ver `titularUsaBeneficio`. O
    // contrato continua valendo para os dependentes ativos dele — o que sai
    // daqui é apenas o direito do PRÓPRIO titular à tabela do convênio.
    .eq("titular_apenas_financeiro", false)
    .order("data_inicio", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(LIMITE_CONTRATOS_CANDIDATOS);
  type ContratoAtivo = {
    id: string;
    convenio_id: string | null;
    contrato_origem_id?: string | null;
    numero_renovacoes?: number | null;
    sem_carencia?: boolean | null;
    data_inicio?: string | null;
    renovado_em?: string | null;
    created_at?: string | null;
    cb_convenios: { nome: string } | null;
  };
  // Prefere sempre o contrato que TEM convênio vinculado e, no empate, o mais
  // recente (regra única em `escolherContratoAtivo`). Existem contratos ativos
  // legados sem `convenio_id` (criados pelo vínculo automático
  // titular-dependente da importação): quando um deles vinha primeiro na
  // lista, o paciente perdia o desconto do cartão que de fato possui, porque
  // a função desistia no `!contrato.convenio_id` e a cobrança saía cheia.
  const titulares = ((titularContratos ?? []) as any[]).filter(Boolean) as ContratoAtivo[];
  let contrato: ContratoAtivo | null = escolherContratoAtivo(titulares);

  // Segue para o vínculo como DEPENDENTE também quando o contrato de titular
  // encontrado está sem convênio — o benefício pode vir do contrato da família.
  if (!contrato?.convenio_id) {
    const { data: deps } = await supabase
      .from("contrato_dependentes")
      .select(
        "contrato_id,ativo,contratos_assinatura!inner(id,clinica_id,status,convenio_id,contrato_origem_id,numero_renovacoes,sem_carencia,data_inicio,renovado_em,created_at,cb_convenios(nome))",
      )
      .eq("paciente_id", pacienteId)
      .eq("ativo", true)
      .limit(LIMITE_CONTRATOS_CANDIDATOS);
    const ativos = ((deps ?? []) as any[])
      .map((d) => d.contratos_assinatura)
      .filter(
        (c: any) => c && c.clinica_id === clinicaId && c.status === "ativo",
      ) as ContratoAtivo[];
    const cand = escolherContratoAtivo(ativos);
    if (cand) contrato = cand;
  }
  if (!contrato || !contrato.convenio_id) return null;

  const convenioNome = contrato.cb_convenios?.nome ?? "Convênio";

  // 2) Verifica mensalidades em atraso do contrato.
  //    Regra de negócio: tolerância de 5 dias corridos após o vencimento —
  //    dentro dela o convênio funciona NORMALMENTE (mesmos benefícios,
  //    limites e descontos de sempre); só a partir do 6º dia a parcela conta
  //    como atrasada e o convênio é bloqueado. `emDia` cobre os dois casos
  //    "sem restrição" (nada vencido OU dentro da tolerância) — o único sinal
  //    de bloqueio real é `parcelasAtrasadas > 0`. `emCarencia` fica só como
  //    informativo (mostra "vence em N dias" sem travar nada).
  const hojeStr = hojeLocalISODate();
  const { data: mens } = await supabase
    .from("contrato_mensalidades")
    .select("status,vencimento")
    .eq("contrato_id", contrato.id)
    .in("status", ["pendente", "aberto", "atrasado"])
    .lte("vencimento", hojeStr);
  // A régua vem de `cb-regras` para não haver dois "5" soltos no sistema: o
  // indicador de inadimplentes da tela de Vendas usa a mesma constante.
  const DIAS_TOLERANCIA = DIAS_TOLERANCIA_MENSALIDADE;
  const hojeMs = new Date(hojeStr + "T00:00:00").getTime();
  const diasAtrasoLista = (mens ?? []).map((m: any) => {
    const v = new Date(String(m.vencimento) + "T00:00:00").getTime();
    return Math.max(0, Math.floor((hojeMs - v) / 86400000));
  });
  const parcelasAtrasadas = diasAtrasoLista.filter((d) => d > DIAS_TOLERANCIA).length;
  const parcelasEmCarencia = diasAtrasoLista.filter((d) => d >= 0 && d <= DIAS_TOLERANCIA).length;
  const emDia = parcelasAtrasadas === 0;
  const emCarencia = parcelasAtrasadas === 0 && parcelasEmCarencia > 0;
  const diasCarenciaRestantes = emCarencia
    ? Math.min(
        ...diasAtrasoLista.filter((d) => d <= DIAS_TOLERANCIA).map((d) => DIAS_TOLERANCIA - d),
      )
    : null;

  // 2b) Conta mensalidades pagas do contrato (para checagem de carência).
  //     A parcela 0 é a taxa de adesão, não uma mensalidade: sem o filtro
  //     `numero_parcela > 0` ela entrava na conta e toda carência liberava um
  //     mês antes do cadastrado — quem tinha pago a 1ª mensalidade contava 2, e
  //     num cartão de adesão cobrada no ato bastavam os R$ 20,00 para liberar
  //     benefício sem nenhuma mensalidade paga.
  const { count: pagasCount } = await supabase
    .from("contrato_mensalidades")
    .select("id", { count: "exact", head: true })
    .eq("contrato_id", contrato.id)
    .eq("status", "pago")
    .gt("numero_parcela", 0);
  const mensalidadesPagas = pagasCount ?? 0;

  // 3) Busca procedimento_id e especialidade do médico
  // Remove sufixo de desambiguação " (ESPECIALIDADE)" para casar com o cadastro
  // — a agenda grava o serviço como "CONSULTA (GINECOLOGIA)" mas o cadastro tem
  // só "CONSULTA". Sem isso, procedimentoTipo/procedimentoId ficavam null e
  // regras por tipo/especialidade não eram aplicadas.
  const procNomeBase = (procedimentoNome ?? "").replace(/\s*\([^()]*\)\s*$/, "").trim();
  const procNorm = procNomeBase
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
  // Busca direto por nome (case-insensitive) — antes puxávamos todos os
  // procedimentos da clínica com .limit(5000), mas o PostgREST corta em
  // 1000 por default. Em clínicas com >1000 procedimentos ativos, o item
  // procurado podia ficar fora do lote e procedimentoId caía como null,
  // o que fazia o cálculo de desconto do convênio pegar a especialidade
  // errada do médico placeholder (ex.: Mamografia 10% em vez de
  // Tomografia 5%).
  let procRow: { id: string; nome: string; tipo: string | null } | null = null;
  if (procNomeBase) {
    const { data: exact } = await supabase
      .from("procedimentos")
      .select("id,nome,tipo")
      .eq("clinica_id", clinicaId)
      .eq("ativo", true)
      .ilike("nome", procNomeBase)
      .limit(5);
    procRow =
      ((exact ?? []) as any[]).find(
        (p) =>
          (p.nome ?? "")
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .toLowerCase()
            .trim() === procNorm,
      ) ??
      ((exact ?? [])[0] as any) ??
      null;
    if (!procRow) {
      const { data: fuzzy } = await supabase
        .from("procedimentos")
        .select("id,nome,tipo")
        .eq("clinica_id", clinicaId)
        .eq("ativo", true)
        .ilike("nome", `%${procNomeBase}%`)
        .limit(10);
      procRow =
        ((fuzzy ?? []) as any[]).find((p) =>
          (p.nome ?? "")
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .toLowerCase()
            .includes(procNorm),
        ) ?? null;
    }
  }
  const procedimentoId = (procRow as any)?.id ?? null;
  const procedimentoTipo = ((procRow as any)?.tipo ?? "").toString().toLowerCase() || null;

  let especialidadeId: string | null = null;
  if (medicoId) {
    const { data: med } = await supabase
      .from("medicos")
      .select("especialidade_id")
      .eq("id", medicoId)
      .maybeSingle();
    especialidadeId = (med as any)?.especialidade_id ?? null;
  }

  // Fallback: alguns médicos têm a especialidade somente na tabela N:N
  // medico_especialidades (e não na coluna medicos.especialidade_id).
  // Sem esse fallback, o benefício por especialidade não era encontrado e
  // o sistema exibia "sem benefício para este procedimento" mesmo com a
  // especialidade configurada no Cartão Consulta.
  let especialidadesMedico: string[] = especialidadeId ? [especialidadeId] : [];
  if (medicoId) {
    const { data: medEsps } = await supabase
      .from("medico_especialidades")
      .select("especialidade_id")
      .eq("medico_id", medicoId);
    const extras = ((medEsps ?? []) as Array<{ especialidade_id: string | null }>)
      .map((r) => r.especialidade_id)
      .filter((x): x is string => !!x);
    especialidadesMedico = Array.from(new Set([...especialidadesMedico, ...extras]));
    if (!especialidadeId && extras[0]) especialidadeId = extras[0];
  }

  // Especialidades do PROCEDIMENTO (fonte de verdade quando o médico é
  // um "placeholder" com N especialidades — sem isso, a busca pegava a
  // primeira especialidade do médico que casasse com QUALQUER regra do
  // convênio, aplicando o desconto errado, ex.: 10% de Mamografia em
  // vez dos 5% da Tomografia.
  let especialidadesProcedimento: string[] = [];
  if (procedimentoId) {
    const { data: procEsps } = await (supabase as any)
      .from("procedimento_especialidades")
      .select("especialidade_id")
      .eq("procedimento_id", procedimentoId);
    especialidadesProcedimento = ((procEsps ?? []) as Array<{ especialidade_id: string | null }>)
      .map((r) => r.especialidade_id)
      .filter((x): x is string => !!x);
  }

  // 4) Fonte única de regras de desconto: cb_convenio_regras (aba Regras de Preço).
  //    A Agenda passou a ler exatamente as mesmas regras que o Caixa usa —
  //    a aba antiga "Benefícios (regras)" (cb_beneficios) foi removida.
  const { data: regrasRaw } = await (supabase as any)
    .from("cb_convenio_regras")
    .select(
      "id,convenio_id,especialidade_id,procedimento_id,tipo,modo,valor,valor_cartao,percentual,percentual_cartao,prioridade,ativo,carencia_mensalidades,gratuito,limite_qtd,limite_periodo,limite_escopo,excedente_modo,excedente_percentual,excedente_valor,grupo_gratuidade",
    )
    .eq("convenio_id", contrato.convenio_id)
    .eq("ativo", true);
  const regrasCb = (regrasRaw ?? []) as any[];
  const { findRegra, carenciaCumprida } = await import("@/lib/cb-regras");

  // Ordem de tentativa: especialidade do procedimento primeiro (mais
  // específica ao serviço), depois especialidades do médico, por fim null.
  // Coleta TODAS as regras candidatas e escolhe a de maior score
  // (procedimento_id > especialidade_id > tipo > prioridade) para não
  // parar na primeira que casar por coincidência.
  // Especialidade explicitamente indicada no nome do serviço (sufixo
  // "(DERMATOLOGIA)"). É a fonte mais forte de desambiguação quando o
  // procedimento base ("CONSULTA") está vinculado a várias especialidades
  // via procedimento_especialidades — sem isso, a regra de menor valor
  // encontrada primeiro (ex.: NUTRICAO R$60) vencia a regra correta
  // (DERMATOLOGIA R$9,99) por empate de score.
  const sufixoMatch = (procedimentoNome ?? "").match(/\(([^()]+)\)\s*$/);
  const sufixoEsp = sufixoMatch ? sufixoMatch[1].trim() : "";
  let especialidadeSufixoId: string | null = null;
  if (sufixoEsp) {
    const sufixoNorm = sufixoEsp
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .trim();
    const { data: espData } = await supabase
      .from("especialidades")
      .select("id,nome")
      .ilike("nome", sufixoEsp)
      .limit(5);
    const acha =
      ((espData ?? []) as Array<{ id: string; nome: string }>).find(
        (e) =>
          (e.nome ?? "")
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .toLowerCase()
            .trim() === sufixoNorm,
      ) ?? ((espData ?? [])[0] as any);
    especialidadeSufixoId = (acha as any)?.id ?? null;
  }
  // Se o sufixo casou com uma especialidade do médico, usa APENAS ela —
  // o operador foi explícito sobre qual especialidade da consulta.
  const sufixoBateComMedico =
    !!especialidadeSufixoId && especialidadesMedico.includes(especialidadeSufixoId);
  const espsTentativa: (string | null)[] = sufixoBateComMedico
    ? [especialidadeSufixoId]
    : Array.from(
        new Set<string | null>([
          ...(especialidadeSufixoId ? [especialidadeSufixoId] : []),
          ...especialidadesMedico,
          ...especialidadesProcedimento,
          null,
        ]),
      );
  // Mesma pontuação de findRegra (src/lib/cb-regras.ts): especificidade manda
  // e, no mesmo nível, gratuidade vence desconto independentemente da
  // prioridade cadastrada.
  const scoreRegra = (r: any) =>
    (r.procedimento_id ? 1000 : 0) +
    (r.especialidade_id ? 100 : 0) +
    (r.tipo ? 50 : 0) +
    (r.gratuito ? 10 : 0) +
    (Number(r.prioridade) || 0) * 0.001;
  let regraMatch: any = null;
  for (const eid of espsTentativa) {
    const r = findRegra(regrasCb as any, eid, procedimentoTipo, procedimentoId);
    if (r && (!regraMatch || scoreRegra(r) > scoreRegra(regraMatch))) {
      regraMatch = r;
    }
  }

  // Deriva desconto a partir da regra escolhida (gratuidade > modo).
  let desconto: DescontoConvenio | null = null;
  let beneficioEscolhido: any = null;
  const aplicarRegraEscolhida = (r: any) => {
    beneficioEscolhido = {
      ...r,
      // Campos derivados para compatibilidade com o resto do fluxo (limite/excedente).
      escopo: r.procedimento_id ? "servico" : "especialidade",
    };
    if (r.gratuito) {
      desconto = { tipo: "gratuidade", valor: 0 };
    } else if (r.modo === "valor_fixo") {
      const v = Number(r.valor) || 0;
      const vC = r.valor_cartao != null ? Number(r.valor_cartao) || 0 : v;
      desconto = { tipo: "valor_fixo", valor: v, valorOutros: vC };
    } else if (r.modo === "percentual_desconto") {
      const p = Number(r.percentual) || 0;
      const pC = r.percentual_cartao != null ? Number(r.percentual_cartao) || 0 : p;
      desconto = { tipo: "percentual", valor: p, percentualOutros: pC };
    }
  };
  if (regraMatch) aplicarRegraEscolhida(regraMatch);

  // 4b) Carência: se a regra mais específica (regraMatch) não cumpriu a
  //     carência mínima, NÃO cobra particular direto — procura a próxima
  //     regra aplicável, menos específica, cuja carência o contrato já
  //     cumpriu (mesmo princípio do fallback já usado para limite esgotado,
  //     excedente_modo="regra_padrao_convenio"). Sem isso, uma regra por
  //     serviço específico com carência alta (ex.: exame anual gratuito,
  //     carência 6) bloqueava também descontos genéricos por especialidade
  //     com carência menor (ex.: 10% de desconto, carência 2) que o
  //     contrato já tinha direito — cobrando particular cheio à toa.
  let avisoLimite: string | undefined;
  let bloquear = false;
  // Contratos oriundos de renovação (extensão do mesmo contrato ou troca de
  // plano gerando novo contrato) não têm carência — o paciente já é cliente
  // do convênio há pelo menos um ciclo. Considera renovação quando o contrato
  // já foi renovado ao menos uma vez ou tem contrato de origem.
  const isRenovacao =
    Number((contrato as any)?.numero_renovacoes ?? 0) > 0 ||
    !!(contrato as any)?.contrato_origem_id ||
    !!(contrato as any)?.sem_carencia;
  if (regraMatch && !isRenovacao && !carenciaCumprida(regraMatch, mensalidadesPagas)) {
    const regraOriginal = regraMatch;
    const tentadas = new Set<string>([regraMatch.id]);
    let guard = 0;
    while (guard < 20) {
      guard++;
      const regrasRestantes = (regrasCb as any[]).filter((r) => !tentadas.has(r.id));
      let candidata: any = null;
      for (const eid of espsTentativa) {
        const r = findRegra(regrasRestantes, eid, procedimentoTipo, procedimentoId);
        if (r && (!candidata || scoreRegra(r) > scoreRegra(candidata))) {
          candidata = r;
        }
      }
      if (!candidata) {
        regraMatch = null;
        break;
      }
      if (carenciaCumprida(candidata, mensalidadesPagas)) {
        regraMatch = candidata;
        break;
      }
      tentadas.add(candidata.id);
      regraMatch = null;
    }
    if (regraMatch) {
      aplicarRegraEscolhida(regraMatch);
    } else {
      desconto = null;
      beneficioEscolhido = null;
      const n = Number(regraOriginal.carencia_mensalidades) || 0;
      avisoLimite = `Convênio ${convenioNome}: benefício disponível somente após a ${n}ª mensalidade paga (contrato tem ${mensalidadesPagas} paga(s)). Cobrando valor particular.`;
    }
  }

  // 4c) Reserva: tabela de preços por serviço do convênio.
  //     Quando NENHUMA regra da aba "Regras de Preço" cobre este serviço, o
  //     sistema passa a respeitar o valor digitado à mão na aba "Convênios"
  //     do cadastro do serviço (`procedimento_cb_convenio_valores`,
  //     origem='manual'). Antes esse valor aparecia na tela de Serviços mas
  //     nunca era lido na cobrança: o cadastro mostrava o preço do cartão e a
  //     agenda cobrava o particular cheio.
  //     Só linhas 'manual' entram aqui — as de origem='regra' são um cache
  //     gravado pelo "Reaplicar" e poderiam ressuscitar o preço de uma regra
  //     já alterada ou excluída.
  //     Não vale quando a regra existe mas está barrada por carência
  //     (`avisoLimite` preenchido acima): nesse caso a cobrança particular é
  //     a decisão correta.
  if (!desconto && !avisoLimite && procedimentoId) {
    const { data: tabela } = await (supabase as any)
      .from("procedimento_cb_convenio_valores")
      .select("valor_dinheiro,valor_outros")
      .eq("clinica_id", clinicaId)
      .eq("convenio_id", contrato.convenio_id)
      .eq("procedimento_id", procedimentoId)
      .eq("origem", "manual")
      .limit(1);
    const linha = ((tabela ?? [])[0] ?? null) as {
      valor_dinheiro: number | string | null;
      valor_outros: number | string | null;
    } | null;
    const vDin = Number(linha?.valor_dinheiro) || 0;
    const vOut = Number(linha?.valor_outros) || 0;
    if (vDin > 0 || vOut > 0) {
      // Trava de segurança: o cartão NUNCA pode encarecer a conta. Parte
      // dessas linhas digitadas à mão está desatualizada e hoje está ACIMA do
      // preço particular (ex.: restauração de resina a R$ 147,25 contra
      // R$ 120,00 do particular). Quando isso acontece, a forma de pagamento
      // afetada continua no valor particular.
      const { data: procValores } = await supabase
        .from("procedimentos")
        .select(
          "valor_dinheiro,valor_dinheiro_pix,valor_padrao,valor_pix,valor_cartao_credito,valor_cartao_debito,valor_cartao",
        )
        .eq("id", procedimentoId)
        .maybeSingle();
      const baseDin = primeiroValorValido(
        (procValores as any)?.valor_dinheiro,
        (procValores as any)?.valor_dinheiro_pix,
        (procValores as any)?.valor_padrao,
      );
      const baseOutros = valorCartaoProcedimento(procValores);
      const candDin = vDin > 0 ? vDin : vOut;
      const candOutros = vOut > 0 ? vOut : vDin;
      const finalDin = baseDin > 0 && candDin > baseDin ? baseDin : candDin;
      const finalOutros = baseOutros > 0 && candOutros > baseOutros ? baseOutros : candOutros;
      // Só vale como benefício se alguma das formas realmente ficar mais barata.
      const houveDesconto =
        (baseDin > 0 && finalDin < baseDin) || (baseOutros > 0 && finalOutros < baseOutros);
      if (houveDesconto) {
        desconto = { tipo: "valor_fixo", valor: finalDin, valorOutros: finalOutros };
      }
    }
  }

  // 5) Checa limite de uso do benefício escolhido (ex.: "1 consulta R$9,99/dia/contrato")
  if (beneficioEscolhido && beneficioEscolhido.limite_qtd && emDia) {
    const dataBase = dataRef ? new Date(dataRef) : new Date();
    const periodo = (beneficioEscolhido.limite_periodo ?? "dia") as string;
    // Janela do período (dia/semana/mes) ou histórico completo (contrato).
    let janelaInicio: Date | null = null;
    let janelaFim: Date | null = null;
    if (periodo === "semana") {
      const d = new Date(dataBase);
      const dow = (d.getDay() + 6) % 7; // 0 = segunda
      janelaInicio = new Date(d);
      janelaInicio.setDate(d.getDate() - dow);
      janelaInicio.setHours(0, 0, 0, 0);
      janelaFim = new Date(janelaInicio);
      janelaFim.setDate(janelaInicio.getDate() + 6);
      janelaFim.setHours(23, 59, 59, 999);
    } else if (periodo === "mes") {
      janelaInicio = new Date(dataBase.getFullYear(), dataBase.getMonth(), 1, 0, 0, 0, 0);
      janelaFim = new Date(dataBase.getFullYear(), dataBase.getMonth() + 1, 0, 23, 59, 59, 999);
    } else if (periodo === "ano") {
      // Ciclo anual do CONTRATO (não o ano calendário): janela de 12 meses
      // ancorada na renovação mais recente (ou início, se nunca renovado).
      // Sem isso, benefícios como "1 exame por ano por contrato" só podiam
      // usar periodo "contrato" (sem janela — vitalício), o que travava o
      // benefício para sempre após o primeiro uso, mesmo em anos seguintes
      // ou após a renovação do contrato.
      const anchorStr = contrato.renovado_em || contrato.data_inicio;
      const anchor = anchorStr ? new Date(anchorStr) : null;
      if (!anchor || Number.isNaN(anchor.getTime())) {
        janelaInicio = null;
        janelaFim = null;
      } else {
        let cicloInicio = new Date(
          anchor.getFullYear(),
          anchor.getMonth(),
          anchor.getDate(),
          0,
          0,
          0,
          0,
        );
        let guard = 0;
        while (cicloInicio.getTime() > dataBase.getTime() && guard < 200) {
          cicloInicio = new Date(
            cicloInicio.getFullYear() - 1,
            cicloInicio.getMonth(),
            cicloInicio.getDate(),
          );
          guard++;
        }
        let proxCiclo = new Date(
          cicloInicio.getFullYear() + 1,
          cicloInicio.getMonth(),
          cicloInicio.getDate(),
        );
        guard = 0;
        while (proxCiclo.getTime() <= dataBase.getTime() && guard < 200) {
          cicloInicio = proxCiclo;
          proxCiclo = new Date(
            cicloInicio.getFullYear() + 1,
            cicloInicio.getMonth(),
            cicloInicio.getDate(),
          );
          guard++;
        }
        janelaInicio = cicloInicio;
        janelaFim = new Date(proxCiclo.getTime() - 1);
      }
    } else if (periodo === "contrato") {
      janelaInicio = null;
      janelaFim = null;
    } else {
      janelaInicio = new Date(dataBase);
      janelaInicio.setHours(0, 0, 0, 0);
      janelaFim = new Date(dataBase);
      janelaFim.setHours(23, 59, 59, 999);
    }

    // Pacientes que compartilham a cota do contrato
    let pacientesCota: string[] = [];
    const escopoLim = beneficioEscolhido.limite_escopo as string | null;
    if (escopoLim === "paciente") {
      pacientesCota = [pacienteId];
    } else {
      // titular + dependentes ativos do contrato (contrato ou titular_ou_dependente)
      pacientesCota = [contrato.id ? "" : ""]; // placeholder, substituído abaixo
      const { data: tit } = await supabase
        .from("contratos_assinatura")
        .select("paciente_id")
        .eq("id", contrato.id)
        .maybeSingle();
      const { data: depsCota } = await supabase
        .from("contrato_dependentes")
        .select("paciente_id")
        .eq("contrato_id", contrato.id)
        .eq("ativo", true);
      pacientesCota = Array.from(
        new Set([
          ...((tit as any)?.paciente_id ? [(tit as any).paciente_id as string] : []),
          ...((depsCota ?? []) as Array<{ paciente_id: string }>).map((d) => d.paciente_id),
        ]),
      );
    }

    if (pacientesCota.length > 0) {
      let q = supabase
        .from("agendamentos")
        .select("id,medico_id,procedimento,paciente_id,status,inicio,tipo_atendimento", {
          count: "exact",
        })
        .eq("clinica_id", clinicaId)
        .in("paciente_id", pacientesCota)
        .neq("status", "cancelado");
      if (janelaInicio) q = q.gte("inicio", janelaInicio.toISOString());
      if (janelaFim) q = q.lte("inicio", janelaFim.toISOString());
      if (agendamentoId) q = q.neq("id", agendamentoId);
      const { data: agsDiaRaw } = await q;
      // Atendimentos "particular" normalmente não consomem a cota do convênio
      // — o paciente escolheu pagar fora do benefício de propósito. Mas se
      // existir um lançamento financeiro confirmado do próprio agendamento
      // cuja descrição indica o nome do convênio, é sinal de que o desconto
      // do convênio foi aplicado (paciente pagou a taxa de R$ 9,99 em
      // dinheiro, por exemplo) — nesse caso a cota FOI consumida, mesmo que
      // o agendamento tenha ficado gravado como "particular" por bug antigo
      // de sincronização. Buscamos esses lançamentos e reincluímos os
      // agendamentos correspondentes.
      const rawList = (agsDiaRaw ?? []) as Array<{
        id: string;
        medico_id: string | null;
        procedimento?: string | null;
        paciente_id?: string | null;
        status?: string | null;
        inicio?: string | null;
        tipo_atendimento?: string | null;
      }>;
      const idsParticular = rawList
        .filter((a) => a.tipo_atendimento === "particular")
        .map((a) => a.id);
      const idsReincluir = new Set<string>();
      const nomeConvNorm = (convenioNome ?? "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toUpperCase()
        .trim();
      if (idsParticular.length && nomeConvNorm) {
        const { data: lancsConv } = await supabase
          .from("fin_lancamentos")
          .select("agendamento_id, descricao")
          .in("agendamento_id", idsParticular)
          .eq("tipo", "receita")
          .eq("status", "confirmado");
        for (const l of (lancsConv ?? []) as Array<{
          agendamento_id: string | null;
          descricao: string | null;
        }>) {
          if (!l.agendamento_id) continue;
          const d = (l.descricao ?? "")
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .toUpperCase();
          if (d.includes(nomeConvNorm)) idsReincluir.add(l.agendamento_id);
        }
      }
      const agsDia = rawList.filter(
        (a: any) => a.tipo_atendimento !== "particular" || idsReincluir.has(a.id),
      );

      // Se o benefício é por especialidade, filtra pelos agendamentos cujo
      // médico tem a mesma especialidade.
      let usados = 0;
      let agsFiltrados: Array<{
        id: string;
        medico_id: string | null;
        paciente_id?: string | null;
        status?: string | null;
        inicio?: string | null;
      }> = [];
      const normProcServico = (s: string | null | undefined) =>
        (s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toUpperCase();
      if (beneficioEscolhido.escopo === "especialidade" && beneficioEscolhido.especialidade_id) {
        // Regras por especialidade com grupo_gratuidade compartilham a cota
        // entre TODAS as especialidades do grupo (ex.: "1 consulta/dia por
        // CONTRATO" entre as 13 especialidades sem carência do Cartão
        // Consulta — não 1/dia por especialidade individualmente). Sem
        // grupo, o alvo continua sendo só a própria especialidade da regra
        // (comportamento original, ex.: franquias por especialidade).
        const especialidadesAlvo = beneficioEscolhido.grupo_gratuidade
          ? new Set(
              (
                regrasCb as Array<{
                  grupo_gratuidade: string | null;
                  especialidade_id: string | null;
                }>
              )
                .filter(
                  (r) =>
                    r.grupo_gratuidade === beneficioEscolhido.grupo_gratuidade &&
                    r.especialidade_id,
                )
                .map((r) => r.especialidade_id as string),
            )
          : new Set<string>([beneficioEscolhido.especialidade_id as string]);
        const medicoIds = Array.from(
          new Set(
            ((agsDia ?? []) as Array<{ medico_id: string | null }>)
              .map((a) => a.medico_id)
              .filter((x): x is string => !!x),
          ),
        );
        if (medicoIds.length) {
          const { data: meds } = await supabase
            .from("medicos")
            .select("id,especialidade_id")
            .in("id", medicoIds);
          const { data: medEspN } = await supabase
            .from("medico_especialidades")
            .select("medico_id,especialidade_id")
            .in("medico_id", medicoIds);
          const espByMed = new Map<string, Set<string>>();
          ((meds ?? []) as Array<{ id: string; especialidade_id: string | null }>).forEach((m) => {
            const s = espByMed.get(m.id) ?? new Set<string>();
            if (m.especialidade_id) s.add(m.especialidade_id);
            espByMed.set(m.id, s);
          });
          (
            (medEspN ?? []) as Array<{ medico_id: string; especialidade_id: string | null }>
          ).forEach((m) => {
            const s = espByMed.get(m.medico_id) ?? new Set<string>();
            if (m.especialidade_id) s.add(m.especialidade_id);
            espByMed.set(m.medico_id, s);
          });
          agsFiltrados = (
            (agsDia ?? []) as Array<{
              id: string;
              medico_id: string | null;
              paciente_id?: string | null;
              status?: string | null;
              inicio?: string | null;
            }>
          ).filter((a) => {
            if (!a.medico_id) return false;
            const s = espByMed.get(a.medico_id);
            if (!s) return false;
            for (const eid of s) if (especialidadesAlvo.has(eid)) return true;
            return false;
          });
        }
      } else if (
        beneficioEscolhido.escopo === "servico" &&
        beneficioEscolhido.procedimento_id &&
        !beneficioEscolhido.grupo_gratuidade
      ) {
        // Regra por serviço específico SEM grupo de gratuidade (ex.: Preventivo,
        // Densitometria, ECG, Raio-X Tórax — exames anuais que não têm um "OU"
        // com outro exame). Sem este filtro, o "else" genérico logo abaixo
        // contava QUALQUER atendimento pago do contrato como consumo da cota —
        // uma consulta comum já esgotava o exame anual gratuito, porque só o
        // bloco de grupo_gratuidade (mais abaixo) filtrava por procedimento, e
        // só quando a regra tinha grupo configurado.
        const { data: procRegra } = await supabase
          .from("procedimentos")
          .select("nome")
          .eq("id", beneficioEscolhido.procedimento_id)
          .maybeSingle();
        const nomeRegra = normProcServico((procRegra as { nome?: string } | null)?.nome);
        agsFiltrados = (
          (agsDia ?? []) as Array<{
            id: string;
            medico_id: string | null;
            paciente_id?: string | null;
            status?: string | null;
            inicio?: string | null;
            procedimento?: string | null;
          }>
        ).filter((a) => normProcServico(a.procedimento) === nomeRegra);
      } else {
        agsFiltrados = (agsDia ?? []) as Array<{
          id: string;
          medico_id: string | null;
          paciente_id?: string | null;
          status?: string | null;
          inicio?: string | null;
        }>;
      }
      // Grupo de gratuidade compartilhada: se a regra pertence a um grupo,
      // a cota é dividida entre todos os procedimentos do grupo. Filtramos os
      // agendamentos por nome do procedimento (agendamentos.procedimento é
      // texto) usando os nomes dos procedimentos vinculados ao mesmo grupo.
      if (beneficioEscolhido.grupo_gratuidade) {
        const grupoProcIds = Array.from(
          new Set(
            (regrasCb as Array<{ grupo_gratuidade: string | null; procedimento_id: string | null }>)
              .filter(
                (r) =>
                  r.grupo_gratuidade === beneficioEscolhido.grupo_gratuidade && r.procedimento_id,
              )
              .map((r) => r.procedimento_id as string),
          ),
        );
        if (grupoProcIds.length) {
          const { data: procsNomes } = await supabase
            .from("procedimentos")
            .select("nome")
            .in("id", grupoProcIds);
          const normProc = (s: string | null | undefined) =>
            (s ?? "")
              .normalize("NFD")
              .replace(/[\u0300-\u036f]/g, "")
              .trim()
              .toUpperCase();
          const nomesSet = new Set(
            ((procsNomes ?? []) as Array<{ nome: string | null }>).map((p) => normProc(p.nome)),
          );
          const agsWithProc = agsFiltrados as Array<{
            id: string;
            medico_id: string | null;
            paciente_id?: string | null;
            status?: string | null;
            inicio?: string | null;
            procedimento?: string | null;
          }>;
          agsFiltrados = agsWithProc.filter((a) => nomesSet.has(normProc(a.procedimento)));
        }
      }
      // Filtro por TIPO do serviço (consulta x exame). A regra do convênio
      // pode ser específica de um tipo (ex.: "consulta" a R$ 9,99, 1/dia).
      // Sem este filtro, qualquer EXAME feito com um médico da mesma
      // especialidade (ex.: ECG/Ecocardiograma com cardiologista) era contado
      // como uso da consulta do dia e o paciente perdia o benefício.
      const tipoRegra = (beneficioEscolhido.tipo ?? "").toString().trim().toLowerCase() || null;
      if (tipoRegra && agsFiltrados.length > 0) {
        const removerSufixoEspecialidade = (s: string | null | undefined) =>
          (s ?? "").replace(/\s*\([^()]*\)\s*$/, "").trim();
        const inferirTipoPeloTexto = (s: string | null | undefined): string | null => {
          const n = normProcServico(s).replace(/\s+/g, " ").trim();
          if (!n) return null;
          if (/\bCONSULTA\b/.test(n)) return "consulta";
          if (
            /\b(ECG|ELETROCARDIOGRAMA|ECOCARDIOGRAMA|RX|RAIO\s*-?\s*X|RADIOGRAFIA|USG|ULTRASSONOGRAFIA|ULTRA\s*-?\s*SOM|TOMOGRAFIA|MAMOGRAFIA|DENSITOMETRIA|MAPA|HOLTER|ENDOSCOPIA|COLONOSCOPIA|LABORATORIO|LABORATORIAL|HEMOGRAMA|EXAME)\b/.test(
              n,
            )
          ) {
            return "exame";
          }
          return null;
        };
        const nomesAgs = Array.from(
          new Set(
            (agsFiltrados as Array<{ procedimento?: string | null }>)
              .map((a) => (a.procedimento ?? "").trim())
              .filter((n) => !!n),
          ),
        );
        if (nomesAgs.length > 0) {
          const nomesBusca = Array.from(
            new Set(
              nomesAgs
                .flatMap((n) => [n, removerSufixoEspecialidade(n)])
                .map((n) => n.trim())
                .filter(Boolean),
            ),
          );
          const { data: procsTipo } = await supabase
            .from("procedimentos")
            .select("nome,tipo")
            .eq("clinica_id", clinicaId)
            .in("nome", nomesBusca);
          const tipoPorNome = new Map<string, string>();
          ((procsTipo ?? []) as Array<{ nome: string | null; tipo: string | null }>).forEach(
            (p) => {
              const k = normProcServico(p.nome);
              const t = (p.tipo ?? "").toString().trim().toLowerCase();
              if (k && t && !tipoPorNome.has(k)) tipoPorNome.set(k, t);
            },
          );
          agsFiltrados = (agsFiltrados as Array<{ procedimento?: string | null }>).filter((a) => {
            const nomeOriginal = normProcServico(a.procedimento);
            const nomeSemSufixo = normProcServico(removerSufixoEspecialidade(a.procedimento));
            const t =
              tipoPorNome.get(nomeOriginal) ??
              tipoPorNome.get(nomeSemSufixo) ??
              inferirTipoPeloTexto(a.procedimento);
            // Para cota de consulta, só conta outro atendimento quando ele é
            // claramente consulta. Se o serviço não casa no cadastro, exames
            // como ECG/RX/Ecocardiograma não podem queimar a consulta diária.
            if (!t) return tipoRegra !== "consulta";
            return t === tipoRegra;
          }) as typeof agsFiltrados;
        }
      }
      // Regra: o limite só é consumido quando o agendamento efetivamente foi
      // pago. O status na tabela `agendamentos` nem sempre muda para
      // "realizado" após a cobrança no caixa — o sinal mais confiável é a
      // existência de um `fin_lancamentos` (receita, confirmado) vinculado ao
      // agendamento. Combinamos ambos.
      const idsFiltrados = agsFiltrados.map((a) => a.id).filter(Boolean);
      const pagosIds = new Set<string>();
      if (idsFiltrados.length > 0) {
        const { data: lancs } = await supabase
          .from("fin_lancamentos")
          .select("agendamento_id")
          .eq("clinica_id", clinicaId)
          .eq("tipo", "receita")
          .eq("status", "confirmado")
          .in("agendamento_id", idsFiltrados);
        ((lancs ?? []) as Array<{ agendamento_id: string | null }>).forEach((l) => {
          if (l.agendamento_id) pagosIds.add(l.agendamento_id);
        });
      }
      const isPago = (a: { id: string; status?: string | null }) =>
        a.status === "realizado" || a.status === "pago" || pagosIds.has(a.id);
      const agsPagos = agsFiltrados.filter((a) => isPago(a));
      const agsPendentes = agsFiltrados.filter((a) => !isPago(a));
      usados = agsPagos.length;

      // Escopo "titular ou dependente (exclusivo)": se qualquer OUTRO paciente
      // do contrato já consumiu na janela, a cota é considerada esgotada.
      let esgotadoExclusivo = false;
      if (escopoLim === "titular_ou_dependente") {
        esgotadoExclusivo = agsPagos.some((a) => a.paciente_id && a.paciente_id !== pacienteId);
      }

      if (usados >= Number(beneficioEscolhido.limite_qtd) || esgotadoExclusivo) {
        const modo = beneficioEscolhido.excedente_modo;
        const escopoTxt =
          escopoLim === "paciente"
            ? "paciente"
            : escopoLim === "titular_ou_dependente"
              ? "titular-ou-dependente"
              : "contrato";
        const periodoTxt =
          periodo === "semana"
            ? "semana"
            : periodo === "mes"
              ? "mês"
              : periodo === "ano"
                ? "ano"
                : periodo === "contrato"
                  ? "contrato"
                  : "dia";
        // Se a regra é gratuita e o limite já foi consumido, monta um texto
        // detalhado com data/paciente/médico do consumidor (pode ser o
        // titular ou dependente do mesmo contrato).
        let consumidorTxt = "";
        if (beneficioEscolhido.gratuito && agsPagos.length > 0) {
          const consumidor = agsPagos.slice().sort((a, b) => {
            const ta = a.inicio ? new Date(a.inicio).getTime() : 0;
            const tb = b.inicio ? new Date(b.inicio).getTime() : 0;
            return tb - ta;
          })[0];
          let medicoNome = "";
          let pacienteNome = "";
          if (consumidor?.medico_id) {
            const { data: m } = await supabase
              .from("medicos")
              .select("nome")
              .eq("id", consumidor.medico_id)
              .maybeSingle();
            medicoNome = (m as { nome?: string } | null)?.nome ?? "";
          }
          if (consumidor?.paciente_id) {
            const { data: p } = await supabase
              .from("pacientes")
              .select("nome")
              .eq("id", consumidor.paciente_id)
              .maybeSingle();
            pacienteNome = (p as { nome?: string } | null)?.nome ?? "";
          }
          const dt = consumidor?.inicio ? new Date(consumidor.inicio) : null;
          const dtTxt = dt
            ? `${dt.toLocaleDateString("pt-BR")} às ${dt.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`
            : "";
          consumidorTxt = `Gratuidade de ${procedimentoNome} deste convênio já foi utilizada${dtTxt ? ` em ${dtTxt}` : ""}${pacienteNome ? ` por ${pacienteNome}` : ""}${medicoNome ? ` com Dr(a). ${medicoNome}` : ""}.\n`;
        }
        if (modo === "bloquear") {
          bloquear = true;
          desconto = null;
          avisoLimite = consumidorTxt
            ? `${consumidorTxt}Este atendimento fica bloqueado pelo convênio.`
            : esgotadoExclusivo
              ? `Cota exclusiva já usada por outro membro do contrato — agendamento bloqueado pelo convênio.`
              : `Limite de ${beneficioEscolhido.limite_qtd}/${periodoTxt} por ${escopoTxt} atingido — agendamento bloqueado pelo convênio.`;
        } else if (modo === "particular") {
          desconto = null;
          avisoLimite = consumidorTxt
            ? `${consumidorTxt}Cobrando valor particular cheio neste atendimento.`
            : `Limite de ${beneficioEscolhido.limite_qtd}/${periodoTxt} por ${escopoTxt} atingido — cobrando valor particular cheio.`;
        } else if (modo === "valor_fixo") {
          const v = Number(beneficioEscolhido.excedente_valor) || 0;
          desconto = { tipo: "valor_fixo", valor: v, valorOutros: v };
          avisoLimite = consumidorTxt
            ? `${consumidorTxt}Cobrando valor fixo excedente de R$ ${v.toFixed(2)} neste atendimento.`
            : `Limite atingido — cobrando valor fixo excedente R$ ${v.toFixed(2)}.`;
        } else if (modo === "percentual_particular") {
          const pct = Number(beneficioEscolhido.excedente_percentual) || 0;
          // pct = desconto sobre o particular; ex.: 50 → paga 50% do particular
          desconto = { tipo: "percentual", valor: pct };
          avisoLimite = consumidorTxt
            ? `${consumidorTxt}Cobrando ${100 - pct}% do valor particular neste atendimento.`
            : `Limite de ${beneficioEscolhido.limite_qtd}/${periodoTxt} por ${escopoTxt} atingido — cobrando ${100 - pct}% do valor particular.`;
        } else if (modo === "regra_padrao_convenio") {
          // Fallback: procura a próxima regra do mesmo convênio para este
          // procedimento excluindo regras gratuitas. Aplica o desconto dessa
          // regra como se o benefício gratuito não existisse.
          //
          // A própria regra que estourou o limite fica FORA da busca. Sem essa
          // exclusão, uma regra não gratuita com limite (ex.: consulta de
          // Cardiologia a R$ 8,00, 1/dia por contrato) era reencontrada como
          // "regra padrão" e reaplicada: a 2ª consulta do dia saía pelos
          // mesmos R$ 8,00, exibindo "limite atingido" — ou seja, a cota não
          // tinha efeito nenhum. Só as regras gratuitas escapavam do problema,
          // porque `excludeGratuito` já as removia da busca.
          const regrasFallback = (regrasCb as any[]).filter((r) => r.id !== beneficioEscolhido.id);
          let fallback: any = null;
          for (const eid of espsTentativa) {
            const r = findRegra(regrasFallback as any, eid, procedimentoTipo, procedimentoId, {
              excludeGratuito: true,
            });
            if (r && (!fallback || scoreRegra(r) > scoreRegra(fallback))) {
              fallback = r;
            }
          }
          if (fallback) {
            if (fallback.modo === "valor_fixo") {
              const v = Number(fallback.valor) || 0;
              const vC = fallback.valor_cartao != null ? Number(fallback.valor_cartao) || 0 : v;
              desconto = { tipo: "valor_fixo", valor: v, valorOutros: vC };
              avisoLimite = consumidorTxt
                ? `${consumidorTxt}Aplicando o desconto padrão do convênio (R$ ${v.toFixed(2)}).`
                : `Limite de ${beneficioEscolhido.limite_qtd}/${periodoTxt} por ${escopoTxt} atingido — aplicando desconto padrão do convênio (R$ ${v.toFixed(2)}).`;
            } else if (fallback.modo === "percentual_desconto") {
              const p = Number(fallback.percentual) || 0;
              const pC =
                fallback.percentual_cartao != null ? Number(fallback.percentual_cartao) || 0 : p;
              desconto = { tipo: "percentual", valor: p, percentualOutros: pC };
              avisoLimite = consumidorTxt
                ? `${consumidorTxt}Aplicando o desconto padrão do convênio (${p}% off).`
                : `Limite de ${beneficioEscolhido.limite_qtd}/${periodoTxt} por ${escopoTxt} atingido — aplicando desconto padrão do convênio (${p}% off).`;
            } else {
              desconto = null;
              avisoLimite = consumidorTxt
                ? `${consumidorTxt}Sem regra padrão configurada — cobrando particular.`
                : `Limite atingido e sem regra padrão do convênio — cobrando valor particular.`;
            }
          } else {
            desconto = null;
            avisoLimite = consumidorTxt
              ? `${consumidorTxt}Não há regra padrão do convênio para este procedimento — cobrando valor particular.`
              : `Limite atingido e não há regra padrão do convênio — cobrando valor particular.`;
          }
        }
      } else if (agsPendentes.length >= 1) {
        // Cota ainda não consumida, mas existem outros agendamentos pendentes
        // que compartilham a cota — aviso informativo (não altera desconto).
        const aviso = calcularAvisoLimitePendentes({
          beneficio: beneficioEscolhido,
          pendentes: agsPendentes as { procedimento?: string | null }[],
          usados,
          procedimentoNome,
        });
        if (aviso) avisoLimite = aviso;
        // Se o convênio bloqueia excedente e os pendentes já estouram a cota,
        // bloqueia esta tentativa antes mesmo do primeiro virar consumido.
        if (
          deveBloquearPorLimitePendente({
            beneficio: beneficioEscolhido,
            pendentes: agsPendentes as { procedimento?: string | null }[],
            usados,
            procedimentoNome,
          })
        ) {
          bloquear = true;
          desconto = null;
        }
      }
    }
  }

  // 6) Tolerância de 5 dias corridos após o vencimento: dentro dela o
  //    convênio funciona NORMALMENTE (mesmo desconto/limite de sempre) — só
  //    avisa que a mensalidade está vencida, sem restringir nada. O bloqueio
  //    de verdade só acontece a partir do 6º dia (`bloquear`/`emDia=false`,
  //    tratado nos fluxos de cobrança que chamam esta função).
  if (emCarencia) {
    const diasAtraso = DIAS_TOLERANCIA - (diasCarenciaRestantes ?? 0);
    // No próprio dia do vencimento o atraso é zero — a parcela vence hoje, não
    // está vencida. Dizer "vencida há 0 dia(s)" fazia a recepção achar que o
    // paciente estava devendo já no dia da cobrança.
    const abertura =
      diasAtraso <= 0 ? "Mensalidade vence hoje" : `Mensalidade vencida há ${diasAtraso} dia(s)`;
    const info = `${abertura} — dentro da tolerância de ${DIAS_TOLERANCIA} dias, convênio segue liberado normalmente. Regularize em até ${diasCarenciaRestantes ?? 0} dia(s) para evitar bloqueio.`;
    avisoLimite = avisoLimite ? `${info} ${avisoLimite}` : info;
  }

  // Carrega acréscimo de cartão do convênio (aplicado no fluxo de cobrança
  // quando a forma de pagamento não é dinheiro). Convênio Funcionário nunca
  // recebe acréscimo — o nome do convênio já é normalizado abaixo.
  let acrescimoCartao: ConvenioInfo["acrescimoCartao"] = null;
  const nomeUpper = (convenioNome ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase();
  if (!nomeUpper.includes("FUNCIONARIO") && contrato.convenio_id) {
    const { data: convRow } = await supabase
      .from("cb_convenios")
      .select("acrescimo_cartao_modo,acrescimo_cartao_percentual,acrescimo_cartao_valor")
      .eq("id", contrato.convenio_id)
      .maybeSingle();
    const row = convRow as {
      acrescimo_cartao_modo: string | null;
      acrescimo_cartao_percentual: number | null;
      acrescimo_cartao_valor: number | null;
    } | null;
    if (row?.acrescimo_cartao_modo) {
      acrescimoCartao = {
        modo: row.acrescimo_cartao_modo as "percentual" | "valor_fixo",
        percentual: Number(row.acrescimo_cartao_percentual) || 0,
        valor: Number(row.acrescimo_cartao_valor) || 0,
      };
    }
  }

  return {
    convenioNome,
    emDia,
    parcelasAtrasadas,
    desconto,
    avisoLimite,
    bloquear,
    emCarencia,
    diasCarenciaRestantes,
    acrescimoCartao,
  };
}

export function aplicarDesconto(valor: number, d: DescontoConvenio): number {
  if (d.tipo === "gratuidade") return 0;
  if (d.tipo === "percentual") return Math.max(0, valor * (1 - Number(d.valor) / 100));
  if (d.tipo === "valor_fixo") return Math.max(0, Number(d.valor) || 0);
  return Math.max(0, valor - Number(d.valor));
}

/** Aplica desconto considerando o canal de pagamento (dinheiro vs outros). */
export function aplicarDescontoPorForma(valor: number, forma: string, d: DescontoConvenio): number {
  if (d.tipo === "valor_fixo") {
    const ehDinheiro = forma === "dinheiro";
    const v = ehDinheiro ? Number(d.valor) : Number(d.valorOutros);
    return Math.max(0, v || 0);
  }
  if (d.tipo === "percentual") {
    const ehDinheiro = forma === "dinheiro";
    const pct = ehDinheiro ? Number(d.valor) : Number(d.percentualOutros ?? d.valor);
    return Math.max(0, valor * (1 - (pct || 0) / 100));
  }
  return aplicarDesconto(valor, d);
}

/**
 * Retorna a memória de cálculo do desconto aplicado a este canal, para
 * exibir abaixo de cada opção do modal de "Forma de pagamento".
 * Formato curto: "R$ 130 − 10% = R$ 117"  ou  "Valor fixo R$ 95".
 */
export function memoriaDescontoPorForma(
  baseValor: number,
  forma: string,
  d: DescontoConvenio,
): string {
  const fmt = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  if (d.tipo === "gratuidade") return "Gratuidade (R$ 0,00)";
  if (d.tipo === "valor_fixo") {
    const v = forma === "dinheiro" ? Number(d.valor) : Number(d.valorOutros);
    return `Valor fixo ${fmt(v || 0)}`;
  }
  if (d.tipo === "percentual") {
    const pct = forma === "dinheiro" ? Number(d.valor) : Number(d.percentualOutros ?? d.valor);
    const final = Math.max(0, baseValor * (1 - (pct || 0) / 100));
    return `${fmt(baseValor)} − ${pct}% = ${fmt(final)}`;
  }
  return `${fmt(baseValor)} − ${fmt(Number(d.valor) || 0)}`;
}

/** Preço de um atendimento já resolvido para a tela de cobrança do Caixa. */
export type PrecoCaixa = {
  /** Valor a cobrar em dinheiro (já com o benefício do convênio, quando há). */
  valorDinheiro: number;
  /** Valor a cobrar em PIX/cartão (já com o benefício do convênio, quando há). */
  valorCartao: number;
  /** Valor particular cheio, para o operador comparar. */
  baseDinheiro: number;
  baseCartao: number;
  /** Nome do convênio do contrato do paciente, se existir. */
  convenioNome: string | null;
  /** Etiqueta curta do benefício aplicado: "-10%", "R$ 9,99", "GRATUIDADE". */
  rotuloBeneficio: string | null;
  /** Memória do cálculo em dinheiro, ex.: "R$ 130,00 − 10% = R$ 117,00". */
  memoriaDinheiro: string | null;
  /** Aviso a exibir: atraso de mensalidade, cota esgotada, carência. */
  aviso: string | null;
  /** Convênio existe mas o benefício não entrou (atraso/limite/carência). */
  cobrandoParticular: boolean;
  /** Benefício é cortesia — o valor sugerido é zero. */
  gratuidade: boolean;
};

/**
 * Preço de um atendimento para a tela de cobrança do Caixa, usando o mesmo
 * motor da Agenda.
 *
 * O Caixa exibia o valor calculado pela função `fila_caixa_hoje` do banco, que
 * reimplementava a regra do convênio de forma reduzida: enxergava só o titular
 * (dependente do contrato pagava particular), descartava benefícios com cota,
 * repetia o preço de dinheiro na coluna de cartão e não bloqueava contrato em
 * atraso. Aqui o valor é recalculado pelo motor real na hora de abrir a
 * cobrança, que é o número que o paciente efetivamente paga.
 */
export async function precoAtendimentoParaCaixa(params: {
  clinicaId: string;
  pacienteId: string | null | undefined;
  medicoNome?: string | null;
  medicoId?: string | null;
  procedimentoNome: string | null | undefined;
  agendamentoId?: string | null;
  dataRef?: string | null;
}): Promise<PrecoCaixa | null> {
  const { clinicaId, pacienteId, medicoId, procedimentoNome, agendamentoId, dataRef } = params;
  const nomeBruto = (procedimentoNome ?? "").trim();
  if (!nomeBruto) return null;

  // Mesma resolução de nome do motor: a Agenda grava "CONSULTA (CARDIOLOGIA)"
  // e o cadastro tem só "CONSULTA", então o sufixo de especialidade sai antes
  // da busca. Sem isso o serviço não é encontrado e o valor sai zerado.
  const semSufixo = nomeBruto.replace(/\s*\([^()]*\)\s*$/, "").trim();
  const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
  const colunas =
    "id,nome,valor_dinheiro,valor_dinheiro_pix,valor_padrao,valor_pix,valor_cartao,valor_cartao_credito,valor_cartao_debito";
  let proc: any = null;
  for (const candidato of Array.from(new Set([nomeBruto, semSufixo])).filter(Boolean)) {
    const { data } = await supabase
      .from("procedimentos")
      .select(colunas)
      .eq("clinica_id", clinicaId)
      .eq("ativo", true)
      .ilike("nome", candidato)
      .limit(5);
    const lista = (data ?? []) as any[];
    proc = lista.find((p) => norm(p.nome ?? "") === norm(candidato)) ?? lista[0] ?? null;
    if (proc) break;
  }
  if (!proc && semSufixo) {
    const { data } = await supabase
      .from("procedimentos")
      .select(colunas)
      .eq("clinica_id", clinicaId)
      .eq("ativo", true)
      .ilike("nome", `%${semSufixo}%`)
      .limit(10);
    proc =
      ((data ?? []) as any[]).find((p) => norm(p.nome ?? "").includes(norm(semSufixo))) ?? null;
  }
  if (!proc) return null;

  const baseDinheiro = primeiroValorValido(
    proc.valor_dinheiro,
    proc.valor_dinheiro_pix,
    proc.valor_padrao,
  );
  const baseCartao = valorCartaoProcedimento(proc);

  const info = await obterInfoConvenioPaciente({
    clinicaId,
    pacienteId,
    medicoId,
    procedimentoNome: nomeBruto,
    agendamentoId,
    dataRef,
  });

  const semConvenio: PrecoCaixa = {
    valorDinheiro: baseDinheiro,
    valorCartao: baseCartao,
    baseDinheiro,
    baseCartao,
    convenioNome: null,
    rotuloBeneficio: null,
    memoriaDinheiro: null,
    aviso: null,
    cobrandoParticular: false,
    gratuidade: false,
  };
  if (!info) return semConvenio;

  // Contrato em atraso além da tolerância, cota esgotada ou carência não
  // cumprida: cobra o particular cheio, mas diz o motivo na tela.
  if (!info.emDia) {
    return {
      ...semConvenio,
      convenioNome: info.convenioNome,
      cobrandoParticular: true,
      aviso: `Convênio ${info.convenioNome} em atraso (${info.parcelasAtrasadas} parcela(s)). Cobrando valor particular.`,
    };
  }
  if (!info.desconto) {
    return {
      ...semConvenio,
      convenioNome: info.convenioNome,
      cobrandoParticular: true,
      aviso: info.avisoLimite ?? null,
    };
  }

  const d = info.desconto;
  const rotulo =
    d.tipo === "gratuidade"
      ? "GRATUIDADE"
      : d.tipo === "percentual"
        ? `-${d.valor}%`
        : `R$ ${Number(d.valor ?? 0)
            .toFixed(2)
            .replace(".", ",")}`;
  return {
    valorDinheiro: Math.round(aplicarDescontoPorForma(baseDinheiro, "dinheiro", d) * 100) / 100,
    valorCartao: Math.round(aplicarDescontoPorForma(baseCartao, "cartao_credito", d) * 100) / 100,
    baseDinheiro,
    baseCartao,
    convenioNome: info.convenioNome,
    rotuloBeneficio: rotulo,
    memoriaDinheiro: memoriaDescontoPorForma(baseDinheiro, "dinheiro", d),
    aviso: info.avisoLimite ?? null,
    cobrandoParticular: false,
    gratuidade: d.tipo === "gratuidade",
  };
}
