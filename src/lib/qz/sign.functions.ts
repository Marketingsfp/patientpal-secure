// Server function que assina os comandos enviados ao QZ Tray usando a
// chave privada armazenada no secret QZ_PRIVATE_KEY. Isso permite
// impressão silenciosa sem o popup de autorização do QZ.
import { createServerFn } from "@tanstack/react-start";
import { createSign } from "node:crypto";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

function validarPayload(input: { toSign: string }) {
  if (!input || typeof input.toSign !== "string") {
    throw new Error("Payload inválido para assinatura QZ.");
  }
  // Limite defensivo: a assinatura QZ recebe apenas o payload de comando,
  // nunca documentos inteiros.
  if (input.toSign.length === 0 || input.toSign.length > 8000) {
    throw new Error("Payload de assinatura QZ fora do tamanho permitido.");
  }
}

function assinar(toSign: string): { signature: string } {
  const privateKey = process.env.QZ_PRIVATE_KEY;
  if (!privateKey) {
    throw new Error("QZ_PRIVATE_KEY não configurada no servidor.");
  }
  // QZ Tray usa SHA512 por padrão para o certificado do site (2.1+).
  const signer = createSign("SHA512");
  signer.update(toSign);
  signer.end();
  return { signature: signer.sign(privateKey).toString("base64") };
}

// Este endpoint assina com a chave privada do QZ Tray, e uma assinatura
// válida dispensa o popup de autorização na estação. Sem middleware ele era
// um oráculo de assinatura aberto à internet: qualquer um obtinha comandos
// de impressão assinados. Exigir sessão é o mínimo — só quem está logado no
// sistema pode pedir assinatura.
export const assinarQzMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { toSign: string }) => {
    validarPayload(input);
    return input;
  })
  .handler(async ({ data }) => assinar(data.toSign));

// O totem roda SEM login, pelo link público /totem/t/<token> (é o que a tela
// Configurações → Painel e Totem entrega). Com a assinatura presa ao login,
// o QZ Tray do totem nunca recebia assinatura e a senha não saía no papel.
// Aqui a chave é o mesmo token secreto que já libera emitir senha sem login:
// quem não tem o token de uma clínica continua sem assinatura. Autorizado
// pelo dono em 05/10/2026.
export const assinarQzMessageTotem = createServerFn({ method: "POST" })
  .inputValidator((input: { toSign: string; token: string }) => {
    validarPayload(input);
    if (typeof input.token !== "string" || input.token.length < 16 || input.token.length > 200) {
      throw new Error("Token do totem inválido.");
    }
    return input;
  })
  .handler(async ({ data }) => {
    const { data: clinica, error } = await supabaseAdmin
      .from("clinicas")
      .select("id")
      .eq("token_publico", data.token)
      .maybeSingle();
    if (error || !clinica) {
      throw new Error("Token do totem inválido.");
    }
    return assinar(data.toSign);
  });
