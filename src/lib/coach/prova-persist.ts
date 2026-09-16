import { diaRio } from "@/lib/coach/data-atual";

/**
 * Persistência local da prova.
 * Evita que trocar de aba, perder conexão ou recarregar a página
 * faça a atendente refazer a prova do zero. O estado vale apenas para o dia atual
 * (o progresso zera diariamente, no fuso do Rio).
 */
export type EstadoProva = {
  dia: string;
  prova: unknown;
  respostas: number[];
  reveladas: boolean[];
  enviado: boolean;
};

const chave = (atendente: string) => `prova:estado:${atendente.trim().toLowerCase()}`;

export function loadEstadoProva(atendente: string): EstadoProva | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(chave(atendente));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as EstadoProva;
    if (!parsed || parsed.dia !== diaRio() || !parsed.prova) {
      localStorage.removeItem(chave(atendente));
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function saveEstadoProva(atendente: string, estado: Omit<EstadoProva, "dia">) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(
      chave(atendente),
      JSON.stringify({ ...estado, dia: diaRio() } satisfies EstadoProva),
    );
  } catch {
    // storage cheio ou indisponível: segue sem persistir
  }
}

export function clearEstadoProva(atendente: string) {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(chave(atendente));
  } catch {
    // ignore
  }
}
