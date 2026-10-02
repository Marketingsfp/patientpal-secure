import { useEffect, useMemo, useState } from "react";
import { MapPin, MapPinOff, Home, Users, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { HhpKpiCard, HhpKpiRow } from "@/design-system/hhp/kpi-card";
import { zonedDateStringToUtcISO } from "@/lib/date-utils";
import { formatarCpf } from "@/lib/sessoes/busca-ativa-contatos";

/**
 * Aba "Origem" do Painel Executivo: de onde vêm os pacientes atendidos no
 * período escolhido no topo da tela.
 *
 * A conta é toda feita no banco (`painel_origem_pacientes`,
 * supabase/migrations/20261002130000_painel_origem_pacientes.sql) — o
 * navegador só recebe 1.000 linhas por consulta e "Este ano" passa disso.
 * "Atendimento" é a mesma regra do card Compareceram da aba Produção.
 *
 * Paciente sem cidade e sem CEP no cadastro aparece numa fatia própria em vez
 * de ser contado como local ou de fora: chutar a cidade seria inventar dado.
 */

type Periodo = { de: string; ate: string };
type Grupo = "fora" | "sem_endereco";

type Totais = {
  pacientes: number;
  atendimentos: number;
  fora_pacientes: number;
  fora_atendimentos: number;
  local_pacientes: number;
  local_atendimentos: number;
  sem_end_pacientes: number;
  sem_end_atendimentos: number;
};
type LinhaCidade = { cidade: string; pacientes: number; atendimentos: number };
type LinhaBairro = { bairro: string; cidade: string; pacientes: number; atendimentos: number };
type PacienteOrigem = {
  id: string;
  nome: string | null;
  cpf: string | null;
  bairro: string | null;
  cidade: string | null;
  cep: string | null;
  atendimentos: number;
  grupo: Grupo;
};
type Origem = {
  totais: Totais;
  cidades: LinhaCidade[];
  bairros: LinhaBairro[];
  pacientes: PacienteOrigem[];
};

const TOTAIS_VAZIOS: Totais = {
  pacientes: 0,
  atendimentos: 0,
  fora_pacientes: 0,
  fora_atendimentos: 0,
  local_pacientes: 0,
  local_atendimentos: 0,
  sem_end_pacientes: 0,
  sem_end_atendimentos: 0,
};
const VAZIO: Origem = { totais: TOTAIS_VAZIOS, cidades: [], bairros: [], pacientes: [] };

/** Acima disso a lista do modal pede para usar a busca — evita travar a tela. */
const LIMITE_LISTA = 500;

const int = (n: number) => Number(n ?? 0).toLocaleString("pt-BR");
const pct = (parte: number, todo: number) =>
  todo > 0 ? `${((parte / todo) * 100).toFixed(1).replace(".", ",")}%` : "0%";
const formatarCep = (cep: string | null) => {
  const d = (cep ?? "").replace(/\D/g, "");
  return d.length === 8 ? `${d.slice(0, 5)}-${d.slice(5)}` : cep || "—";
};

async function carregarOrigem(clinicaId: string, periodo: Periodo): Promise<Origem> {
  const { data, error } = await supabase.rpc(
    "painel_origem_pacientes" as never,
    {
      p_clinica: clinicaId,
      p_ini: zonedDateStringToUtcISO(periodo.de, "00:00:00"),
      p_fim: zonedDateStringToUtcISO(periodo.ate, "23:59:59"),
    } as never,
  );
  // Se a função ainda não existir no banco, a aba abre zerada em vez de quebrar.
  if (error || !data) return VAZIO;
  const r = data as Partial<Origem>;
  return {
    totais: { ...TOTAIS_VAZIOS, ...(r.totais ?? {}) },
    cidades: r.cidades ?? [],
    bairros: r.bairros ?? [],
    pacientes: r.pacientes ?? [],
  };
}

export function SecaoOrigemPacientes({
  clinicaId,
  periodo,
}: {
  clinicaId: string;
  /** Período escolhido no topo da tela — esta seção não tem filtro próprio. */
  periodo: Periodo;
}) {
  const [dados, setDados] = useState<Origem>(VAZIO);
  const [carregando, setCarregando] = useState(false);
  const [aberto, setAberto] = useState<Grupo | null>(null);

  useEffect(() => {
    let vivo = true;
    setCarregando(true);
    carregarOrigem(clinicaId, periodo)
      .then((d) => vivo && setDados(d))
      .finally(() => vivo && setCarregando(false));
    return () => {
      vivo = false;
    };
  }, [clinicaId, periodo.de, periodo.ate]);

  const t = dados.totais;

  return (
    <div className="space-y-6">
      <HhpKpiRow>
        <HhpKpiCard
          label="Pacientes de fora de São João de Meriti"
          value={carregando ? "…" : int(t.fora_pacientes)}
          icon={MapPin}
          tone="info"
          hint={`${pct(t.fora_pacientes, t.pacientes)} dos ${int(t.pacientes)} pacientes atendidos · clique para ver a lista`}
          onClick={() => setAberto("fora")}
        />
        <HhpKpiCard
          label="Atendimentos de quem é de fora"
          value={carregando ? "…" : int(t.fora_atendimentos)}
          icon={Users}
          tone="info"
          hint={`${pct(t.fora_atendimentos, t.atendimentos)} dos ${int(t.atendimentos)} atendimentos do período`}
          onClick={() => setAberto("fora")}
        />
        <HhpKpiCard
          label="De São João de Meriti"
          value={carregando ? "…" : int(t.local_pacientes)}
          icon={Home}
          tone="ok"
          hint={`${pct(t.local_pacientes, t.pacientes)} dos pacientes · ${int(t.local_atendimentos)} atendimentos`}
        />
        <HhpKpiCard
          label="Sem endereço no cadastro"
          value={carregando ? "…" : int(t.sem_end_pacientes)}
          icon={MapPinOff}
          tone="warn"
          hint={`${pct(t.sem_end_pacientes, t.pacientes)} dos pacientes · clique para ver quem atualizar`}
          onClick={() => setAberto("sem_endereco")}
        />
      </HhpKpiRow>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Ranking
          titulo="Cidades de origem (fora de São João de Meriti)"
          linhas={dados.cidades.map((c) => ({
            nome: c.cidade,
            valor: c.atendimentos,
            extra: `${int(c.pacientes)} pac.`,
          }))}
        />
        <Ranking
          titulo="Bairros mais frequentes (fora de São João de Meriti)"
          linhas={dados.bairros.map((b) => ({
            nome: `${b.bairro} — ${b.cidade}`,
            valor: b.atendimentos,
            extra: `${int(b.pacientes)} pac.`,
          }))}
        />
      </div>
      <p className="text-xs text-muted-foreground">
        Os rankings mostram o número de atendimentos. A cidade vem do cadastro do paciente; quando
        ela está em branco, o sistema usa o CEP.
      </p>

      <ModalPacientes grupo={aberto} pacientes={dados.pacientes} onClose={() => setAberto(null)} />
    </div>
  );
}

function Ranking({
  titulo,
  linhas,
}: {
  titulo: string;
  linhas: { nome: string; valor: number; extra?: string }[];
}) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm">{titulo}</CardTitle>
      </CardHeader>
      <CardContent>
        {linhas.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">Sem dados no período.</p>
        ) : (
          <div className="divide-y max-h-[420px] overflow-y-auto">
            {linhas.map((r, i) => (
              <div
                key={`${r.nome}-${i}`}
                className="flex items-center justify-between py-2 text-sm"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span className="w-6 text-xs text-muted-foreground tabular-nums">{i + 1}</span>
                  <span className="truncate">{r.nome}</span>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  {r.extra && <span className="text-xs text-muted-foreground">{r.extra}</span>}
                  <span className="font-semibold tabular-nums">{int(r.valor)}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ModalPacientes({
  grupo,
  pacientes,
  onClose,
}: {
  grupo: Grupo | null;
  pacientes: PacienteOrigem[];
  onClose: () => void;
}) {
  const [busca, setBusca] = useState("");

  useEffect(() => {
    if (grupo) setBusca("");
  }, [grupo]);

  const doGrupo = useMemo(() => pacientes.filter((p) => p.grupo === grupo), [pacientes, grupo]);

  const filtrados = useMemo(() => {
    const termo = busca.trim().toUpperCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
    if (!termo) return doGrupo;
    const soDigitos = termo.replace(/\D/g, "");
    return doGrupo.filter((p) => {
      const texto = `${p.nome ?? ""} ${p.bairro ?? ""} ${p.cidade ?? ""}`
        .toUpperCase()
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "");
      if (texto.includes(termo)) return true;
      return (
        soDigitos.length >= 3 &&
        `${p.cpf ?? ""} ${p.cep ?? ""}`.replace(/\D/g, " ").replace(/\s+/g, " ").includes(soDigitos)
      );
    });
  }, [doGrupo, busca]);

  const visiveis = filtrados.slice(0, LIMITE_LISTA);
  const semEndereco = grupo === "sem_endereco";

  return (
    <Dialog open={grupo !== null} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-5xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {semEndereco ? <MapPinOff className="h-4 w-4" /> : <MapPin className="h-4 w-4" />}
            {semEndereco
              ? "Pacientes sem endereço no cadastro"
              : "Pacientes de fora de São João de Meriti"}
          </DialogTitle>
          <DialogDescription>
            {semEndereco
              ? "Não é um erro do sistema: esses cadastros estão sem cidade e sem CEP, por isso não entram em nenhuma cidade. Na próxima vinda, a recepção pode completar o endereço."
              : `${int(doGrupo.length)} pacientes atendidos no período escolhido no topo da tela.`}
          </DialogDescription>
        </DialogHeader>

        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por nome, CPF, bairro, cidade ou CEP"
            className="pl-8"
          />
        </div>

        <div className="max-h-[60vh] overflow-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>CPF</TableHead>
                <TableHead>Bairro / Cidade</TableHead>
                <TableHead>CEP</TableHead>
                <TableHead className="text-right">Atendimentos</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visiveis.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="py-6 text-center text-muted-foreground">
                    Nenhum paciente encontrado.
                  </TableCell>
                </TableRow>
              ) : (
                visiveis.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="font-medium">{p.nome ?? "—"}</TableCell>
                    <TableCell className="tabular-nums whitespace-nowrap">
                      {p.cpf ? formatarCpf(p.cpf) : "—"}
                    </TableCell>
                    <TableCell>{[p.bairro, p.cidade].filter(Boolean).join(" / ") || "—"}</TableCell>
                    <TableCell className="tabular-nums whitespace-nowrap">
                      {formatarCep(p.cep)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums font-semibold">
                      {int(p.atendimentos)}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
        {filtrados.length > LIMITE_LISTA && (
          <p className="text-xs text-muted-foreground">
            Mostrando os {int(LIMITE_LISTA)} com mais atendimentos de {int(filtrados.length)}. Use a
            busca para achar os demais.
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}
