/**
 * Escolha de voz do Coach, agora ligada ao catálogo de vozes do sistema
 * (tela Voz & Áudio / servidor de voz da clínica).
 *
 * A configuração guardada em `coach_config_clinica.voz_config` passa a ser
 * apenas: qual voz do catálogo representa o paciente feminino e qual
 * representa o masculino, na ligação e no WhatsApp. Vazio = voz padrão
 * configurada na tela Voz & Áudio.
 */

export type VozAtividade = "ligacao" | "whatsapp";
export type VozPersonagem = "masculino" | "feminino";

/** Voz do catálogo do sistema para cada personagem. */
export type VozesDaAtividade = Record<VozPersonagem, string>;
export type VozConfig = Record<VozAtividade, VozesDaAtividade>;

export const ATIVIDADES: Array<{ id: VozAtividade; label: string; ajuda: string }> = [
  {
    id: "ligacao",
    label: "Treinamento por ligação",
    ajuda: "Voz do paciente durante a ligação simulada.",
  },
  {
    id: "whatsapp",
    label: "Treinamento por WhatsApp",
    ajuda: "Áudios enviados nas conversas de WhatsApp.",
  },
];

export const PERSONAGENS: Array<{ id: VozPersonagem; label: string }> = [
  { id: "feminino", label: "Personagem feminina" },
  { id: "masculino", label: "Personagem masculino" },
];

/** Nada escolhido: usa a voz padrão da tela Voz & Áudio. */
export const VOZ_PADRAO_SISTEMA = "";

export const VOZ_CONFIG_PADRAO: VozConfig = {
  ligacao: { masculino: VOZ_PADRAO_SISTEMA, feminino: VOZ_PADRAO_SISTEMA },
  whatsapp: { masculino: VOZ_PADRAO_SISTEMA, feminino: VOZ_PADRAO_SISTEMA },
};

/** IDs de voz aceitos pelo proxy de TTS do sistema. */
const VOZ_RE = /^[a-z0-9_-]{1,32}$/i;

function normVoz(valor: unknown, catalogo?: string[]): string {
  const v = typeof valor === "string" ? valor.trim() : "";
  if (!v || !VOZ_RE.test(v)) return VOZ_PADRAO_SISTEMA;
  // Quando o catálogo do servidor é conhecido, uma voz que não existe mais
  // (herdada do motor antigo do Coach) cai no padrão da tela Voz & Áudio.
  if (catalogo && catalogo.length && !catalogo.includes(v)) return VOZ_PADRAO_SISTEMA;
  return v;
}

/**
 * Lê a configuração salva aceitando o formato antigo do Coach, em que cada
 * personagem era um objeto `{ provedor, piper, gemini }`. Só a voz do servidor
 * local (`piper`) é aproveitada; provedor e voz Gemini deixam de existir.
 */
function normPersonagem(raw: unknown, catalogo?: string[]): string {
  if (typeof raw === "string") return normVoz(raw, catalogo);
  const o = (raw ?? {}) as Record<string, unknown>;
  if (typeof o["voz"] === "string") return normVoz(o["voz"], catalogo);
  if (typeof o["piper"] === "string") return normVoz(o["piper"], catalogo);
  return VOZ_PADRAO_SISTEMA;
}

export function parseVozConfig(raw: unknown, catalogo?: string[]): VozConfig {
  const obj = (raw ?? {}) as Record<string, Record<string, unknown> | undefined>;
  const out = {} as VozConfig;
  for (const a of ATIVIDADES) {
    const atv = obj[a.id] ?? {};
    out[a.id] = {
      masculino: normPersonagem(atv["masculino"], catalogo),
      feminino: normPersonagem(atv["feminino"], catalogo),
    };
  }
  return out;
}

/** Voz escolhida para a atividade + gênero do personagem. */
export function vozEscolhida(
  cfg: unknown,
  atividade: VozAtividade,
  personagem: VozPersonagem,
): string {
  return parseVozConfig(cfg)[atividade][personagem];
}

const NOMES_MASCULINOS = [
  "joao","joão","rafael","carlos","pedro","lucas","marcos","paulo","jose","josé",
  "andre","andré","bruno","thiago","tiago","felipe","gustavo","daniel","eduardo",
  "fernando","ricardo","roberto","rodrigo","sergio","sérgio","vitor","victor",
  "matheus","mateus","gabriel","leonardo","luiz","luis","luís","antonio","antônio",
  "batista","alexandre","diego","igor","murilo","otavio","otávio","renato","samuel",
];
const NOMES_FEMININOS_EXCECAO = [
  "beatriz","ines","inês","raquel","rachel","ester","esther","carmen","eliane",
  "elen","helen","kettlen","yasmin","karen","cristiane","jessica","jéssica","nathalia",
];

/** Decide o gênero do personagem a partir do nome, para escolher a voz. */
export function personagemPorNome(nomeCompleto: string): VozPersonagem {
  const limpo = (nomeCompleto ?? "")
    .replace(/paciente|cliente|·|\-|\|/gi, " ")
    .trim()
    .toLowerCase();
  const primeiro = limpo.split(/\s+/)[0] ?? "";
  if (!primeiro) return "feminino";
  if (NOMES_MASCULINOS.includes(primeiro)) return "masculino";
  if (NOMES_FEMININOS_EXCECAO.includes(primeiro)) return "feminino";
  if (/(a|ia|ana|ne|ce)$/.test(primeiro)) return "feminino";
  return "masculino";
}
