import { loadWhatsAppConfig } from "@/lib/whatsapp.server";
import type { FranciscoConfig } from "./config";

// Transporte compartilhado com o mesmo número da clínica; configuração e mensagens independentes.
const GRAPH = "https://graph.facebook.com/v22.0";
export async function validarTemplates(clinicaId: string, c: FranciscoConfig) {
  const wa = await loadWhatsAppConfig(clinicaId);
  if (!wa?.ativo || !wa.access_token || !wa.phone_number_id || !wa.waba_id)
    throw new Error("WhatsApp da clínica não está pronto para envio.");
  for (const etapa of ["d1", "d4"] as const) {
    if (!c[etapa]) continue;
    const t = c.templates[etapa];
    const url = new URL(`${GRAPH}/${wa.waba_id}/message_templates`);
    url.searchParams.set("name", t.nome);
    url.searchParams.set("fields", "name,status,language,components");
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${wa.access_token}` },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok)
      throw new Error("Não foi possível conferir o template na Meta. Nenhum envio autorizado.");
    const json = (await res.json()) as {
      data?: Array<{
        name: string;
        language: string;
        status: string;
        components: Array<{ type: string; text?: string }>;
      }>;
    };
    const aprovado = json.data?.find(
      (x) => x.name === t.nome && x.language === t.idioma && x.status === "APPROVED",
    );
    const body = aprovado?.components.find((x) => x.type === "BODY")?.text;
    // Templates com mídia/botões não são suportados nesta versão. Evita parâmetros faltando.
    if (body !== t.texto || aprovado?.components.some((x) => !["BODY", "FOOTER"].includes(x.type)))
      throw new Error(
        `Template ${etapa.toUpperCase()} precisa estar aprovado na Meta, com o mesmo texto e somente corpo/rodapé.`,
      );
  }
  return wa;
}
export async function enviarTemplateFrancisco(
  wa: Awaited<ReturnType<typeof validarTemplates>>,
  telefone: string,
  t: FranciscoConfig["templates"]["d1"],
  clinica: string,
) {
  const res = await fetch(`${GRAPH}/${wa.phone_number_id}/messages`, {
    method: "POST",
    signal: AbortSignal.timeout(15000),
    headers: { Authorization: `Bearer ${wa.access_token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to: telefone,
      type: "template",
      template: {
        name: t.nome,
        language: { code: t.idioma },
        components: [{ type: "body", parameters: [{ type: "text", text: clinica.slice(0, 400) }] }],
      },
    }),
  });
  // Não há retry automático: em erro/timeout não sabemos se o provedor aceitou.
  if (!res.ok)
    throw new Error(
      `Meta recusou ou não confirmou o envio (${res.status}). Requer conferência humana.`,
    );
  const json = (await res.json()) as { messages?: Array<{ id?: string }> };
  const id = json.messages?.[0]?.id;
  if (!id)
    throw new Error("Meta não devolveu identificador de mensagem. Requer conferência humana.");
  return id;
}
