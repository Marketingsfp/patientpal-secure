/**
 * FASE 12 — Registro único dos papéis de modelo na homologação.
 *
 * Cada papel tem um modelo fixo. Nenhum papel pode substituir outro
 * silenciosamente: quem chama o provedor precisa passar pelo `garantirPapel`,
 * que falha alto se o modelo não for o do papel declarado.
 *
 * - paciente  (GPT Terra) → escreve como paciente simulado;
 * - carga     (GPT Luna)  → gera variações de texto para volume;
 * - avaliador (GPT Sol)   → avalia execuções já concluídas;
 * - nina                  → o sistema sob teste; o modelo vem da configuração
 *                           real da clínica e é registrado por execução.
 */
import { MODELO_TERRA } from "@/lib/nina/simulador-terra";
import { MODELO_LUNA } from "@/lib/nina/carga";
import { MODELO_SOL } from "@/lib/nina/avaliador-sol";

export type PapelModelo = "paciente" | "carga" | "avaliador" | "nina";

export const PROVEDOR_IA = "lovable-ai-gateway";

export type DefinicaoPapel = {
  papel: PapelModelo;
  rotulo: string;
  modelo: string | null;
  provedor: string;
  descricao: string;
};

export const PAPEIS_MODELOS: Record<PapelModelo, DefinicaoPapel> = {
  paciente: {
    papel: "paciente",
    rotulo: "GPT Terra — paciente simulado",
    modelo: MODELO_TERRA,
    provedor: PROVEDOR_IA,
    descricao: "Só escreve mensagens de paciente. Não avalia, não executa ferramentas.",
  },
  carga: {
    papel: "carga",
    rotulo: "GPT Luna — geração de volume",
    modelo: MODELO_LUNA,
    provedor: PROVEDOR_IA,
    descricao: "Só gera variações de texto. Não controla concorrência nem conversa.",
  },
  avaliador: {
    papel: "avaliador",
    rotulo: "GPT Sol — avaliação",
    modelo: MODELO_SOL,
    provedor: PROVEDOR_IA,
    descricao: "Só avalia execuções concluídas. Nunca participa da conversa.",
  },
  nina: {
    papel: "nina",
    rotulo: "Nina — sistema sob teste",
    modelo: null,
    provedor: PROVEDOR_IA,
    descricao: "Modelo real da clínica; registrado em cada execução.",
  },
};

/** Falha alto se o modelo informado não for o do papel. */
export function garantirPapel(papel: PapelModelo, modelo: string): string {
  const def = PAPEIS_MODELOS[papel];
  if (!def.modelo) {
    if (!modelo?.trim()) throw new Error("Modelo da Nina não informado nesta execução.");
    return modelo;
  }
  if (modelo !== def.modelo) {
    throw new Error(
      `Modelo inválido para o papel "${def.rotulo}": esperado ${def.modelo}, recebido ${modelo}.`,
    );
  }
  return modelo;
}

/** Papel de um modelo conhecido (para conferência e telemetria). */
export function papelDoModelo(modelo: string | null | undefined): PapelModelo | null {
  if (!modelo) return null;
  for (const def of Object.values(PAPEIS_MODELOS)) {
    if (def.modelo && def.modelo === modelo) return def.papel;
  }
  return null;
}

/** Identificação registrada junto de cada execução. */
export function identificacaoModelo(papel: PapelModelo, modelo?: string | null) {
  const def = PAPEIS_MODELOS[papel];
  return { papel, modelo: def.modelo ?? modelo ?? null, provedor: def.provedor };
}
