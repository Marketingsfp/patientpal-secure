// Escolha da voz do treinamento, por personagem e por atividade.
// Fica salva na clínica (coluna voz_config), então vale para todas as atendentes da unidade.

export type VozProvedor = "auto" | "piper" | "gemini" | "openai";
export type VozAtividade = "ligacao" | "whatsapp";
export type VozPersonagem = "masculino" | "feminino";

export type VozEscolha = {
  /** Motor usado para gerar o áudio. */
  provedor: VozProvedor;
  /** Voz do servidor local (Piper / Coqui). */
  piper: string;
  /** Voz da plataforma (Gemini). */
  gemini: string;
};

export type VozConfig = Record<VozAtividade, Record<VozPersonagem, VozEscolha>>;

export const VOZES_PIPER: Array<{ id: string; label: string; genero: VozPersonagem }> = [
  { id: "dii_pt-BR", label: "Dii (feminina, natural)", genero: "feminino" },
  { id: "pt_BR-luciana", label: "Luciana (feminina, clara)", genero: "feminino" },
  { id: "pt_BR-faber-medium", label: "Faber (masculina, natural)", genero: "masculino" },
  { id: "pt_BR-edresson-low", label: "Edresson (masculina, grave)", genero: "masculino" },
];

export const VOZES_GEMINI: Array<{ id: string; label: string; genero: VozPersonagem }> = [
  { id: "Aoede", label: "Aoede (feminina, suave)", genero: "feminino" },
  { id: "Kore", label: "Kore (feminina, firme)", genero: "feminino" },
  { id: "Leda", label: "Leda (feminina, jovem)", genero: "feminino" },
  { id: "Puck", label: "Puck (masculina, animada)", genero: "masculino" },
  { id: "Charon", label: "Charon (masculina, grave)", genero: "masculino" },
  { id: "Fenrir", label: "Fenrir (masculina, firme)", genero: "masculino" },
];

const PADRAO_POR_GENERO: Record<VozPersonagem, { piper: string; gemini: string }> = {
  feminino: { piper: "dii_pt-BR", gemini: "Aoede" },
  masculino: { piper: "pt_BR-faber-medium", gemini: "Puck" },
};

export const VOZ_CONFIG_PADRAO: VozConfig = {
  ligacao: {
    masculino: { provedor: "auto", ...PADRAO_POR_GENERO.masculino },
    feminino: { provedor: "auto", ...PADRAO_POR_GENERO.feminino },
  },
  whatsapp: {
    masculino: { provedor: "auto", ...PADRAO_POR_GENERO.masculino },
    feminino: { provedor: "auto", ...PADRAO_POR_GENERO.feminino },
  },
};

export const ATIVIDADES: Array<{ id: VozAtividade; label: string; ajuda: string }> = [
  { id: "ligacao", label: "Treinamento por ligação", ajuda: "Voz do paciente durante a ligação simulada." },
  { id: "whatsapp", label: "Treinamento por WhatsApp", ajuda: "Áudios enviados nas conversas de WhatsApp." },
];

export const PERSONAGENS: Array<{ id: VozPersonagem; label: string }> = [
  { id: "feminino", label: "Personagem feminina" },
  { id: "masculino", label: "Personagem masculino" },
];

export const PROVEDORES: Array<{ id: VozProvedor; label: string; descricao: string }> = [
  {
    id: "auto",
    label: "Automático (recomendado)",
    descricao: "Tenta o Piper local; se estiver fora do ar usa a voz Gemini e, por último, a OpenAI.",
  },
  { id: "piper", label: "Piper local", descricao: "Somente o seu servidor de voz local." },
  { id: "gemini", label: "Gemini alta qualidade", descricao: "Voz da plataforma em pt-BR, sem depender do seu servidor." },
  { id: "openai", label: "Gemini fallback (OpenAI)", descricao: "Voz de reserva da plataforma." },
];

const PROV_VALIDOS: VozProvedor[] = ["auto", "piper", "gemini", "openai"];

function normProv(v: unknown): VozProvedor {
  return PROV_VALIDOS.includes(v as VozProvedor) ? (v as VozProvedor) : "auto";
}

function normVoz(
  v: unknown,
  lista: Array<{ id: string }>,
  fallback: string,
): string {
  return typeof v === "string" && lista.some((x) => x.id === v) ? v : fallback;
}

function normEscolha(raw: unknown, genero: VozPersonagem): VozEscolha {
  const padrao = PADRAO_POR_GENERO[genero];
  // Compatibilidade: antes era só o nome do provedor.
  if (typeof raw === "string") {
    return { provedor: normProv(raw), ...padrao };
  }
  const o = (raw ?? {}) as Record<string, unknown>;
  return {
    provedor: normProv(o["provedor"]),
    piper: normVoz(o["piper"], VOZES_PIPER, padrao.piper),
    gemini: normVoz(o["gemini"], VOZES_GEMINI, padrao.gemini),
  };
}

export function parseVozConfig(raw: unknown): VozConfig {
  const obj = (raw ?? {}) as Record<string, Record<string, unknown> | undefined>;
  const out = {} as VozConfig;
  for (const a of ATIVIDADES) {
    const atv = obj[a.id] ?? {};
    out[a.id] = {
      masculino: normEscolha(atv["masculino"], "masculino"),
      feminino: normEscolha(atv["feminino"], "feminino"),
    };
  }
  return out;
}

/** Voz escolhida para a atividade + gênero do personagem. */
export function escolhaDaVoz(
  cfg: unknown,
  atividade: VozAtividade,
  personagem: VozPersonagem,
): VozEscolha {
  return parseVozConfig(cfg)[atividade][personagem];
}

/** Provedor escolhido para a atividade + gênero do personagem. */
export function provedorDaVoz(
  cfg: unknown,
  atividade: VozAtividade,
  personagem: VozPersonagem,
): VozProvedor {
  return escolhaDaVoz(cfg, atividade, personagem).provedor;
}
