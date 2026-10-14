import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  listarEspecialidadesSite,
  listarMedicosSite,
  listarSiteAgendamento,
  salvarEspecialidadeSite,
  salvarMedicoSite,
  salvarSiteAgendamento,
} from "@/lib/integracoes/site-agendamento.functions";

export const Route = createFileRoute("/_authenticated/app/configuracoes/site-agendamento")({
  component: Pagina,
  head: () => ({ meta: [{ title: "Agendamento pelo site — ClinicaOS" }] }),
});

type Linha = Awaited<ReturnType<typeof listarSiteAgendamento>>[number];

function Pagina() {
  const listar = useServerFn(listarSiteAgendamento);
  const { data, isLoading, error } = useQuery({
    queryKey: ["site-agendamento"],
    queryFn: () => listar(),
  });
  return (
    <div className="space-y-4 p-6">
      <div>
        <h1 className="text-2xl font-semibold">Agendamento pelo site</h1>
        <p className="text-sm text-muted-foreground">
          Controla o formulário de agendamento do site institucional. Desligado, o site passa a
          mostrar que o agendamento está indisponível. Não afeta agendamentos já existentes nem a
          agenda da recepção.
        </p>
      </div>
      {isLoading && <p className="text-sm text-muted-foreground">Carregando…</p>}
      {error && <p className="text-sm text-destructive">Não foi possível carregar.</p>}
      {data && data.length === 0 && (
        <p className="text-sm text-muted-foreground">
          Somente administradores da clínica podem alterar esta configuração.
        </p>
      )}
      {data?.map((l) => <CartaoClinica key={l.clinicaId} linha={l} />)}
    </div>
  );
}

function CartaoClinica({ linha }: { linha: Linha }) {
  const salvar = useServerFn(salvarSiteAgendamento);
  const qc = useQueryClient();
  const [ativo, setAtivo] = useState(linha.ativo);
  const [motivo, setMotivo] = useState(linha.motivo);
  const [dias, setDias] = useState(String(linha.diasAntecedencia));
  const [salvando, setSalvando] = useState(false);
  useEffect(() => {
    setAtivo(linha.ativo);
    setMotivo(linha.motivo);
    setDias(String(linha.diasAntecedencia));
  }, [linha.ativo, linha.motivo, linha.diasAntecedencia]);

  const diasNum = Number(dias);
  const diasValido = Number.isInteger(diasNum) && diasNum >= 1 && diasNum <= 60;
  const alterado =
    ativo !== linha.ativo || motivo !== linha.motivo || diasNum !== linha.diasAntecedencia;

  async function onSalvar() {
    setSalvando(true);
    try {
      await salvar({
        data: { clinicaId: linha.clinicaId, ativo, motivo, diasAntecedencia: diasNum },
      });
      toast.success("Configuração salva.");
      await qc.invalidateQueries({ queryKey: ["site-agendamento"] });
    } catch (e) {
      toast.error((e as Error).message || "Não foi possível salvar.");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-4">
        <CardTitle className="text-base">{linha.nome}</CardTitle>
        <div className="flex items-center gap-3">
          <Badge variant={ativo ? "default" : "secondary"}>{ativo ? "Ligado" : "Desligado"}</Badge>
          <Switch checked={ativo} onCheckedChange={setAtivo} aria-label="Ligar ou desligar" />
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <Textarea
          value={motivo}
          onChange={(e) => setMotivo(e.target.value)}
          placeholder="Motivo (opcional)"
          maxLength={500}
        />
        <div className="flex flex-wrap items-center gap-3">
          <label className="text-sm font-medium" htmlFor={`dias-${linha.clinicaId}`}>
            Dias de antecedência
          </label>
          <Input
            id={`dias-${linha.clinicaId}`}
            type="number"
            min={1}
            max={60}
            value={dias}
            onChange={(e) => setDias(e.target.value)}
            className="w-24"
          />
          <span className="text-sm text-muted-foreground">
            {diasValido
              ? `O site oferece horários até ${diasNum} dias à frente.`
              : "Informe um número de 1 a 60."}
          </span>
        </div>
        <div className="flex items-center justify-between gap-4">
          <p className="text-xs text-muted-foreground">
            {linha.atualizadoEm
              ? `Última alteração: ${new Date(linha.atualizadoEm).toLocaleString("pt-BR", {
                  timeZone: "America/Sao_Paulo",
                })}${linha.atualizadoPor ? ` por ${linha.atualizadoPor}` : ""}`
              : "Nunca alterado (ligado por padrão)."}
          </p>
          <Button onClick={onSalvar} disabled={!alterado || salvando || !diasValido}>
            {salvando ? "Salvando…" : "Salvar"}
          </Button>
        </div>
        <Especialidades clinicaId={linha.clinicaId} />
        <Medicos clinicaId={linha.clinicaId} />
      </CardContent>
    </Card>
  );
}

function Especialidades({ clinicaId }: { clinicaId: string }) {
  const listar = useServerFn(listarEspecialidadesSite);
  const salvar = useServerFn(salvarEspecialidadeSite);
  const qc = useQueryClient();
  const chave = ["site-agendamento-esp", clinicaId];
  const { data, isLoading, error } = useQuery({
    queryKey: chave,
    queryFn: () => listar({ data: { clinicaId } }),
  });
  const [busca, setBusca] = useState("");
  const [gravando, setGravando] = useState<string | null>(null);
  const termo = busca.trim().toLowerCase();
  const lista = (data ?? []).filter((e) => e.nome.toLowerCase().includes(termo));

  async function alternar(id: string, ativo: boolean) {
    setGravando(id);
    try {
      await salvar({ data: { clinicaId, especialidadeId: id, ativo } });
      await qc.invalidateQueries({ queryKey: chave });
    } catch (e) {
      toast.error((e as Error).message || "Não foi possível salvar.");
    } finally {
      setGravando(null);
    }
  }

  return (
    <section className="space-y-2 border-t pt-3">
      <h3 className="text-sm font-semibold">Especialidades no site</h3>
      <Input placeholder="Buscar especialidade" value={busca} onChange={(e) => setBusca(e.target.value)} />
      {isLoading && <p className="text-sm text-muted-foreground">Carregando…</p>}
      {error && <p className="text-sm text-destructive">Não foi possível carregar.</p>}
      <ul className="max-h-72 divide-y overflow-y-auto rounded border">
        {lista.map((e) => (
          <li key={e.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
            {e.oferecidaUnidade ? (
              <>
                <span>{e.nome}</span>
                <Switch
                  checked={e.ativoSite}
                  disabled={gravando === e.id}
                  onCheckedChange={(v) => alternar(e.id, v)}
                  aria-label={`Oferecer ${e.nome} no site`}
                />
              </>
            ) : (
              <>
                <span className="text-muted-foreground">{e.nome}</span>
                <span className="text-xs text-muted-foreground">não oferecida pela unidade</span>
              </>
            )}
          </li>
        ))}
        {data && lista.length === 0 && (
          <li className="px-3 py-2 text-sm text-muted-foreground">Nenhuma especialidade.</li>
        )}
      </ul>
    </section>
  );
}

const POR_PAGINA = 20;

function Medicos({ clinicaId }: { clinicaId: string }) {
  const listar = useServerFn(listarMedicosSite);
  const listarEsp = useServerFn(listarEspecialidadesSite);
  const salvar = useServerFn(salvarMedicoSite);
  const qc = useQueryClient();
  const chave = ["site-agendamento-med", clinicaId];
  const { data, isLoading, error } = useQuery({
    queryKey: chave,
    queryFn: () => listar({ data: { clinicaId } }),
  });
  const { data: esps } = useQuery({
    queryKey: ["site-agendamento-esp", clinicaId],
    queryFn: () => listarEsp({ data: { clinicaId } }),
  });
  const [busca, setBusca] = useState("");
  const [esp, setEsp] = useState("");
  const [pagina, setPagina] = useState(0);
  const [gravando, setGravando] = useState<string | null>(null);
  useEffect(() => setPagina(0), [busca, esp]);

  const termo = busca.trim().toLowerCase();
  const filtrados = (data ?? []).filter(
    (m) => m.nome.toLowerCase().includes(termo) && (!esp || m.especialidades.includes(esp)),
  );
  const paginas = Math.max(1, Math.ceil(filtrados.length / POR_PAGINA));
  const pag = filtrados.slice(pagina * POR_PAGINA, (pagina + 1) * POR_PAGINA);
  const visiveis = (data ?? []).filter((m) => m.visivel).length;

  async function alternar(id: string, visivel: boolean) {
    setGravando(id);
    try {
      await salvar({ data: { clinicaId, medicoId: id, visivel } });
      await Promise.all([
        qc.invalidateQueries({ queryKey: chave }),
        qc.invalidateQueries({ queryKey: ["site-agendamento-esp", clinicaId] }),
      ]);
    } catch (e) {
      toast.error((e as Error).message || "Não foi possível salvar.");
    } finally {
      setGravando(null);
    }
  }

  return (
    <section className="space-y-2 border-t pt-3">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold">Médicos no site</h3>
        {data && (
          <span className="text-xs text-muted-foreground">
            {visiveis} visíveis de {data.length} ativos
          </span>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        <Input
          className="flex-1"
          placeholder="Buscar médico"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
        />
        <select
          className="h-9 rounded-md border bg-background px-2 text-sm"
          value={esp}
          onChange={(e) => setEsp(e.target.value)}
          aria-label="Filtrar por especialidade"
        >
          <option value="">Todas as especialidades</option>
          {(esps ?? []).map((e) => (
            <option key={e.id} value={e.id}>
              {e.nome}
            </option>
          ))}
        </select>
      </div>
      {isLoading && <p className="text-sm text-muted-foreground">Carregando…</p>}
      {error && <p className="text-sm text-destructive">Não foi possível carregar.</p>}
      <ul className="divide-y rounded border">
        {pag.map((m) => (
          <li key={m.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
            <span className={m.visivel ? "" : "text-muted-foreground"}>{m.nome}</span>
            <Switch
              checked={m.visivel}
              disabled={gravando === m.id}
              onCheckedChange={(v) => alternar(m.id, v)}
              aria-label={`Mostrar ${m.nome} no site`}
            />
          </li>
        ))}
        {data && pag.length === 0 && (
          <li className="px-3 py-2 text-sm text-muted-foreground">Nenhum médico.</li>
        )}
      </ul>
      {paginas > 1 && (
        <div className="flex items-center justify-end gap-2 text-sm">
          <Button variant="outline" size="sm" disabled={pagina === 0} onClick={() => setPagina(pagina - 1)}>
            Anterior
          </Button>
          <span>
            {pagina + 1} / {paginas}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={pagina >= paginas - 1}
            onClick={() => setPagina(pagina + 1)}
          >
            Próxima
          </Button>
        </div>
      )}
    </section>
  );
}
