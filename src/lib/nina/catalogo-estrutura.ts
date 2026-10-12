import { z } from "zod";
import { MODALIDADES_ATENDIMENTO, interpretarModalidade } from "./modalidade-atendimento";
import { DIAS_SEMANA, RECORRENCIAS } from "./catalogo-constantes";
import { REGRA_FOTO_PEDIDO_MEDICO } from "./prompt/pedido-medico";
import {
  REGRA_ANESTESIA_ADICIONAL,
  REGRA_HORARIOS_PUBLICADOS,
  REGRA_MODALIDADES_CONFIRMADAS,
  REGRA_IDADE_NAO_INFORMADA,
  idadeNaoInformada,
} from "./regras-administrativas-confirmadas";

const texto = z.string().trim().max(4000).nullable().optional();
const hora = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
  .nullable()
  .optional();
export const modalidadesCatalogo = z.enum([
  "hora_marcada",
  "chegada_com_pre_agendamento",
  "chegada_sem_pre_agendamento",
  "ficha",
]);

/** Complementos confirmados pela equipe. Ausência nunca equivale a uma regra negativa. */
export const complementoAtendimentoSchema = z
  .object({
    chave: z.string().min(1).max(500),
    modalidade: modalidadesCatalogo.nullable().optional(),
    idade_minima: z.number().int().min(0).max(1500).nullable().optional(),
    unidade_idade: z.enum(["anos", "meses"]).nullable().optional(),
    criterio_adicional: texto,
    chegada_ate: hora,
    referencia_recorrencia: z.string().date().nullable().optional(),
    situacao_preco: z
      .enum(["definido", "sob_consulta", "incluido", "nao_informado"])
      .nullable()
      .optional(),
    inclui: texto,
    acrescimos: texto,
  })
  .superRefine((v, ctx) => {
    if ((v.idade_minima != null) !== (v.unidade_idade != null))
      ctx.addIssue({
        code: "custom",
        message: "Informe a idade mínima e a unidade juntas.",
        path: ["idade_minima"],
      });
  });

const textoCurto = z.string().trim().max(200).nullable().optional();

/** Linha de escala habitual (não é vaga): dia, faixa, recorrência e observação. */
export const horarioCatalogoSchema = z
  .object({
    dia: z.enum(DIAS_SEMANA),
    inicio: hora,
    fim: hora,
    recorrencia: z.enum(RECORRENCIAS).default("Toda semana"),
    referencia_recorrencia: z.string().date().nullable().optional(),
    observacao: textoCurto,
  })
  .refine((h) => !h.inicio || !h.fim || h.fim > h.inicio, {
    message: "O término precisa ser depois do início.",
    path: ["fim"],
  });

/** Preço por forma de pagamento; `condicao` é a condição real (ex.: até 3x). */
export const precoCatalogoSchema = z.object({
  forma: z.string().trim().min(1, "Informe a forma de pagamento").max(80),
  valor: z.number().min(0).nullable().optional(),
  condicao: textoCurto,
  observacao: texto,
});

/** Quem realiza um atendimento de exame/procedimento, com a própria escala. */
export const executanteCatalogoSchema = z.object({
  medico_id: z.string().uuid().nullable().optional(),
  nome: z.string().trim().min(1, "Informe quem realiza").max(160),
  horarios: z.array(horarioCatalogoSchema).max(60).default([]),
});

/**
 * Atendimento estruturado: fonte única dos fatos do item (12/10/2026).
 * Profissional usa `horarios`; exame/procedimento usa `executantes`.
 */
export const atendimentoCatalogoSchema = z
  .object({
    id: z.string().trim().min(1).max(64),
    nome: z.string().trim().min(1, "Informe o nome do atendimento").max(200),
    especialidade: z.string().trim().max(200).nullable().optional(),
    modalidade: modalidadesCatalogo.nullable().optional(),
    horarios: z.array(horarioCatalogoSchema).max(60).default([]),
    executantes: z.array(executanteCatalogoSchema).max(30).default([]),
    chegada_ate: hora,
    precos: z.array(precoCatalogoSchema).max(20).default([]),
    situacao_preco: z
      .enum(["definido", "sob_consulta", "incluido", "nao_informado"])
      .nullable()
      .optional(),
    idade_minima: z.number().int().min(0).max(1500).nullable().optional(),
    unidade_idade: z.enum(["anos", "meses"]).nullable().optional(),
    criterio_adicional: texto,
    inclui: texto,
    acrescimos: texto,
    observacao: texto,
  })
  .superRefine((v, ctx) => {
    if ((v.idade_minima != null) !== (v.unidade_idade != null))
      ctx.addIssue({
        code: "custom",
        message: "Informe a idade mínima e a unidade juntas.",
        path: ["idade_minima"],
      });
  });
export type AtendimentoCatalogo = z.infer<typeof atendimentoCatalogoSchema>;
export type HorarioCatalogo = z.infer<typeof horarioCatalogoSchema>;
export type PrecoCatalogo = z.infer<typeof precoCatalogoSchema>;

export const estruturaCatalogoSchema = z
  .object({
    versao: z.literal(1).default(1),
    origem_clinica_os: z
      .object({
        tipo: z.enum(["medico", "procedimento", "consulta"]),
        id: z.string().uuid(),
        ativo: z.boolean(),
        visivel: z.boolean(),
      })
      .optional(),
    aliases: z.array(z.string().trim().min(2).max(160)).max(50).default([]),
    categoria: z
      .enum(["consulta", "exame", "procedimento", "exame_procedimento"])
      .nullable()
      .optional(),
    abrangencia: z.enum(["item", "grupo"]).nullable().optional(),
    grupo: z.string().trim().max(200).nullable().optional(),
    encaminhamento_humano: z.boolean().nullable().optional(),
    /**
     * A Nina pode agendar este item (regra de 12/10/2026). Só `true` libera;
     * ausente, nulo ou `false` = informar e encaminhar à equipe.
     */
    nina_pode_agendar: z.boolean().nullable().optional(),
    preparo_status: z.enum(["nao_informado", "informado", "sem_preparo"]).default("nao_informado"),
    pedido_medico: z.enum(["nao_informado", "obrigatorio", "dispensado"]).default("nao_informado"),
    convenios_status: z.enum(["nao_informado", "aceita", "nao_aceita"]).default("nao_informado"),
    complementos: z.array(complementoAtendimentoSchema).max(100).default([]),
    /** Presente e não vazio = item estruturado: os fatos saem só daqui. */
    atendimentos: z.array(atendimentoCatalogoSchema).max(60).optional(),
  })
  .superRefine((v, ctx) => {
    if (new Set(v.complementos.map((c) => c.chave)).size !== v.complementos.length)
      ctx.addIssue({
        code: "custom",
        message: "Há regras duplicadas para o mesmo atendimento.",
        path: ["complementos"],
      });
    const ids = (v.atendimentos ?? []).map((a) => a.id);
    if (new Set(ids).size !== ids.length)
      ctx.addIssue({
        code: "custom",
        message: "Há atendimentos com a mesma identificação.",
        path: ["atendimentos"],
      });
  });
export type EstruturaCatalogo = z.infer<typeof estruturaCatalogoSchema>;
export type ComplementoAtendimento = z.infer<typeof complementoAtendimentoSchema>;
export const estruturaVazia = (): EstruturaCatalogo => estruturaCatalogoSchema.parse({});
export function lerEstrutura(v: unknown): EstruturaCatalogo {
  const r = estruturaCatalogoSchema.safeParse(v);
  return r.success ? r.data : estruturaVazia();
}

const normal = (v: string) =>
  v
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

/** Alteração editorial: preserva palavras, números, critérios e ordem dos blocos. */
export function organizarTextoCatalogo(v: string): string {
  return v.replace(/[ \t]+\|[ \t]+/g, "\n").trim();
}

export type AtendimentoPublicado = {
  chave: string;
  atendimento: string;
  profissional: string | null;
  especialidade: string | null;
  horarios_publicados: string | null;
  chegada_publicada: string | null;
  criterio_publicado: string | null;
  idade_minima: number | null;
  unidade_idade: "anos" | "meses" | null;
  modalidade: ReturnType<typeof interpretarModalidade>;
  dinheiro: string | null;
  pix_cartao: string | null;
  cartao?: string | null;
  pix?: string | null;
  observacoes: string | null;
  outros: string[];
  complemento?: ComplementoAtendimento;
};

/** Lê somente rótulos explícitos da importação. Não interpreta linguagem clínica livre. */
export function separarAtendimentos(
  conteudo: string | null | undefined,
  profissional?: string,
): AtendimentoPublicado[] {
  if (!conteudo) return [];
  const blocos = organizarTextoCatalogo(conteudo).split(/\n\s*\n/);
  const itens: AtendimentoPublicado[] = [];
  for (const bloco of blocos) {
    const linhas = bloco
      .split("\n")
      .map((x) => x.trim())
      .filter(Boolean);
    if (!linhas.length || !linhas.some((x) => /^Especialidade\s*:/i.test(x))) return [];
    const campos = new Map<string, string>();
    const outros: string[] = [];
    const conhecidos = [
      "especialidade",
      "profissional",
      "dias e horarios",
      "idade/criterio informado",
      "dinheiro",
      "pix/cartao",
      "cartao",
      "pix",
      "observacao",
      "pode chegar ate que horas",
    ];
    for (const l of linhas.slice(1)) {
      const pos = l.indexOf(":");
      const k = normal(l.slice(0, pos));
      if (pos > 0 && conhecidos.includes(k) && !campos.has(k))
        campos.set(k, l.slice(pos + 1).trim());
      else outros.push(l);
    }
    const nome = campos.get("profissional") || profissional || null;
    const criterio = campos.get("idade/criterio informado") || null;
    // "40 kg", "-" e "SFP" continuam literais e desconhecidos como idade.
    const idade = /^(?:a partir de\s+)?(\d+)\s*(anos?|meses|m[eê]s)$/i.exec(criterio ?? "");
    const obs = campos.get("observacao") || null;
    itens.push({
      chave: normal(`${linhas[0]}::${nome ?? ""}`),
      atendimento: linhas[0]!,
      profissional: nome,
      especialidade: campos.get("especialidade") || null,
      horarios_publicados: campos.get("dias e horarios") || null,
      chegada_publicada: campos.get("pode chegar ate que horas") || null,
      criterio_publicado: criterio,
      idade_minima: idade ? Number(idade[1]) : null,
      unidade_idade: idade ? (/^a/i.test(idade[2]!) ? "anos" : "meses") : null,
      modalidade: interpretarModalidade(obs),
      dinheiro: campos.get("dinheiro") || null,
      pix_cartao: campos.get("pix/cartao") || null,
      cartao: campos.get("cartao") || null,
      pix: campos.get("pix") || null,
      observacoes: obs,
      outros,
    });
  }
  // Mesma chave em dois blocos não autoriza reuni-los nem descartar diferenças.
  return itens;
}

/** Atendimentos estruturados do item, ou null quando o item ainda é do formato antigo. */
export function atendimentosDaEstrutura(estrutura: unknown): AtendimentoCatalogo[] | null {
  const lista = lerEstrutura(estrutura).atendimentos;
  return lista && lista.length ? lista : null;
}

export function formatarPrecoCatalogo(valor: number | null | undefined): string | null {
  if (valor == null) return null;
  return `R$ ${valor.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function dataBR(iso: string): string {
  const [a, m, d] = iso.split("-");
  return `${d}/${m}/${a}`;
}

/** Escala em texto, gerada a partir das linhas estruturadas (nunca digitada). */
export function textoHorariosCatalogo(linhas: readonly HorarioCatalogo[]): string | null {
  if (!linhas.length) return null;
  return linhas
    .map((h) => {
      const faixa = h.inicio ? (h.fim ? ` ${h.inicio}–${h.fim}` : ` a partir de ${h.inicio}`) : "";
      const ref = h.referencia_recorrencia
        ? `; referência ${dataBR(h.referencia_recorrencia)}`
        : "";
      const rec =
        h.recorrencia && h.recorrencia !== "Toda semana" ? ` (${h.recorrencia}${ref})` : "";
      return `${h.dia}${faixa}${rec}${h.observacao ? `: ${h.observacao}` : ""}`;
    })
    .join(" · ");
}

type CampoPreco = "dinheiro" | "pix_cartao" | "cartao" | "pix";
/** Forma de pagamento → campo de preço lido pelas regras existentes. */
export function campoDaForma(forma: string): CampoPreco | null {
  const f = normal(forma).replace(/\s*(\/|\be\b)\s*/g, "/");
  if (/^(dinheiro|especie|em especie)$/.test(f)) return "dinheiro";
  if (f === "pix/cartao" || f === "cartao/pix") return "pix_cartao";
  if (/^cartao\b/.test(f)) return "cartao";
  if (f === "pix") return "pix";
  return null;
}

function rotuloIdade(n: number, unidade: "anos" | "meses"): string {
  if (unidade === "anos") return `a partir de ${n} ${n === 1 ? "ano" : "anos"}`;
  return `a partir de ${n} ${n === 1 ? "mês" : "meses"}`;
}

/** Atendimento estruturado no formato já consumido pela Nina e pelas regras. */
export function publicadoDoAtendimento(
  a: AtendimentoCatalogo,
  profissional?: string,
): AtendimentoPublicado {
  const campos: Partial<Record<CampoPreco, string>> = {};
  const outros: string[] = a.modalidade
    ? [`Modalidade: ${MODALIDADES_ATENDIMENTO[a.modalidade]}`]
    : ["Modalidade: não informada"];
  for (const p of a.precos) {
    const linha = `${formatarPrecoCatalogo(p.valor) ?? "valor não informado"}${p.condicao ? ` (${p.condicao})` : ""}`;
    const campo = campoDaForma(p.forma);
    if (campo && !campos[campo]) campos[campo] = linha;
    else outros.push(`${p.forma}: ${linha}`);
    if (p.observacao) outros.push(`${p.forma} — observação: ${p.observacao}`);
  }
  const idade =
    a.idade_minima != null && a.unidade_idade ? rotuloIdade(a.idade_minima, a.unidade_idade) : null;
  if (idade && a.criterio_adicional) outros.push(`Outros critérios: ${a.criterio_adicional}`);
  if (a.situacao_preco === "sob_consulta") outros.push("Situação do preço: precisa de orçamento.");
  if (a.situacao_preco === "incluido")
    outros.push("Situação do preço: incluído em outro atendimento.");
  if (a.inclui) outros.push(`Inclui: ${a.inclui}`);
  if (a.acrescimos) outros.push(`Acréscimos: ${a.acrescimos}`);
  const horarios = a.executantes.length
    ? a.executantes
        .map((e) => {
          const t = textoHorariosCatalogo(e.horarios);
          return t ? `${e.nome}: ${t}` : null;
        })
        .filter(Boolean)
        .join(" | ") || null
    : textoHorariosCatalogo(a.horarios);
  const chave = `id:${a.id}`;
  return {
    chave,
    atendimento: a.nome,
    profissional: profissional || a.executantes.map((e) => e.nome).join(", ") || null,
    especialidade: a.especialidade || null,
    horarios_publicados: horarios,
    chegada_publicada: a.chegada_ate ?? null,
    criterio_publicado: idade ?? a.criterio_adicional ?? null,
    idade_minima: a.idade_minima ?? null,
    unidade_idade: a.unidade_idade ?? null,
    modalidade: a.modalidade ?? null,
    dinheiro: campos.dinheiro ?? null,
    pix_cartao: campos.pix_cartao ?? null,
    cartao: campos.cartao ?? null,
    pix: campos.pix ?? null,
    observacoes: a.observacao || null,
    outros,
    complemento: {
      chave,
      modalidade: a.modalidade ?? null,
      idade_minima: a.idade_minima ?? null,
      unidade_idade: a.unidade_idade ?? null,
      criterio_adicional: a.criterio_adicional ?? null,
      chegada_ate: a.chegada_ate ?? null,
      situacao_preco: a.situacao_preco ?? null,
      inclui: a.inclui ?? null,
      acrescimos: a.acrescimos ?? null,
    },
  };
}

export function atendimentosEstruturados(
  conteudo: string | null | undefined,
  estrutura: unknown,
  profissional?: string,
  atendimentoPadrao?: string,
) {
  const estruturados = atendimentosDaEstrutura(estrutura);
  if (estruturados) return estruturados.map((a) => publicadoDoAtendimento(a, profissional));
  const e = lerEstrutura(estrutura);
  const publicados = separarAtendimentos(conteudo, profissional);
  const itens: AtendimentoPublicado[] =
    publicados.length || !atendimentoPadrao
      ? publicados
      : [
          {
            chave: normal(`${atendimentoPadrao}::${profissional ?? ""}`),
            atendimento: atendimentoPadrao,
            profissional: profissional || null,
            especialidade: null,
            horarios_publicados: null,
            chegada_publicada: null,
            criterio_publicado: null,
            idade_minima: null,
            unidade_idade: null,
            modalidade: null,
            dinheiro: null,
            pix_cartao: null,
            observacoes: null,
            outros: conteudo ? [conteudo] : [],
          },
        ];
  return itens.map((a) => {
    const complemento = e.complementos.find((c) => c.chave === a.chave);
    return { ...a, ...(complemento ? { complemento } : {}) };
  });
}

/** Todos os blocos do atendimento selecionado precisam concordar na modalidade. */
export function modalidadeEstruturada(
  conteudo: string | null | undefined,
  estrutura: unknown,
  profissional: string,
  modalidadeLegada: string | null | undefined,
  selecionados?: AtendimentoPublicado[],
) {
  const itens =
    selecionados ?? atendimentosEstruturados(conteudo, estrutura, profissional, "Consulta");
  if (!itens.length) return "nao_definida" as const;
  const base = interpretarModalidade(modalidadeLegada);
  const modos = itens.map((a) => {
    const fontes = [a.complemento?.modalidade, a.modalidade, base].filter(Boolean);
    return new Set(fontes).size > 1 ? "nao_definida" : (fontes[0] ?? null);
  });
  if (modos.every((m) => !m)) return null;
  if (modos.some((m) => !m || m === "nao_definida") || new Set(modos).size !== 1)
    return "nao_definida" as const;
  if (base && base !== modos[0]) return "nao_definida" as const;
  return modos[0]!;
}

/** Resumo legível dos MESMOS fatos, com cada regra vinculada ao atendimento certo. */
export function textoAtendimentos(itens: AtendimentoPublicado[]): string {
  return itens
    .map((a) =>
      [
        a.atendimento,
        a.especialidade && `Especialidade: ${a.especialidade}`,
        a.profissional && `Profissional: ${a.profissional}`,
        a.horarios_publicados && `Dias e horários: ${a.horarios_publicados}`,
        a.chegada_publicada && `Limite de chegada publicado: ${a.chegada_publicada}`,
        a.criterio_publicado && `Critério publicado: ${a.criterio_publicado}`,
        a.dinheiro && `Dinheiro: ${a.dinheiro}`,
        a.pix_cartao && `Pix/cartão: ${a.pix_cartao}`,
        a.cartao && `Cartão: ${a.cartao}`,
        a.pix && `Pix: ${a.pix}`,
        a.observacoes && `Observações: ${a.observacoes}`,
        ...a.outros,
      ]
        .filter(Boolean)
        .join("\n"),
    )
    .join("\n\n");
}

/** Elimina somente a cópia comprovadamente idêntica; condições extras são preservadas. */
export function pagamentosJaDescritos(formas: unknown, itens: AtendimentoPublicado[]): boolean {
  if (!Array.isArray(formas) || !formas.length || !itens.length) return false;
  const valor = (t: string | null | undefined) => {
    if (!t || !/^R\$\s*[\d.]+,\d{2}$/.test(t)) return null;
    return Number(t.replace(/R\$|\s|\./g, "").replace(",", "."));
  };
  return formas.every((f) => {
    if (!f || typeof f.valor !== "number" || f.observacao) return false;
    const forma = normal(String(f.forma ?? ""));
    const campo =
      forma === "dinheiro"
        ? "dinheiro"
        : forma === "pix/cartao"
          ? "pix_cartao"
          : forma === "cartao"
            ? "cartao"
            : forma === "pix"
              ? "pix"
              : null;
    if (!campo) return false;
    const alvos = f.condicao
      ? itens.filter((a) => normal(a.atendimento) === normal(f.condicao))
      : itens;
    return alvos.length > 0 && alvos.every((a) => valor(a[campo]) === f.valor);
  });
}

export function pendenciasEstrutura(
  conteudo: string | null | undefined,
  estrutura: unknown,
  profissional?: string,
): string[] {
  const estruturados = atendimentosDaEstrutura(estrutura);
  if (estruturados) {
    const p: string[] = [];
    for (const a of estruturados) {
      if (!a.modalidade)
        p.push(`${a.nome}: modalidade não informada — a Nina vai informar e encaminhar.`);
      const linhas = [...a.horarios, ...a.executantes.flatMap((e) => e.horarios)];
      if (linhas.some((h) => h.recorrencia === "Quinzenal" && !h.referencia_recorrencia))
        p.push(`${a.nome}: horário quinzenal sem data de referência.`);
      if (/anestesia/i.test(a.observacao ?? "") && !a.acrescimos)
        p.push(`${a.nome}: confirmar o valor adicional da anestesia.`);
      if (
        !a.precos.length &&
        a.situacao_preco !== "incluido" &&
        a.situacao_preco !== "sob_consulta"
      )
        p.push(`${a.nome}: nenhum preço cadastrado.`);
    }
    return [...new Set(p)];
  }
  const atendimentos = atendimentosEstruturados(conteudo, estrutura, profissional);
  const pendencias: string[] = [];
  for (const a of atendimentos) {
    if (
      !idadeNaoInformada(a.criterio_publicado) &&
      a.idade_minima === null &&
      !a.complemento?.criterio_adicional
    )
      pendencias.push(
        `${a.atendimento}: critério “${a.criterio_publicado}” precisa de conferência.`,
      );
    if (!a.complemento?.modalidade && (!a.modalidade || a.modalidade === "nao_definida"))
      pendencias.push(`${a.atendimento}: modalidade ainda não confirmada.`);
    if (
      /15 dias|quinzenal/i.test(`${a.horarios_publicados} ${a.observacoes}`) &&
      !a.complemento?.referencia_recorrencia
    )
      pendencias.push(`${a.atendimento}: recorrência sem data de referência.`);
    if (
      /anestesia/i.test(a.observacoes ?? "") &&
      !a.complemento?.acrescimos &&
      !/(?:R\$\s*[\d.]+,\d{2}\s*\(anestesia\)|anestesia adicional:\s*R\$\s*[\d.]+,\d{2})/i.test(
        a.observacoes ?? "",
      )
    )
      pendencias.push(`${a.atendimento}: confirmar o valor adicional da anestesia.`);
  }
  return [...new Set(pendencias)];
}

export const INSTRUCAO_DADOS_CATALOGO =
  "Cada item de atendimentos_publicados associa consulta/procedimento, profissional, valores, critérios e escala. " +
  "Nunca misture preço ou idade de atendimentos diferentes do mesmo profissional. Complementos são informações confirmadas para aquela chave; " +
  "se contradisserem o texto publicado, confirme com a equipe o aspecto conflitante, sem escolher uma versão. " +
  REGRA_MODALIDADES_CONFIRMADAS +
  " " +
  REGRA_IDADE_NAO_INFORMADA +
  " " +
  "Preparo não informado não significa sem preparo; convênios não informados não significam que não aceita. " +
  "Pedido médico: quando obrigatório na base de conhecimento, solicite uma foto legível do pedido para o exame, procedimento ou consulta identificado; " +
  "quando dispensado, informe que não precisa se o paciente perguntar. Não informado não significa dispensado: " +
  "não presuma a exigência ou a dispensa. Se perguntarem e não houver regra publicada explícita, confirme com a equipe. " +
  REGRA_FOTO_PEDIDO_MEDICO +
  " " +
  "Se a opção de pedido médico contradisser requisitos em texto, confirme com a equipe antes de orientar. " +
  "'40 kg' não é idade. 'Manhã e tarde' não estabelece um limite numérico de chegada. Quinzenal sem data de referência não identifica o próximo dia. " +
  REGRA_HORARIOS_PUBLICADOS +
  " " +
  REGRA_ANESTESIA_ADICIONAL +
  " " +
  "Grupo geral e item específico não compartilham regras automaticamente. " +
  "Responda somente aos objetivos do pedido, sem copiar os rótulos internos ou repetir fatos.";

export const INSTRUCAO_ESTRUTURA_CATALOGO = INSTRUCAO_DADOS_CATALOGO;
