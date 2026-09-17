/** Regras administrativas da clínica. Não calcula confiança nem altera o cadastro. */
export const MARCADOR_REGRAS_CATALOGO =
  "REGRAS DO CATÁLOGO — SFP, PROFISSIONAL GENÉRICO E IDADE MÍNIMA (2026-09-17)";
export const REGRAS_CATALOGO_PROMPT = `${MARCADOR_REGRAS_CATALOGO}
Estas regras substituem orientações anteriores sobre SFP, técnico/técnica e interpretação de idades, tanto no WhatsApp real quanto na homologação.
- Se o procedimento ou a consulta solicitada tiver o nome do profissional SFP, encaminhe para atendimento humano usando solicitar_atendente_humano. Não prossiga com informações ou agendamento automático desse item. Só confirme a transferência quando a ferramenta confirmar; em caso de falha, informe a dificuldade sem afirmar que transferiu. Uma opção SFP em uma lista ampla não torna as outras opções exclusivas da equipe: identifique o atendimento solicitado.
- Se o nome do profissional for técnico ou técnica (com ou sem acento, independentemente de maiúsculas), não informe esse nome nem invente outro. Omita a identificação do profissional e forneça normalmente as demais informações publicadas, inclusive valores, preparo, horários, modalidade e restrições. A regra também vale para resumos e confirmações.
- As idades informadas no catálogo são idades mínimas. Apresente como “a partir de X anos” ou “a partir de X meses”, conservando o número e a unidade. Exemplos: 18 anos → a partir de 18 anos; 3 anos → a partir de 3 anos; 0 anos → a partir de 0 anos. Uma idade isolada em “Idade/critério informado” também é mínima. Não transforme idade mínima em idade exata, máxima ou faixa. Campo sem idade continua desconhecido. Não interprete preços, horários, duração do preparo ou periodicidade como idade.`;

function nomeNormalizado(nome: unknown): string {
  return String(nome ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}
export const profissionalSfp = (nome: unknown) => nomeNormalizado(nome) === "sfp";
export const profissionalGenerico = (nome: unknown) =>
  /^(tecnico|tecnica)$/.test(nomeNormalizado(nome));

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
  return (
    extras?.atendimento_humano_obrigatorio === true ||
    profissionalSfp(r.medico) ||
    (Array.isArray(extras?.executantes) &&
      extras.executantes.some((e) => profissionalSfp(objeto(e)?.nome)))
  );
}

/** Não usa o primeiro resultado de uma lista ambígua como escolha do paciente. */
export function resultadoExigeHumano(
  dados: unknown,
  referenciasSelecionadas: readonly string[] = [],
): boolean {
  const r = objeto(dados);
  if (!r) return false;
  if (r.codigo === "PROFISSIONAL_SFP" || r.erro === "PROFISSIONAL_SFP") return true;
  const registros = [r.records, r.registros, r.itens].find(Array.isArray) as unknown[] | undefined;
  if (!registros?.length) return false;
  const escolhidos = registros.filter((reg) =>
    referenciasSelecionadas.includes(String(objeto(reg)?.id ?? "")),
  );
  return (escolhidos.length ? escolhidos : registros).every(registroExigeHumano);
}

export const MOTIVO_SFP = "PROFISSIONAL_SFP: atendimento solicitado exclusivo da equipe humana";
export function respostaEncaminhamentoSfp(confirmado: boolean): string {
  return confirmado
    ? "Esse atendimento é realizado com o apoio da nossa equipe. Encaminhei sua conversa para um atendente, que continuará por aqui."
    : "Esse atendimento precisa do apoio da nossa equipe. Não consegui transferir sua conversa neste momento; por favor, entre em contato com a recepção.";
}

/** Projeção pública apenas. IDs e nomes usados internamente na agenda não mudam. */
type DadosPublicos<T> = T extends string
  ? string | null
  : T extends Array<infer V>
    ? Array<DadosPublicos<V>>
    : T extends object
      ? { [K in keyof T]: DadosPublicos<T[K]> }
      : T;
export function dadosPublicosCatalogo<T>(valor: T): DadosPublicos<T> {
  if (typeof valor === "string")
    return (profissionalGenerico(valor) ? null : valor) as DadosPublicos<T>;
  if (Array.isArray(valor))
    return valor.map(dadosPublicosCatalogo).filter((v) => v !== null) as DadosPublicos<T>;
  if (valor && typeof valor === "object")
    return Object.fromEntries(
      Object.entries(valor).map(([chave, v]) => [
        chave,
        chave === "medico" && typeof v === "string"
          ? v
              .split(",")
              .map((n) => n.trim())
              .filter((n) => !profissionalGenerico(n))
              .join(", ") || null
          : dadosPublicosCatalogo(v),
      ]),
    ) as DadosPublicos<T>;
  return valor as DadosPublicos<T>;
}

/** Protege também os textos estáticos e respostas que repetem o nome genérico. */
export function omitirNomeGenerico(texto: string): string {
  return texto
    .replace(
      /^[\t ]*(?:[-•]\s*)?\*{0,2}(?:profissional|m[eé]dico|m[eé]dica|executante)\s*:?\*{0,2}\s*:?\s*(?:(?:dr|dra)\.?\s*)?t[eé]cnic[oa]\b[\t *.,]*($|\n)/gim,
      "",
    )
    .replace(
      /\b(?:profissional|m[eé]dico|m[eé]dica|executante)\s*:\s*(?:(?:dr|dra)\.?\s*)?t[eé]cnic[oa]\b[\t .;]*/gi,
      "",
    )
    .replace(
      /\s+(?:com|por|pelo|pela)\s+(?:(?:o|a|um|uma)\s+)?(?:(?:dr|dra)\.?\s*)?t[eé]cnic[oa]\b/gi,
      "",
    )
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
