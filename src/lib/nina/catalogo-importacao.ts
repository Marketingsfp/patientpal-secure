import {
  horariosDoMedico,
  mapearProfissionais,
  mapearServicos,
  type EntradaOperacional,
} from "./fonte-operacional";
import {
  prepararSincronizacao,
  type RegistroSincronizacao,
  type TipoSincronizacao,
} from "./catalogo-sincronizacao";
import { lerEstrutura } from "./catalogo-estrutura";
import { dadosDoServico, type DadosServicoOrigem } from "./catalogo-importacao-servicos";
import type { Executante } from "./catalogo";

export type OrigemImportacao = {
  tipo: TipoSincronizacao;
  fonte: RegistroSincronizacao;
  somenteRascunho: boolean;
};
export type CadastroImportacao = Omit<EntradaOperacional, "medicos" | "procedimentos"> & {
  medicos: (EntradaOperacional["medicos"][number] & { ativo: boolean })[];
  procedimentos: (EntradaOperacional["procedimentos"][number] &
    DadosServicoOrigem & {
      ativo: boolean;
      observacoes?: string | null;
      grupo?: string | null;
      exige_autorizacao?: boolean;
      exige_termo?: boolean;
    })[];
  especialidadesMedicos: { medico_id: string; especialidade_id: string }[];
  convenios?: { id: string; nome: string; ativo: boolean }[];
  valoresConvenios?: {
    procedimento_id: string;
    convenio_id: string;
    valor_dinheiro: unknown;
    valor_outros: unknown;
  }[];
  especialidadesProcedimentos?: { procedimento_id: string; especialidade_id: string }[];
};

/** Adapta todos os cadastros; filtros de oferta ao paciente viram estado editorial. */
export function adaptarCadastroCompleto(e: CadastroImportacao): OrigemImportacao[] {
  const detalhesConsulta = (p: CadastroImportacao["procedimentos"][number]) => {
    const detalhes = [
      p.preparo ? `Preparo: ${p.preparo}` : null,
      p.observacoes,
      p.exige_autorizacao === true ? "Exige autorização." : null,
      p.exige_termo === true ? "Exige termo." : null,
    ].filter(Boolean);
    return detalhes.length ? `${p.nome}\n${detalhes.join("\n")}` : null;
  };
  const especiais = new Map(e.especialidades.map((x) => [x.id, x]));
  const medicos = e.medicos.map((m) => ({
    ...m,
    especialidades_cadastro: e.especialidadesMedicos
      .filter((x) => x.medico_id === m.id)
      .map((x) => {
        const esp = especiais.get(x.especialidade_id);
        if (!esp)
          throw Error(
            `Especialidade não localizada para ${m.nome}. Confira o cadastro antes de importar.`,
          );
        return esp;
      }),
  }));
  const entrada = {
    ...e,
    medicos: medicos.map((m) => ({ ...m, visivel_agendamento_online: true })),
  };
  const metadados = (
    tipo: "medico" | "procedimento" | "consulta",
    id: string,
    ativo: boolean,
    visivel = true,
  ) => ({ tipo, id, ativo, visivel });
  const profissionais = mapearProfissionais(
    { ...entrada, procedimentos: e.procedimentos.filter((p) => p.ativo) },
    true,
  ).map((p) => {
    const m = medicos.find((x) => x.id === p.id)!;
    return {
      tipo: "profissional" as const,
      somenteRascunho: !m.ativo || m.visivel_agendamento_online === false,
      fonte: {
        ...p,
        especialidades: m.especialidades_cadastro,
        observacao_publica:
          [
            p.observacao_publica,
            ...e.procedimentos
              .filter(
                (c) =>
                  c.ativo &&
                  c.tipo === "consulta" &&
                  e.vinculos.some((v) => v.medico_id === m.id && v.procedimento_id === c.id),
              )
              .map(detalhesConsulta),
          ]
            .filter(Boolean)
            .join("\n\n") || null,
        estrutura: {
          ...lerEstrutura(p.estrutura),
          origem_clinica_os: metadados(
            "medico",
            m.id,
            m.ativo,
            m.visivel_agendamento_online !== false,
          ),
        },
      },
    };
  });
  const servicos = mapearServicos({
    ...entrada,
    medicos: medicos.filter((m) => m.ativo && m.visivel_agendamento_online !== false),
  }).map((s) => {
    const p = e.procedimentos.find((x) => x.id === s.id)!;
    const convenios = (e.valoresConvenios ?? [])
      .filter((v) => v.procedimento_id === p.id)
      .flatMap((v) => {
        const c = e.convenios?.find((c) => c.id === v.convenio_id && c.ativo);
        return c ? [{ ...v, nome: c.nome }] : [];
      });
    const especialidades = (e.especialidadesProcedimentos ?? [])
      .filter((v) => v.procedimento_id === p.id)
      .map((v) => {
        const esp = especiais.get(v.especialidade_id);
        if (!esp) throw Error(`Especialidade não localizada para ${p.nome}.`);
        return esp.nome;
      });
    const { categoria, ...dados } = dadosDoServico(p, convenios, especialidades);
    return {
      tipo: "servico" as const,
      somenteRascunho: !p.ativo,
      fonte: {
        ...s,
        ...dados,
        executantes: [...(s.executantes as Executante[])]
          .sort((a, b) => String(a.medico_id).localeCompare(String(b.medico_id)))
          .map((x) => ({
            ...x,
            horarios: x.horarios === "não informado no cadastro" ? null : x.horarios,
            observacao:
              horariosDoMedico(x.medico_id!, entrada, "exame_procedimento", p.id)
                .filter((h) => h.observacao)
                .map(
                  (h) =>
                    `${h.dia}${h.inicio ? ` ${h.inicio}` : ""}${h.fim ? `–${h.fim}` : ""}: ${h.observacao}`,
                )
                .join("\n") || null,
          })),
        estrutura: {
          ...lerEstrutura(s.estrutura),
          categoria,
          grupo: p.grupo ?? null,
          origem_clinica_os: metadados("procedimento", p.id, p.ativo),
        },
      },
    };
  });
  // A seção de profissionais também admite consultas sem profissional definido.
  // Mantém cada consulta sem vínculo, sem inventar um médico ou descartar o cadastro.
  const consultas = e.procedimentos
    .filter(
      (p) =>
        p.tipo === "consulta" &&
        (!p.ativo ||
          !e.vinculos.some(
            (v) => v.procedimento_id === p.id && e.medicos.some((m) => m.id === v.medico_id),
          )),
    )
    .map((p) => {
      const virtual = mapearProfissionais(
        {
          ...entrada,
          medicos: [{ id: p.id, nome: p.nome, especialidade_id: null }],
          vinculos: [{ medico_id: p.id, procedimento_id: p.id }],
          disponibilidades: [],
          agendas: [],
        },
        true,
      )[0]!;
      return {
        tipo: "profissional" as const,
        somenteRascunho: true,
        fonte: {
          ...virtual,
          medico_id: null,
          nome: p.nome,
          observacao_publica:
            [
              virtual.observacao_publica?.replace(
                /^Profissional: .+$/gm,
                "Profissional: não vinculado no cadastro",
              ),
              detalhesConsulta(p),
            ]
              .filter(Boolean)
              .join("\n\n") || null,
          estrutura: {
            ...lerEstrutura(virtual.estrutura),
            origem_clinica_os: metadados("consulta", p.id, p.ativo, false),
          },
        },
      };
    });
  return [...profissionais, ...servicos, ...consultas] as OrigemImportacao[];
}

export type ItemImportacao = {
  tipo: TipoSincronizacao;
  fonteId: string;
  id: string;
  nome: string;
  acao: "criar" | "atualizar" | "igual" | "revisar";
  status: string;
  motivo: string | null;
  versao: string | null;
  mudancas: { campo: string; antes: string; depois: string }[];
  dados?: Record<string, unknown>;
};
const normalizar = (nome: string) =>
  nome
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/^\s*dr(?:a)?\.?\s+/, "")
    .replace(/\s+/g, " ")
    .trim();
const chaveOrigem = (r: RegistroSincronizacao, tipo: TipoSincronizacao) =>
  r.estrutura?.origem_clinica_os?.id ??
  r[tipo === "profissional" ? "medico_id" : "procedimento_id"];

/** Correspondência por vínculo ou nome exato único; ambiguidades exigem vínculo manual. */
export function planejarImportacao(
  origens: OrigemImportacao[],
  destino: Record<TipoSincronizacao, RegistroSincronizacao[]>,
): ItemImportacao[] {
  const usados = new Set<string>();
  return origens.map(({ tipo, fonte, somenteRascunho }) => {
    const todos = destino[tipo];
    const porVinculo = todos.filter((r) => chaveOrigem(r, tipo) === fonte.id);
    const porNome = todos.filter(
      (r) => !chaveOrigem(r, tipo) && normalizar(r.nome) === normalizar(fonte.nome),
    );
    const candidatos = porVinculo.length ? porVinculo : porNome;
    const atual = candidatos.length === 1 ? candidatos[0] : undefined;
    const status =
      atual?.status === "ARQUIVADO"
        ? "ARQUIVADO"
        : somenteRascunho
          ? "RASCUNHO"
          : (atual?.status ?? "PUBLICADO");
    const item: ItemImportacao = {
      tipo,
      fonteId: fonte.id,
      id: atual?.id ?? fonte.id,
      nome: fonte.nome,
      acao: atual ? "atualizar" : "criar",
      status,
      motivo: null,
      versao: atual?.updated_at ?? null,
      mudancas: [],
    };
    try {
      if (candidatos.length > 1)
        throw Error("Há mais de um registro correspondente. Confira os vínculos manualmente.");
      if (
        !porVinculo.length &&
        porNome.length &&
        origens.filter(
          (o) => o.tipo === tipo && normalizar(o.fonte.nome) === normalizar(fonte.nome),
        ).length > 1
      )
        throw Error("Nome compartilhado por mais de uma origem. Confira o vínculo manualmente.");
      if (atual && usados.has(`${tipo}:${atual.id}`))
        throw Error("O mesmo registro corresponde a mais de uma origem. Confira os vínculos.");
      if (!atual && todos.some((r) => r.id === fonte.id))
        throw Error("O identificador de destino já pertence a outro registro.");
      if (atual) usados.add(`${tipo}:${atual.id}`);
      if (somenteRascunho && atual?.status === "PUBLICADO" && atual.rascunho != null) {
        item.dados = {};
        item.motivo =
          "Retirado da publicação; alterações em revisão preservadas para conferência manual.";
        item.mudancas = [{ campo: "Situação", antes: "PUBLICADO", depois: "RASCUNHO" }];
        return item;
      }
      const p = prepararSincronizacao(
        tipo,
        atual ?? { id: fonte.id, nome: fonte.nome, status: "RASCUNHO" },
        fonte,
      );
      item.dados = p.dados;
      item.mudancas = p.mudancas;
      if (atual?.status !== status)
        item.mudancas.push({
          campo: "Situação",
          antes: atual?.status ?? "Não existe",
          depois: status,
        });
      if (atual && !item.mudancas.length) item.acao = "igual";
    } catch (e) {
      item.acao = "revisar";
      item.motivo = (e as Error).message;
      delete item.dados;
    }
    return item;
  });
}
