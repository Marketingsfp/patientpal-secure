import { CAUSA_SFP_OUTRA_UNIDADE } from "@/lib/atendimento/motivo-sfp";
import { lerEstrutura } from "./catalogo-estrutura";
import { fluxoDoRegistro } from "./fluxo-agendamento-item";

/**
 * Regra de 12/10/2026: a Nina só agenda itens do catálogo marcados com
 * "Nina pode agendar". Sem registro identificado, ou com qualquer registro
 * não marcado, a resposta é não: informar e encaminhar à equipe.
 */
export function registrosPermitemAgendar(registros: readonly { estrutura?: unknown }[]): boolean {
  return (
    registros.length > 0 &&
    registros.every((r) => lerEstrutura(r.estrutura).nina_pode_agendar === true)
  );
}

type RegistroAgendavel = {
  id: string;
  nome: string;
  estrutura?: unknown;
  medico_id?: string | null;
  tipo_atendimento?: string | null;
};

/**
 * Decide pelo catálogo já lido. Ordem: itens identificados na conversa,
 * exame/procedimento pelo nome exato e consulta pelo profissional.
 * `null` = nenhum item encontrado (o servidor ainda pode resolver o médico).
 */
export function permissaoAgendamentoNoCatalogo(
  catalogo: { servicos: readonly RegistroAgendavel[]; profissionais: readonly RegistroAgendavel[] },
  entrada: {
    medico?: string | null;
    procedimento?: string | null;
    referencias?: readonly string[];
  },
): { permitido: boolean; nomes: string[] } | null {
  // Agendar exige "Nina pode agendar" E modalidade agendável (hora marcada,
  // ordem de chegada com pré-agendamento ou ficha).
  const decidir = (registros: readonly RegistroAgendavel[]) => ({
    permitido: registros.length > 0 && registros.every((r) => fluxoDoRegistro(r) === "agendar"),
    nomes: registros.map((r) => r.nome),
  });
  const referencias = (entrada.referencias ?? []).filter((id) => /^[0-9a-f-]{36}$/i.test(id));
  const porReferencia = [...catalogo.servicos, ...catalogo.profissionais].filter((r) =>
    referencias.includes(r.id),
  );
  if (porReferencia.length) return decidir(porReferencia);
  const procedimento = entrada.procedimento?.trim().toLocaleLowerCase("pt-BR");
  if (procedimento) {
    const servicos = catalogo.servicos.filter(
      (s) => s.nome.toLocaleLowerCase("pt-BR") === procedimento,
    );
    if (servicos.length) return decidir(servicos);
  }
  const medico = entrada.medico?.trim();
  if (medico) {
    const alvo = medico.toLocaleLowerCase("pt-BR");
    const profissionais = catalogo.profissionais.filter(
      (p) =>
        p.id === medico ||
        p.medico_id === medico ||
        p.nome.trim().toLocaleLowerCase("pt-BR") === alvo,
    );
    if (profissionais.length) return decidir(profissionais);
  }
  return null;
}

/** Só normaliza critérios de idade explícitos, não datas, preços ou periodicidade. */
export function apresentarIdadeMinima(texto: string | null): string | null {
  if (!texto) return texto;
  return texto
    .replace(
      /\b(idade(?:\s*\/\s*crit[eé]rio informado)?(?:\s+(?:m[ií]nima|informada))?\s*:\s*)(?:a partir de\s+)?(\d+\s*(?:anos?|meses|m[eê]s))\b/gi,
      (_t, rotulo: string, idade: string) => `${rotulo}a partir de ${idade}`,
    )
    .replace(
      /(^|[|;\n]\s*)(\d+\s*(?:anos?|meses|m[eê]s))(?=\s*(?:$|[|;\n]))/gi,
      (_t, inicio: string, idade: string) => `${inicio}a partir de ${idade}`,
    );
}

function objeto(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}
export function registroExigeHumano(valor: unknown): boolean {
  const r = objeto(valor);
  if (!r) return false;
  const extras = objeto(r.extras);
  return extras?.atendimento_humano_obrigatorio === true;
}

/** Snapshot restrito à regra que foi avaliada; não lê o cadastro atual para explicar o passado. */
export function evidenciaRegraHumano(dados: unknown, referencias: readonly string[] = []) {
  const r = objeto(dados) ?? {};
  const registros = [r.records, r.registros, r.itens].find(Array.isArray) as unknown[] | undefined;
  const escolhidos =
    registros?.filter((v) => referencias.includes(String(objeto(v)?.id ?? ""))) ?? [];
  return (escolhidos.length ? escolhidos : (registros ?? []))
    .filter(registroExigeHumano)
    .map((v) => {
      const item = objeto(v)!;
      return {
        id: item.id ?? null,
        nome: item.procedimento ?? item.nome ?? null,
        campo: "extras.atendimento_humano_obrigatorio",
        valor: true,
        ...(typeof item.medico === "string" && item.medico.trim()
          ? { profissional: item.medico.trim() }
          : {}),
      };
    });
}

/** Apenas descreve uma restrição já confirmada. Nunca decide encaminhar pelo nome. */
export function motivoRegraHumano(
  evidencia: readonly { nome: unknown; profissional?: unknown }[] = [],
): string {
  // Listas com outros profissionais não comprovam que a causa foi SFP.
  const sfp =
    evidencia.length > 0 &&
    evidencia.every(
      (r) => typeof r.profissional === "string" && /^sfp$/i.test(r.profissional.trim()),
    );
  const nomes = evidencia
    .map((r) => (typeof r.nome === "string" ? r.nome.trim() : ""))
    .filter(Boolean);
  return (
    "CATALOGO_ATENDIMENTO_HUMANO" +
    (sfp ? " / PROFISSIONAL_SFP" : "") +
    ": " +
    (sfp
      ? CAUSA_SFP_OUTRA_UNIDADE + (nomes.length ? ` Atendimento: ${nomes.join("; ")}.` : "")
      : (nomes.length ? nomes.join("; ") + ". " : "") +
        "Encaminhamento humano obrigatório no cadastro consultado.")
  ).slice(0, 500);
}

/** Não usa o primeiro resultado de uma lista ambígua como escolha do paciente. */
export function resultadoExigeHumano(
  dados: unknown,
  referenciasSelecionadas: readonly string[] = [],
): boolean {
  const r = objeto(dados);
  if (!r) return false;
  if (r.esclarecimento) return false;
  if (r.codigo === "CATALOGO_ATENDIMENTO_HUMANO" || r.erro === "CATALOGO_ATENDIMENTO_HUMANO")
    return true;
  const registros = [r.records, r.registros, r.itens].find(Array.isArray) as unknown[] | undefined;
  if (!registros?.length) return false;
  const escolhidos = registros.filter((reg) =>
    referenciasSelecionadas.includes(String(objeto(reg)?.id ?? "")),
  );
  return (escolhidos.length ? escolhidos : registros).every(registroExigeHumano);
}
