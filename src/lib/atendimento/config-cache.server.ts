/**
 * Cache curto, em memória do servidor, da configuração de WhatsApp por clínica.
 *
 * Motivo (Fase 5): cada envio relia a configuração no banco antes de falar com
 * a Meta. O conteúdo muda muito raramente, então guardamos por poucos segundos
 * para tirar uma ida ao banco do caminho crítico.
 *
 * Segurança:
 * - o cache vive apenas no processo do servidor; nada disso é devolvido ao
 *   navegador nem gravado em storage compartilhado;
 * - o token continua sendo usado somente dentro do servidor;
 * - qualquer gravação na configuração invalida a entrada da clínica.
 */
import { loadWhatsAppConfig, type WhatsAppConfigRow } from "@/lib/whatsapp.server";

const TTL_MS = 45_000;

type Entrada = { valor: WhatsAppConfigRow | null; expiraEm: number };

const cache = new Map<string, Entrada>();
const emVoo = new Map<string, Promise<WhatsAppConfigRow | null>>();

/** Remove a configuração da clínica do cache (usar após qualquer alteração). */
export function invalidarConfigWhatsApp(clinicaId: string) {
  cache.delete(clinicaId);
  emVoo.delete(clinicaId);
}

/** Esvazia o cache inteiro (usado em testes). */
export function limparCacheConfigWhatsApp() {
  cache.clear();
  emVoo.clear();
}

/**
 * Configuração da clínica, servida do cache quando ainda estiver fresca.
 * Chamadas simultâneas da mesma clínica compartilham uma única consulta.
 */
export async function obterConfigWhatsApp(
  clinicaId: string,
  agora: number = Date.now(),
): Promise<WhatsAppConfigRow | null> {
  const cached = cache.get(clinicaId);
  if (cached && cached.expiraEm > agora) return cached.valor;

  const jaEmVoo = emVoo.get(clinicaId);
  if (jaEmVoo) return jaEmVoo;

  const p = (async () => {
    try {
      const valor = await loadWhatsAppConfig(clinicaId);
      cache.set(clinicaId, { valor, expiraEm: Date.now() + TTL_MS });
      return valor;
    } finally {
      emVoo.delete(clinicaId);
    }
  })();
  emVoo.set(clinicaId, p);
  return p;
}
