/**
 * Tabela de Valores — consulta de balcão, SÓ LEITURA.
 *
 * Serve para a atendente responder "quanto custa?" sem simular agendamento
 * nem abrir ordem de serviço. Por isso não existe aqui nenhum botão de
 * edição, exclusão ou lançamento: quem precisa mudar preço usa o Catálogo de
 * Serviços (Cadastros › Serviços), que é outra permissão.
 *
 * O mesmo componente é usado na tela cheia (/app/tabela-valores) e na gaveta
 * que abre por cima da Agenda e da Recepção — daí ele receber a altura por
 * fora em vez de fixar a própria.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { Search, Clock, Stethoscope, Info, X, AlertTriangle } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useClinica } from "@/hooks/use-clinica";
import { mostrarErro } from "@/lib/traduzir-erro";
import {
  getTabelaValores,
  EVENTO_REFS_INVALIDADAS,
  type TabelaValoresDados,
} from "@/lib/agenda/refs-cache";
import {
  calcularConvenio,
  calcularParticular,
  casaBusca,
  formatarReal,
  normalizar,
  type LinhaValor,
  type ServicoTabela,
} from "@/lib/tabela-valores/calcular";

/** Valor especial do filtro: sem convênio, preço cheio. */
const PARTICULAR = "__particular__";

/**
 * Teto de linhas desenhadas de uma vez. O catálogo passa de mil serviços e
 * desenhar tudo trava o balcão no primeiro caractere digitado; quem busca um
 * preço específico nunca precisa rolar mil linhas.
 */
const MAX_LINHAS = 80;

const rotuloTipo = (t: string) => {
  const n = normalizar(t);
  if (n === "consulta") return "Consultas";
  if (n === "exame") return "Exames";
  if (n === "procedimento") return "Procedimentos";
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : "Outros";
};

interface LinhaCalculada {
  servico: ServicoTabela;
  valor: LinhaValor;
  particular: LinhaValor;
  /** Outro serviço ativo tem o mesmo nome com preço diferente. */
  nomeRepetido: boolean;
}

export function TabelaValoresPainel({ className = "" }: { className?: string }) {
  const { clinicaAtual } = useClinica();
  const [dados, setDados] = useState<TabelaValoresDados | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [busca, setBusca] = useState("");
  const [convenioId, setConvenioId] = useState<string>(PARTICULAR);
  const [tipo, setTipo] = useState<string>("__todos__");
  const [aberto, setAberto] = useState<string | null>(null);
  const campoBusca = useRef<HTMLInputElement>(null);

  const clinicaId = clinicaAtual?.clinica_id;

  useEffect(() => {
    if (!clinicaId) return;
    let cancelado = false;
    const carregar = () => {
      setCarregando(true);
      getTabelaValores(clinicaId)
        .then((d) => {
          if (!cancelado) setDados(d);
        })
        .catch((e) => {
          if (!cancelado) mostrarErro(e);
        })
        .finally(() => {
          if (!cancelado) setCarregando(false);
        });
    };
    carregar();
    // Salvar um serviço no Catálogo limpa o cache e avisa por evento; a tela
    // aberta no balcão passa a mostrar o preço novo sem precisar recarregar.
    const onInvalidado = () => carregar();
    window.addEventListener(EVENTO_REFS_INVALIDADAS, onInvalidado);
    return () => {
      cancelado = true;
      window.removeEventListener(EVENTO_REFS_INVALIDADAS, onInvalidado);
    };
  }, [clinicaId]);

  useEffect(() => {
    campoBusca.current?.focus();
  }, []);

  const tipos = useMemo(() => {
    const set = new Set<string>();
    for (const s of dados?.servicos ?? []) if (s.tipo) set.add(s.tipo);
    return Array.from(set).sort();
  }, [dados]);

  /** Nomes que aparecem em mais de um cadastro ativo — risco de ler o preço errado. */
  const nomesRepetidos = useMemo(() => {
    const contagem = new Map<string, number>();
    for (const s of dados?.servicos ?? []) {
      const k = normalizar(s.nome);
      contagem.set(k, (contagem.get(k) ?? 0) + 1);
    }
    return new Set(
      Array.from(contagem)
        .filter(([, n]) => n > 1)
        .map(([k]) => k),
    );
  }, [dados]);

  const linhas = useMemo<LinhaCalculada[]>(() => {
    if (!dados) return [];
    const regras = convenioId === PARTICULAR ? [] : (dados.regrasPorConvenio[convenioId] ?? []);
    const resultado: LinhaCalculada[] = [];
    for (const servico of dados.servicos) {
      if (tipo !== "__todos__" && servico.tipo !== tipo) continue;
      if (!casaBusca(busca, [servico.nome, servico.codigo, servico.grupo])) continue;
      const particular = calcularParticular(servico);
      const valor =
        convenioId === PARTICULAR
          ? particular
          : calcularConvenio({
              servico,
              regras,
              especialidadesDoServico: dados.especialidadesPorServico[servico.id] ?? [],
              valorManual: dados.valoresManuais[`${servico.id}::${convenioId}`] ?? null,
            });
      resultado.push({
        servico,
        valor,
        particular,
        nomeRepetido: nomesRepetidos.has(normalizar(servico.nome)),
      });
    }
    return resultado;
  }, [dados, busca, convenioId, tipo, nomesRepetidos]);

  const visiveis = linhas.slice(0, MAX_LINHAS);
  const convenioNome =
    convenioId === PARTICULAR
      ? "Particular"
      : (dados?.convenios.find((c) => c.id === convenioId)?.nome ?? "Convênio");

  return (
    <div className={`flex flex-col min-h-0 ${className}`}>
      {/* Filtros — ficam fixos no topo para a atendente trocar de convênio
          sem perder a lista de vista. */}
      <div className="shrink-0 space-y-2 pb-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <Input
            ref={campoBusca}
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por nome, código ou grupo (ex.: ultrassom, 0301, cardiologia)…"
            className="pl-9 pr-9 h-11 text-base"
          />
          {busca && (
            <button
              type="button"
              onClick={() => {
                setBusca("");
                campoBusca.current?.focus();
              }}
              className="absolute right-2 top-1/2 -translate-y-1/2 h-7 w-7 rounded-md flex items-center justify-center text-muted-foreground hover:bg-muted"
              aria-label="Limpar busca"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Select value={convenioId} onValueChange={setConvenioId}>
            <SelectTrigger className="h-10 w-auto min-w-[200px] max-w-[320px] font-semibold">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={PARTICULAR}>Particular (sem convênio)</SelectItem>
              {(dados?.convenios ?? []).map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.nome}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={tipo} onValueChange={setTipo}>
            <SelectTrigger className="h-10 w-auto min-w-[150px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__todos__">Todos os tipos</SelectItem>
              {tipos.map((t) => (
                <SelectItem key={t} value={t}>
                  {rotuloTipo(t)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <span className="text-xs text-muted-foreground ml-auto">
            {carregando && !dados
              ? "Carregando…"
              : linhas.length > MAX_LINHAS
                ? `${MAX_LINHAS} de ${linhas.length} — refine a busca`
                : `${linhas.length} serviço(s)`}
          </span>
        </div>
      </div>

      {/* Lista */}
      <div className="flex-1 min-h-0 overflow-y-auto rounded-lg border">
        {carregando && !dados ? (
          <p className="p-6 text-sm text-muted-foreground">Carregando a tabela…</p>
        ) : visiveis.length === 0 ? (
          <p className="p-6 text-sm text-muted-foreground">
            Nenhum serviço encontrado com esse texto.
          </p>
        ) : (
          <ul className="divide-y">
            {visiveis.map((l) => (
              <LinhaServico
                key={l.servico.id}
                linha={l}
                convenioNome={convenioNome}
                mostrandoConvenio={convenioId !== PARTICULAR}
                medicos={dados?.medicosPorServico[l.servico.id] ?? []}
                expandido={aberto === l.servico.id}
                onToggle={() => setAberto((a) => (a === l.servico.id ? null : l.servico.id))}
              />
            ))}
          </ul>
        )}
      </div>

      <p className="shrink-0 pt-2 text-[11px] text-muted-foreground">
        Consulta somente. O valor do convênio depende do contrato do paciente estar ativo e em dia —
        confirme na ficha antes de fechar o atendimento.
      </p>
    </div>
  );
}

function LinhaServico({
  linha,
  convenioNome,
  mostrandoConvenio,
  medicos,
  expandido,
  onToggle,
}: {
  linha: LinhaCalculada;
  convenioNome: string;
  mostrandoConvenio: boolean;
  medicos: string[];
  expandido: boolean;
  onToggle: () => void;
}) {
  const { servico, valor, particular, nomeRepetido } = linha;
  const temDesconto =
    mostrandoConvenio &&
    (valor.dinheiro !== particular.dinheiro || valor.outros !== particular.outros);
  const temDetalhe = !!servico.preparo || medicos.length > 0 || valor.avisos.length > 0;

  return (
    <li className="px-3 py-2.5 hover:bg-muted/40">
      <div className="flex items-start justify-between gap-3">
        <button
          type="button"
          onClick={onToggle}
          className="flex-1 min-w-0 text-left"
          aria-expanded={expandido}
        >
          <div className="font-medium leading-tight break-words">{servico.nome}</div>
          <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
            {servico.codigo && (
              <Badge variant="outline" className="font-mono text-[10px] px-1.5 py-0">
                {servico.codigo}
              </Badge>
            )}
            {servico.grupo && <span>{servico.grupo}</span>}
            {servico.duracao_minutos > 0 && (
              <span className="inline-flex items-center gap-0.5">
                <Clock className="h-3 w-3" />
                {servico.duracao_minutos} min
              </span>
            )}
            {temDetalhe && (
              <span className="inline-flex items-center gap-0.5 text-primary">
                <Info className="h-3 w-3" />
                {expandido ? "menos" : "detalhes"}
              </span>
            )}
          </div>
        </button>

        <div className="shrink-0 text-right">
          {servico.valor_variavel ? (
            <span className="text-sm font-semibold text-amber-600">Valor sob consulta</span>
          ) : valor.gratuito ? (
            <span className="inline-flex items-center rounded-md bg-emerald-100 px-2 py-1 text-sm font-semibold text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-200">
              Gratuito pelo convênio
            </span>
          ) : (
            <div className="flex items-start gap-4">
              <ValorColuna rotulo="Dinheiro" valor={valor.dinheiro} destaque />
              <ValorColuna rotulo="PIX / Cartão" valor={valor.outros} />
            </div>
          )}
          {temDesconto && !valor.gratuito && !servico.valor_variavel && (
            <div className="mt-0.5 text-[10px] text-muted-foreground">
              particular: {formatarReal(particular.dinheiro)} / {formatarReal(particular.outros)}
            </div>
          )}
          {mostrandoConvenio && !temDesconto && !valor.gratuito && (
            <div className="mt-0.5 text-[10px] text-muted-foreground">
              {convenioNome} sem desconto neste serviço
            </div>
          )}
        </div>
      </div>

      {expandido && temDetalhe && (
        <div className="mt-2 space-y-2 rounded-md bg-muted/50 px-3 py-2 text-xs">
          {valor.avisos.map((a, i) => (
            <p key={i} className="flex items-start gap-1.5 text-amber-800 dark:text-amber-200">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
              <span>{a}</span>
            </p>
          ))}
          {medicos.length > 0 && (
            <p className="flex items-start gap-1.5">
              <Stethoscope className="h-3.5 w-3.5 shrink-0 mt-0.5 text-muted-foreground" />
              <span>
                <span className="text-muted-foreground">Realizado por: </span>
                {medicos.join(", ")}
              </span>
            </p>
          )}
          {servico.preparo && (
            <p className="whitespace-pre-wrap">
              <span className="font-semibold">Preparo: </span>
              {servico.preparo}
            </p>
          )}
        </div>
      )}

      {nomeRepetido && (
        <p className="mt-1 text-[10px] text-amber-700 dark:text-amber-300">
          Existe outro cadastro ativo com este mesmo nome — confira o código antes de informar.
        </p>
      )}
    </li>
  );
}

function ValorColuna({
  rotulo,
  valor,
  destaque = false,
}: {
  rotulo: string;
  valor: number;
  destaque?: boolean;
}) {
  return (
    <div className="text-right">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{rotulo}</div>
      <div
        className={`font-semibold tabular-nums ${destaque ? "text-emerald-600 dark:text-emerald-400" : ""}`}
      >
        {formatarReal(valor)}
      </div>
    </div>
  );
}

export { PARTICULAR };
