/** Identidade operacional do profissional; o catálogo continua sendo a fonte
 * dos preços, escala publicada e demais informações de atendimento. */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { catalogoDoTurno } from "./catalogo-turno.server";
import { normalizar } from "@/lib/nina-especialidade";
import { registrarEtapa } from "./evidencias.server";
import type { RegistroConhecimento } from "./knowledge-contract";
import { atendimentosEstruturados, modalidadeEstruturada } from "./catalogo-estrutura";
import { selecionarAtendimentosConsulta, type EscopoAtendimentoConsulta } from "./atendimento-consulta";
import { servicoParaRegistro, type ServicoPublicado } from "./catalogo-conhecimento";
import type { AtendimentoPublicado } from "./catalogo-estrutura";

type MedicoAgenda = { id: string; nome: string };
type CadastroMedico = MedicoAgenda & { ativo: boolean };
type ProfissionalCatalogo = { id: string; nome: string; medico_id: string | null };
type ResolucaoMedico =
  | { ok: true; id: string; nome: string; candidatosOficiais: MedicoAgenda[] }
  | { ok: false; opcoes: MedicoAgenda[] };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function termosNome(nome: string): string[] {
  return normalizar(nome)
    .replace(/^(?:dr|dra|doutor|doutora)\.?\s+/, "")
    .split(/[^a-z0-9]+/)
    .filter((p) => p && !["de", "da", "do", "das", "dos", "e"].includes(p));
}

/** Nome abreviado só resolve quando existe um único médico compatível.
 * Não escolhe por ordem, semelhança aproximada ou disponibilidade de vagas. */
function candidatosPorNome(nome: string, medicos: MedicoAgenda[]): MedicoAgenda[] {
  const termos = termosNome(nome);
  if (!termos.length) return [];
  return medicos.filter((m) => {
    const completos = termosNome(m.nome);
    return termos[0] === completos[0] && termos.every((p) => completos.includes(p));
  });
}

async function medicosDaClinica(
  clinicaId: string,
  idsVinculados?: string[],
): Promise<CadastroMedico[]> {
  const consulta = supabaseAdmin
    .from("medicos")
    .select("id, nome, ativo")
    .eq("clinica_id", clinicaId);
  const { data, error } = await (idsVinculados
    ? consulta.in("id", idsVinculados)
    : consulta.eq("ativo", true));
  if (error) throw new Error(error.message);
  return (data ?? []) as CadastroMedico[];
}

/** Só lê cadastros inativos referenciados pelos profissionais deste resultado. */
async function incluirCadastrosVinculados(
  clinicaId: string,
  ativos: CadastroMedico[],
  publicados: ProfissionalCatalogo[],
): Promise<CadastroMedico[]> {
  const ids = [
    ...new Set(
      publicados.flatMap((p) =>
        p.medico_id && !ativos.some((m) => m.id === p.medico_id) ? [p.medico_id] : [],
      ),
    ),
  ];
  return ids.length ? [...ativos, ...(await medicosDaClinica(clinicaId, ids))] : ativos;
}

function resolverNome(nome: string, medicos: MedicoAgenda[]): ResolucaoMedico {
  const candidatos = candidatosPorNome(nome, medicos);
  return candidatos.length === 1
    ? { ok: true, ...candidatos[0]!, candidatosOficiais: medicos }
    : { ok: false, opcoes: candidatos.slice(0, 5) };
}

function resolverPublicado(
  profissional: ProfissionalCatalogo,
  cadastros: CadastroMedico[],
): ResolucaoMedico {
  const medicos = cadastros.filter((m) => m.ativo === true);
  if (profissional.medico_id) {
    const vinculado = cadastros.find((m) => m.id === profissional.medico_id);
    if (vinculado?.ativo === true)
      return { ok: true, id: vinculado.id, nome: vinculado.nome, candidatosOficiais: medicos };
    // Cadastros antigos inativos podem coexistir com o cadastro ativo da
    // mesma pessoa. Só reconcilia por nome completo/abreviado inequívoco,
    // com ao menos nome e sobrenome e confirmação do vínculo na mesma clínica.
    if (
      !vinculado ||
      termosNome(profissional.nome).length < 2 ||
      candidatosPorNome(profissional.nome, [vinculado]).length !== 1
    )
      return { ok: false, opcoes: [] };
  }
  return resolverNome(profissional.nome, medicos);
}

function origemVinculo(profissional: ProfissionalCatalogo, resolucao: ResolucaoMedico) {
  if (!resolucao.ok) return "nao_resolvido";
  if (!profissional.medico_id) return "nome_unico";
  return profissional.medico_id === resolucao.id
    ? "vinculo_cadastrado"
    : "vinculo_inativo_reconciliado";
}

/** A mesma resolução de identidade do catálogo é usada para ler a modalidade. */
export async function modalidadePublicadaDoMedico(clinicaId: string, medicoId: string, escopo?: EscopoAtendimentoConsulta) {
  const leitura = await catalogoDoTurno(clinicaId);
  if (escopo?.procedimentoId) {
    const { data, error } = leitura
      ? { data: leitura.servicos.find(s => s.id === escopo.procedimentoId), error: null }
      : await supabaseAdmin.from("nina_cat_servicos")
      .select("id, nome, descricao_publica, estrutura, executantes, formas_pagamento, valor, valor_observacao, preparo, restricoes")
      .eq("clinica_id", clinicaId).eq("status", "PUBLICADO").eq("id", escopo.procedimentoId).maybeSingle();
    if (error) throw new Error(error.message);
    // O ID da publicação preserva a identidade mesmo após renomear o serviço.
    if (!data) return "nao_definida" as const;
    const servico = data as ServicoPublicado;
    const executantes = Array.isArray(servico.executantes) ? servico.executantes : [];
    const nomesVinculados: string[] = [];
    for (const e of executantes) {
      if (!e?.nome) continue;
      const r = await resolverMedicoAgenda(clinicaId, String(e.medico_id || e.nome));
      if (r.ok && r.id === medicoId) nomesVinculados.push(normalizar(String(e.nome)));
    }
    if (!nomesVinculados.length) return "nao_definida" as const;
    const registro = servicoParaRegistro(servico);
    const itens = (registro.extras?.atendimentos_publicados ?? []) as AtendimentoPublicado[];
    const selecionados: AtendimentoPublicado[] = [];
    for (const item of itens) {
      if (!item.profissional || nomesVinculados.includes(normalizar(item.profissional))) selecionados.push(item);
      else {
        const r = await resolverMedicoAgenda(clinicaId, item.profissional);
        if (r.ok && r.id === medicoId) selecionados.push(item);
      }
    }
    if (!selecionados.length) return "nao_definida" as const;
    return modalidadeEstruturada(servico.descricao_publica, servico.estrutura, "", null, selecionados);
  }
  const [ativos, publicados] = await Promise.all([
    medicosDaClinica(clinicaId),
    leitura ? { data: leitura.profissionais, error: null } : supabaseAdmin.from("nina_cat_profissionais").select("id, nome, medico_id, tipo_atendimento, estrutura, observacao_publica")
      .eq("clinica_id", clinicaId).eq("status", "PUBLICADO"),
  ]);
  if (publicados.error) throw new Error(publicados.error.message);
  const catalogo = publicados.data ?? [];
  const cadastros = await incluirCadastrosVinculados(clinicaId, ativos, catalogo);
  const vinculados = catalogo.filter(p => {
    const r = resolverPublicado(p, cadastros);
    return r.ok && r.id === medicoId;
  });
  const modos = vinculados.flatMap(p => {
    const itens = atendimentosEstruturados(p.observacao_publica, p.estrutura, p.nome);
    const selecionados = escopo && itens.length ? selecionarAtendimentosConsulta(itens, escopo) : undefined;
    if (selecionados && !selecionados.length) return [];
    return [modalidadeEstruturada(p.observacao_publica, p.estrutura, p.nome, p.tipo_atendimento, selecionados)];
  });
  if (escopo && vinculados.length && !modos.length) return "nao_definida" as const;
  if (modos.includes("nao_definida")) return "nao_definida";
  const definidos = [...new Set(modos.filter(m => m !== null))];
  return definidos.length > 1 ? "nao_definida" : definidos[0] ?? null;
}

/** Aceita o UUID operacional, nome ou um UUID de profissional publicado.
 * Um UUID de catálogo nunca é enviado diretamente à tabela de agendamentos. */
export async function resolverMedicoAgenda(
  clinicaId: string,
  termo: string,
): Promise<ResolucaoMedico> {
  const cadastros = await medicosDaClinica(clinicaId);
  const medicos = cadastros.filter((m) => m.ativo === true);
  if (!UUID.test(termo)) return resolverNome(termo, medicos);
  const operacional = medicos.find((m) => m.id.toLowerCase() === termo.toLowerCase());
  if (operacional) return { ok: true, ...operacional, candidatosOficiais: medicos };

  const leitura = await catalogoDoTurno(clinicaId);
  const { data, error } = leitura
    ? { data: leitura.profissionais.find(p => p.id.toLowerCase() === termo.toLowerCase()), error: null }
    : await supabaseAdmin
    .from("nina_cat_profissionais")
    .select("id, nome, medico_id")
    .eq("id", termo)
    .eq("clinica_id", clinicaId)
    .eq("status", "PUBLICADO")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return { ok: false, opcoes: [] };
  const resultado = resolverPublicado(
    data,
    await incluirCadastrosVinculados(clinicaId, cadastros, [data]),
  );
  registrarEtapa({
    tipo: "consulta",
    fonte: "agenda",
    titulo: "Profissional do catálogo resolvido para a agenda",
    dados: {
      catalogo_id: data.id,
      nome_catalogo: data.nome,
      medico_id: resultado.ok ? resultado.id : null,
      medico_id_publicado: data.medico_id,
      origem_vinculo: origemVinculo(data, resultado),
      situacao: resultado.ok ? "vinculado" : resultado.opcoes.length ? "ambiguo" : "nao_encontrado",
    },
    codigo: {
      arquivo: "src/lib/nina/vinculo-catalogo-agenda.server.ts",
      funcao: "resolverMedicoAgenda",
    },
  });
  return resultado;
}

/** Enriquece somente os profissionais efetivamente retornados pelo catálogo.
 * Ler identidades não consulta vagas e não confirma escolha ou reserva. */
export async function vincularProfissionaisCatalogo(
  clinicaId: string,
  registros: readonly RegistroConhecimento[],
) {
  const profissionais = registros.filter((r) => r.tipo === "profissional" && r.id && r.medico);
  if (!profissionais.length) return [];
  const leitura = await catalogoDoTurno(clinicaId);
  const [cadastros, catalogo] = await Promise.all([
    medicosDaClinica(clinicaId),
    leitura ? { data: leitura.profissionais.filter(p => profissionais.some(r => r.id === p.id)), error: null } : supabaseAdmin
      .from("nina_cat_profissionais")
      .select("id, nome, medico_id")
      .eq("clinica_id", clinicaId)
      .eq("status", "PUBLICADO")
      .in(
        "id",
        profissionais.map((r) => r.id!),
      ),
  ]);
  if (catalogo.error) throw new Error(catalogo.error.message);
  const publicados = new Map((catalogo.data ?? []).map((p) => [p.id, p]));
  const cadastrosVinculados = await incluirCadastrosVinculados(
    clinicaId,
    cadastros,
    catalogo.data ?? [],
  );
  const vinculos = profissionais.map((r) => {
    const publicado = publicados.get(r.id!);
    const resolucao: ResolucaoMedico = publicado
      ? resolverPublicado(publicado, cadastrosVinculados)
      : { ok: false, opcoes: [] };
    return {
      catalogo_id: r.id!,
      nome_catalogo: r.medico!,
      medico_id: resolucao.ok ? resolucao.id : null,
      origem_vinculo: publicado ? origemVinculo(publicado, resolucao) : "nao_resolvido",
      nome_agenda: resolucao.ok ? resolucao.nome : null,
      situacao: resolucao.ok ? "vinculado" : resolucao.opcoes.length ? "ambiguo" : "nao_encontrado",
      opcoes: resolucao.ok ? [] : resolucao.opcoes.map((m) => ({ medico_id: m.id, nome: m.nome })),
    };
  });
  registrarEtapa({
    tipo: "consulta",
    fonte: "agenda",
    titulo: "Vínculos entre os profissionais publicados e a agenda",
    dados: {
      vinculos: vinculos.map((v) => ({
        ...v,
        medico_id_publicado: publicados.get(v.catalogo_id)?.medico_id ?? null,
      })),
      consulta_de_vagas: false,
    },
    codigo: {
      arquivo: "src/lib/nina/vinculo-catalogo-agenda.server.ts",
      funcao: "vincularProfissionaisCatalogo",
    },
  });
  return vinculos;
}
