/**
 * Pré-busca do cadastro (09/10/2026) — parte pura e testável.
 *
 * Antes da 1ª chamada ao modelo, quando o Jev já identificou com segurança uma
 * intenção de agendamento/informação, e a mensagem cita de forma INEQUÍVOCA um
 * atendimento publicado (especialidade, exame/procedimento ou profissional),
 * o servidor executa as mesmas ferramentas que o modelo chamaria na 1ª rodada.
 *
 * Qualquer dúvida (zero ou mais de um candidato) devolve null: segue o fluxo
 * atual, sem pré-busca. Nada aqui decide resposta, vaga ou encaminhamento.
 */
import { normalizar, raizEspecialidade } from "../nina-especialidade";
import type { IntencaoNina } from "./atendimento-fase1";
import type { OBJETIVOS_PESQUISA_CATALOGO } from "./catalogo-pesquisa";

export const FLAG_PREFETCH_CADASTRO = "nina_prefetch_cadastro";
export const PRAZO_PREFETCH_MS = 2000;

type Objetivo = (typeof OBJETIVOS_PESQUISA_CATALOGO)[number];

const OBJETIVOS_POR_INTENCAO: Partial<Record<IntencaoNina, Objetivo[]>> = {
  agendamento: ["agendamento"],
  disponibilidade: ["horarios", "agendamento"],
  valor: ["valor"],
  medico: ["medicos"],
  consulta: ["informacoes_gerais"],
  exame: ["informacoes_gerais"],
  procedimento: ["informacoes_gerais"],
  preparo: ["preparo"],
};

export function intencaoPermitePrefetch(intencao: IntencaoNina | null): boolean {
  return intencao !== null && intencao in OBJETIVOS_POR_INTENCAO;
}

/** Soma mínima das probabilidades das intenções elegíveis (mesmo limiar do Jev). */
export const CONFIANCA_MINIMA_PREFETCH = 0.8;
/** Intenções abaixo disso somam na confiança, mas não definem objetivos (ruído). */
const PROB_MINIMA_INTENCAO = 0.1;

/**
 * Intenções do Jev que liberam a pré-busca. Uma mensagem com dois pedidos
 * compatíveis ("quanto custa? tem vaga?") divide a probabilidade entre valor,
 * agendamento e disponibilidade, e nenhuma passa sozinha de 0,8. Quando a SOMA
 * das elegíveis passa do limiar, a pré-busca usa todas elas. Só serve à
 * pré-busca: não muda a intenção aplicada ao turno.
 */
export function intencoesParaPrefetch(
  r:
    | {
        choice?: unknown;
        confidence?: unknown;
        probabilities?: Record<string, number>;
      }
    | undefined,
): IntencaoNina[] {
  if (!r) return [];
  const probs = r.probabilities ?? {};
  const todas = Object.entries(probs)
    .filter(([k, p]) => k in OBJETIVOS_POR_INTENCAO && typeof p === "number" && p > 0)
    .sort((a, b) => b[1] - a[1]);
  const soma = todas.reduce((s, [, p]) => s + p, 0);
  const elegiveis = todas.filter(([, p]) => p >= PROB_MINIMA_INTENCAO);
  if (elegiveis.length && soma >= CONFIANCA_MINIMA_PREFETCH)
    return elegiveis.map(([k]) => k as IntencaoNina);
  if (
    typeof r.choice === "string" &&
    r.choice in OBJETIVOS_POR_INTENCAO &&
    typeof r.confidence === "number" &&
    r.confidence >= CONFIANCA_MINIMA_PREFETCH
  )
    return [r.choice as IntencaoNina];
  return [];
}

export type CatalogoPrefetch = {
  servicos: Array<{ nome: string }>;
  profissionais: Array<{ nome: string; especialidades: unknown }>;
};

export type ChamadaPrefetch = {
  nome: "consultar_cadastro" | "buscar_medicos";
  args: Record<string, unknown>;
};
export type PlanoPrefetch = {
  termo: string;
  tipo: "especialidade" | "servico" | "profissional";
  chamadas: ChamadaPrefetch[];
};

/** Palavras de nome muito comuns: sozinhas não identificam um profissional. */
const NOMES_COMUNS = new Set([
  "maria",
  "jose",
  "joao",
  "ana",
  "silva",
  "santos",
  "souza",
  "sousa",
  "oliveira",
  "pereira",
  "lima",
  "costa",
  "rodrigues",
  "ferreira",
  "alves",
  "gomes",
  "ribeiro",
  "carvalho",
  "almeida",
  "dias",
  "neves",
  "paula",
  "luiz",
  "luis",
  "carlos",
  "antonio",
  "francisco",
  "clinica",
  "clinico",
]);

function listaEspecialidades(v: unknown): string[] {
  // O cadastro publicado guarda [{ id, nome }]; versões antigas, só o texto.
  if (Array.isArray(v))
    return v
      .map((e) =>
        typeof e === "string"
          ? e
          : e && typeof e === "object" && typeof (e as { nome?: unknown }).nome === "string"
            ? (e as { nome: string }).nome
            : "",
      )
      .map((e) => e.trim())
      .filter(Boolean);
  if (typeof v === "string")
    return v
      .split(/[,;/]/)
      .map((s) => s.trim())
      .filter(Boolean);
  return [];
}

function palavras(texto: string): string[] {
  return normalizar(texto)
    .replace(/[^a-z0-9 ]/g, " ")
    .split(" ")
    .filter(Boolean);
}

/** A especialidade aparece na mensagem? Aceita raiz ("cardio") e 1ª palavra ("clinico" ~ "clinica geral"). */
function citaEspecialidade(texto: string, nome: string): boolean {
  const n = normalizar(nome)
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (n.length >= 4 && texto.includes(n)) return true;
  const raiz = raizEspecialidade(nome);
  if (raiz.length >= 5 && texto.includes(raiz)) return true;
  const primeira = n.split(" ")[0] ?? "";
  if (n.includes(" ") && primeira.length >= 6) {
    const r = primeira.slice(0, primeira.length - 1); // clinica -> clinic
    return new RegExp(`\\b${r}[a-z]?\\b`).test(texto);
  }
  return false;
}

/**
 * Plano determinístico. Devolve null quando não há exatamente um atendimento
 * identificado — inclusive quando a mensagem cita dois (pedido múltiplo).
 */
export function planejarPrefetch(
  mensagem: string,
  intencao: IntencaoNina | IntencaoNina[] | null,
  catalogo: CatalogoPrefetch,
  nomePopular?: { especialidade: string } | null,
): PlanoPrefetch | null {
  const lista = (Array.isArray(intencao) ? intencao : [intencao]).filter(
    intencaoPermitePrefetch,
  ) as IntencaoNina[];
  if (!lista.length) return null;
  const objetivos = [...new Set(lista.flatMap((i) => OBJETIVOS_POR_INTENCAO[i]!))];
  const texto = palavras(mensagem).join(" ");
  if (!texto) return null;

  // 1) Serviços (exame/procedimento) com nome completo na mensagem.
  const servicos = [
    ...new Set(
      catalogo.servicos
        .map((s) => s.nome)
        .filter((n) => {
          const nn = palavras(n).join(" ");
          return nn.length >= 4 && new RegExp(`\\b${nn}\\b`).test(texto);
        }),
    ),
  ];
  // Nomes contidos em outro achado ("ultrassom" dentro de "ultrassom de tireoide") não contam.
  const servicosMax = servicos.filter(
    (a) => !servicos.some((b) => b !== a && normalizar(b).includes(normalizar(a))),
  );

  // 2) Especialidades distintas publicadas.
  const todas = [
    ...new Set(catalogo.profissionais.flatMap((p) => listaEspecialidades(p.especialidades))),
  ];
  const especs = new Set(
    todas.filter((e) => citaEspecialidade(texto, e)).map((e) => normalizar(e)),
  );
  if (nomePopular) especs.add(normalizar(nomePopular.especialidade));

  // 3) Profissional por palavra distintiva do nome, com um único dono.
  const profs = new Set<string>();
  let tokenProf: string | null = null;
  for (const t of palavras(mensagem)) {
    if (t.length < 4 || NOMES_COMUNS.has(t)) continue;
    const donos = catalogo.profissionais.filter((p) => palavras(p.nome).includes(t));
    if (donos.length === 1) {
      profs.add(donos[0]!.nome);
      tokenProf = t;
    } else if (donos.length > 1) return null; // nome ambíguo: o modelo pergunta
  }

  const achados = servicosMax.length + especs.size + profs.size;
  if (achados !== 1) return null;

  if (servicosMax.length === 1) {
    const termo = servicosMax[0]!;
    return {
      termo,
      tipo: "servico",
      chamadas: [
        {
          nome: "consultar_cadastro",
          args: { termo, objetivos, tipo_atendimento: "exame_procedimento" },
        },
      ],
    };
  }
  if (especs.size === 1) {
    const chave = [...especs][0]!;
    const termo = todas.find((e) => normalizar(e) === chave) ?? nomePopular?.especialidade ?? chave;
    return {
      termo,
      tipo: "especialidade",
      chamadas: [
        { nome: "consultar_cadastro", args: { termo, objetivos, tipo_atendimento: "consulta" } },
      ],
    };
  }
  const nome = [...profs][0]!;
  return {
    termo: nome,
    tipo: "profissional",
    chamadas: [{ nome: "buscar_medicos", args: { nome: tokenProf } }],
  };
}
