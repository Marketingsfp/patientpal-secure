import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * gerarBoletosContrato — Stub de integração bancária.
 *
 * Lê todas as parcelas de um contrato e cria/atualiza registros na tabela
 * `boletos` com status "pendente_emissao". A chamada real à API do banco
 * (Itaú / Sicredi / Asaas / Cora / etc.) deve ser feita no bloco TODO abaixo —
 * basta receber as credenciais via secrets e implementar `emitirBoletoNoBanco`.
 */
export const gerarBoletosContrato = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ contratoId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;

    const { data: contrato, error: errC } = await supabase
      .from("contratos_assinatura")
      .select("id, clinica_id, paciente_id, paciente_nome, forma_pagamento")
      .eq("id", data.contratoId)
      .single();
    if (errC || !contrato) {
      return { pendentes: 0, emitidos: 0, mensagem: errC?.message ?? "Contrato não encontrado", erro: true };
    }

    const { data: parcelas, error: errP } = await supabase
      .from("contrato_mensalidades")
      .select("id, numero_parcela, valor, vencimento, status")
      .eq("contrato_id", contrato.id)
      .order("numero_parcela");
    if (errP) {
      return { pendentes: 0, emitidos: 0, mensagem: errP.message, erro: true };
    }

    const aEmitir = (parcelas ?? []).filter((p) => p.status !== "pago");

    // Quais parcelas já têm boleto?
    const ids = aEmitir.map((p) => p.id);
    const { data: existentes } = await supabase
      .from("boletos")
      .select("id, mensalidade_id, status")
      .in("mensalidade_id", ids.length > 0 ? ids : ["00000000-0000-0000-0000-000000000000"]);
    const jaExiste = new Set((existentes ?? []).map((b) => b.mensalidade_id));

    const novos = aEmitir
      .filter((p) => !jaExiste.has(p.id))
      .map((p) => ({
        clinica_id: contrato.clinica_id,
        contrato_id: contrato.id,
        mensalidade_id: p.id,
        paciente_id: contrato.paciente_id,
        valor: p.valor,
        vencimento: p.vencimento,
        status: "pendente_emissao" as const,
      }));

    if (novos.length > 0) {
      const { error: errIns } = await supabase.from("boletos").insert(novos);
      if (errIns) {
        return { pendentes: 0, emitidos: 0, mensagem: errIns.message, erro: true };
      }
    }

    // TODO: integrar API do banco aqui.
    // Para cada boleto pendente_emissao, chamar `emitirBoletoNoBanco(...)`,
    // receber { nosso_numero, linha_digitavel, codigo_barras, url_pdf } e
    // atualizar o boleto com status='emitido' + emitido_em=now().
    //
    // Exemplo:
    //   const apiKey = process.env.BANCO_API_KEY!;
    //   const res = await fetch("https://api.banco.com/v1/boletos", { ... });
    //   await supabase.from("boletos").update({
    //     nosso_numero: res.nosso_numero,
    //     linha_digitavel: res.linha_digitavel,
    //     codigo_barras: res.codigo_barras,
    //     url_pdf: res.url_pdf,
    //     status: "emitido",
    //     emitido_em: new Date().toISOString(),
    //     banco: "Banco XYZ",
    //   }).eq("id", boletoId);

    return {
      pendentes: novos.length,
      emitidos: 0,
      total: aEmitir.length,
      mensagem:
        novos.length > 0
          ? `${novos.length} boleto(s) registrados como pendentes. Integração bancária ainda não configurada — configure as credenciais do banco para emitir efetivamente.`
          : "Nenhuma parcela em aberto sem boleto registrado.",
      erro: false,
    };
  });
