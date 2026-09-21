/** Candidatos completos do atendimento publicado, sem o corte de relevância do chat. */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { agoraNaClinica } from "@/lib/nina-agora";
import { normalizar } from "@/lib/nina-especialidade";
import { profissionalParaRegistro, servicoParaRegistro,
  type ProfissionalPublicado, type ServicoPublicado } from "./catalogo-conhecimento";
import type { RegistroConhecimento } from "./knowledge-contract";
import { resolverMedicoAgenda, vincularProfissionaisCatalogo } from "./vinculo-catalogo-agenda.server";
import { atendimentosEstruturados, textoAtendimentos } from "./catalogo-estrutura";
import { atendePreferenciaConsulta, nomeCompletoConsulta, type PreferenciaAtendimentoConsulta } from "./atendimento-consulta";

const colunasProfissional = "id, nome, especialidades, atende_consultorio, formas_pagamento, convenios, horarios, tipo_atendimento, observacao_publica, aviso_dia, aviso_valido_de, aviso_valido_ate, unidades(nome), estrutura";
const colunasServico = "id, nome, valor, valor_observacao, descricao_publica, preparo, restricoes, executantes, formas_pagamento, estrutura";
const lista = (v: unknown): Record<string, unknown>[] => Array.isArray(v) ? v.filter(x => x && typeof x === "object") : [];
const chave = (v: string) => normalizar(v).replace(/^consulta\b\s*[—–:-]?\s*/, "").trim();

export type CandidatoPrimeiraVaga = { registro: RegistroConhecimento; medicoId: string | null; medicoNome: string };
type ReferenciaAtendimento = { registro: string; procedimento: string | null };

export async function candidatosPrimeiraVaga(clinicaId: string, tipo: "consulta" | "procedimento",
  atendimento: string | readonly ReferenciaAtendimento[], preferencia?: PreferenciaAtendimentoConsulta | null): Promise<CandidatoPrimeiraVaga[]> {
  const normalizarNome = tipo === "consulta" ? chave : normalizar;
  // Referências são pistas para reler a publicação, sempre ligadas ao seu ID.
  // Grafias diferentes do mesmo atendimento não são modalidades diferentes.
  const corresponde = (id: string, nome: string) => typeof atendimento === "string"
    ? normalizarNome(nome) === normalizarNome(atendimento)
    : atendimento.some(r => r.registro === id && !!r.procedimento && normalizarNome(r.procedimento) === normalizarNome(nome));
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
      const itens = atendimentosEstruturados(p.observacao_publica, p.estrutura, p.nome);
      const especialidades = lista(p.especialidades).filter(e => corresponde(p.id, String(e.nome ?? "")) ||
        itens.some(i => normalizar(i.especialidade ?? "") === normalizar(String(e.nome ?? "")) &&
          (corresponde(p.id, i.atendimento) || corresponde(p.id, nomeCompletoConsulta(i)))));
      // Um registro por especialidade: duas consultas reais do mesmo médico
      // devem continuar ambíguas, em vez de virar um único procedimento composto.
      return especialidades.flatMap(especialidade => {
        const nome = chave(String(especialidade.nome ?? ""));
        if (preferencia && nome !== chave(preferencia.especialidade)) return [];
        const outras = lista(p.especialidades).map(e => chave(String(e.nome ?? ""))).filter(e => e && e !== nome);
        const formas_pagamento = lista(p.formas_pagamento).filter(f => {
          const condicao = chave(String(f.condicao ?? ""));
          return !outras.some(e => condicao.includes(e)) || condicao.includes(nome);
        });
        const publicados = itens.filter(i => chave(i.especialidade ?? "") === nome);
        if (!publicados.length) return preferencia ? [] : [profissionalParaRegistro({ ...p, especialidades: [especialidade], formas_pagamento }, hoje)];
        const nomeEspecifico = typeof atendimento === "string" && !corresponde(p.id, String(especialidade.nome ?? ""));
        const escolhidos = publicados.filter(i => atendePreferenciaConsulta(i, preferencia) &&
          (!nomeEspecifico || corresponde(p.id, i.atendimento) || corresponde(p.id, nomeCompletoConsulta(i))));
        // Cada atendimento conserva seu título, preços e condições. Duas
        // variantes continuam ambíguas; não se reduz ambas à especialidade.
        return escolhidos.map(item => {
          const formas = formas_pagamento.filter(f => normalizar(String(f.condicao ?? "")) === normalizar(item.atendimento));
          const registro = profissionalParaRegistro({ ...p, especialidades: [especialidade], formas_pagamento: formas,
            observacao_publica: textoAtendimentos([item]) }, hoje);
          return { ...registro, procedimento: nomeCompletoConsulta(item), preco_dinheiro: item.dinheiro,
            preco_cartao: item.pix_cartao, extras: { ...registro.extras, atendimentos_publicados: [item] } };
        });
      });
    });
    const vinculos = await vincularProfissionaisCatalogo(clinicaId, registros);
    return registros.map(registro => ({ registro, medicoNome: registro.medico!,
      medicoId: vinculos.find(v => v.catalogo_id === registro.id)?.medico_id ?? null }));
  }
  const servicos = (linhas as ServicoPublicado[]).filter(s => corresponde(s.id, s.nome));
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
