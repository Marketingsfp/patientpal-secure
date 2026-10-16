// Ações da EQUIPE ligadas à Área do Paciente.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { CODIGO_VALIDADE_MIN, apenasDigitos } from "./regras";

/**
 * Código de teste: enquanto o e-mail da clínica não está configurado, o
 * administrador gera um código para um paciente e o informa pessoalmente.
 * Só admin da clínica; fica registrado na auditoria.
 */
export const gerarCodigoTeste = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { clinicaId: string; pacienteId: string }) =>
    z.object({ clinicaId: z.string().uuid(), pacienteId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: ehAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _clinica_id: data.clinicaId,
      _role: "admin",
    });
    if (!ehAdmin) throw new Error("Só administradores podem gerar código de teste.");
    const s = await import("./portal.server");
    const db = await s.admin();
    const { data: cfg } = await db
      .from("portal_paciente_config")
      .select("ativo")
      .eq("clinica_id", data.clinicaId)
      .maybeSingle();
    if (!cfg?.ativo) throw new Error("Ligue a Área do Paciente desta clínica primeiro.");
    const { data: p } = await db
      .from("pacientes")
      .select("id, cpf_digits")
      .eq("id", data.pacienteId)
      .eq("clinica_id", data.clinicaId)
      .maybeSingle();
    const cpf = apenasDigitos(p?.cpf_digits);
    if (!p || cpf.length !== 11) throw new Error("Este paciente não tem CPF cadastrado.");
    const cpfHash = await s.hmac("cpf", `${data.clinicaId}:${cpf}`);
    const codigo = s.codigoAleatorio();
    await db
      .from("portal_otps")
      .update({ invalidado: true })
      .eq("clinica_id", data.clinicaId)
      .eq("cpf_hash", cpfHash)
      .is("usado_em", null);
    const { error } = await db.from("portal_otps").insert({
      clinica_id: data.clinicaId,
      cpf_hash: cpfHash,
      paciente_id: p.id,
      codigo_hash: await s.hmac("otp", codigo),
      expira_em: new Date(Date.now() + CODIGO_VALIDADE_MIN * 60_000).toISOString(),
      ip_hash: await s.ipHash(),
    });
    if (error) throw new Error("Não foi possível gerar o código.");
    await s.auditar({
      clinica_id: data.clinicaId,
      paciente_id: p.id,
      cpf_hash: cpfHash,
      evento: "codigo_teste_gerado",
      detalhe: { por: context.userId },
    });
    return { codigo, validadeMin: CODIGO_VALIDADE_MIN };
  });
