import { useId, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CurrencyInput } from "@/components/ui/currency-input";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { TextoCatalogo as Textarea, CampoTextoCatalogo } from "./TextoCatalogo";
import { ComoLer } from "./AjudaCatalogo";
import { DIAS_SEMANA, RECORRENCIAS } from "@/lib/nina/catalogo-constantes";
import { paraNumero } from "@/lib/nina/catalogo";
import {
  dataDaConversao,
  fatosNoTextoLivre,
  mensagemFatosNoTexto,
} from "@/lib/nina/catalogo-atendimentos";
import { MODALIDADES_ATENDIMENTO } from "@/lib/nina/modalidade-atendimento";
import type {
  AtendimentoCatalogo,
  HorarioCatalogo,
  PrecoCatalogo,
} from "@/lib/nina/catalogo-estrutura";
import type { ChaveAjudaCatalogo } from "@/lib/nina/catalogo-ajuda";

const selectClass =
  "h-10 w-full rounded-md border border-input bg-background px-3 text-sm disabled:opacity-50";
const FORMAS_COMUNS = ["Dinheiro", "Pix/cartão", "Cartão", "Pix"];

function novoAtendimento(nome = ""): AtendimentoCatalogo {
  return {
    id: crypto.randomUUID(),
    nome,
    especialidade: null,
    modalidade: null,
    horarios: [],
    executantes: [],
    chegada_ate: null,
    precos: [],
    situacao_preco: null,
    idade_minima: null,
    unidade_idade: null,
    criterio_adicional: null,
    inclui: null,
    acrescimos: null,
    observacao: null,
  };
}

function Campo({
  rotulo,
  ajuda,
  children,
  id,
}: {
  rotulo: string;
  ajuda?: ChaveAjudaCatalogo;
  children: React.ReactNode;
  id?: string;
}) {
  return (
    <div className="space-y-1 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor={id}>{rotulo}</label>
        {ajuda && <ComoLer chave={ajuda} />}
      </div>
      {children}
    </div>
  );
}

/** Linhas de escala habitual: dia, início, fim, recorrência e observação. */
function HorariosEditor({
  linhas,
  onChange,
  somenteLeitura,
}: {
  linhas: HorarioCatalogo[];
  onChange: (l: HorarioCatalogo[]) => void;
  somenteLeitura?: boolean;
}) {
  const atualizar = (i: number, patch: Partial<HorarioCatalogo>) =>
    onChange(linhas.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  return (
    <div className="space-y-2">
      {linhas.length === 0 && (
        <p className="text-xs text-muted-foreground">
          Nenhum horário. Dia sem cadastro não significa dia fechado.
        </p>
      )}
      {linhas.map((h, i) => (
        <div key={i} className="space-y-2 rounded-md border p-2">
          <div className="grid gap-2 sm:grid-cols-4">
            <select
              aria-label="Dia"
              className={selectClass}
              disabled={somenteLeitura}
              value={h.dia}
              onChange={(e) => atualizar(i, { dia: e.target.value as HorarioCatalogo["dia"] })}
            >
              {DIAS_SEMANA.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
            <Input
              aria-label="Início"
              type="time"
              disabled={somenteLeitura}
              value={h.inicio ?? ""}
              onChange={(e) => atualizar(i, { inicio: e.target.value || null })}
            />
            <Input
              aria-label="Fim (não é limite de chegada)"
              type="time"
              disabled={somenteLeitura}
              value={h.fim ?? ""}
              onChange={(e) => atualizar(i, { fim: e.target.value || null })}
            />
            <select
              aria-label="Recorrência"
              className={selectClass}
              disabled={somenteLeitura}
              value={h.recorrencia}
              onChange={(e) =>
                atualizar(i, { recorrencia: e.target.value as HorarioCatalogo["recorrencia"] })
              }
            >
              {RECORRENCIAS.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {h.recorrencia === "Quinzenal" && (
              <Input
                aria-label="Data de referência da recorrência"
                title="Uma data em que este horário acontece, para calcular as próximas"
                type="date"
                className="w-auto"
                disabled={somenteLeitura}
                value={h.referencia_recorrencia ?? ""}
                onChange={(e) => atualizar(i, { referencia_recorrencia: e.target.value || null })}
              />
            )}
            <CampoTextoCatalogo
              aria-label="Observação do horário"
              placeholder="Observação do horário (ex.: limite de 15 pacientes)"
              disabled={somenteLeitura}
              value={h.observacao ?? ""}
              onChange={(e) => atualizar(i, { observacao: e.target.value || null })}
            />
            {!somenteLeitura && (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="Remover horário"
                onClick={() => onChange(linhas.filter((_, idx) => idx !== i))}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      ))}
      {!somenteLeitura && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() =>
            onChange([
              ...linhas,
              {
                dia: DIAS_SEMANA[0],
                inicio: null,
                fim: null,
                recorrencia: "Toda semana",
                observacao: null,
              },
            ])
          }
        >
          <Plus className="mr-2 h-4 w-4" /> Adicionar horário
        </Button>
      )}
    </div>
  );
}

function PrecosEditor({
  precos,
  onChange,
  somenteLeitura,
}: {
  precos: PrecoCatalogo[];
  onChange: (p: PrecoCatalogo[]) => void;
  somenteLeitura?: boolean;
}) {
  const lista = useId();
  const atualizar = (i: number, patch: Partial<PrecoCatalogo>) =>
    onChange(precos.map((p, idx) => (idx === i ? { ...p, ...patch } : p)));
  return (
    <div className="space-y-2">
      <datalist id={lista}>
        {FORMAS_COMUNS.map((f) => (
          <option key={f} value={f} />
        ))}
      </datalist>
      {precos.length === 0 && (
        <p className="text-xs text-muted-foreground">
          Nenhum preço. Em branco significa valor não informado, não gratuito.
        </p>
      )}
      {precos.map((p, i) => (
        <div key={i} className="grid gap-2 rounded-md border p-2 sm:grid-cols-[1fr_1fr_1fr_auto]">
          <Input
            aria-label="Forma de pagamento"
            list={lista}
            placeholder="Forma (ex.: Dinheiro)"
            disabled={somenteLeitura}
            value={p.forma}
            onChange={(e) => atualizar(i, { forma: e.target.value })}
          />
          <CurrencyInput
            value={p.valor == null ? "" : String(p.valor)}
            disabled={somenteLeitura}
            placeholder="Valor não informado"
            onChange={(v) => atualizar(i, { valor: paraNumero(v) })}
          />
          <CampoTextoCatalogo
            aria-label="Condição"
            placeholder="Condição (ex.: até 3x)"
            disabled={somenteLeitura}
            value={p.condicao ?? ""}
            onChange={(e) => atualizar(i, { condicao: e.target.value || null })}
          />
          {!somenteLeitura && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="Remover preço"
              onClick={() => onChange(precos.filter((_, idx) => idx !== i))}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
          <CampoTextoCatalogo
            aria-label="Observação do preço"
            className="sm:col-span-3"
            placeholder="Observação do preço (opcional)"
            disabled={somenteLeitura}
            value={p.observacao ?? ""}
            onChange={(e) => atualizar(i, { observacao: e.target.value || null })}
          />
        </div>
      ))}
      {!somenteLeitura && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() =>
            onChange([...precos, { forma: "", valor: null, condicao: null, observacao: null }])
          }
        >
          <Plus className="mr-2 h-4 w-4" /> Adicionar preço
        </Button>
      )}
    </div>
  );
}

/**
 * Atendimentos estruturados: fonte única de horários, preços e regras do item.
 * Profissional edita horários do próprio atendimento; exame edita quem realiza.
 */
export function AtendimentosEditor({
  tipo,
  atendimentos,
  onChange,
  medicos,
  especialidades,
  somenteLeitura,
}: {
  tipo: "servico" | "profissional";
  atendimentos: AtendimentoCatalogo[];
  onChange: (a: AtendimentoCatalogo[]) => void;
  medicos: Array<{ id: string; nome: string }>;
  /** Especialidades do profissional (nomes) para escolher em cada atendimento. */
  especialidades?: string[];
  somenteLeitura?: boolean;
}) {
  const atualizar = (i: number, patch: Partial<AtendimentoCatalogo>) =>
    onChange(atendimentos.map((a, idx) => (idx === i ? { ...a, ...patch } : a)));
  const base = useId();
  return (
    <div className="space-y-3">
      {atendimentos.map((a, i) => {
        const id = (campo: string) => `${base}-${i}-${campo}`;
        const fatosObs = fatosNoTextoLivre(a.observacao);
        return (
          <details key={a.id} open className="rounded-md border p-3">
            <summary className="cursor-pointer text-sm font-medium">
              {a.nome || "Novo atendimento"}
              {a.modalidade ? ` · ${MODALIDADES_ATENDIMENTO[a.modalidade]}` : " · sem modalidade"}
            </summary>
            <div className="mt-3 space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <Campo rotulo="Nome do atendimento *" ajuda="atendimento_nome" id={id("nome")}>
                  <CampoTextoCatalogo
                    id={id("nome")}
                    disabled={somenteLeitura}
                    placeholder={tipo === "servico" ? "Ex.: Ultrassom de abdome" : "Ex.: Consulta"}
                    value={a.nome}
                    onChange={(e) => atualizar(i, { nome: e.target.value })}
                  />
                </Campo>
                <Campo rotulo="Especialidade" ajuda="atendimento_especialidade" id={id("esp")}>
                  {tipo === "profissional" ? (
                    <select
                      id={id("esp")}
                      className={selectClass}
                      disabled={somenteLeitura}
                      value={a.especialidade ?? ""}
                      onChange={(e) => atualizar(i, { especialidade: e.target.value || null })}
                    >
                      <option value="">Não informada</option>
                      {[...new Set([...(especialidades ?? []), a.especialidade ?? ""])]
                        .filter(Boolean)
                        .map((e) => (
                          <option key={e} value={e}>
                            {e}
                          </option>
                        ))}
                    </select>
                  ) : (
                    <CampoTextoCatalogo
                      id={id("esp")}
                      disabled={somenteLeitura}
                      value={a.especialidade ?? ""}
                      onChange={(e) => atualizar(i, { especialidade: e.target.value || null })}
                    />
                  )}
                </Campo>
                <Campo rotulo="Modalidade" ajuda="complemento_modalidade" id={id("mod")}>
                  <select
                    id={id("mod")}
                    className={selectClass}
                    disabled={somenteLeitura}
                    value={a.modalidade ?? ""}
                    onChange={(e) =>
                      atualizar(i, {
                        modalidade: (e.target.value || null) as AtendimentoCatalogo["modalidade"],
                      })
                    }
                  >
                    <option value="">Não informada</option>
                    {Object.entries(MODALIDADES_ATENDIMENTO).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v}
                      </option>
                    ))}
                  </select>
                </Campo>
                <Campo rotulo="Limite de chegada" ajuda="complemento_chegada" id={id("chegada")}>
                  <Input
                    id={id("chegada")}
                    type="time"
                    disabled={somenteLeitura}
                    value={a.chegada_ate ?? ""}
                    onChange={(e) => atualizar(i, { chegada_ate: e.target.value || null })}
                  />
                </Campo>
              </div>

              {tipo === "profissional" ? (
                <Campo rotulo="Horários deste atendimento" ajuda="atendimento_horarios">
                  <HorariosEditor
                    linhas={a.horarios}
                    somenteLeitura={somenteLeitura}
                    onChange={(horarios) => atualizar(i, { horarios })}
                  />
                </Campo>
              ) : (
                <Campo rotulo="Quem realiza e horários" ajuda="atendimento_executantes">
                  <div className="space-y-3">
                    {a.executantes.map((ex, j) => (
                      <div key={j} className="space-y-2 rounded-md border p-2">
                        <div className="flex items-center gap-2">
                          <div className="flex-1">
                            <SearchableSelect
                              options={medicos.map((m) => ({ value: m.id, label: m.nome }))}
                              value={ex.medico_id ?? ""}
                              disabled={somenteLeitura}
                              placeholder={ex.nome || "Escolha o profissional"}
                              onChange={(v) => {
                                const m = medicos.find((x) => x.id === v);
                                atualizar(i, {
                                  executantes: a.executantes.map((x, k) =>
                                    k === j
                                      ? { ...x, medico_id: v || null, nome: m?.nome ?? x.nome }
                                      : x,
                                  ),
                                });
                              }}
                            />
                          </div>
                          {!somenteLeitura && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              aria-label="Remover quem realiza"
                              onClick={() =>
                                atualizar(i, {
                                  executantes: a.executantes.filter((_, k) => k !== j),
                                })
                              }
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                        <HorariosEditor
                          linhas={ex.horarios}
                          somenteLeitura={somenteLeitura}
                          onChange={(horarios) =>
                            atualizar(i, {
                              executantes: a.executantes.map((x, k) =>
                                k === j ? { ...x, horarios } : x,
                              ),
                            })
                          }
                        />
                      </div>
                    ))}
                    {a.executantes.some((x) => !x.nome.trim()) && (
                      <p className="text-xs text-amber-600">
                        Escolha o profissional de cada linha antes de salvar.
                      </p>
                    )}
                    {!somenteLeitura && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          atualizar(i, {
                            executantes: [
                              ...a.executantes,
                              { medico_id: null, nome: "", horarios: [] },
                            ],
                          })
                        }
                      >
                        <Plus className="mr-2 h-4 w-4" /> Adicionar quem realiza
                      </Button>
                    )}
                  </div>
                </Campo>
              )}

              <Campo rotulo="Preços" ajuda="atendimento_precos">
                <PrecosEditor
                  precos={a.precos}
                  somenteLeitura={somenteLeitura}
                  onChange={(precos) => atualizar(i, { precos })}
                />
              </Campo>

              <div className="grid gap-3 sm:grid-cols-2">
                <Campo rotulo="Situação do preço" ajuda="complemento_situacao_preco" id={id("sit")}>
                  <select
                    id={id("sit")}
                    className={selectClass}
                    disabled={somenteLeitura}
                    value={a.situacao_preco ?? ""}
                    onChange={(e) =>
                      atualizar(i, {
                        situacao_preco: (e.target.value ||
                          null) as AtendimentoCatalogo["situacao_preco"],
                      })
                    }
                  >
                    <option value="">Não informada</option>
                    <option value="definido">Valor definido no cadastro</option>
                    <option value="sob_consulta">Precisa de orçamento</option>
                    <option value="incluido">Incluído em outro atendimento</option>
                  </select>
                </Campo>
                <Campo rotulo="Idade mínima" ajuda="complemento_idade" id={id("idade")}>
                  <div className="flex gap-2">
                    <Input
                      id={id("idade")}
                      type="number"
                      min="0"
                      disabled={somenteLeitura}
                      value={a.idade_minima ?? ""}
                      onChange={(e) =>
                        atualizar(
                          i,
                          e.target.value === ""
                            ? { idade_minima: null, unidade_idade: null }
                            : {
                                idade_minima: Number(e.target.value),
                                unidade_idade: a.unidade_idade ?? "anos",
                              },
                        )
                      }
                    />
                    <select
                      aria-label="Unidade da idade"
                      className={selectClass}
                      disabled={somenteLeitura || a.idade_minima == null}
                      value={a.unidade_idade ?? "anos"}
                      onChange={(e) =>
                        atualizar(i, {
                          unidade_idade: e.target.value as AtendimentoCatalogo["unidade_idade"],
                        })
                      }
                    >
                      <option value="anos">Anos</option>
                      <option value="meses">Meses</option>
                    </select>
                  </div>
                </Campo>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                {(
                  [
                    ["criterio_adicional", "Outros critérios confirmados", "complemento_criterio"],
                    ["inclui", "O que está incluído", "complemento_inclui"],
                    ["acrescimos", "Acréscimos e quando se aplicam", "complemento_acrescimos"],
                    ["observacao", "Observação do atendimento", "atendimento_observacao"],
                  ] as const
                ).map(([campo, rotulo, ajuda]) => (
                  <Campo key={campo} rotulo={rotulo} ajuda={ajuda} id={id(campo)}>
                    <Textarea
                      id={id(campo)}
                      disabled={somenteLeitura}
                      value={a[campo] ?? ""}
                      onChange={(e) => atualizar(i, { [campo]: e.target.value || null })}
                    />
                  </Campo>
                ))}
              </div>
              {fatosObs.length > 0 && (
                <p className="text-xs text-amber-600">
                  {mensagemFatosNoTexto("Observação", fatosObs)}
                </p>
              )}

              {!somenteLeitura && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="text-destructive"
                  onClick={() => onChange(atendimentos.filter((_, idx) => idx !== i))}
                  disabled={atendimentos.length === 1}
                  title={
                    atendimentos.length === 1 ? "O item precisa de ao menos um atendimento" : ""
                  }
                >
                  <Trash2 className="mr-2 h-4 w-4" /> Remover este atendimento
                </Button>
              )}
            </div>
          </details>
        );
      })}
      {!somenteLeitura && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => onChange([...atendimentos, novoAtendimento()])}
        >
          <Plus className="mr-2 h-4 w-4" /> Adicionar atendimento
        </Button>
      )}
    </div>
  );
}

/** Item ainda no formato antigo: oferece a conversão (nada é salvo até salvar). */
export function ConversaoParaAtendimentos({
  somenteLeitura,
  onConverter,
}: {
  somenteLeitura?: boolean;
  onConverter: () => void;
}) {
  return (
    <div className="space-y-2 rounded-md border border-dashed p-3 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <p className="font-medium">Formato antigo</p>
        <ComoLer chave="converter_estruturado" />
      </div>
      <p className="text-muted-foreground">
        Horários, preços e regras deste item ainda estão no texto e em campos separados. Converta
        para atendimentos estruturados para que cada informação fique num lugar só.
      </p>
      {!somenteLeitura && (
        <Button type="button" variant="outline" size="sm" onClick={onConverter}>
          Converter para atendimentos
        </Button>
      )}
    </div>
  );
}

export function PendenciasAtendimentos({ itens }: { itens: string[] }) {
  const unicos = [...new Set(itens)];
  if (!unicos.length) return null;
  return (
    <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
      <p className="font-medium">Confira antes de publicar</p>
      <ul className="mt-1 list-disc space-y-1 pl-5 text-muted-foreground">
        {unicos.map((p) => (
          <li key={p}>{p}</li>
        ))}
      </ul>
    </div>
  );
}

/** Aviso ao vivo de fatos escritos no texto livre de um item estruturado. */
export function AvisoTextoLivre({ texto }: { texto: string | null | undefined }) {
  const fatos = fatosNoTextoLivre(texto);
  if (!fatos.length) return null;
  return (
    <p className="text-xs text-amber-600">
      {mensagemFatosNoTexto("Texto para o paciente", fatos)} O salvamento será bloqueado.
    </p>
  );
}

/** Tela clássica com item estruturado: os campos exibidos são calculados. */
export function AvisoItemEstruturadoClassico() {
  return (
    <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
      Este item usa atendimentos estruturados. Os horários, preços e modalidade abaixo são
      calculados a partir deles e ficam só para leitura nesta tela; a edição é feita na tela
      organizada do catálogo.
    </div>
  );
}

/** Volta o item ao formato antigo a partir da cópia guardada na conversão. */
export function DesfazerConversao({
  copia,
  somenteLeitura,
  onDesfazer,
}: {
  copia: string | null | undefined;
  somenteLeitura?: boolean;
  onDesfazer: () => void;
}) {
  const [confirmar, setConfirmar] = useState(false);
  if (!copia || somenteLeitura) return null;
  const quando = dataDaConversao(copia);
  const data = quando ? new Date(quando).toLocaleDateString("pt-BR") : null;
  return (
    <div className="space-y-2 rounded-md border border-dashed p-3 text-sm">
      {!confirmar ? (
        <Button type="button" variant="ghost" size="sm" onClick={() => setConfirmar(true)}>
          Desfazer conversão
        </Button>
      ) : (
        <>
          <p>
            Volta ao conteúdo de antes da conversão{data ? ` (${data})` : ""}. Mudanças feitas nos
            atendimentos depois disso serão perdidas. Nada é gravado até você salvar.
          </p>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="destructive"
              size="sm"
              onClick={() => {
                setConfirmar(false);
                onDesfazer();
              }}
            >
              Confirmar e voltar ao formato antigo
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={() => setConfirmar(false)}>
              Cancelar
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
