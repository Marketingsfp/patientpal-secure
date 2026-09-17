/** Candidatos completos do atendimento publicado, sem o corte de relevância do chat. */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { agoraNaClinica } from "@/lib/nina-agora";
import { normalizar } from "@/lib/nina-especialidade";
import { profissionalParaRegistro, servicoParaRegistro,
  type ProfissionalPublicado, type ServicoPublicado } from "./catalogo-conhecimento";
import type { RegistroConhecimento } from "./knowledge-contract";
import { resolverMedicoAgenda, vincularProfissionaisCatalogo } from "./vinculo-catalogo-agenda.server";

const colunasProfissional = "id, nome, especialidades, atende_consultorio, formas_pagamento, convenios, horarios, tipo_atendimento, observacao_publica, aviso_dia, aviso_valido_de, aviso_valido_ate, unidades(nome)";
const colunasServico = "id, nome, valor, valor_observacao, descricao_publica, preparo, restricoes, executantes, formas_pagamento";
const lista = (v: unknown): Record<string, unknown>[] => Array.isArray(v) ? v.filter(x => x && typeof x === "object") : [];
const chave = (v: string) => normalizar(v).replace(/^consulta\s*[—–:-]?\s*/, "").trim();

export type CandidatoPrimeiraVaga = { registro: RegistroConhecimento; medicoId: string | null; medicoNome: string };

export async function candidatosPrimeiraVaga(clinicaId: string, tipo: "consulta" | "procedimento", atendimento: string): Promise<CandidatoPrimeiraVaga[]> {
  const tabela = tipo === "consulta" ? "nina_cat_profissionais" : "nina_cat_servicos";
  const linhas: unknown[] = [];
  // Páginas limitadas, com ordem estável. Nunca declarar busca completa com um top-6.
  for (let pagina = 0; ; pagina++) {
    const r = await supabaseAdmin.from(tabela).select(tipo === "consulta" ? colunasProfissional : colunasServico)
      .eq("clinica_id", clinicaId).eq("status", "PUBLICADO").order("id")
      .range(pagina * 200, pagina * 200 + 199);
    if (r.error) throw new Error(r.error.message);
    linhas.push(...(r.data ?? []));
    if ((r.data?.length ?? 0) < 200) break;
  }
  const hoje = agoraNaClinica().iso;
  if (tipo === "consulta") {
    const registros = (linhas as ProfissionalPublicado[]).flatMap(p => {
      const especialidades = lista(p.especialidades).filter(e => chave(String(e.nome ?? "")) === chave(atendimento));
      if (!especialidades.length) return [];
      const outras = lista(p.especialidades).map(e => chave(String(e.nome ?? "")))
        .filter(e => e && e !== chave(atendimento));
      const formas_pagamento = lista(p.formas_pagamento).filter(f => {
        const condicao = chave(String(f.condicao ?? ""));
        return !outras.some(e => condicao.includes(e)) || condicao.includes(chave(atendimento));
      });
      return [profissionalParaRegistro({ ...p, especialidades, formas_pagamento }, hoje)];
    });
    const vinculos = await vincularProfissionaisCatalogo(clinicaId, registros);
    return registros.map(registro => ({ registro, medicoNome: registro.medico!,
      medicoId: vinculos.find(v => v.catalogo_id === registro.id)?.medico_id ?? null }));
  }
  const servicos = (linhas as ServicoPublicado[]).filter(s => normalizar(s.nome) === normalizar(atendimento));
  const candidatos: CandidatoPrimeiraVaga[] = [];
  for (const servico of servicos) {
    for (const executante of lista(servico.executantes)) {
      const nome = String(executante.nome ?? "").trim();
      if (!nome) continue;
      const medico = await resolverMedicoAgenda(clinicaId, nome);
      candidatos.push({ registro: servicoParaRegistro({ ...servico, executantes: [executante] }),
        medicoId: medico.ok ? medico.id : null, medicoNome: nome });
    }
  }
  return candidatos;
}
