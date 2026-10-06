import { createHash } from "node:crypto";
import { adaptarCadastroCompleto, planejarImportacao, type OrigemImportacao } from "./catalogo-importacao";
import type { RegistroSincronizacao } from "./catalogo-sincronizacao";
import { hojeBR } from "@/lib/date-utils";

export async function lerPaginasCatalogo<T>(consulta: () => any): Promise<T[]> {
  const linhas: T[] = [];
  for (let inicio = 0; ;) {
    const { data, error } = await consulta().range(inicio, inicio + 999);
    if (error) throw Object.assign(Error(error.message), { code: error.code });
    if (!data?.length) return linhas;
    linhas.push(...(data ?? []));
    inicio += data.length;
  }
}

/** Apenas dados administrativos do atendimento; nunca dados pessoais/financeiros do médico. */
export async function lerCadastroCompleto(db: any, clinicaId: string): Promise<OrigemImportacao[]> {
  const [medicos, procedimentos, disponibilidades, agendas, vinculos, especialidades, especialidadesMedicos, convenios, valoresConvenios, especialidadesProcedimentos] = await Promise.all([
    lerPaginasCatalogo<any>(() => db.from("medicos").select("id, nome, ativo, especialidade_id, visivel_agendamento_online")
      .eq("clinica_id", clinicaId).order("id")),
    lerPaginasCatalogo<any>(() => db.from("procedimentos").select("id, nome, ativo, tipo, valor_padrao, valor_dinheiro_pix, valor_dinheiro, valor_pix, valor_cartao, valor_cartao_credito, valor_cartao_debito, valor_cartao_consulta, valor_cartao_desconto, valor_variavel, preparo, observacoes, grupo, exige_preparo, exige_autorizacao, exige_termo, duracao_minutos, sessoes_incluidas, ciclo_dias, requer_laudo")
      .eq("clinica_id", clinicaId).order("id")),
    lerPaginasCatalogo<any>(() => db.from("medico_disponibilidades").select("id, medico_id, agenda_id, dia_semana, hora_inicio, hora_fim, observacoes, limite_pacientes, vigencia_inicio, vigencia_fim")
      .eq("clinica_id", clinicaId).eq("ativo", true).order("id")),
    lerPaginasCatalogo<any>(() => db.from("medico_agendas").select("id, medico_id, nome, ordem_chegada, medico_agenda_procedimentos(procedimento_id)")
      .eq("clinica_id", clinicaId).eq("ativo", true).order("id")),
    lerPaginasCatalogo<any>(() => db.from("medico_procedimentos").select("id, medico_id, procedimento_id, especialidade_id, medicos!inner(clinica_id)")
      .eq("medicos.clinica_id", clinicaId).order("id")),
    lerPaginasCatalogo<any>(() => db.from("especialidades").select("id, nome").order("id")),
    lerPaginasCatalogo<any>(() => db.from("medico_especialidades").select("medico_id, especialidade_id, medicos!inner(clinica_id)")
      .eq("medicos.clinica_id", clinicaId).order("medico_id").order("especialidade_id")),
    lerPaginasCatalogo<any>(() => db.from("cb_convenios").select("id, nome, ativo").eq("clinica_id", clinicaId).order("id")),
    lerPaginasCatalogo<any>(() => db.from("procedimento_cb_convenio_valores").select("procedimento_id, convenio_id, valor_dinheiro, valor_outros")
      .eq("clinica_id", clinicaId).order("id")),
    lerPaginasCatalogo<any>(() => db.from("procedimento_especialidades").select("procedimento_id, especialidade_id, procedimentos!inner(clinica_id)")
      .eq("procedimentos.clinica_id", clinicaId).order("procedimento_id").order("especialidade_id")),
  ]);
  return adaptarCadastroCompleto({ medicos, procedimentos, disponibilidades, agendas, vinculos, especialidades, especialidadesMedicos, convenios, valoresConvenios, especialidadesProcedimentos, hojeISO: hojeBR() });
}
const tabelas = { profissional: "nina_cat_profissionais", servico: "nina_cat_servicos" };
const assinar = (v: unknown) => createHash("sha256").update(JSON.stringify(v)).digest("hex");

/** Sem transação global: cada registro tem CAS e resultado explícito; reenvio não duplica IDs. */
export function importacaoCompleta(contexto: { supabase: any; userId: string }, lerFonte = lerCadastroCompleto) {
  const db = contexto.supabase;
  async function autorizar(clinicaId: string) {
    const { data, error } = await db.from("clinica_memberships").select("role")
      .eq("clinica_id", clinicaId).eq("user_id", contexto.userId).eq("ativo", true).maybeSingle();
    if (error || !data || !["admin", "gestor"].includes(data.role)) throw Error("Apenas administradores e gestores podem sincronizar esta clínica.");
  }
  async function montar(clinicaId: string) {
    await autorizar(clinicaId);
    const [origens, profissional, servico] = await Promise.all([
      lerFonte(db, clinicaId),
      lerPaginasCatalogo<RegistroSincronizacao>(() => db.from(tabelas.profissional).select("*").eq("clinica_id", clinicaId).order("id")),
      lerPaginasCatalogo<RegistroSincronizacao>(() => db.from(tabelas.servico).select("*").eq("clinica_id", clinicaId).order("id")),
    ]);
    await autorizar(clinicaId);
    const itens = planejarImportacao(origens, { profissional, servico });
    const resumo = {
      medicos: origens.filter(o => o.fonte.estrutura?.origem_clinica_os?.tipo === "medico").length,
      servicos: servico.length, profissionais: profissional.length,
      criar: itens.filter(i => i.acao === "criar").length,
      atualizar: itens.filter(i => i.acao === "atualizar").length,
      iguais: itens.filter(i => i.acao === "igual").length,
      revisar: itens.filter(i => i.acao === "revisar").length,
      rascunhos: itens.filter(i => i.status === "RASCUNHO").length,
    };
    return { assinatura: assinar({ clinicaId, itens }), itens, resumo };
  }
  return {
    async prever(clinicaId: string) {
      const p = await montar(clinicaId);
      return { ...p, itens: p.itens.map(item => {
        const { dados, ...publico } = item;
        return { ...publico, assinatura: assinar({ clinicaId, item }) };
      }) };
    },
    async aplicar(clinicaId: string, assinatura: string, alvos?: { tipo: string; fonteId: string; assinatura: string }[]) {
      const p = await montar(clinicaId);
      const conflito = "A origem ou a base mudou. Confira uma nova prévia antes de sincronizar.";
      let itens = p.itens;
      if (alvos) {
        if (!alvos.length || alvos.length > 50 || new Set(alvos.map(a => `${a.tipo}:${a.fonteId}`)).size !== alvos.length) throw Error("Lote inválido.");
        itens = alvos.map(a => {
          const item = p.itens.find(i => i.tipo === a.tipo && i.fonteId === a.fonteId);
          if (!item || assinar({ clinicaId, item }) !== a.assinatura) throw Error(conflito);
          return item;
        });
      } else if (p.assinatura !== assinatura) throw Error(conflito);
      const resultados: { nome: string; acao: string; ok: boolean; motivo: string | null }[] = [];
      for (const item of itens) {
        if (item.acao === "revisar" || item.acao === "igual") {
          resultados.push({ nome: item.nome, acao: item.acao, ok: item.acao === "igual", motivo: item.motivo });
          continue;
        }
        try {
          await autorizar(clinicaId);
          const valores = { ...item.dados, status: item.status,
            ...(item.status === "PUBLICADO" ? { publicado_por: contexto.userId, publicado_em: new Date().toISOString() } : {}) };
          const q = item.acao === "criar"
            ? db.from(tabelas[item.tipo]).insert({ ...valores, id: item.id, clinica_id: clinicaId, criado_por: contexto.userId })
            : db.from(tabelas[item.tipo]).update(valores).eq("clinica_id", clinicaId).eq("id", item.id).eq("updated_at", item.versao);
          const { data, error } = await q.select("id").maybeSingle();
          if (error || !data) throw Error(error?.code === "23505" ? "Registro já criado por outra sincronização. Gere nova prévia." : error?.message ?? "O registro mudou durante a sincronização.");
          resultados.push({ nome: item.nome, acao: item.acao, ok: true, motivo: null });
        } catch (e) {
          resultados.push({ nome: item.nome, acao: item.acao, ok: false, motivo: (e as Error).message });
          // Não continuar após erro operacional/permissão. A UI informa o que já foi concluído.
          break;
        }
      }
      return { resultados, total: itens.length, processados: resultados.length };
    },
  };
}
