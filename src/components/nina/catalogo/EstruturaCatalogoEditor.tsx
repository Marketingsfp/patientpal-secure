import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { MODALIDADES_ATENDIMENTO } from "@/lib/nina/modalidade-atendimento";
import {
  atendimentosEstruturados,
  organizarTextoCatalogo,
  pendenciasEstrutura,
  type EstruturaCatalogo,
  type ComplementoAtendimento,
} from "@/lib/nina/catalogo-estrutura";

const selectClass =
  "h-10 w-full rounded-md border border-input bg-background px-3 text-sm disabled:opacity-50";
function Escolha({
  label,
  value,
  options,
  disabled,
  onChange,
}: {
  label: string;
  value: string | null | undefined;
  options: Record<string, string>;
  disabled?: boolean;
  onChange: (v: string | null) => void;
}) {
  return (
    <label className="space-y-1 text-sm">
      <span>{label}</span>
      <select
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
    </label>
  );
}

export function EstruturaCatalogoEditor({
  valor,
  onChange,
  tipo,
  conteudo,
  profissional,
  atendimento,
  somenteLeitura,
  onOrganizar,
}: {
  valor: EstruturaCatalogo;
  onChange: (v: EstruturaCatalogo) => void;
  tipo: "servico" | "profissional";
  conteudo: string;
  profissional?: string;
  atendimento: string;
  somenteLeitura?: boolean;
  onOrganizar: (v: string) => void;
}) {
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
        <div className="space-y-1">
          <Label htmlFor={`aliases-${tipo}`}>Nomes alternativos e siglas</Label>
          <Textarea
            id={`aliases-${tipo}`}
            disabled={somenteLeitura}
            value={valor.aliases.join("\n")}
            placeholder="Um nome por linha. Apenas equivalências confirmadas deste atendimento."
            onChange={(e) => set({ aliases: e.target.value.split("\n") })}
          />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {tipo === "servico" && (
            <Escolha
              label="Categoria do atendimento"
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
            value={valor.abrangencia}
            options={{
              item: "Atendimento específico",
              grupo: "Categoria geral (grupo de atendimentos)",
            }}
            disabled={somenteLeitura}
            onChange={(v) => set({ abrangencia: v as EstruturaCatalogo["abrangencia"] })}
          />
          <div className="space-y-1">
            <Label htmlFor={`grupo-${tipo}`}>Grupo ao qual pertence</Label>
            <Input
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
          <Escolha
            label="Encaminhamento humano obrigatório"
            value={valor.encaminhamento_humano == null ? null : String(valor.encaminhamento_humano)}
            options={{ true: "Sim — encaminhar silenciosamente", false: "Não" }}
            disabled={somenteLeitura}
            onChange={(v) => set({ encaminhamento_humano: v == null ? null : v === "true" })}
          />
          {tipo === "servico" ? (
            <Escolha
              label="Situação do preparo"
              value={valor.preparo_status === "nao_informado" ? null : valor.preparo_status}
              options={{
                informado: "Preparo cadastrado",
                sem_preparo: "Clínica confirmou que não exige preparo",
              }}
              disabled={somenteLeitura}
              onChange={(v) =>
                set({
                  preparo_status: (v ?? "nao_informado") as EstruturaCatalogo["preparo_status"],
                })
              }
            />
          ) : (
            <Escolha
              label="Situação dos convênios"
              value={valor.convenios_status === "nao_informado" ? null : valor.convenios_status}
              options={{
                aceita: "Aceita os convênios cadastrados",
                nao_aceita: "Clínica confirmou que não aceita",
              }}
              disabled={somenteLeitura}
              onChange={(v) =>
                set({
                  convenios_status: (v ?? "nao_informado") as EstruturaCatalogo["convenios_status"],
                })
              }
            />
          )}
        </div>
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
                    <label className="space-y-1 text-sm">
                      Idade mínima confirmada
                      <Input
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
                    </label>
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
                    <label className="space-y-1 text-sm">
                      Limite de chegada confirmado
                      <Input
                        type="time"
                        disabled={somenteLeitura}
                        value={c?.chegada_ate ?? ""}
                        onChange={(e) =>
                          complemento(a.chave, { chegada_ate: e.target.value || null })
                        }
                      />
                    </label>
                    <label className="space-y-1 text-sm">
                      Data de referência da recorrência
                      <Input
                        type="date"
                        disabled={somenteLeitura}
                        value={c?.referencia_recorrencia ?? ""}
                        onChange={(e) =>
                          complemento(a.chave, { referencia_recorrencia: e.target.value || null })
                        }
                      />
                    </label>
                    {(
                      [
                        ["criterio_adicional", "Outros critérios confirmados"],
                        ["inclui", "O que está incluído"],
                        ["acrescimos", "Acréscimos e quando se aplicam"],
                      ] as const
                    ).map(([campo, rotulo]) => (
                      <label key={campo} className="space-y-1 text-sm">
                        {rotulo}
                        <Textarea
                          disabled={somenteLeitura}
                          value={c?.[campo] ?? ""}
                          onChange={(e) =>
                            complemento(a.chave, { [campo]: e.target.value || null })
                          }
                        />
                      </label>
                    ))}
                  </div>
                )}
              </div>
            </details>
          );
        })}
        {desvinculados.length > 0 && (
          <p className="text-sm text-amber-600">
            Há complementos de uma identificação anterior. Revise-os antes de publicar:{" "}
            {desvinculados.map((c) => c.chave).join("; ")}. Eles foram preservados e não serão
            aplicados a outro atendimento.
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
      </div>
    </details>
  );
}
