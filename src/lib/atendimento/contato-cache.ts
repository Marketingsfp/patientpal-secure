/**
 * FASE 4 — cache de contato por ID do paciente.
 *
 * A referência do cache é o vínculo direto (`contato_paciente_id`), então o
 * mesmo paciente atendido em conversas diferentes aparece na hora, sem novo
 * lookup. Conversas sem vínculo nunca entram aqui (não há chave confiável).
 */

/** Chave canônica de cache: ["contact", contactId]. */
export function chaveContato(contactId: string): [string, string] {
  return ["contact", contactId];
}

export function chaveContatoTexto(contactId: string): string {
  return chaveContato(contactId).join(":");
}

export type EntradaContato<T = unknown> = { valor: T; em: number };

export class CacheContatos<T = unknown> {
  private mapa = new Map<string, EntradaContato<T>>();

  constructor(
    private limite = 30,
    private ttlMs = 5 * 60 * 1000,
  ) {}

  guardar(contactId: string | null | undefined, valor: T): void {
    if (!contactId) return;
    const k = chaveContatoTexto(contactId);
    this.mapa.delete(k);
    this.mapa.set(k, { valor, em: Date.now() });
    while (this.mapa.size > this.limite) {
      const primeira = this.mapa.keys().next().value as string | undefined;
      if (!primeira) break;
      this.mapa.delete(primeira);
    }
  }

  obter(contactId: string | null | undefined, agora = Date.now()): T | undefined {
    if (!contactId) return undefined;
    const k = chaveContatoTexto(contactId);
    const e = this.mapa.get(k);
    if (!e) return undefined;
    if (agora - e.em > this.ttlMs) {
      this.mapa.delete(k);
      return undefined;
    }
    return e.valor;
  }

  invalidar(contactId: string | null | undefined): void {
    if (!contactId) return;
    this.mapa.delete(chaveContatoTexto(contactId));
  }

  limpar(): void {
    this.mapa.clear();
  }

  get tamanho(): number {
    return this.mapa.size;
  }
}

/**
 * Decide se a abertura do lead pode usar o vínculo direto (busca por ID) ou
 * precisa do fallback por telefone. O fallback só acontece enquanto a conversa
 * não tem `contato_paciente_id` gravado.
 */
export function planoAberturaContato(params: {
  contactId?: string | null;
  telefone?: string | null;
}): { via: "id" | "telefone" | "sem_contato"; contactId: string | null } {
  if (params.contactId) return { via: "id", contactId: params.contactId };
  if (params.telefone) return { via: "telefone", contactId: null };
  return { via: "sem_contato", contactId: null };
}
