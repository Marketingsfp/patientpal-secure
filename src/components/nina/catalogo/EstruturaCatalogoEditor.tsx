import { useId } from "react";
import { Input } from "@/components/ui/input";
import { TextoCatalogo as Textarea, CampoTextoCatalogo } from "./TextoCatalogo";
import { Button } from "@/components/ui/button";
import { MODALIDADES_ATENDIMENTO } from "@/lib/nina/modalidade-atendimento";
import {
  atendimentosEstruturados,
  organizarTextoCatalogo,
  pendenciasEstrutura,
  type EstruturaCatalogo,
  type ComplementoAtendimento,
} from "@/lib/nina/catalogo-estrutura";
import type { ChaveAjudaCatalogo } from "@/lib/nina/catalogo-ajuda";
import { ComoLer, RotuloAjuda } from "./AjudaCatalogo";

const selectClass =
  "h-10 w-full rounded-md border border-input bg-background px-3 text-sm disabled:opacity-50";
function Escolha({
  label,
  value,
  options,
  disabled,
  onChange,
  ajuda,
}: {
  label: string;
  value: string | null | undefined;
  options: Record<string, string>;
  disabled?: boolean;
  onChange: (v: string | null) => void;
  ajuda?: ChaveAjudaCatalogo;
}) {
  const id = useId();
  return (
    <div className="space-y-1 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor={id}>{label}</label>
        {ajuda && <ComoLer chave={ajuda} />}
      </div>
      <select
        id={id}
        aria-label={label}
        className={selectClass}
        disabled={disabled}
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value || null)}
      >
        <option value="">Não informado</option>
        {Object.entries(options).map(([k, v]) => (
          <option key={k} value={k}>
            {v}
          </option>
        ))}
      </select>
    </div>
  );
}

type PropsEstrutura = {
  valor: EstruturaCatalogo;
  onChange: (v: EstruturaCatalogo) => void;
  somenteLeitura?: boolean;
};

/** Categoria, abrangência e grupo: organizam o catálogo, sem efeito na Nina. */
export function CamposOrganizacao({
  valor,
  onChange,
  somenteLeitura,
  tipo,
}: PropsEstrutura & { tipo: "servico" | "profissional" }) {
  const set = (patch: Partial<EstruturaCatalogo>) => onChange({ ...valor, ...patch });
  return (
    <>
      {tipo === "servico" && (
        <Escolha
          label="Categoria do atendimento"
          ajuda="categoria"
          value={valor.categoria}
          options={{
            exame: "Exame",
            procedimento: "Procedimento",
            exame_procedimento: "Exame/procedimento — ainda não classificado",
          }}
          disabled={somenteLeitura}
          onChange={(v) => set({ categoria: v as EstruturaCatalogo["categoria"] })}
        />
      )}
      <Escolha
        label="Abrangência do cadastro"
        ajuda="abrangencia"
        value={valor.abrangencia}
        options={{
          item: "Atendimento específico",
          grupo: "Categoria geral (grupo de atendimentos)",
        }}
        disabled={somenteLeitura}
        onChange={(v) => set({ abrangencia: v as EstruturaCatalogo["abrangencia"] })}
      />
      <div className="space-y-1">
        <RotuloAjuda chave="grupo" htmlFor={`grupo-${tipo}`}>
          Grupo ao qual pertence
        </RotuloAjuda>
        <CampoTextoCatalogo
          id={`grupo-${tipo}`}
          value={valor.grupo ?? ""}
          disabled={somenteLeitura}
          placeholder="Ex.: Ultrassonografia"
          onChange={(e) => set({ grupo: e.target.value || null })}
        />
        <p className="text-xs text-muted-foreground">
          Organiza a classificação. Não copia preços ou regras do grupo.
        </p>
      </div>
    </>
  );
}

export function CampoEncaminhamentoHumano({ valor, onChange, somenteLeitura }: PropsEstrutura) {
  return (
    <Escolha
      label="Encaminhamento humano obrigatório"
      ajuda="encaminhamento_humano"
      value={valor.encaminhamento_humano == null ? null : String(valor.encaminhamento_humano)}
      options={{ true: "Sim — transferir para a equipe (o paciente é avisado)", false: "Não" }}
      disabled={somenteLeitura}
      onChange={(v) =>
        onChange({ ...valor, encaminhamento_humano: v == null ? null : v === "true" })
      }
    />
  );
}

export function CampoNinaPodeAgendar({ valor, onChange, somenteLeitura }: PropsEstrutura) {
  return (
    <Escolha
      label="Nina pode agendar"
      ajuda="nina_pode_agendar"
      // Sem marcação equivale a "Não": a Nina informa e encaminha à equipe.
      value={valor.nina_pode_agendar === true ? "true" : "false"}
      options={{
        true: "Sim — a Nina agenda (exige modalidade agendável)",
        false: "Não — informa e encaminha à equipe",
      }}
      disabled={somenteLeitura}
      onChange={(v) => onChange({ ...valor, nina_pode_agendar: v === "true" })}
    />
  );
}

export function CampoSituacaoPreparo({ valor, onChange, somenteLeitura }: PropsEstrutura) {
  return (
    <Escolha
      label="Situação do preparo"
      ajuda="preparo_status"
      value={valor.preparo_status === "nao_informado" ? null : valor.preparo_status}
      options={{
        informado: "Preparo cadastrado",
        sem_preparo: "Clínica confirmou que não exige preparo",
      }}
      disabled={somenteLeitura}
      onChange={(v) =>
        onChange({
          ...valor,
          preparo_status: (v ?? "nao_informado") as EstruturaCatalogo["preparo_status"],
        })
      }
    />
  );
}

export function CampoSituacaoConvenios({ valor, onChange, somenteLeitura }: PropsEstrutura) {
  return (
    <Escolha
      label="Situação dos convênios"
      ajuda="convenios_status"
      value={valor.convenios_status === "nao_informado" ? null : valor.convenios_status}
      options={{
        aceita: "Aceita os convênios cadastrados",
        nao_aceita: "Clínica confirmou que não aceita",
      }}
      disabled={somenteLeitura}
      onChange={(v) =>
        onChange({
          ...valor,
          convenios_status: (v ?? "nao_informado") as EstruturaCatalogo["convenios_status"],
        })
      }
    />
  );
}

type PropsAtendimentos = PropsEstrutura & {
  conteudo: string;
  profissional?: string;
  atendimento: string;
  onOrganizar: (v: string) => void;
};

/** Complementos confirmados de cada atendimento identificado no texto. */
export function ComplementosAtendimentos({
  valor,
  onChange,
  conteudo,
  profissional,
  atendimento,
  somenteLeitura,
  onOrganizar,
}: PropsAtendimentos) {
  const set = (patch: Partial<EstruturaCatalogo>) => onChange({ ...valor, ...patch });
  const itens = atendimentosEstruturados(conteudo, undefined, profissional, atendimento).map(
    (a) => ({ ...a, complemento: valor.complementos.find((c) => c.chave === a.chave) }),
  );
  const pendencias = pendenciasEstrutura(conteudo, valor, profissional);
  const desvinculados = valor.complementos.filter((c) => !itens.some((a) => a.chave === c.chave));
  const complemento = (chave: string, patch: Partial<ComplementoAtendimento>) =>
    set({
      complementos: [
        ...valor.complementos.filter((c) => c.chave !== chave),
        { ...valor.complementos.find((c) => c.chave === chave), chave, ...patch },
      ],
    });
  return (
    <>
      {itens.length > 0 && (
        <p className="text-sm text-muted-foreground">
          {itens.length} atendimento(s) identificado(s) no texto. Preços e horários abaixo vêm do
          cadastro atual; os complementos ficam associados a cada atendimento.
        </p>
      )}
      {itens.map((a, i) => {
        const c = a.complemento;
        const duplicado = itens.filter((x) => x.chave === a.chave).length > 1;
        return (
          <details key={`${a.chave}-${i}`} className="rounded-md border p-3">
            <summary className="cursor-pointer text-sm font-medium">
              {a.atendimento}
              {a.profissional ? ` · ${a.profissional}` : ""}
            </summary>
            <div className="mt-3 space-y-3">
              {a.horarios_publicados ||
              a.chegada_publicada ||
              a.criterio_publicado ||
              a.dinheiro ||
              a.pix_cartao ? (
                <dl className="text-sm text-muted-foreground space-y-1">
                  <div>
                    <dt className="inline font-medium">Horários publicados: </dt>
                    <dd className="inline">{a.horarios_publicados || "Não informado"}</dd>
                  </div>
                  <div>
                    <dt className="inline font-medium">Chegada: </dt>
                    <dd className="inline">{a.chegada_publicada || "Não informado"}</dd>
                  </div>
                  <div>
                    <dt className="inline font-medium">Critério: </dt>
                    <dd className="inline">{a.criterio_publicado || "Não informado"}</dd>
                  </div>
                  <div>
                    <dt className="inline font-medium">Valores: </dt>
                    <dd className="inline">
                      Dinheiro: {a.dinheiro || "não informado"} · Pix/cartão:{" "}
                      {a.pix_cartao || "não informado"}
                    </dd>
                  </div>
                </dl>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Valores, horários e orientações permanecem nos campos do cadastro. Use os
                  complementos abaixo para regras confirmadas deste atendimento.
                </p>
              )}
              {duplicado ? (
                <p className="text-sm text-amber-600">
                  Há dois blocos com a mesma identificação. Confira o texto antes de complementar.
                </p>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2">
                  <Escolha
                    label={`Modalidade · ${i + 1}`}
                    ajuda="complemento_modalidade"
                    value={c?.modalidade}
                    options={MODALIDADES_ATENDIMENTO}
                    disabled={somenteLeitura}
                    onChange={(v) =>
                      complemento(a.chave, {
                        modalidade: v as ComplementoAtendimento["modalidade"],
                      })
                    }
                  />
                  <Escolha
                    label={`Situação do preço · ${i + 1}`}
                    ajuda="complemento_situacao_preco"
                    value={c?.situacao_preco}
                    options={{
                      definido: "Valor definido no cadastro",
                      sob_consulta: "Precisa de orçamento",
                      incluido: "Incluído em outro atendimento",
                      nao_informado: "Ainda não informado",
                    }}
                    disabled={somenteLeitura}
                    onChange={(v) =>
                      complemento(a.chave, {
                        situacao_preco: v as ComplementoAtendimento["situacao_preco"],
                      })
                    }
                  />
                  <div className="space-y-1 text-sm">
                    <div className="flex flex-wrap items-center gap-2">
                      <label htmlFor={`idade-${i}`}>Idade mínima confirmada</label>
                      <ComoLer chave="complemento_idade" />
                    </div>
                    <Input
                      id={`idade-${i}`}
                      type="number"
                      min="0"
                      disabled={somenteLeitura}
                      value={c?.idade_minima ?? ""}
                      onChange={(e) =>
                        complemento(a.chave, {
                          idade_minima: e.target.value === "" ? null : Number(e.target.value),
                          ...(e.target.value === "" ? { unidade_idade: null } : {}),
                        })
                      }
                    />
                  </div>
                  <Escolha
                    label={`Unidade da idade · ${i + 1}`}
                    value={c?.unidade_idade}
                    options={{ anos: "Anos", meses: "Meses" }}
                    disabled={somenteLeitura}
                    onChange={(v) =>
                      complemento(a.chave, {
                        unidade_idade: v as ComplementoAtendimento["unidade_idade"],
                      })
                    }
                  />
                  <div className="space-y-1 text-sm">
                    <div className="flex flex-wrap items-center gap-2">
                      <label htmlFor={`chegada-${i}`}>Limite de chegada confirmado</label>
                      <ComoLer chave="complemento_chegada" />
                    </div>
                    <Input
                      id={`chegada-${i}`}
                      type="time"
                      disabled={somenteLeitura}
                      value={c?.chegada_ate ?? ""}
                      onChange={(e) =>
                        complemento(a.chave, { chegada_ate: e.target.value || null })
                      }
                    />
                  </div>
                  <div className="space-y-1 text-sm">
                    <div className="flex flex-wrap items-center gap-2">
                      <label htmlFor={`recorrencia-${i}`}>Data de referência da recorrência</label>
                      <ComoLer chave="complemento_recorrencia" />
                    </div>
                    <Input
                      id={`recorrencia-${i}`}
                      type="date"
                      disabled={somenteLeitura}
                      value={c?.referencia_recorrencia ?? ""}
                      onChange={(e) =>
                        complemento(a.chave, { referencia_recorrencia: e.target.value || null })
                      }
                    />
                  </div>
                  {(
                    [
                      [
                        "criterio_adicional",
                        "Outros critérios confirmados",
                        "complemento_criterio",
                      ],
                      ["inclui", "O que está incluído", "complemento_inclui"],
                      ["acrescimos", "Acréscimos e quando se aplicam", "complemento_acrescimos"],
                    ] as const
                  ).map(([campo, rotulo, ajuda]) => (
                    <div key={campo} className="space-y-1 text-sm">
                      <div className="flex flex-wrap items-center gap-2">
                        <label htmlFor={`${campo}-${i}`}>{rotulo}</label>
                        <ComoLer chave={ajuda} />
                      </div>
                      <Textarea
                        id={`${campo}-${i}`}
                        disabled={somenteLeitura}
                        value={c?.[campo] ?? ""}
                        onChange={(e) => complemento(a.chave, { [campo]: e.target.value || null })}
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>
          </details>
        );
      })}
      {desvinculados.length > 0 && (
        <p className="text-sm text-amber-600">
          Há complementos de uma identificação anterior:{" "}
          {desvinculados.map((c) => c.chave).join("; ")}. Eles foram preservados e não aparecem em
          nenhum atendimento desta tela, mas a modalidade deles ainda é considerada pela Nina ao
          decidir se agenda este item. Revise antes de publicar.
        </p>
      )}
      {pendencias.length > 0 && (
        <details className="text-sm">
          <summary className="cursor-pointer text-amber-600">
            {pendencias.length} ponto(s) para conferir com a clínica
          </summary>
          <ul className="mt-2 list-disc pl-5 text-muted-foreground">
            {pendencias.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </details>
      )}
      {!somenteLeitura && conteudo.includes(" | ") && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => onOrganizar(organizarTextoCatalogo(conteudo))}
        >
          Organizar texto em linhas, preservando o conteúdo
        </Button>
      )}
    </>
  );
}

/** Layout clássico: organização, regras e complementos num único bloco recolhível. */
export function EstruturaCatalogoEditor(
  props: PropsAtendimentos & { tipo: "servico" | "profissional" },
) {
  const { tipo } = props;
  return (
    <details className="rounded-lg border p-4">
      <summary className="cursor-pointer text-sm font-medium">
        Organização do conhecimento e regras por atendimento
      </summary>
      <div className="mt-4 space-y-4">
        <div>
          <h3 className="font-medium">Organização do conhecimento</h3>
          <p className="text-xs text-muted-foreground">
            Informações em branco continuam desconhecidas. Confirme regras com a clínica antes de
            preencher.
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <CamposOrganizacao {...props} />
          <CampoEncaminhamentoHumano {...props} />
          <CampoNinaPodeAgendar {...props} />
          {tipo === "servico" ? (
            <CampoSituacaoPreparo {...props} />
          ) : (
            <CampoSituacaoConvenios {...props} />
          )}
        </div>
        <ComplementosAtendimentos {...props} />
      </div>
    </details>
  );
}
