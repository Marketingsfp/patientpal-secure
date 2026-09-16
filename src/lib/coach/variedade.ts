/**
 * Controle de variedade das simulações: evita repetir pacientes, serviços e
 * perguntas de abertura entre as conversas/ligações da mesma atendente.
 */
import { diaRio } from "./data-atual";

const KEY_USADOS = "roleplay:usados";

type Registro = { dia: string; itens: string[] };

function ler(atendente: string): Registro {
  if (typeof window === "undefined") return { dia: diaRio(), itens: [] };
  try {
    const raw = localStorage.getItem(`${KEY_USADOS}:${atendente}`);
    const r = raw ? (JSON.parse(raw) as Registro) : null;
    if (r && r.dia === diaRio()) return r;
  } catch {
    /* ignora storage inválido */
  }
  return { dia: diaRio(), itens: [] };
}

/** Itens (nomes, serviços, aberturas) que a IA não pode repetir hoje. */
export function itensEvitar(atendente: string): string[] {
  return ler(atendente).itens.slice(-60);
}

/** Registra o que foi usado numa simulação recém-criada. */
export function registrarUsados(atendente: string, itens: (string | undefined)[]) {
  const r = ler(atendente);
  const novos = itens
    .map((i) => (i ?? "").trim())
    .filter((i) => i.length > 1 && !r.itens.includes(i));
  if (!novos.length) return;
  const atualizado: Registro = { dia: r.dia, itens: [...r.itens, ...novos].slice(-80) };
  try {
    localStorage.setItem(`${KEY_USADOS}:${atendente}`, JSON.stringify(atualizado));
  } catch {
    /* storage cheio */
  }
}

/** Embaralha uma cópia da lista (Fisher-Yates). */
export function embaralhar<T>(lista: T[]): T[] {
  const a = [...lista];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
