import { supabase } from "@/integrations/supabase/client";

export interface DependenteIncluido {
  id: string;
  paciente_id: string;
  paciente_nome: string;
  parentesco: string | null;
  tipo: string;
  incluido_em: string;
  excluido_em: string | null;
  ativo: boolean;
}

export interface TaxaInclusaoLancada {
  id: string;
  numero_parcela: number;
  valor: number;
  vencimento: string;
}

/** Um cartão ativo em que o paciente já aparece, como titular ou dependente. */
export interface VinculoAtivoDoPaciente {
  contratoId: string;
  numero: number | null;
  titularNome: string;
  convenioNome: string | null;
  vinculo: "titular" | "dependente";
}

export type IncluirDependenteResultado =
  | {
      ok: true;
      dependente: DependenteIncluido;
      taxa?: TaxaInclusaoLancada;
      taxaAviso?: string;
      /**
       * Preenchido quando a inclusão foi feita mesmo com o paciente já ligado
       * a outro cartão ativo (operador confirmou, ou o chamador é a
       * importação em lote). Serve para a tela registrar o aviso.
       */
      avisoVinculoDuplicado?: string;
    }
  | {
      ok: false;
      mensagem: string;
      /**
       * "vinculo_duplicado" NÃO é erro: é a pergunta que falta ao operador.
       * Quem chama deve confirmar com ele e repetir a chamada com
       * `confirmarVinculoDuplicado: true`.
       */
      motivo?: "vinculo_duplicado";
      vinculos?: VinculoAtivoDoPaciente[];
      error?: unknown;
    };

/**
 * Lista os cartões ATIVOS em que o paciente já aparece — como titular ou como
 * dependente ativo —, ignorando o contrato informado em `ignorarContratoId`.
 *
 * Existe porque nada impedia a recepção de cadastrar o mesmo paciente como
 * dependente em dois cartões ativos ao mesmo tempo. Quando isso acontece, o
 * sistema tem que escolher um dos dois para decidir convênio, preço e bloqueio
 * por mensalidade vencida — e o paciente podia acabar sendo cobrado pela
 * tabela de um cartão e bloqueado pela dívida do outro.
 */
export async function buscarVinculosAtivosDoPaciente(params: {
  pacienteId: string;
  clinicaId: string;
  ignorarContratoId?: string | null;
}): Promise<VinculoAtivoDoPaciente[]> {
  const { pacienteId, clinicaId, ignorarContratoId } = params;
  if (!pacienteId || !clinicaId) return [];

  const encontrados: VinculoAtivoDoPaciente[] = [];

  const { data: comoTitular } = await supabase
    .from("contratos_assinatura")
    .select("id, numero, paciente_nome, cb_convenios(nome)")
    .eq("clinica_id", clinicaId)
    .eq("status", "ativo")
    .eq("paciente_id", pacienteId)
    .limit(50);
  for (const c of ((comoTitular ?? []) as any[]).filter(Boolean)) {
    if (ignorarContratoId && c.id === ignorarContratoId) continue;
    encontrados.push({
      contratoId: String(c.id),
      numero: c.numero ?? null,
      titularNome: c.paciente_nome ?? "—",
      convenioNome: c.cb_convenios?.nome ?? null,
      vinculo: "titular",
    });
  }

  const { data: comoDependente } = await supabase
    .from("contrato_dependentes")
    .select(
      "contrato_id, contratos_assinatura!inner(id, numero, status, clinica_id, paciente_nome, cb_convenios(nome))",
    )
    .eq("paciente_id", pacienteId)
    .eq("ativo", true)
    .limit(50);
  for (const linha of ((comoDependente ?? []) as any[]).filter(Boolean)) {
    const c = linha.contratos_assinatura;
    if (!c || c.clinica_id !== clinicaId || c.status !== "ativo") continue;
    if (ignorarContratoId && c.id === ignorarContratoId) continue;
    if (encontrados.some((v) => v.contratoId === String(c.id))) continue;
    encontrados.push({
      contratoId: String(c.id),
      numero: c.numero ?? null,
      titularNome: c.paciente_nome ?? "—",
      convenioNome: c.cb_convenios?.nome ?? null,
      vinculo: "dependente",
    });
  }

  return encontrados;
}

/** Frase pronta para a tela, listando os cartões em que o paciente já está. */
export function descreverVinculosAtivos(
  pacienteNome: string,
  vinculos: ReadonlyArray<VinculoAtivoDoPaciente>,
): string {
  const linhas = vinculos.map((v) => {
    const cartao = v.numero != null ? `cartão ${v.numero}` : "um cartão";
    const convenio = v.convenioNome ? ` — ${v.convenioNome}` : "";
    const papel =
      v.vinculo === "titular"
        ? "onde é o TITULAR"
        : `onde é dependente de ${v.titularNome.toUpperCase()}`;
    return `• ${cartao}${convenio}, ${papel}`;
  });
  const abertura =
    vinculos.length === 1
      ? `${pacienteNome} já está em outro cartão ativo:`
      : `${pacienteNome} já está em ${vinculos.length} outros cartões ativos:`;
  return `${abertura}\n\n${linhas.join("\n")}`;
}

/**
 * `incluirDependenteContrato` com a pergunta ao operador já embutida.
 *
 * Devolve `null` quando o operador desistiu no aviso de vínculo duplicado —
 * nesse caso a tela deve simplesmente parar, sem mostrar erro.
 *
 * A pergunta chega por parâmetro (e não com `confirmDialog` importado aqui)
 * para este módulo continuar sem depender de componente de tela.
 */
export async function incluirDependenteConfirmando(
  params: Parameters<typeof incluirDependenteContrato>[0],
  perguntar: (mensagem: string) => Promise<boolean>,
): Promise<IncluirDependenteResultado | null> {
  const primeira = await incluirDependenteContrato(params);
  if (primeira.ok || primeira.motivo !== "vinculo_duplicado") return primeira;
  if (!(await perguntar(primeira.mensagem))) return null;
  return incluirDependenteContrato({ ...params, confirmarVinculoDuplicado: true });
}

/**
 * Rotina única para incluir dependente num contrato de assinatura.
 * Três telas diferentes inseriam direto em contrato_dependentes, cada uma
 * com sua própria (ou nenhuma) validação de limite/duplicidade/titular —
 * a regra do plano podia ser burlada por quem passasse pela tela sem
 * checagem. Centraliza a validação aqui (o banco também bloqueia via
 * trigger trg_contrato_dependentes_validar, como última linha de defesa).
 */
export async function incluirDependenteContrato(params: {
  contratoId: string;
  pacienteId: string;
  pacienteNome: string;
  parentesco?: string | null;
  tipo?: string;
  /**
   * Quando presente, cria uma cobrança avulsa de "Taxa de inclusão de
   * dependente" em `contrato_mensalidades` (numero_parcela negativo — não
   * conta como mensalidade). Se a taxa falhar, a inclusão do dependente
   * já feita permanece e retornamos `taxaAviso` para o operador reagir.
   */
  taxa?: {
    valor: number;
    vencimento: string; // ISO YYYY-MM-DD
  } | null;
  /**
   * Deixa passar quando o paciente já está em OUTRO cartão ativo. Sem isto, a
   * função devolve `motivo: "vinculo_duplicado"` com a lista dos cartões, para
   * a tela perguntar ao operador antes de duplicar o vínculo.
   *
   * Não é bloqueio: mudar de cartão é legítimo (foi o que a recepção fez ao
   * vender um plano novo para a família). O que não pode é acontecer sem que
   * ninguém perceba — quando o paciente fica ativo nos dois, o sistema precisa
   * escolher um deles para decidir preço e inadimplência, e o paciente podia
   * ser bloqueado pela dívida de um titular que não é mais o dele.
   */
  confirmarVinculoDuplicado?: boolean;
}): Promise<IncluirDependenteResultado> {
  const {
    contratoId,
    pacienteId,
    pacienteNome,
    parentesco,
    tipo,
    taxa,
    confirmarVinculoDuplicado,
  } = params;

  const { data: contrato, error: eContrato } = await supabase
    .from("contratos_assinatura")
    .select("id, paciente_id, status, convenio_id, clinica_id")
    .eq("id", contratoId)
    .maybeSingle();
  if (eContrato) return { ok: false, mensagem: "Falha ao buscar o contrato.", error: eContrato };
  if (!contrato) return { ok: false, mensagem: "Contrato não encontrado." };
  if (contrato.status === "cancelado") {
    return {
      ok: false,
      mensagem: "Este contrato está cancelado — não é possível incluir dependentes.",
    };
  }
  if (contrato.paciente_id === pacienteId) {
    return { ok: false, mensagem: "O titular não pode ser dependente do próprio contrato." };
  }

  const { data: ativos, error: eAtivos } = await supabase
    .from("contrato_dependentes")
    .select("id, paciente_id")
    .eq("contrato_id", contratoId)
    .eq("ativo", true);
  if (eAtivos)
    return { ok: false, mensagem: "Falha ao checar dependentes atuais.", error: eAtivos };
  const ativosRows = (ativos ?? []) as Array<{ id: string; paciente_id: string }>;
  if (ativosRows.some((d) => d.paciente_id === pacienteId)) {
    return { ok: false, mensagem: "Esse paciente já é dependente ativo deste contrato." };
  }

  let maxDep = 0;
  if (contrato.convenio_id) {
    const { data: conv } = await supabase
      .from("cb_convenios")
      .select("max_dependentes")
      .eq("id", contrato.convenio_id)
      .maybeSingle();
    maxDep = Number((conv as { max_dependentes?: number } | null)?.max_dependentes ?? 0) || 0;
  }
  if (ativosRows.length >= maxDep) {
    return {
      ok: false,
      mensagem:
        maxDep === 0
          ? "Este convênio não permite dependentes."
          : `Limite de ${maxDep} dependentes atingido.`,
    };
  }

  // Último check antes de gravar: o paciente já está em outro cartão ativo?
  // Fica por último de propósito — não adianta avisar sobre duplicidade se a
  // inclusão fosse falhar por limite ou contrato cancelado de qualquer jeito.
  let avisoVinculoDuplicado: string | undefined;
  const vinculos = await buscarVinculosAtivosDoPaciente({
    pacienteId,
    clinicaId: (contrato as { clinica_id: string }).clinica_id,
    ignorarContratoId: contratoId,
  });
  if (vinculos.length > 0) {
    const descricao = descreverVinculosAtivos(pacienteNome, vinculos);
    if (!confirmarVinculoDuplicado) {
      return {
        ok: false,
        motivo: "vinculo_duplicado",
        vinculos,
        mensagem: `${descricao}\n\nSe ele mudou de cartão, remova o vínculo antigo depois de incluir aqui — ficar ativo nos dois faz o sistema escolher um deles para decidir preço e mensalidade vencida.`,
      };
    }
    avisoVinculoDuplicado = descricao;
  }

  const hoje = new Date().toISOString().slice(0, 10);
  const { data, error } = await supabase
    .from("contrato_dependentes")
    .insert({
      contrato_id: contratoId,
      paciente_id: pacienteId,
      paciente_nome: pacienteNome,
      parentesco: parentesco?.trim() || null,
      tipo: tipo || "dependente",
      incluido_em: hoje,
      ativo: true,
    } as never)
    .select("id, paciente_id, paciente_nome, parentesco, tipo, incluido_em, excluido_em, ativo")
    .single();
  if (error) {
    // Trava de banco (trigger) é a última linha de defesa contra corrida —
    // mesma mensagem amigável de duplicidade caso a checagem acima perca.
    const mensagem =
      (error as { code?: string }).code === "23505"
        ? "Esse paciente já é dependente ativo deste contrato."
        : "Falha ao incluir dependente.";
    return { ok: false, mensagem, error };
  }
  const dependente = data as unknown as DependenteIncluido;

  // Lançamento opcional da Taxa de inclusão de dependente. Usa
  // numero_parcela negativo para diferenciar de mensalidades e da adesão
  // inicial (0). O menor negativo existente decrementa em 1.
  if (taxa && Number(taxa.valor) > 0) {
    const { data: negs } = await supabase
      .from("contrato_mensalidades")
      .select("numero_parcela")
      .eq("contrato_id", contratoId)
      .lt("numero_parcela", 0)
      .order("numero_parcela", { ascending: true })
      .limit(1);
    const menorNeg = ((negs ?? []) as Array<{ numero_parcela: number }>)[0]?.numero_parcela ?? 0;
    const proxNeg = Math.min(menorNeg, 0) - 1;
    const observacoes = `Taxa de inclusão de dependente — ${pacienteNome}`;
    const { data: taxaRow, error: eTaxa } = await supabase
      .from("contrato_mensalidades")
      .insert({
        contrato_id: contratoId,
        clinica_id: (contrato as { clinica_id: string }).clinica_id,
        numero_parcela: proxNeg,
        vencimento: taxa.vencimento,
        valor: Number(taxa.valor),
        status: "pendente",
        observacoes,
      } as never)
      .select("id, numero_parcela, valor, vencimento")
      .single();
    if (eTaxa) {
      return {
        ok: true,
        dependente,
        taxaAviso: `Dependente incluído, mas a Taxa de inclusão não foi lançada. Detalhe: ${eTaxa.message ?? String(eTaxa)}`,
        avisoVinculoDuplicado,
      };
    }
    return {
      ok: true,
      dependente,
      taxa: taxaRow as unknown as TaxaInclusaoLancada,
      avisoVinculoDuplicado,
    };
  }

  return { ok: true, dependente, avisoVinculoDuplicado };
}
