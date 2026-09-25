import { Badge } from "@/components/ui/badge";
import type { LeituraDetalhesMensagem } from "@/lib/nina/detalhes-mensagem-contrato";
import { registrosSemMotor } from "@/lib/nina/fluxo-direto";

const AMBIENTES = {
  homologacao: "Homologação",
  producao: "Produção",
  nao_registrado: "Ambiente não registrado",
} as const;


const ESTADOS_PASSO = {
  concluido: { texto: "Concluído", classe: "text-emerald-700 dark:text-emerald-400" },
  falhou: { texto: "Falhou", classe: "text-destructive" },
  em_andamento: { texto: "Em andamento", classe: "text-amber-700 dark:text-amber-400" },
  nao_confirmado: { texto: "Não confirmado", classe: "text-muted-foreground" },
  ignorado: { texto: "Não executada", classe: "text-muted-foreground" },
} as const;

function duracao(ms: number | null): string {
  if (ms == null || !Number.isFinite(ms)) return "Não registrada";
  if (ms < 1000) return `${ms} ms`;
  return `${(ms / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} s`;
}

function Passos({
  passos,
  inicio = 1,
}: {
  passos: LeituraDetalhesMensagem["passos"];
  inicio?: number;
}) {
  return (
    <ol start={inicio} className="space-y-3">
      {passos.map((passo, indice) => {
        const estado = ESTADOS_PASSO[passo.estado];
        return (
          <li key={passo.id} className="flex gap-3">
            <span
              aria-hidden="true"
              className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium"
            >
              {inicio + indice}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <p className="font-medium">{passo.titulo}</p>
                <span className={`text-xs ${estado.classe}`}>{estado.texto}</span>
                {passo.duracaoMs != null && (
                  <span className="text-xs text-muted-foreground">{duracao(passo.duracaoMs)}</span>
                )}
              </div>
              <p className="mt-0.5 whitespace-pre-wrap break-words text-muted-foreground">
                {passo.descricao}
              </p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

const ESTADOS_FERRAMENTA = {
  ...ESTADOS_PASSO,
  nao_registrado: { texto: "Execução não registrada", classe: "text-muted-foreground" },
} as const;

function Bloco({ rotulo, texto }: { rotulo: string; texto: string }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{rotulo}</p>
      <pre className="mt-1 max-h-60 overflow-auto whitespace-pre-wrap break-words rounded bg-muted/30 p-2 text-[11px]">
        {texto}
      </pre>
    </div>
  );
}

function Lista({ rotulo, itens }: { rotulo: string; itens: string[] }) {
  if (!itens.length) return null;
  return (
    <div>
      <p className="text-xs text-muted-foreground">{rotulo}</p>
      <ul className="mt-1 list-disc space-y-0.5 pl-4 text-xs">
        {itens.map((item, i) => (
          <li key={i}>{item}</li>
        ))}
      </ul>
    </div>
  );
}

function numero(v: number | null): string {
  return v == null ? "—" : v.toLocaleString("pt-BR");
}

/** Rodada a rodada: o que o modelo escreveu, o que pediu e o que recebeu de volta. */
function LinhaDoTempo({ linha }: { linha: NonNullable<LeituraDetalhesMensagem["linhaDoTempo"]> }) {
  return (
    <section aria-label="Como a Nina chegou à resposta" className="space-y-3">
      <h3 className="font-semibold">Como a Nina chegou à resposta</h3>
      {!linha.rodadas.length && (
        <p className="text-muted-foreground">
          {linha.semModelo
            ? `Resposta produzida sem chamar o modelo: ${linha.semModelo}.`
            : "Não há rodadas do modelo registradas para esta mensagem."}
        </p>
      )}
      <Lista rotulo="Antes de chamar o modelo, o sistema registrou:" itens={linha.antesDoModelo} />
      <ol className="space-y-3">
        {linha.rodadas.map((r) => (
          <li key={r.numero} className="space-y-3 rounded-lg border p-3" data-rodada={r.numero}>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <p className="font-medium">Rodada {r.numero}</p>
              <span className="text-xs text-muted-foreground">
                {r.modelo ?? "Modelo não registrado"} · {duracao(r.latenciaMs)} · tokens{" "}
                {numero(r.tokensEntrada)} → {numero(r.tokensSaida)}
                {r.tentativas != null && r.tentativas > 1 ? ` · ${r.tentativas} tentativas` : ""}
              </span>
            </div>
            {r.orientacoesAntes.map((t, i) => (
              <Bloco key={i} rotulo="Orientação interna do sistema antes desta rodada" texto={t} />
            ))}
            {r.erro ? (
              <p className="text-destructive">Falha na chamada ao modelo: {r.erro}</p>
            ) : r.texto ? (
              <Bloco rotulo="O modelo escreveu" texto={r.texto} />
            ) : (
              <p className="text-xs text-muted-foreground">
                O modelo não escreveu texto nesta rodada
                {r.ferramentas.length ? "; apenas pediu ferramentas." : "."}
              </p>
            )}
            {r.ferramentas.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground">Ferramentas</p>
                <ul className="space-y-2">
                  {r.ferramentas.map((f, i) => {
                    const estado = ESTADOS_FERRAMENTA[f.estado];
                    return (
                      <li key={i} className="space-y-2 rounded border bg-muted/10 p-2">
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                          <p className="font-medium break-all">{f.nome}</p>
                          <span className={`text-xs ${estado.classe}`}>{estado.texto}</span>
                          {f.pedidaPeloSistema && (
                            <Badge variant="outline">Acionada pelo sistema</Badge>
                          )}
                        </div>
                        {f.detalhe && <p className="text-xs text-muted-foreground">{f.detalhe}</p>}
                        {f.argumentos && <Bloco rotulo="Pediu" texto={f.argumentos} />}
                        {f.resultado ? (
                          <details>
                            <summary className="cursor-pointer text-xs">
                              Recebeu de volta
                            </summary>
                            <div className="mt-1">
                              <Bloco rotulo="Como a Nina recebeu o resultado" texto={f.resultado} />
                            </div>
                          </details>
                        ) : (
                          f.estado === "concluido" &&
                          !f.pedidaPeloSistema && (
                            <p className="text-xs text-muted-foreground">
                              Resultado não registrado: não houve rodada seguinte do modelo (a
                              resposta foi montada logo após esta ferramenta) ou o resultado não pôde
                              ser ligado a ela com segurança.
                            </p>
                          )
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
            {r.resultadosSemVinculo.length > 0 && (
              <details>
                <summary className="cursor-pointer text-xs">
                  Resultados recebidos sem vínculo seguro com cada ferramenta (
                  {r.resultadosSemVinculo.length})
                </summary>
                <div className="mt-1 space-y-2">
                  {r.resultadosSemVinculo.map((t, i) => (
                    <Bloco key={i} rotulo={`Resultado ${i + 1}`} texto={t} />
                  ))}
                </div>
              </details>
            )}
            <Lista rotulo="Registros do sistema após esta rodada" itens={r.registrosSistema} />
          </li>
        ))}
      </ol>
      {linha.ajusteFinal && (
        <div className="space-y-2 rounded-lg border p-3">
          <p className="font-medium">Ajuste feito pelo sistema depois do modelo</p>
          <Bloco rotulo="Texto do modelo" texto={linha.ajusteFinal.antes || "(vazio)"} />
          <Bloco rotulo="Texto final" texto={linha.ajusteFinal.depois || "(vazio)"} />
        </div>
      )}
    </section>
  );
}

/** Somente leitura normalizada da mensagem selecionada; não reavalia nem executa a Nina. */
export function DetalhesMensagemNina({
  leitura,
  registros,
}: {
  leitura: LeituraDetalhesMensagem;
  registros?: unknown;
}) {
  const restantes = leitura.passos.slice(8);
  return (
    <div className="space-y-5 text-sm" data-mensagem-id={leitura.mensagem?.id}>
      <section
        aria-label="Resultado desta mensagem"
        className="space-y-3 rounded-lg border bg-muted/20 p-3"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-semibold">Resultado</h3>
          <Badge variant="outline">{AMBIENTES[leitura.ambiente]}</Badge>
        </div>
        <p className="font-medium">{leitura.resultado}</p>
        <dl className="grid grid-cols-1 gap-x-4 gap-y-2 text-xs sm:grid-cols-2">
          {[
            ["Modelo", leitura.modelo ?? "Não registrado"],
            ["Versão do núcleo neste turno", leitura.versaoRuntime ?? "Não registrada"],
            [
              "Versão do prompt",
              leitura.versaoPrompt == null ? "Não registrada" : String(leitura.versaoPrompt),
            ],
            ["Duração registrada", duracao(leitura.duracaoMs)],
            [
              "Chamadas ao modelo registradas",
              leitura.rodadas == null ? "Não registradas" : String(leitura.rodadas),
            ],
            ...(leitura.protocolo ? [["Protocolo", leitura.protocolo]] : []),
          ].map(([rotulo, valor]) => (
            <div key={rotulo}>
              <dt className="text-muted-foreground">{rotulo}</dt>
              <dd className="mt-0.5 break-words font-medium">{valor}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section aria-label="Mensagem registrada" className="space-y-2">
        <h3 className="font-semibold">Mensagem registrada</h3>
        {leitura.mensagem ? (
          <>
            <blockquote className="whitespace-pre-wrap break-words rounded-lg border bg-muted/20 p-3">
              {leitura.mensagem.texto || "O registro desta mensagem não contém texto."}
            </blockquote>
            <p className="text-xs text-muted-foreground">Origem: {leitura.mensagem.origem}</p>
          </>
        ) : (
          <p className="text-muted-foreground">
            A mensagem selecionada não foi localizada nos registros disponíveis.
          </p>
        )}
      </section>

      {leitura.entradas.length > 0 && (
        <details className="rounded-lg border p-3">
          <summary className="cursor-pointer font-medium">O que o paciente enviou</summary>
          <div className="mt-3 space-y-2">
            {leitura.entradas.map((entrada, indice) => (
              <p key={indice} className="whitespace-pre-wrap break-words text-muted-foreground">
                {entrada}
              </p>
            ))}
          </div>
        </details>
      )}

      <details className="rounded-lg border p-3">
        <summary className="cursor-pointer font-medium">
          Última resposta do modelo registrada
        </summary>
        <p className="mt-3 whitespace-pre-wrap break-words text-muted-foreground">
          {leitura.respostaOriginal ?? "Nenhuma resposta do modelo foi localizada nos registros."}
        </p>
      </details>

      {leitura.linhaDoTempo && <LinhaDoTempo linha={leitura.linhaDoTempo} />}

      <section aria-label="O que aconteceu" className="space-y-3">
        <h3 className="font-semibold">O que aconteceu</h3>
        {leitura.passos.length ? (
          <Passos passos={leitura.passos.slice(0, 8)} />
        ) : (
          <p className="text-muted-foreground">
            Não há etapas suficientes para reconstruir este atendimento.
          </p>
        )}
        {restantes.length > 0 && (
          <details className="rounded-lg border p-3">
            <summary className="cursor-pointer font-medium">
              Outras etapas registradas ({restantes.length})
            </summary>
            <div className="mt-3">
              <Passos passos={restantes} inicio={9} />
            </div>
          </details>
        )}
      </section>

      {leitura.alertas.length > 0 && (
        <section
          aria-label="Limitações do registro"
          className="space-y-2 rounded-lg border border-amber-500/40 bg-amber-500/5 p-3"
        >
          <h3 className="font-medium">Limitações do registro</h3>
          <ul className="list-disc space-y-1 pl-4 text-xs text-muted-foreground">
            {leitura.alertas.map((alerta, indice) => (
              <li key={indice}>{alerta}</li>
            ))}
          </ul>
        </section>
      )}

      {registros != null && (
        <details className="rounded-lg border p-3" data-testid="registros-tecnicos">
          <summary className="cursor-pointer font-medium">Ver registros técnicos</summary>
          <p className="mt-3 text-xs text-muted-foreground">
            Registros da geração e da entrega desta mensagem.
          </p>
          <pre className="mt-2 max-h-80 overflow-auto whitespace-pre-wrap break-words rounded bg-muted/30 p-2 text-[11px]">
            {JSON.stringify(registrosSemMotor([registros as Record<string, unknown>])[0], null, 2)}
          </pre>
        </details>
      )}
    </div>
  );
}
