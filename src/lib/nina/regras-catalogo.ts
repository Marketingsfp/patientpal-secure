import { criarResultado } from "./resposta/contrato";

/** Regras administrativas da clínica. Não calcula confiança nem altera o cadastro. */
export const MARCADOR_REGRAS_CATALOGO =
  "REGRAS DO CATÁLOGO — SFP, PROFISSIONAL GENÉRICO E IDADE MÍNIMA (2026-09-17)";
export const REGRAS_CATALOGO_PROMPT = `${MARCADOR_REGRAS_CATALOGO}
Estas regras substituem orientações anteriores sobre SFP, nomes genéricos de profissionais e interpretação de idades, tanto no WhatsApp real quanto na homologação.
- RAIO-X e MAMOGRAFIA no campo de executante/médico são recursos internos da agenda, não pessoas. Use seus IDs internamente para consultar vagas e agendar; não ofereça escolha desses recursos, não os apresente como profissional e não peça confirmação de profissional. Nas informações, opções de horário, resumo e conclusão, apresente o nome específico do exame, data, horário e demais informações pertinentes. Preserve o nome do exame: MAMOGRAFIA como atendimento pode ser informado; RAIO-X como suposto nome de médico não. Nunca invente médico ou enfermeiro para esses procedimentos.
- Se o procedimento ou a consulta solicitada tiver o nome do profissional SFP, encaminhe para atendimento humano usando solicitar_atendente_humano com motivo iniciado por PROFISSIONAL_SFP. Esse encaminhamento é silencioso: apenas atribua à equipe, sem mensagem ao paciente, aviso de transferência, protocolo, saudação ou informações do item. Encerre o turno quando a ferramenta confirmar; em caso de falha, informe a dificuldade sem afirmar que transferiu. Uma opção SFP em uma lista ampla não torna as outras opções exclusivas da equipe: identifique o atendimento solicitado.
- Na identificação do profissional, apresente somente nomes próprios publicados. Cargos, equipes e setores como técnico, técnica, enfermagem, enfermeiro, enfermeira ou equipe de enfermagem não são nomes próprios: omita essa identificação, sem inventar ou substituir por outro profissional. Use o nome do exame/procedimento como título e forneça normalmente as demais informações publicadas, inclusive valores, preparo, horários, modalidade e restrições. Não deixe uma linha "Profissional:" vazia nem pergunte se o paciente prefere "enfermagem" ou "técnica". Preserve nomes próprios em listas que também contenham nomes genéricos. A regra vale com ou sem acento, em qualquer capitalização, também em resumos e confirmações. SFP continua exigindo encaminhamento humano silencioso; não o trate apenas como nome a ocultar.
- As idades informadas no catálogo são idades mínimas. Apresente como “a partir de X anos” ou “a partir de X meses”, conservando o número e a unidade. Exemplos: 18 anos → a partir de 18 anos; 3 anos → a partir de 3 anos; 0 anos → a partir de 0 anos. Uma idade isolada em “Idade/critério informado” também é mínima. Não transforme idade mínima em idade exata, máxima ou faixa. Campo sem idade continua desconhecido. Não interprete preços, horários, duração do preparo ou periodicidade como idade.`;

function nomeNormalizado(nome: unknown): string {
  return String(nome ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}
export const profissionalSfp = (nome: unknown) => ["sfp", "spf"].includes(nomeNormalizado(nome));
// Marcadores completos de cargo/equipe. Não busca essas palavras dentro de nomes próprios.
const NOME_GENERICO = String.raw`(?:t[eé]cnic[oa]s?(?:\s+(?:de|em)\s+(?:enfermagem|radiologia|laborat[oó]rio))?|enfermagem|enfermeir[oa]s?|auxiliar(?:es)?\s+de\s+enfermagem|equipe(?:\s+(?:de\s+enfermagem|t[eé]cnica|m[eé]dica))?)`;
const NOME_GENERICO_COMPLETO = new RegExp(`^${NOME_GENERICO}$`, "i");
/** Recursos confirmados no cadastro operacional; não infere a partir de nomes de pessoas. */
export const recursoAgendaSemProfissional = (nome: unknown) =>
  /^(?:raio\s*[-–—]?\s*x|mamografia)$/.test(nomeNormalizado(nome));
export const profissionalGenerico = (nome: unknown) =>
  NOME_GENERICO_COMPLETO.test(nomeNormalizado(nome)) || recursoAgendaSemProfissional(nome);

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
  if (r.esclarecimento) return false;
  if (r.codigo === "PROFISSIONAL_SFP" || r.erro === "PROFISSIONAL_SFP") return true;
  const registros = [r.records, r.registros, r.itens].find(Array.isArray) as unknown[] | undefined;
  if (!registros?.length) return false;
  const escolhidos = registros.filter((reg) =>
    referenciasSelecionadas.includes(String(objeto(reg)?.id ?? "")),
  );
  return (escolhidos.length ? escolhidos : registros).every(registroExigeHumano);
}

export const MOTIVO_SFP = "PROFISSIONAL_SFP: atendimento solicitado exclusivo da equipe humana";
/** Aceita o código oficial e o motivo legado "Profissional SFP exige atendimento humano". */
export function motivoProfissionalSfp(motivo: string): boolean {
  return /\bprofissional[_\s]+(?:e\s+)?sfp\b/.test(nomeNormalizado(motivo));
}
export function respostaEncaminhamentoSfp(confirmado: boolean): string {
  return confirmado
    ? ""
    : "Esse atendimento precisa do apoio da nossa equipe. Não consegui transferir sua conversa neste momento; por favor, entre em contato com a recepção.";
}

/** Silêncio deliberado: o transporte não deve criar fallback, áudio ou outra bolha. */
export function resultadoEncaminhamentoSfp(confirmado: boolean) {
  return criarResultado({
    origem: confirmado ? "handoff" : "erro",
    estado: confirmado ? "descartar" : "entregar",
    texto: respostaEncaminhamentoSfp(confirmado),
    fatosConfirmados: confirmado ? ["handoff_confirmado"] : [],
    restricoes: ["atendimento_humano_obrigatorio_sfp", ...(confirmado ? ["handoff_sfp_silencioso"] : [])],
  });
}

/** Projeção pública apenas. IDs e nomes usados internamente na agenda não mudam. */
type DadosPublicos<T> = T extends string
  ? string | null
  : T extends Array<infer V>
    ? Array<DadosPublicos<V>>
    : T extends object
      ? { [K in keyof T]: DadosPublicos<T[K]> }
      : T;
const CAMPOS_NOME = new Set([
  "nome", "name", "medico", "medica", "profissional", "executante", "doctor",
  "doctor_name", "medico_nome", "nome_medico", "profissional_nome", "nome_profissional",
  "doctors", "medicos", "profissionais", "executantes",
  "nome_catalogo", "medicoEscolhido",
]);
export function dadosPublicosCatalogo<T>(valor: T, campoNome = false, contextoProfissional = campoNome): DadosPublicos<T> {
  if (typeof valor === "string")
    return (campoNome
      ? valor.split(",").map((n) => n.trim()).filter((n) =>
        !NOME_GENERICO_COMPLETO.test(nomeNormalizado(n)) && !(contextoProfissional && recursoAgendaSemProfissional(n))).join(", ") || null
      : valor) as DadosPublicos<T>;
  if (Array.isArray(valor))
    return valor.map((v) => dadosPublicosCatalogo(v, campoNome, contextoProfissional)).filter((v) => v !== null) as DadosPublicos<T>;
  if (valor && typeof valor === "object")
    return Object.fromEntries(
      Object.entries(valor).map(([chave, v]) => [
        chave,
        dadosPublicosCatalogo(v, CAMPOS_NOME.has(chave),
          chave === "nome" || chave === "name"
            ? contextoProfissional || "medico_id" in valor || "doctor_id" in valor || (valor as Record<string, unknown>).tipo === "profissional"
            : CAMPOS_NOME.has(chave)),
      ]),
    ) as DadosPublicos<T>;
  return valor as DadosPublicos<T>;
}

/** Protege também os textos estáticos e respostas que repetem o nome genérico. */
export function omitirNomeGenerico(texto: string): string {
  return texto
    .replace(
      /\*{0,2}\b(?:profissional|m[eé]dic[oa]|executante)\s*:?\*{0,2}\s*:\s*\*{0,2}(?:(?:dr|dra)\.?\s*)?(?:raio\s*[-–—]?\s*x|mamografia)\*{0,2}(?=\s*(?:$|[.;|\n]|\*{0,2}(?:data|hor[aá]rio|cl[ií]nica|valor)\s*:))[\t .;|]*/gi,
      "",
    )
    .replace(
      /^([\t ]*(?:[-•][\t ]*)?\*{0,2}(?:profissional|m[eé]dico|m[eé]dica|executante)\s*:?\*{0,2}\s*:?\s*)([^\n]+)$/gim,
      (linha, rotulo: string, nomes: string) => {
        const partes = nomes.split(",");
        const proprios = partes.filter((nome) => !profissionalGenerico(
          nome.trim().replace(/^[* ]*(?:dr[a]?\.?\s+)?/i, "").replace(/[* .]+$/, ""),
        ));
        if (proprios.length === partes.length) return linha;
        return proprios.length ? `${rotulo}${proprios.map((n) => n.trim()).join(", ")}` : "";
      },
    )
    .replace(
      new RegExp(String.raw`^[\t ]*(?:[-•]\s*)?\*{0,2}(?:profissional|m[eé]dico|m[eé]dica|executante)\s*:?\*{0,2}\s*:?\s*\*{0,2}(?:(?:dr|dra)\.?\s*)?${NOME_GENERICO}[\t *.,]*($|\n)`, "gim"),
      "",
    )
    .replace(
      new RegExp(String.raw`\*{0,2}\b(?:profissional|m[eé]dico|m[eé]dica|executante)[\t ]*\*{0,2}[\t ]*:[\t ]*\*{0,2}[\t ]*(?:(?:dr|dra)\.?\s*)?${NOME_GENERICO}\*{0,2}(?=[\t ]*(?:$|[.;|\n]))[\t .;]*`, "gi"),
      "",
    )
    .replace(
      new RegExp(String.raw`^[\t ]*(?:[-•]\s*)?\*{0,2}${NOME_GENERICO}\*{0,2}[\t ]*:?([\t ]*$|\n)`, "gim"),
      "",
    )
    .replace(
      new RegExp(String.raw`\s+(?:com|por|pelo|pela)\s+(?:(?:o|a|um|uma)\s+)?\*{0,2}(?:(?:dr|dra)\.?\s*)?${NOME_GENERICO}\*{0,2}(?=[\t ]*(?:$|[.,;\n]|(?:[aà]s|no|na|em|para|hoje|amanh[ãa])\b))`, "gi"),
      "",
    )
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
