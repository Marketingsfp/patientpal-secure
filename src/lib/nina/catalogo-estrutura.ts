import { z } from "zod";
import { interpretarModalidade } from "./modalidade-atendimento";
import { REGRA_APRESENTACAO_VALORES } from "./pagamento-catalogo";
import { REGRA_ANESTESIA_ADICIONAL, REGRA_HORARIOS_PUBLICADOS, REGRA_MODALIDADES_CONFIRMADAS } from "./regras-administrativas-confirmadas";

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

export const estruturaCatalogoSchema = z
  .object({
    versao: z.literal(1).default(1),
    aliases: z.array(z.string().trim().min(2).max(160)).max(50).default([]),
    categoria: z
      .enum(["consulta", "exame", "procedimento", "exame_procedimento"])
      .nullable()
      .optional(),
    abrangencia: z.enum(["item", "grupo"]).nullable().optional(),
    grupo: z.string().trim().max(200).nullable().optional(),
    encaminhamento_humano: z.boolean().nullable().optional(),
    preparo_status: z.enum(["nao_informado", "informado", "sem_preparo"]).default("nao_informado"),
    convenios_status: z.enum(["nao_informado", "aceita", "nao_aceita"]).default("nao_informado"),
    complementos: z.array(complementoAtendimentoSchema).max(100).default([]),
  })
  .superRefine((v, ctx) => {
    if (new Set(v.complementos.map((c) => c.chave)).size !== v.complementos.length)
      ctx.addIssue({
        code: "custom",
        message: "Há regras duplicadas para o mesmo atendimento.",
        path: ["complementos"],
      });
  });
export type EstruturaCatalogo = z.infer<typeof estruturaCatalogoSchema>;
export type ComplementoAtendimento = z.infer<typeof complementoAtendimentoSchema>;
export const estruturaVazia = (): EstruturaCatalogo => estruturaCatalogoSchema.parse({});
export function lerEstrutura(v: unknown): EstruturaCatalogo {
  const r = estruturaCatalogoSchema.safeParse(v);
  return r.success ? r.data : estruturaVazia();
}

export const padronizarSfp = (s: string) => s.replace(/\bSPF\b/gi, "SFP");
const normal = (v: string) =>
  v
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

/** Alteração editorial: preserva palavras, números, critérios e ordem dos blocos. */
export function organizarTextoCatalogo(v: string): string {
  return padronizarSfp(v)
    .replace(/[ \t]+\|[ \t]+/g, "\n")
    .trim();
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
      pix_cartao: campos.get("pix/cartao") || campos.get("cartao") || null,
      observacoes: obs,
      outros,
    });
  }
  // Mesma chave em dois blocos não autoriza reuni-los nem descartar diferenças.
  return itens;
}

export function atendimentosEstruturados(
  conteudo: string | null | undefined,
  estrutura: unknown,
  profissional?: string,
  atendimentoPadrao?: string,
) {
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
  const itens = selecionados ?? atendimentosEstruturados(conteudo, estrutura, profissional, "Consulta");
  if (!itens.length) return "nao_definida" as const;
  const base = interpretarModalidade(modalidadeLegada);
  const modos = itens.map((a) => {
    const fontes = [a.complemento?.modalidade, a.modalidade, base].filter(Boolean);
    return new Set(fontes).size > 1 ? "nao_definida" : fontes[0] ?? null;
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
  const valor = (t: string | null) => {
    if (!t || !/^R\$\s*[\d.]+,\d{2}$/.test(t)) return null;
    return Number(t.replace(/R\$|\s|\./g, "").replace(",", "."));
  };
  return formas.every((f) => {
    if (!f || typeof f.valor !== "number" || f.observacao) return false;
    const forma = normal(String(f.forma ?? ""));
    const campo =
      forma === "dinheiro"
        ? "dinheiro"
        : ["cartao", "pix/cartao"].includes(forma)
          ? "pix_cartao"
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
  const atendimentos = atendimentosEstruturados(conteudo, estrutura, profissional);
  const pendencias: string[] = [];
  for (const a of atendimentos) {
    if (a.criterio_publicado && a.idade_minima === null && !a.complemento?.criterio_adicional)
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
    if (/anestesia/i.test(a.observacoes ?? "") && !a.complemento?.acrescimos &&
        !/(?:R\$\s*[\d.]+,\d{2}\s*\(anestesia\)|anestesia adicional:\s*R\$\s*[\d.]+,\d{2})/i.test(a.observacoes ?? ""))
      pendencias.push(`${a.atendimento}: confirmar o valor adicional da anestesia.`);
  }
  return [...new Set(pendencias)];
}

export const INSTRUCAO_DADOS_CATALOGO =
  "Cada item de atendimentos_publicados associa consulta/procedimento, profissional, valores, critérios e escala. " +
  "Nunca misture preço ou idade de atendimentos diferentes do mesmo profissional. Complementos são informações confirmadas para aquela chave; " +
  "se contradisserem o texto publicado, confirme com a equipe o aspecto conflitante, sem escolher uma versão. " +
  REGRA_MODALIDADES_CONFIRMADAS + " " +
  "Preparo não informado não significa sem preparo; convênios não informados não significam que não aceita. " +
  "'40 kg' não é idade. 'Manhã e tarde' não estabelece um limite numérico de chegada. Quinzenal sem data de referência não identifica o próximo dia. " +
  REGRA_HORARIOS_PUBLICADOS + " " + REGRA_ANESTESIA_ADICIONAL + " " +
  "Grupo geral e item específico não compartilham regras automaticamente. " +
  "Responda somente aos objetivos do pedido, sem copiar os rótulos internos ou repetir fatos.";

export const INSTRUCAO_ESTRUTURA_CATALOGO =
  INSTRUCAO_DADOS_CATALOGO +
  " " +
  REGRA_APRESENTACAO_VALORES +
  " Profissional genérico é equipe interna: omita o nome; SFP exige encaminhamento humano silencioso.";
