import type { ProfissionalCatalogo, ServicoCatalogo } from "./catalogo";
import type { TipoCatalogo } from "./catalogo-ia";
import type { AtendimentoCatalogo } from "./catalogo-estrutura";

/**
 * Campos vazios de um cadastro, para o aviso "Faltou preencher" na revisão da IA.
 *
 * Decisão do usuário (15/10/2026): avisar sobre TODOS os campos do formulário,
 * inclusive lacunas antigas de um cadastro editado, sem impedir a publicação.
 * Identificadores e vínculos internos (ids) não entram: não são informação a escrever.
 */
export function lacunasCatalogo(
  tipo: TipoCatalogo,
  dados: ServicoCatalogo | ProfissionalCatalogo,
): string[] {
  const faltas: string[] = [];
  const falta = (vazio: boolean, rotulo: string) => {
    if (vazio) faltas.push(rotulo);
  };
  const semTexto = (v: unknown) => typeof v !== "string" || !v.trim();
  const estrutura = dados.estrutura ?? null;
  const atendimentos = estrutura?.atendimentos?.length ? estrutura.atendimentos : null;

  falta(!estrutura?.aliases?.length, "Dicionário (outras formas de falar o nome)");
  falta(estrutura?.nina_pode_agendar == null, "Regras da Nina: Nina pode agendar");
  falta(estrutura?.encaminhamento_humano == null, "Regras da Nina: atendimento humano obrigatório");

  if (tipo === "servico") {
    const s = dados as ServicoCatalogo;
    falta(!estrutura?.categoria, "Categoria (exame ou procedimento)");
    falta(
      !estrutura || estrutura.pedido_medico === "nao_informado",
      "Pedido médico (exige ou dispensa)",
    );
    falta(
      estrutura?.preparo_status !== "sem_preparo" && semTexto(s.preparo),
      "Preparo (orientações ou “não exige preparo”)",
    );
    falta(semTexto(s.restricoes), "Requisitos e restrições");
    falta(semTexto(s.descricao_publica), "Texto para o paciente");
    if (atendimentos) faltas.push(...lacunasAtendimentos(tipo, atendimentos));
    else {
      falta(!s.executantes.length, "Quem realiza");
      for (const e of s.executantes) falta(semTexto(e.horarios), `Horários de ${e.nome}`);
      falta(!s.formas_pagamento.length && s.valor == null, "Valores e formas de pagamento");
      for (const f of s.formas_pagamento) falta(f.valor == null, `Valor (${f.forma})`);
      falta(semTexto(s.valor_observacao), "Condições gerais dos valores");
    }
  } else {
    const p = dados as ProfissionalCatalogo;
    falta(!p.especialidades.length, "Especialidades");
    falta(!p.unidade_id, "Unidade de atendimento");
    falta(p.atende_consultorio == null, "Atende no consultório");
    falta(
      !estrutura || estrutura.convenios_status === "nao_informado",
      "Situação dos convênios (aceita ou não)",
    );
    falta(estrutura?.convenios_status === "aceita" && !p.convenios.length, "Convênios aceitos");
    falta(semTexto(p.observacao_publica), "Texto para o paciente");
    if (atendimentos) faltas.push(...lacunasAtendimentos(tipo, atendimentos));
    else {
      falta(!p.horarios.length, "Dias e horários");
      falta(semTexto(p.tipo_atendimento), "Hora marcada, ordem de chegada ou ficha");
      falta(!p.formas_pagamento.length, "Valores e formas de pagamento");
      for (const f of p.formas_pagamento) falta(f.valor == null, `Valor (${f.forma})`);
    }
    falta(semTexto(p.aviso_dia), "Aviso do dia");
  }
  falta(semTexto(dados.nota_interna), "Nota interna");
  return faltas;
}

/** Item estruturado: os fatos ficam em cada atendimento, então a falta é por atendimento. */
function lacunasAtendimentos(tipo: TipoCatalogo, lista: AtendimentoCatalogo[]): string[] {
  const faltas: string[] = [];
  for (const a of lista) {
    const de = ` — ${a.nome}`;
    const precoResolvido = a.situacao_preco === "incluido" || a.situacao_preco === "sob_consulta";
    if (tipo === "servico") {
      if (!a.executantes.length) faltas.push(`Quem realiza${de}`);
      for (const e of a.executantes)
        if (!e.horarios.length) faltas.push(`Horários de ${e.nome}${de}`);
    } else {
      if (!a.especialidade?.trim()) faltas.push(`Especialidade${de}`);
      if (!a.modalidade) faltas.push(`Hora marcada, ordem de chegada ou ficha${de}`);
      if (!a.horarios.length) faltas.push(`Dias e horários${de}`);
    }
    if (!a.precos.length && !precoResolvido) faltas.push(`Valores${de}`);
    for (const p of a.precos)
      if (p.valor == null && !precoResolvido) faltas.push(`Valor (${p.forma})${de}`);
    if (a.idade_minima == null) faltas.push(`Idade mínima${de}`);
  }
  return faltas;
}
