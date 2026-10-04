import { useEffect, useId, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { BookOpen, Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { TextoCatalogo as Textarea } from "./TextoCatalogo";
import { gerarVariacoesCatalogoIA } from "@/lib/nina/catalogo.functions";
import {
  juntarVariacoes,
  LIMITE_VARIACOES,
  type ContextoDicionario,
  type ResultadoDicionario,
} from "@/lib/nina/catalogo-dicionario";

const rotulos = {
  sigla: "Sigla",
  nome_popular: "Nome popular",
  sinonimo: "Sinônimo",
  grafia: "Outra grafia",
  erro_comum: "Erro comum",
};

export function DicionarioCatalogoEditor({
  clinicaId,
  contexto,
  onChange,
  somenteLeitura,
}: {
  clinicaId?: string;
  contexto: ContextoDicionario;
  onChange: (aliases: string[]) => void;
  somenteLeitura: boolean;
}) {
  const id = useId();
  const gerar = useServerFn(gerarVariacoesCatalogoIA);
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState("");
  const [previa, setPrevia] = useState<ResultadoDicionario | null>(null);
  const [selecionadas, setSelecionadas] = useState<string[]>([]);
  const chave = JSON.stringify([clinicaId, contexto]);
  const atual = useRef(chave);
  atual.current = chave;
  const versao = useRef(0);
  const lock = useRef(false);
  useEffect(() => {
    setPrevia(null);
    setSelecionadas([]);
    setErro("");
  }, [chave]);
  useEffect(
    () => () => {
      versao.current++;
    },
    [],
  );

  async function sugerir() {
    if (!clinicaId || somenteLeitura || lock.current) return;
    lock.current = true;
    const pedido = ++versao.current;
    const origem = atual.current;
    setOcupado(true);
    setErro("");
    setPrevia(null);
    setSelecionadas([]);
    try {
      const resultado = await gerar({
        data: {
          clinicaId,
          contexto: { ...contexto, aliases: juntarVariacoes(contexto.aliases, []) },
        },
      });
      if (pedido !== versao.current) return;
      if (origem !== atual.current) {
        setErro(
          "O cadastro mudou durante a geração. Gere novamente para considerar as alterações.",
        );
        return;
      }
      setPrevia(resultado);
    } catch (e) {
      if (pedido === versao.current)
        setErro(e instanceof Error ? e.message : "Não foi possível gerar as variações.");
    } finally {
      lock.current = false;
      if (pedido === versao.current) setOcupado(false);
    }
  }

  return (
    <section
      className="space-y-3 rounded-lg border bg-muted/30 p-4"
      aria-label="Dicionário do cadastro"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <BookOpen className="h-4 w-4" aria-hidden="true" />
          Dicionário de formas de falar
        </h3>
        {!somenteLeitura && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={ocupado || !clinicaId || contexto.nome.trim().length < 2}
            onClick={() => void sugerir()}
          >
            {ocupado ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <Sparkles className="h-4 w-4" aria-hidden="true" />
            )}
            {ocupado ? "Pesquisando e gerando…" : "Pesquisar e gerar com GPT-6 Astra"}
          </Button>
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        Siglas, nomes populares e formas de escrever este mesmo atendimento. Semelhança não torna
        exames diferentes equivalentes.
      </p>
      <p className="text-xs text-muted-foreground">
        Pesquisa na web ao gerar, com até 3 chamadas e cobrança de IA/pesquisa. A internet ajuda a
        descobrir nomes; valores, preparo e regras continuam vindo do cadastro da clínica.
      </p>
      <div className="space-y-1">
        <Label htmlFor={id}>Variações revisadas · uma por linha</Label>
        <Textarea
          id={id}
          rows={4}
          value={contexto.aliases.join("\n")}
          disabled={somenteLeitura}
          aria-describedby={`${id}-ajuda`}
          placeholder="Adicione variações confirmadas ou gere sugestões para revisar."
          onChange={(e) => onChange(e.target.value.split("\n"))}
        />
        <p id={`${id}-ajuda`} className="text-xs text-muted-foreground">
          {contexto.aliases.filter((v) => v.trim()).length}/{LIMITE_VARIACOES} variações. Salve o
          rascunho ou publique o cadastro para gravar.
        </p>
      </div>
      {erro && (
        <p role="alert" className="text-sm text-destructive">
          {erro}
        </p>
      )}
      {previa && (
        <div className="space-y-3 border-t pt-3" aria-live="polite">
          <p className="text-sm font-medium">
            {previa.variacoes.length} sugestões para revisar e selecionar.
          </p>
          <div className="flex flex-wrap gap-2 text-xs">
            {Object.entries(rotulos).map(([categoria, rotulo]) => (
              <span key={categoria} className="rounded-md border px-2 py-1">
                {rotulo}: {previa.variacoes.filter((v) => v.categoria === categoria).length}
              </span>
            ))}
          </div>
          {!previa.variacoes.length && (
            <p className="text-sm text-muted-foreground">Nenhuma nova variação foi sugerida.</p>
          )}
          <div className="max-h-72 space-y-2 overflow-y-auto">
            {previa.variacoes.map((v) => (
              <label
                key={v.termo}
                className="flex cursor-pointer items-start gap-2 rounded-md border p-2 text-sm"
              >
                <input
                  type="checkbox"
                  className="mt-1"
                  disabled={somenteLeitura}
                  checked={selecionadas.includes(v.termo)}
                  onChange={(e) =>
                    setSelecionadas((anteriores) =>
                      e.target.checked
                        ? [...anteriores, v.termo]
                        : anteriores.filter((t) => t !== v.termo),
                    )
                  }
                />
                <span>
                  <strong>{v.termo}</strong>
                  <span className="ml-2 text-xs text-muted-foreground">{rotulos[v.categoria]}</span>
                  <span className="block text-xs text-muted-foreground">{v.explicacao}</span>
                  <span className="block text-xs text-muted-foreground">
                    {v.origem === "web"
                      ? "Com referência da pesquisa"
                      : "Hipótese de escrita gerada pela IA — revise"}
                  </span>
                  {v.fontes.map((url, i) => (
                    <a
                      key={url}
                      href={url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mr-3 inline-block text-xs text-primary underline"
                    >
                      Fonte {i + 1} · {new URL(url).hostname}
                    </a>
                  ))}
                </span>
              </label>
            ))}
          </div>
          <details className="rounded-md border p-3 text-sm">
            <summary className="cursor-pointer font-medium">
              Pesquisa executada · {previa.pesquisa.chamadas} chamadas ·{" "}
              {previa.pesquisa.fontes.length} fontes
            </summary>
            <p className="mt-2 text-xs text-muted-foreground">
              Links retornados pela ferramenta de pesquisa. Confira o conteúdo antes de aprovar uma
              equivalência. As fontes ficam disponíveis nesta prévia; ao salvar, somente os termos
              selecionados entram no dicionário.
            </p>
            <ul className="mt-2 space-y-2">
              {previa.pesquisa.fontes.map((fonte) => (
                <li key={fonte.url}>
                  <a
                    href={fonte.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary underline"
                  >
                    {fonte.titulo || new URL(fonte.url).hostname}
                  </a>
                </li>
              ))}
            </ul>
          </details>
          {!!previa.duvidas.length && (
            <div className="rounded-md border p-3 text-sm">
              <p className="font-medium">Expressões que precisam de esclarecimento</p>
              <ul className="list-disc pl-4">
                {previa.duvidas.map((d, i) => (
                  <li key={i}>{d}</li>
                ))}
              </ul>
            </div>
          )}
          <Button
            type="button"
            size="sm"
            disabled={somenteLeitura || !selecionadas.length}
            onClick={() => {
              try {
                onChange(juntarVariacoes(contexto.aliases, selecionadas));
                setPrevia(null);
                setSelecionadas([]);
                setErro("");
              } catch (e) {
                setErro(e instanceof Error ? e.message : "Revise a seleção.");
              }
            }}
          >
            Adicionar selecionadas ao formulário ({selecionadas.length})
          </Button>
        </div>
      )}
      <p className="text-xs text-muted-foreground">
        As sugestões não são salvas automaticamente. O uso pela Maria depende da ativação da
        consulta por esta base, ainda pendente.
      </p>
    </section>
  );
}
