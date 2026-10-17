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

/**
 * Liberar / retirar um documento ou resultado de exame da Área do Paciente.
 * A pessoa precisa enxergar o registro (RLS da clínica) e ter um dos papéis
 * acima naquela clínica. Grava quem/quando e registra no histórico do portal.
 */
export const liberarParaPaciente = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (d: {
      origem: "documento" | "exame" | "anexo" | "pedido_exame";
      id: string;
      liberar: boolean;
    }) =>
      z
        .object({
          origem: z.enum(["documento", "exame", "anexo", "pedido_exame"]),
          id: z.string().uuid(),
          liberar: z.boolean(),
        })
        .parse(d),
  )
  .handler(async ({ data, context }) => {
    const tabela = {
      documento: "documentos_emitidos",
      exame: "exame_resultados",
      anexo: "paciente_arquivos",
      pedido_exame: "pedidos_exame",
    }[data.origem] as
      | "documentos_emitidos"
      | "exame_resultados"
      | "paciente_arquivos"
      | "pedidos_exame";
    const { data: reg } = await context.supabase
      .from(tabela)
      .select(
        data.origem === "documento"
          ? "id, clinica_id, paciente_id, tipo"
          : data.origem === "anexo"
            ? "id, clinica_id, paciente_id, finalidade_portal"
            : data.origem === "pedido_exame"
              ? "id, clinica_id, paciente_id, status"
              : "id, clinica_id, paciente_id",
      )
      .eq("id", data.id)
      .maybeSingle();
    const r = reg as {
      id: string;
      clinica_id: string;
      paciente_id: string | null;
      tipo?: string;
      finalidade_portal?: string;
      status?: string;
    } | null;
    if (!r) throw new Error("Registro não encontrado.");
    if (!r.paciente_id) throw new Error("Este registro não está ligado a um cadastro de paciente.");
    if (r.tipo === "contrato") throw new Error("Contratos não vão para a Área do Paciente.");
    if (data.liberar && data.origem === "anexo" && r.finalidade_portal !== "clinico")
      throw new Error("Arquivo interno não pode ser liberado.");
    if (data.liberar && data.origem === "pedido_exame" && r.status !== "emitido")
      throw new Error("Pedido cancelado não pode ser liberado.");
    const { data: pode, error: permissaoErro } = await context.supabase.rpc("portal_pode_liberar", {
      _clinica_id: r.clinica_id,
    });
    if (permissaoErro || !pode)
      throw new Error("Você não tem permissão para liberar documentos ao paciente.");
    const { data: paciente } = await context.supabase.from("pacientes").select("id")
      .eq("id", r.paciente_id).eq("clinica_id", r.clinica_id).maybeSingle();
    if (!paciente) throw new Error("Vínculo de paciente inválido.");
    const s = await import("./portal.server");
    const db =
      data.origem === "anexo" || data.origem === "pedido_exame"
        ? context.supabase
        : await s.admin();
    const agora = new Date().toISOString();
    const { error } = await db
      .from(tabela)
      .update({
        liberado_paciente_em: data.liberar ? agora : null,
        liberado_paciente_por: data.liberar ? context.userId : null,
      })
      .eq("id", r.id)
      .eq("paciente_id", r.paciente_id)
      .eq("clinica_id", r.clinica_id);
    if (error) throw new Error("Não foi possível salvar agora.");
    if (data.origem === "documento" || data.origem === "exame")
      await s.auditar({
        clinica_id: r.clinica_id,
        paciente_id: r.paciente_id,
        evento: data.liberar ? "equipe_liberou" : "equipe_retirou",
        detalhe: { por: context.userId, origem: data.origem, id: r.id },
      });
    return { liberadoEm: data.liberar ? agora : null };
  });
