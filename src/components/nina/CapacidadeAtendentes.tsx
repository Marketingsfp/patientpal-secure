import { useCallback, useEffect, useId, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, RefreshCw, Users } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  configurarCapacidadeAtendente,
  listarCapacidadesAtendentes,
} from "@/lib/atendimento.functions";
import type { ResultadoDistribuicaoFila } from "@/lib/atendimento/distribuicao-contrato";
import {
  mensagemDistribuicaoFila,
  textoCargaAtendente,
  textoMotivoDistribuicao,
  validarLimiteAtendente,
} from "./distribuicao-fila-ui";

type Atendente = {
  userId: string;
  nome: string;
  estado: string | null;
  cargaAtual: number;
  capacidade: number | null;
  motivo: string | null;
};

function EditorLimite({
  atendente,
  desabilitado,
  salvando,
  onSalvar,
}: {
  atendente: Atendente;
  desabilitado: boolean;
  salvando: boolean;
  onSalvar: (userId: string, capacidade: number | null) => Promise<void>;
}) {
  const id = useId();
  const [modo, setModo] = useState<"sem_limite" | "limitado">(
    atendente.capacidade === null ? "sem_limite" : "limitado",
  );
  const [valor, setValor] = useState(atendente.capacidade?.toString() ?? "");
  const [erro, setErro] = useState<string | null>(null);
  const motivo = textoMotivoDistribuicao(atendente.motivo);
  const estado =
    atendente.estado === "ONLINE"
      ? "Online"
      : atendente.estado === "PAUSA"
        ? "Em pausa"
        : atendente.estado === "OFFLINE"
          ? "Offline"
          : "Sem escolha de disponibilidade";

  return (
    <form
      className="space-y-3 rounded-lg border p-3"
      aria-label={`Limite de ${atendente.nome}`}
      onSubmit={(e) => {
        e.preventDefault();
        const validacao = validarLimiteAtendente(modo, valor);
        if (!validacao.ok) {
          setErro(validacao.erro);
          return;
        }
        setErro(null);
        void onSalvar(atendente.userId, validacao.capacidade);
      }}
    >
      <div>
        <p className="text-sm font-medium">{atendente.nome}</p>
        <p className="text-xs text-muted-foreground">
          {estado} · {textoCargaAtendente(atendente.cargaAtual, atendente.capacidade)}
        </p>
        {motivo && (
          <p className="text-xs text-muted-foreground">
            {motivo
              .replace(/^Seu perfil/, "O perfil")
              .replace(/^Você está/, "Atendente está")
              .replace(/^Escolha sua disponibilidade/, "Aguardando escolha de disponibilidade")}
          </p>
        )}
      </div>
      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-40 flex-1 space-y-1">
          <Label htmlFor={`${id}-modo`}>Recebimento de conversas</Label>
          <Select
            value={modo}
            disabled={desabilitado}
            onValueChange={(v: "sem_limite" | "limitado") => {
              setModo(v);
              setErro(null);
            }}
          >
            <SelectTrigger id={`${id}-modo`}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="sem_limite">Sem limite</SelectItem>
              <SelectItem value="limitado">Definir limite</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {modo === "limitado" && (
          <div className="w-36 space-y-1">
            <Label htmlFor={`${id}-valor`}>Máximo de ativas</Label>
            <Input
              id={`${id}-valor`}
              type="number"
              min={1}
              max={1000}
              step={1}
              required
              inputMode="numeric"
              value={valor}
              disabled={desabilitado}
              aria-invalid={!!erro}
              aria-describedby={erro ? `${id}-erro` : undefined}
              onChange={(e) => {
                setValor(e.target.value);
                setErro(null);
              }}
            />
          </div>
        )}
        <Button
          type="submit"
          size="sm"
          disabled={desabilitado}
          aria-label={`Salvar limite de ${atendente.nome}`}
        >
          {salvando && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
          Salvar limite
        </Button>
      </div>
      {erro && (
        <p id={`${id}-erro`} role="alert" className="text-xs text-destructive">
          {erro}
        </p>
      )}
    </form>
  );
}

/** A permissão do servidor controla tanto a abertura quanto a gravação. */
export function CapacidadeAtendentes({
  clinicaId,
  onAlterada,
}: {
  clinicaId: string;
  onAlterada: (r: ResultadoDistribuicaoFila) => void;
}) {
  const listar = useServerFn(listarCapacidadesAtendentes);
  const configurar = useServerFn(configurarCapacidadeAtendente);
  const [aberto, setAberto] = useState(false);
  const [dados, setDados] = useState<{ podeConfigurar: boolean; atendentes: Atendente[] } | null>(
    null,
  );
  const [carregando, setCarregando] = useState(false);
  const [salvando, setSalvando] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [confirmacao, setConfirmacao] = useState<string | null>(null);
  const seq = useRef(0);
  const montado = useRef(true);

  const carregar = useCallback(async () => {
    const pedido = ++seq.current;
    setCarregando(true);
    setErro(null);
    try {
      const r = await listar({ data: { clinicaId } });
      if (pedido !== seq.current) return;
      setDados(r);
    } catch {
      if (pedido === seq.current) setErro("Não foi possível consultar os limites da equipe.");
    } finally {
      if (pedido === seq.current) setCarregando(false);
    }
  }, [clinicaId, listar]);

  useEffect(() => {
    montado.current = true;
    void carregar();
    return () => {
      montado.current = false;
      seq.current += 1;
    };
  }, [carregar]);

  const salvar = async (userId: string, capacidade: number | null) => {
    if (!dados?.podeConfigurar || salvando) return;
    setSalvando(userId);
    setErro(null);
    setConfirmacao(null);
    try {
      const r = await configurar({ data: { clinicaId, userId, capacidade } });
      if (!montado.current) return;
      // O snapshot "meu" é do gestor autenticado, não do atendente editado.
      const aviso = mensagemDistribuicaoFila({ ...r, meu: null });
      const nome = dados.atendentes.find((a) => a.userId === userId)?.nome ?? "atendente";
      const texto = `Limite salvo para ${nome}. ${aviso.texto}`;
      setConfirmacao(texto);
      if (aviso.tom === "erro") toast.error(texto);
      else if (aviso.tom === "aviso") toast.warning(texto);
      else toast.success(texto);
      onAlterada(r);
      await carregar();
    } catch {
      if (montado.current)
        setErro(
          "Não foi possível confirmar o limite. Atualize a consulta antes de tentar novamente.",
        );
    } finally {
      if (montado.current) setSalvando(null);
    }
  };

  // Sem autorização confirmada, a ação de gestão não é oferecida.
  if (!dados?.podeConfigurar) {
    return erro ? (
      <div className="text-[11px]">
        <p role="alert" className="text-destructive">
          {erro}
        </p>
        <Button variant="ghost" size="sm" disabled={carregando} onClick={() => void carregar()}>
          Consultar limites da equipe
        </Button>
      </div>
    ) : null;
  }

  return (
    <Dialog
      open={aberto}
      onOpenChange={(v) => {
        setAberto(v);
        if (v) {
          setConfirmacao(null);
          void carregar();
        }
      }}
    >
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="h-7 justify-start px-1 text-[11px]">
          <Users className="mr-1.5 h-3.5 w-3.5" />
          Limites da equipe
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Limites de conversas da equipe</DialogTitle>
          <DialogDescription>
            O padrão é sem limite. Você pode definir um máximo de conversas ativas por atendente.
            Salvar reavalia as conversas aguardando distribuição; as já atribuídas continuam com
            seus responsáveis.
          </DialogDescription>
        </DialogHeader>
        <div className="flex justify-end">
          <Button
            variant="outline"
            size="sm"
            disabled={carregando || !!salvando}
            onClick={() => void carregar()}
          >
            <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${carregando ? "animate-spin" : ""}`} />
            Atualizar consulta
          </Button>
        </div>
        {erro && (
          <p role="alert" className="text-sm text-destructive">
            {erro}
          </p>
        )}
        {confirmacao && (
          <p role="status" className="text-sm">
            {confirmacao}
          </p>
        )}
        <div className="space-y-3" aria-busy={carregando}>
          {dados.atendentes.map((atendente) => (
            <EditorLimite
              key={`${atendente.userId}:${atendente.capacidade ?? "sem_limite"}`}
              atendente={atendente}
              desabilitado={carregando || !!salvando}
              salvando={salvando === atendente.userId}
              onSalvar={salvar}
            />
          ))}
          {!carregando && dados.atendentes.length === 0 && (
            <p className="text-sm text-muted-foreground">
              Nenhum atendente disponível para configurar.
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
