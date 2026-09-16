import { diaRio } from "@/lib/coach/data-atual";

/**
 * Persistência local do treino de roleplay.
 * Evita que trocar de aba, perder conexão ou recarregar a página
 * faça a atendente começar tudo de novo. O estado vale apenas para o dia atual
 * (o progresso zera diariamente, no fuso do Rio).
 */
export type EstadoRoleplay = {
  dia: string;
  convAtiva: number;
  cenarios: Record<number, unknown>;
  convs: Record<number, unknown[]>;
  pontosFracos?: string[];
};

const chave = (atendente: string) => `roleplay:estado:${atendente.trim().toLowerCase()}`;

export function loadEstadoRoleplay(atendente: string): EstadoRoleplay | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(chave(atendente));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as EstadoRoleplay;
    if (!parsed || parsed.dia !== diaRio()) {
      localStorage.removeItem(chave(atendente));
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function saveEstadoRoleplay(
  atendente: string,
  estado: Omit<EstadoRoleplay, "dia">,
) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(
      chave(atendente),
      JSON.stringify({ ...estado, dia: diaRio() } satisfies EstadoRoleplay),
    );
  } catch {
    // storage cheio ou indisponível: segue sem persistir
  }
}

export function clearEstadoRoleplay(atendente: string) {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(chave(atendente));
  } catch {
    // ignore
  }
}
