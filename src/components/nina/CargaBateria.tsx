/** Bateria por profissional: a Luna conversa como paciente com cada médico escolhido. */
import { useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { ListChecks, Loader2, Play, RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { mostrarErro } from "@/lib/traduzir-erro";
import { LIMITES_BATERIA } from "@/lib/nina/carga-bateria";
import { previsualizarBateriaCarga } from "@/lib/nina/carga.functions";
import {
  cenariosDaSelecao,
  proximoLoteBateria,
  type ProfissionalBateriaUI,
} from "./carga-teste-ui";

export type SelecaoBateria = {
  profissionalIds: string[];
  variacoesPorConsulta: number;
  turnos: number;
  simultaneas: number;
};

const limitar = (v: number, min: number, max: number) =>
  Math.min(max, Math.max(min, Number.isFinite(v) ? Math.trunc(v) : min));

export function CargaBateria({
  clinicaId,
  disabled,
  disparando,
  onDisparar,
}: {
  clinicaId: string;
  disabled: boolean;
  disparando: boolean;
  onDisparar: (selecao: SelecaoBateria, cenarios: number) => void;
}) {
  const previsualizar = useServerFn(previsualizarBateriaCarga);
  const [profissionais, setProfissionais] = useState<ProfissionalBateriaUI[] | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [selecionados, setSelecionados] = useState<Set<string>>(() => new Set());
  const [variacoes, setVariacoes] = useState(1);
  const [turnos, setTurnos] = useState<number>(LIMITES_BATERIA.turnosPadrao);
  const [simultaneas, setSimultaneas] = useState<number>(LIMITES_BATERIA.simultaneasPadrao);
  const [filtro, setFiltro] = useState("");

  const carregar = async () => {
    setCarregando(true);
    try {
      const r = await previsualizar({ data: { clinicaId } });
      const lista = r.profissionais as ProfissionalBateriaUI[];
      setProfissionais(lista);
      setSelecionados(
        (atual) => new Set([...atual].filter((id) => lista.some((p) => p.id === id))),
      );
    } catch (e) {
      mostrarErro(e);
    } finally {
      setCarregando(false);
    }
  };
  const cenarios = profissionais ? cenariosDaSelecao(profissionais, selecionados, variacoes) : 0;
  const excede = cenarios > LIMITES_BATERIA.cenariosMax;
  const visiveis = useMemo(() => {
    const termo = filtro.trim().toLowerCase();
    return (profissionais ?? []).filter(
      (p) =>
        !termo ||
        p.nome.toLowerCase().includes(termo) ||
        p.consultas.some((c) =>
          `${c.consulta} ${c.especialidade ?? ""}`.toLowerCase().includes(termo),
        ),
    );
  }, [profissionais, filtro]);
  const alternar = (id: string) =>
    setSelecionados((atual) => {
      const novo = new Set(atual);
      if (novo.has(id)) novo.delete(id);
      else novo.add(id);
      return novo;
    });

  return (
    <div className="space-y-4">
      <div className="space-y-2 rounded-lg border bg-muted/30 p-3 text-sm">
        <p className="font-medium">Como funciona</p>
        <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
          <li>
            A Luna faz o papel do paciente: cumprimenta, diz a necessidade sem citar o médico,
            escolhe o profissional e um horário que a Nina oferecer e confirma, respondendo ao que a
            Nina disser.
          </li>
          <li>
            Cada consulta publicada do médico escolhido vira um cenário, em um lead próprio. No
            máximo {LIMITES_BATERIA.cenariosMax} cenários por disparo; os leads só são reiniciados
            no início, como em toda carga.
          </li>
          <li>
            A Nina agenda de verdade na agenda real (marcado como [TESTE NINA]). No fim de cada
            cenário o sistema confere o resultado e devolve a vaga como DISPONÍVEL.
          </li>
          <li>A primeira mensagem de cada lead espera 15 segundos depois do reinício.</li>
        </ul>
      </div>
      <Button variant="secondary" disabled={disabled || carregando} onClick={() => void carregar()}>
        {carregando ? (
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        ) : (
          <RefreshCw className="mr-2 h-4 w-4" />
        )}
        {profissionais ? "Atualizar profissionais" : "Carregar profissionais publicados"}
      </Button>
      {profissionais && (
        <fieldset disabled={disabled} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="bateria-variacoes">Perfis de paciente por consulta</Label>
              <Input
                id="bateria-variacoes"
                type="number"
                min={1}
                max={LIMITES_BATERIA.variacoesPorConsulta}
                value={variacoes}
                onChange={(e) =>
                  setVariacoes(
                    limitar(Number(e.target.value), 1, LIMITES_BATERIA.variacoesPorConsulta),
                  )
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="bateria-turnos">Mensagens do paciente por cenário (máximo)</Label>
              <Input
                id="bateria-turnos"
                type="number"
                min={LIMITES_BATERIA.turnosMin}
                max={LIMITES_BATERIA.turnosMax}
                value={turnos}
                onChange={(e) =>
                  setTurnos(
                    limitar(
                      Number(e.target.value),
                      LIMITES_BATERIA.turnosMin,
                      LIMITES_BATERIA.turnosMax,
                    ),
                  )
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="bateria-simultaneas">Conversas ao mesmo tempo</Label>
              <Input
                id="bateria-simultaneas"
                type="number"
                min={1}
                max={LIMITES_BATERIA.cenariosMax}
                value={simultaneas}
                onChange={(e) =>
                  setSimultaneas(limitar(Number(e.target.value), 1, LIMITES_BATERIA.cenariosMax))
                }
              />
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Input
              className="max-w-xs"
              placeholder="Filtrar por nome ou especialidade"
              value={filtro}
              onChange={(e) => setFiltro(e.target.value)}
            />
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                setSelecionados(
                  new Set(
                    proximoLoteBateria(profissionais, variacoes, LIMITES_BATERIA.cenariosMax),
                  ),
                )
              }
            >
              <ListChecks className="mr-2 h-4 w-4" /> Próximo lote não testado
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setSelecionados(new Set())}>
              Limpar seleção
            </Button>
          </div>
          <div className="max-h-[28rem] divide-y overflow-y-auto rounded-lg border">
            {visiveis.map((p) => (
              <label
                key={p.id}
                className="flex cursor-pointer items-start gap-3 px-3 py-2 text-sm hover:bg-muted/50"
              >
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={selecionados.has(p.id)}
                  onChange={() => alternar(p.id)}
                />
                <span className="min-w-0 flex-1 space-y-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{p.nome}</span>
                    {!p.vinculadoAgenda && <Badge variant="outline">Sem agenda vinculada</Badge>}
                    {p.vinculadoAgenda && (
                      <Badge variant="outline">
                        {p.vagas == null ? "vagas não conferidas" : `${p.vagas} vaga(s) em 60 dias`}
                      </Badge>
                    )}
                    {p.ultimoTeste && (
                      <Badge variant="secondary">
                        Testado em {new Date(p.ultimoTeste.em).toLocaleDateString("pt-BR")}:{" "}
                        {p.ultimoTeste.resultado}
                      </Badge>
                    )}
                  </span>
                  {p.consultas.map((c) => (
                    <span key={c.consulta} className="block text-xs text-muted-foreground">
                      {c.consulta} · {c.modalidade}
                      {c.dinheiro ? ` · Dinheiro ${c.dinheiro}` : ""}
                      {c.pixCartao ? ` · Pix/cartão ${c.pixCartao}` : ""} · Esperado:{" "}
                      {c.esperadoRotulo}
                    </span>
                  ))}
                </span>
              </label>
            ))}
            {!visiveis.length && (
              <p className="px-3 py-4 text-sm text-muted-foreground">
                Nenhum profissional publicado com consulta encontrado.
              </p>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button
              disabled={disabled || disparando || !cenarios || excede}
              onClick={() =>
                onDisparar(
                  {
                    profissionalIds: [...selecionados],
                    variacoesPorConsulta: variacoes,
                    turnos,
                    simultaneas,
                  },
                  cenarios,
                )
              }
            >
              {disparando ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Play className="mr-2 h-4 w-4" />
              )}
              Disparar bateria
            </Button>
            <span className={excede ? "text-sm text-destructive" : "text-xs text-muted-foreground"}>
              {cenarios} de {LIMITES_BATERIA.cenariosMax} cenários · até {cenarios * turnos}{" "}
              mensagens do paciente · {Math.min(simultaneas, Math.max(cenarios, 1))} ao mesmo tempo
              {excede ? " — reduza a seleção ou os perfis por consulta" : ""}
            </span>
          </div>
        </fieldset>
      )}
    </div>
  );
}
