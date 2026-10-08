import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  candidatos,
  carregarRegistro,
  conferirErro,
  envioRealLiberado,
  type ConfigRegistro,
} from "./service.server";
import { naJanelaFrancisco, textoTemplateFrancisco } from "./config";
import { enviarTemplateFrancisco, validarTemplates } from "./transport.server";

type Db = SupabaseClient<any>;
export async function executarClinicaFrancisco(db: Db, registro: ConfigRegistro, prazo: number) {
  const c = registro.publicado;
  if (!envioRealLiberado() || !c?.ativo || c.modo !== "real" || !naJanelaFrancisco(c, new Date()))
    return { enviados: 0, examinados: 0 };
  const wa = await validarTemplates(registro.clinica_id, c);
  const { data: clinica, error } = await db
    .from("clinicas")
    .select("nome")
    .eq("id", registro.clinica_id)
    .single();
  conferirErro(error);
  if (!clinica?.nome) throw new Error("Clínica sem nome para apresentação do Francisco.");
  let cursor = registro.cursor_job ?? undefined;
  let examinados = 0,
    enviados = 0,
    tentativas = 0;
  // Cursor persistente: a rodada seguinte retoma a leitura, sem limite total de orçamentos.
  for (let pagina = 0; pagina < 5 && tentativas < c.limiteRodada && Date.now() < prazo; pagina++) {
    const lote = await candidatos(db, registro.clinica_id, registro, cursor);
    for (const item of lote.itens) {
      if (Date.now() >= prazo || tentativas >= c.limiteRodada) break;
      examinados++;
      cursor = { em: item.created_at, id: item.orcamento_id };
      if (item.motivo !== "elegivel") continue;
      // Reserva atômica confere de novo financeiro, opt-in, resposta e duplicidade.
      const texto = textoTemplateFrancisco(c, item.etapa, clinica.nome);
      const reserva = await db.rpc("francisco_reservar", {
        p_clinica: registro.clinica_id,
        p_orcamento: item.orcamento_id,
        p_etapa: item.etapa,
        p_texto: texto,
      });
      conferirErro(reserva.error);
      if (!reserva.data) continue;
      const r = reserva.data as { id: string; telefone: string; configuracao: typeof c };
      try {
        // Uma configuração publicada em paralelo não pode usar o template validado anterior.
        if (!configuracoesIguais(r.configuracao, c)) {
          const bloqueio = await db
            .from("francisco_envios")
            .update({
              status: "bloqueado",
              motivo: "Configuração mudou durante a rodada.",
              updated_at: new Date().toISOString(),
            })
            .eq("id", r.id);
          conferirErro(bloqueio.error);
          continue;
        }
        if (!naJanelaFrancisco(c, new Date()) || !envioRealLiberado()) break;
        const final = await db.rpc("francisco_conferir_reserva", { p_id: r.id });
        conferirErro(final.error);
        if (final.data !== true) continue;
        tentativas++;
        const waId = await enviarTemplateFrancisco(
          wa,
          r.telefone,
          c.templates[item.etapa],
          clinica.nome,
        );
        const gravado = await db
          .from("francisco_envios")
          .update({
            status: "enviado",
            wa_message_id: waId,
            entrega: "sent",
            updated_at: new Date().toISOString(),
          })
          .eq("id", r.id);
        conferirErro(gravado.error);
        enviados++;
        const mensagem = await db.from("whatsapp_mensagens").insert({
          clinica_id: registro.clinica_id,
          wa_message_id: waId,
          direction: "out",
          from_number: wa.display_phone_number,
          to_number: r.telefone,
          body: texto,
          tipo: "template",
          status: "sent",
          enviada_por: "sistema",
          raw: { agente: "francisco", envio_id: r.id, etapa: item.etapa },
        });
        conferirErro(mensagem.error);
      } catch {
        // Inclui timeout e aceite seguido de falha de persistência. Nunca reenviar automaticamente.
        const falha = await db
          .from("francisco_envios")
          .update({
            status: "incerto",
            motivo: "Envio sem confirmação completa. Conferir na Meta antes de qualquer ação.",
            updated_at: new Date().toISOString(),
          })
          .eq("id", r.id);
        conferirErro(falha.error);
      }
    }
    if (
      (!lote.proximo && cursor?.id === lote.itens.at(-1)?.orcamento_id) ||
      lote.itens.length === 0
    ) {
      cursor = undefined;
      break;
    }
    if (Date.now() >= prazo || tentativas >= c.limiteRodada) break;
  }
  const salvo = await db
    .from("francisco_config")
    .update({ cursor_job: cursor ?? null })
    .eq("clinica_id", registro.clinica_id);
  conferirErro(salvo.error);
  return { enviados, examinados, tentativas };
}
function configuracoesIguais(a: unknown, b: unknown): boolean {
  const ordenar = (v: any): any =>
    Array.isArray(v)
      ? v.map(ordenar)
      : v && typeof v === "object"
        ? Object.fromEntries(
            Object.keys(v)
              .sort()
              .map((k) => [k, ordenar(v[k])]),
          )
        : v;
  return JSON.stringify(ordenar(a)) === JSON.stringify(ordenar(b));
}
export async function executarRodadaFrancisco() {
  if (!envioRealLiberado())
    return { bloqueado: true, enviados: 0, motivo: "Envio real desativado no servidor." };
  const db = supabaseAdmin as Db;
  const prazo = Date.now() + 40000;
  // A configuração só entra na rotina quando publicada e explicitamente ativada.
  const { data, error } = await db
    .from("francisco_config")
    .select("clinica_id")
    .eq("publicado->>ativo", "true")
    .eq("publicado->>modo", "real");
  conferirErro(error);
  let enviados = 0,
    falhas = 0;
  for (const linha of data ?? []) {
    if (Date.now() >= prazo) break;
    try {
      const registro = await carregarRegistro(db, linha.clinica_id);
      if (registro) enviados += (await executarClinicaFrancisco(db, registro, prazo)).enviados;
    } catch (e) {
      falhas++;
      const log = await db.from("francisco_eventos").insert({
        clinica_id: linha.clinica_id,
        tipo: "rodada_bloqueada",
        dados: {
          motivo:
            e instanceof Error ? e.message.slice(0, 500) : "Não foi possível concluir a rodada.",
        },
      });
      conferirErro(log.error);
    }
  }
  return { bloqueado: false, enviados, falhas };
}
