// Núcleo server-only da Área do Paciente. O paciente NÃO é usuário do Auth:
// a identidade é a sessão própria (cookie HttpOnly), e toda leitura é cercada
// por clinica_id + paciente_id da sessão. Usa service_role, então este
// arquivo é a única barreira — nunca aceitar paciente_id vindo do navegador.

import { getCookie, getRequestHeader, getRequestIP, setCookie, deleteCookie } from "@tanstack/react-start/server";
import { hostnamePadrao, idClinicaValido, normalizarHostname } from "@/lib/clinica-acesso";
import { SESSAO_MAX_HORAS, sessaoValida } from "./regras";

export const COOKIE_SESSAO = "portal_sessao";

export async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

function pepper(): string {
  const p = process.env["PORTAL_PACIENTE_PEPPER"];
  if (!p) throw new Error("Área do Paciente indisponível no momento.");
  return p;
}

function hex(buf: ArrayBuffer): string {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** HMAC-SHA256 com o segredo do servidor (CPF, código, IP e token nunca ficam em claro). */
export async function hmac(tipo: string, valor: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(pepper()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return hex(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${tipo}:${valor}`)));
}

export function tokenAleatorio(): string {
  const b = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...b)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function codigoAleatorio(): string {
  const n = crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000;
  return String(n).padStart(6, "0");
}

export async function ipHash(): Promise<string> {
  const ip =
    getRequestHeader("cf-connecting-ip") ?? getRequestIP({ xForwardedFor: true }) ?? "desconhecido";
  return hmac("ip", ip);
}

/**
 * Clínica da Área do Paciente: domínio próprio cadastrado; nos endereços
 * padrão (prévia/localhost) aceita o `?clinica=` para teste. Só devolve se o
 * interruptor da clínica estiver ligado.
 */
export async function clinicaDoPortal(clinicaParam?: string | null): Promise<string | null> {
  const db = await admin();
  const hostRaw = getRequestHeader("x-forwarded-host") ?? getRequestHeader("host") ?? "";
  const host = normalizarHostname(hostRaw);
  let clinicaId: string | null = null;
  if (!hostnamePadrao(host)) {
    const { data } = await db
      .from("clinica_dominios")
      .select("clinica_id")
      .eq("hostname", host)
      .eq("ativo", true)
      .maybeSingle();
    clinicaId = data?.clinica_id ?? null;
  } else if (idClinicaValido(clinicaParam)) {
    clinicaId = clinicaParam.toLowerCase();
  }
  if (!clinicaId) return null;
  const { data: cfg } = await db
    .from("portal_paciente_config")
    .select("ativo")
    .eq("clinica_id", clinicaId)
    .maybeSingle();
  return cfg?.ativo ? clinicaId : null;
}

export async function auditar(e: {
  clinica_id: string;
  evento: string;
  paciente_id?: string | null;
  cpf_hash?: string | null;
  detalhe?: Record<string, unknown>;
}) {
  const db = await admin();
  await db.from("portal_acessos").insert({
    clinica_id: e.clinica_id,
    evento: e.evento,
    paciente_id: e.paciente_id ?? null,
    cpf_hash: e.cpf_hash ?? null,
    detalhe: (e.detalhe ?? {}) as never,
    ip_hash: await ipHash(),
  });
}

export async function criarSessao(clinicaId: string, pacienteId: string) {
  const db = await admin();
  const token = tokenAleatorio();
  const agora = Date.now();
  const { error } = await db.from("portal_sessoes").insert({
    clinica_id: clinicaId,
    paciente_id: pacienteId,
    token_hash: await hmac("sessao", token),
    expira_max_em: new Date(agora + SESSAO_MAX_HORAS * 3_600_000).toISOString(),
    ip_hash: await ipHash(),
  });
  if (error) throw new Error("Não foi possível entrar agora. Tente novamente.");
  setCookie(COOKIE_SESSAO, token, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: SESSAO_MAX_HORAS * 3600,
  });
}

export type SessaoPortal = { id: string; clinica_id: string; paciente_id: string };

/** Sessão válida (renova o "último uso") ou null. Confere a clínica do endereço. */
export async function sessaoAtual(clinicaParam?: string | null): Promise<SessaoPortal | null> {
  const token = getCookie(COOKIE_SESSAO);
  if (!token) return null;
  const db = await admin();
  const { data: s } = await db
    .from("portal_sessoes")
    .select("id, clinica_id, paciente_id, ultimo_uso_em, expira_max_em, encerrada_em")
    .eq("token_hash", await hmac("sessao", token))
    .maybeSingle();
  if (!s || !sessaoValida(s, new Date())) {
    deleteCookie(COOKIE_SESSAO, { path: "/" });
    return null;
  }
  const clinica = await clinicaDoPortal(clinicaParam);
  if (clinica !== s.clinica_id) return null;
  await db.from("portal_sessoes").update({ ultimo_uso_em: new Date().toISOString() }).eq("id", s.id);
  return { id: s.id, clinica_id: s.clinica_id, paciente_id: s.paciente_id };
}

export async function encerrarSessao() {
  const token = getCookie(COOKIE_SESSAO);
  deleteCookie(COOKIE_SESSAO, { path: "/" });
  if (!token) return;
  const db = await admin();
  await db
    .from("portal_sessoes")
    .update({ encerrada_em: new Date().toISOString() })
    .eq("token_hash", await hmac("sessao", token));
}

export async function termoAtual(clinicaId: string) {
  const db = await admin();
  const { data } = await db
    .from("portal_termos")
    .select("id, versao, titulo, texto, rascunho_juridico")
    .eq("clinica_id", clinicaId)
    .order("versao", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data;
}

export async function aceitouTermoAtual(s: SessaoPortal): Promise<boolean> {
  const termo = await termoAtual(s.clinica_id);
  if (!termo) return true;
  const db = await admin();
  const { data } = await db
    .from("portal_termo_aceites")
    .select("id")
    .eq("paciente_id", s.paciente_id)
    .eq("termo_id", termo.id)
    .maybeSingle();
  return !!data;
}

/** Sessão + termo aceito; senão erro genérico. */
export async function exigirSessao(clinicaParam?: string | null): Promise<SessaoPortal> {
  const s = await sessaoAtual(clinicaParam);
  if (!s) throw new Error("Sua sessão terminou. Entre novamente.");
  if (!(await aceitouTermoAtual(s))) throw new Error("Aceite o termo para continuar.");
  return s;
}

/**
 * Envio do código por e-mail. Enquanto o domínio de e-mail da clínica não
 * estiver configurado, devolve false (a equipe pode gerar um código de teste
 * em Configurações → Área do Paciente).
 */
export async function enviarCodigoEmail(_p: {
  clinicaNome: string;
  email: string;
  codigo: string;
}): Promise<boolean> {
  return false;
}
