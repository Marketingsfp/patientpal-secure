import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const ref = z.object({ clinicaId: z.string().uuid(), pacienteId: z.string().uuid() });
const itemSchema = z.object({
  procedimento_id: z.string().uuid().optional(),
  codigo: z.string().max(100).optional(),
  nome: z.string().trim().min(1).max(500),
  texto_livre: z.string().max(500).optional(),
});
export type ItemPedido = z.infer<typeof itemSchema>;

export const listarPedidosExame = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: z.infer<typeof ref>) => ref.parse(d))
  .handler(async ({ data, context }) => {
    const { data: itens, error } = await context.supabase
      .from("pedidos_exame")
      .select("*")
      .eq("clinica_id", data.clinicaId)
      .eq("paciente_id", data.pacienteId)
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw new Error("Não foi possível carregar os pedidos.");
    return itens ?? [];
  });

export const emitirPedidoExame = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (
      d: z.infer<typeof ref> & {
        medicoId?: string | null;
        agendamentoId?: string | null;
        itens: ItemPedido[];
        indicacao: string;
        observacao: string;
      },
    ) =>
      ref
        .extend({
          medicoId: z.string().uuid().nullable().optional(),
          agendamentoId: z.string().uuid().nullable().optional(),
          itens: z.array(itemSchema).min(1).max(100),
          indicacao: z.string().max(10000),
          observacao: z.string().max(10000),
        })
        .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: pode, error: permErro } = await context.supabase.rpc("portal_pode_liberar", {
      _clinica_id: data.clinicaId,
    });
    if (permErro || !pode) throw new Error("Sem permissão para emitir pedidos.");
    const { data: paciente } = await context.supabase
      .from("pacientes")
      .select("nome")
      .eq("id", data.pacienteId)
      .eq("clinica_id", data.clinicaId)
      .maybeSingle();
    if (!paciente) throw new Error("Paciente não encontrado nesta clínica.");
    const itens: ItemPedido[] = [];
    for (const item of data.itens) {
      if (!item.procedimento_id) {
        itens.push({ nome: item.nome, texto_livre: item.texto_livre });
        continue;
      }
      const { data: proc } = await context.supabase
        .from("procedimentos")
        .select("id,nome,codigo")
        .eq("id", item.procedimento_id)
        .eq("clinica_id", data.clinicaId)
        .maybeSingle();
      if (!proc) throw new Error("Exame não encontrado no catálogo desta clínica.");
      itens.push({
        procedimento_id: proc.id,
        codigo: proc.codigo ?? undefined,
        nome: proc.nome,
        texto_livre: item.texto_livre,
      });
    }
    const { data: cl } = await context.supabase
      .from("clinicas")
      .select("nome")
      .eq("id", data.clinicaId)
      .maybeSingle();
    const { data: med } = data.medicoId
      ? await context.supabase
          .from("medicos")
          .select("nome,crm")
          .eq("id", data.medicoId)
          .eq("clinica_id", data.clinicaId)
          .maybeSingle()
      : { data: null };
    if (data.medicoId && !med) throw new Error("Profissional não encontrado nesta clínica.");
    const { hojeBR } = await import("@/lib/date-utils");
    const { jsPDF } = await import("jspdf");
    const pdf = new jsPDF();
    let y = 22;
    const linha = (texto: string, tamanho = 11) => {
      pdf.setFontSize(tamanho);
      for (const t of pdf.splitTextToSize(texto, 170) as string[]) {
        if (y > 265) {
          pdf.addPage();
          y = 22;
        }
        pdf.text(t, 20, y);
        y += tamanho === 16 ? 9 : 6;
      }
      y += 3;
    };
    linha(cl?.nome ?? "", 16);
    linha("PEDIDO DE EXAME", 16);
    linha(`Paciente: ${paciente.nome}`);
    linha(`Data: ${hojeBR()}`);
    itens.forEach((item, i) =>
      linha(
        `${i + 1}. ${item.codigo ? `${item.codigo} — ` : ""}${item.nome}${item.texto_livre ? ` — ${item.texto_livre}` : ""}`,
      ),
    );
    if (data.indicacao) linha(`Indicação clínica: ${data.indicacao}`);
    if (data.observacao) linha(`Observação: ${data.observacao}`);
    linha(
      `Profissional: ${med?.nome ?? context.claims.email ?? "Equipe da clínica"}${med?.crm ? ` — CRM ${med.crm}` : ""}`,
    );
    const id = crypto.randomUUID();
    const caminho = `${data.clinicaId}/${data.pacienteId}/pedidos-exame/${id}.pdf`;
    const bytes = pdf.output("arraybuffer");
    const { error: uploadErro } = await context.supabase.storage
      .from("paciente-arquivos")
      .upload(caminho, bytes, { contentType: "application/pdf", upsert: false });
    if (uploadErro) throw new Error("Não foi possível salvar o PDF. Nenhum pedido foi emitido.");
    const { data: pedido, error } = await context.supabase
      .from("pedidos_exame")
      .insert({
        id,
        clinica_id: data.clinicaId,
        paciente_id: data.pacienteId,
        medico_id: data.medicoId ?? null,
        profissional_id: context.userId,
        agendamento_id: data.agendamentoId ?? null,
        data: hojeBR(),
        itens,
        indicacao_clinica: data.indicacao,
        observacao: data.observacao,
        pdf_caminho: caminho,
        created_by: context.userId,
      })
      .select("id")
      .single();
    if (error || !pedido) throw new Error("Não foi possível registrar o pedido. Tente novamente.");
    return { id: pedido.id };
  });

export const cancelarPedidoExame = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: existente } = await context.supabase
      .from("pedidos_exame")
      .select("clinica_id,paciente_id")
      .eq("id", data.id)
      .maybeSingle();
    if (!existente) throw new Error("Pedido não encontrado.");
    const { data: pode } = await context.supabase.rpc("portal_pode_liberar", {
      _clinica_id: existente.clinica_id,
    });
    if (!pode) throw new Error("Sem permissão para cancelar pedidos.");
    const { data: pedido, error } = await context.supabase
      .from("pedidos_exame")
      .update({ status: "cancelado" })
      .eq("id", data.id)
      .eq("clinica_id", existente.clinica_id)
      .eq("paciente_id", existente.paciente_id)
      .eq("status", "emitido")
      .select("id")
      .maybeSingle();
    if (error || !pedido) throw new Error("Não foi possível cancelar o pedido.");
    return { ok: true };
  });

export const baixarPedidoEquipe = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: p } = await context.supabase
      .from("pedidos_exame")
      .select("clinica_id,paciente_id,pdf_caminho")
      .eq("id", data.id)
      .maybeSingle();
    const { caminhoClinicoValido } = await import("./regras-fase2");
    if (
      !p?.pdf_caminho ||
      !caminhoClinicoValido(p.pdf_caminho, p.clinica_id, p.paciente_id, "pedidos-exame")
    )
      throw new Error("PDF indisponível.");
    const { data: blob, error } = await context.supabase.storage
      .from("paciente-arquivos")
      .download(p.pdf_caminho);
    if (error || !blob) throw new Error("PDF indisponível.");
    const s = await import("./portal.server");
    await s.auditar({
      clinica_id: p.clinica_id,
      paciente_id: p.paciente_id,
      evento: "equipe_baixou_pedido",
      detalhe: { por: context.userId, id: data.id },
    });
    const bytes = new Uint8Array(await blob.arrayBuffer());
    return { base64: btoa(Array.from(bytes, (b) => String.fromCharCode(b)).join("")) };
  });

export const classificarAnexoPortal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string; finalidade: "clinico" | "interno" }) =>
    z.object({ id: z.string().uuid(), finalidade: z.enum(["clinico", "interno"]) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: existente } = await context.supabase
      .from("paciente_arquivos")
      .select("clinica_id,paciente_id,caminho,tipo")
      .eq("id", data.id)
      .maybeSingle();
    if (!existente) throw new Error("Arquivo não encontrado.");
    const { data: pode } = await context.supabase.rpc("portal_pode_liberar", {
      _clinica_id: existente.clinica_id,
    });
    if (!pode) throw new Error("Sem permissão para classificar arquivos.");
    const { caminhoClinicoValido } = await import("./regras-fase2");
    if (
      data.finalidade === "clinico" &&
      !caminhoClinicoValido(
        existente.caminho,
        existente.clinica_id,
        existente.paciente_id,
        existente.tipo,
      )
    )
      throw new Error("Caminho de arquivo incompatível com liberação ao paciente.");
    const { data: reg, error } = await context.supabase
      .from("paciente_arquivos")
      .update({ finalidade_portal: data.finalidade })
      .eq("id", data.id)
      .eq("clinica_id", existente.clinica_id)
      .eq("paciente_id", existente.paciente_id)
      .select("id")
      .maybeSingle();
    if (error || !reg)
      throw new Error(
        "Não foi possível classificar o arquivo. Confira suas permissões e o caminho do arquivo.",
      );
    return { ok: true };
  });
