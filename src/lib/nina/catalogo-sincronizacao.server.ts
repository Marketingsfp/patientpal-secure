import { createHash } from "node:crypto";
import {
  candidatosMapeamento,
  escolhaMapeamento,
  perguntaMapeamento,
  prepararSincronizacao,
  resumoOrigem,
  validarDestinoSincronizacao,
  type RegistroSincronizacao,
  type TipoSincronizacao,
  type PreviaSincronizacao,
} from "./catalogo-sincronizacao";
import type { PerguntaJev, ResultadoJev } from "./jev";

type Contexto = { supabase: any; userId: string };
type Dependencias = {
  lerFonte: (
    clinicaId: string,
    tipo?: TipoSincronizacao,
  ) => Promise<{ servicos: RegistroSincronizacao[]; profissionais: RegistroSincronizacao[] }>;
  perguntar: (estado: unknown, perguntas: Record<string, PerguntaJev>) => Promise<ResultadoJev>;
};
const tabela = (tipo: TipoSincronizacao) =>
  tipo === "servico" ? "nina_cat_servicos" : "nina_cat_profissionais";
const conflito = "O registro ou a origem mudou. Gere uma nova prévia antes de sincronizar.";
const hash = (v: unknown) => createHash("sha256").update(JSON.stringify(v)).digest("hex");

/** Todas as leituras administrativas e escritas passam por permissão no servidor. */
export function sincronizacaoManual(contexto: Contexto, deps: Dependencias) {
  const sb = contexto.supabase;
  async function autorizar(clinicaId: string) {
    const { data, error } = await sb
      .from("clinica_memberships")
      .select("role")
      .eq("clinica_id", clinicaId)
      .eq("user_id", contexto.userId)
      .eq("ativo", true)
      .maybeSingle();
    if (error) throw new Error("Não foi possível conferir sua permissão.");
    if (!data || !["admin", "gestor"].includes(data.role))
      throw new Error("Apenas administradores e gestores desta clínica podem sincronizar.");
  }
  async function registro(
    clinicaId: string,
    tipo: TipoSincronizacao,
    id: string,
  ): Promise<RegistroSincronizacao> {
    const { data, error } = await sb
      .from(tabela(tipo))
      .select("*")
      .eq("clinica_id", clinicaId)
      .eq("id", id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) throw new Error("Registro não encontrado nesta clínica.");
    validarDestinoSincronizacao(data);
    return data;
  }
  async function fontes(clinicaId: string, tipo: TipoSincronizacao) {
    const f = await deps.lerFonte(clinicaId, tipo);
    return tipo === "servico" ? f.servicos : f.profissionais;
  }
  async function montar(clinicaId: string, tipo: TipoSincronizacao, id: string, fonteId: string) {
    const atual = await registro(clinicaId, tipo, id);
    const origem = (await fontes(clinicaId, tipo)).find((f) => f.id === fonteId);
    if (!origem)
      throw new Error(
        "Origem indisponível ou inativa. Selecione um cadastro válido e gere outra prévia.",
      );
    const proposta = prepararSincronizacao(tipo, atual, origem);
    const previa: PreviaSincronizacao = {
      id,
      fonteId,
      nome: atual.nome,
      origem: resumoOrigem(origem),
      esperadoUpdatedAt: atual.updated_at,
      assinatura: hash({
        clinicaId,
        tipo,
        id,
        fonteId,
        versao: atual.updated_at,
        dados: proposta.dados,
      }),
      mudancas: proposta.mudancas,
    };
    return { atual, proposta, previa };
  }
  return {
    async opcoes(clinicaId: string, tipo: TipoSincronizacao) {
      await autorizar(clinicaId);
      const opcoes = (await fontes(clinicaId, tipo)).map(resumoOrigem);
      await autorizar(clinicaId);
      return opcoes;
    },
    async mapear(clinicaId: string, tipo: TipoSincronizacao, id: string) {
      await autorizar(clinicaId);
      const atual = await registro(clinicaId, tipo, id);
      const todas = (await fontes(clinicaId, tipo)).map(resumoOrigem);
      const candidatos = candidatosMapeamento(atual, todas);
      if (!candidatos.length) throw new Error("Nenhum cadastro de origem disponível para mapear.");
      const resultado = await deps.perguntar(
        {
          tipo,
          nome: atual.nome,
          aliases: atual.estrutura?.aliases ?? [],
          especialidades: atual.especialidades ?? [],
          descricao: atual.descricao_publica ?? atual.observacao_publica ?? null,
        },
        perguntaMapeamento(candidatos),
      );
      await autorizar(clinicaId);
      const ultima = await registro(clinicaId, tipo, id);
      if (ultima.updated_at !== atual.updated_at) throw new Error(conflito);
      if (!resultado.ok)
        throw new Error(
          "O Jev não concluiu o mapeamento. Tente novamente ou selecione o cadastro manualmente. Nenhum dado foi alterado.",
        );
      const sugestao = escolhaMapeamento(resultado.respostas.vinculo, candidatos);
      return {
        sugestao,
        avaliados: candidatos.length,
        total: todas.length,
        confianca: sugestao ? (resultado.respostas.vinculo?.confidence ?? null) : null,
      };
    },
    async prever(clinicaId: string, tipo: TipoSincronizacao, id: string, fonteId: string) {
      await autorizar(clinicaId);
      const { previa } = await montar(clinicaId, tipo, id, fonteId);
      await autorizar(clinicaId);
      return previa;
    },
    async aplicar(
      clinicaId: string,
      tipo: TipoSincronizacao,
      pedido: Pick<PreviaSincronizacao, "id" | "fonteId" | "assinatura" | "esperadoUpdatedAt">,
    ) {
      await autorizar(clinicaId);
      // Releitura fresca: o navegador nunca fornece preços ou outros fatos para a gravação.
      const { atual, proposta, previa } = await montar(clinicaId, tipo, pedido.id, pedido.fonteId);
      if (pedido.assinatura !== previa.assinatura || pedido.esperadoUpdatedAt !== atual.updated_at)
        throw new Error(conflito);
      await autorizar(clinicaId);
      const dados = {
        ...proposta.dados,
        ...(atual.status === "PUBLICADO"
          ? { publicado_em: new Date().toISOString(), publicado_por: contexto.userId }
          : {}),
      };
      // Uma escrita por registro: sem publicação parcial, com auditoria existente e CAS contra concorrência.
      const { data, error } = await sb
        .from(tabela(tipo))
        .update(dados)
        .eq("clinica_id", clinicaId)
        .eq("id", pedido.id)
        .eq("updated_at", pedido.esperadoUpdatedAt)
        .select("id")
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (!data) throw new Error(conflito);
      return { id: pedido.id, status: atual.status, sincronizadoEm: new Date().toISOString() };
    },
  };
}
