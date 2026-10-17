import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { Calendar, FileText, User, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatarCPF } from "@/lib/cpf";
import {
  MolduraPortal,
  PortalAutenticado,
  useClinicaParamPortal,
  useMarcaPortal,
} from "@/components/portal-paciente/portal-shell";
import {
  minhaSessao,
  portalInfo,
  solicitarCodigo,
  verificarCodigo,
} from "@/lib/portal-paciente/portal.functions";
import { resumoInicio } from "@/lib/portal-paciente/portal-fase2.functions";

export const Route = createFileRoute("/paciente/")({
  component: PortalInicio,
  head: () => ({
    meta: [
      { title: "Área do Paciente" },
      { name: "description", content: "Veja seus agendamentos e dados de cadastro com segurança." },
      { property: "og:title", content: "Área do Paciente" },
      {
        property: "og:description",
        content: "Veja seus agendamentos e dados de cadastro com segurança.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
});

function PortalInicio() {
  const clinica = useClinicaParamPortal();
  const sessaoFn = useServerFn(minhaSessao);
  const [pronto, setPronto] = useState(false);
  useEffect(() => setPronto(true), []);
  const { data } = useQuery({
    queryKey: ["portal-sessao", clinica],
    enabled: pronto,
    queryFn: () => sessaoFn({ data: { clinica } }),
  });
  if (data?.logado) {
    return (
      <PortalAutenticado>
        {(c) => <Inicio clinica={c} primeiroNome={data.primeiroNome} />}
      </PortalAutenticado>
    );
  }
  return <Entrar clinica={clinica} carregando={!data} />;
}

function Entrar({ clinica, carregando }: { clinica: string | null; carregando: boolean }) {
  const marca = useMarcaPortal(clinica);
  const qc = useQueryClient();
  const infoFn = useServerFn(portalInfo);
  const pedirFn = useServerFn(solicitarCodigo);
  const verificarFn = useServerFn(verificarCodigo);
  const [cpf, setCpf] = useState("");
  const [codigo, setCodigo] = useState("");
  const [etapa, setEtapa] = useState<"cpf" | "codigo">("cpf");
  const [aviso, setAviso] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [pendencia, setPendencia] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [pronto, setPronto] = useState(false);
  useEffect(() => setPronto(true), []);

  const { data: info } = useQuery({
    queryKey: ["portal-info", clinica],
    enabled: pronto,
    queryFn: () => infoFn({ data: { clinica } }),
  });

  const pedir = async (e?: React.FormEvent) => {
    e?.preventDefault();
    setErro(null);
    setEnviando(true);
    try {
      const r = await pedirFn({ data: { clinica, cpf } });
      setAviso(r.mensagem);
      setEtapa("codigo");
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Tente novamente.");
    } finally {
      setEnviando(false);
    }
  };

  const verificar = async (e: React.FormEvent) => {
    e.preventDefault();
    setErro(null);
    setEnviando(true);
    try {
      const r = await verificarFn({ data: { clinica, cpf, codigo } });
      if (r.status === "ok") await qc.invalidateQueries({ queryKey: ["portal-sessao"] });
      else if (r.status === "pendencia") setPendencia(r.mensagem);
      else setErro(r.mensagem);
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Tente novamente.");
    } finally {
      setEnviando(false);
    }
  };

  return (
    <MolduraPortal marca={marca}>
      <div className="mx-auto max-w-md rounded-2xl border bg-card p-6 shadow-sm">
        <h1 className="text-center text-2xl font-semibold">Área do Paciente</h1>
        {carregando || !info ? (
          <p className="mt-4 text-center text-sm text-muted-foreground">Carregando…</p>
        ) : !info.ativo ? (
          <p className="mt-4 text-center text-sm text-muted-foreground">
            A Área do Paciente não está disponível neste endereço.
          </p>
        ) : pendencia ? (
          <div
            role="alert"
            className="mt-4 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm"
          >
            {pendencia}
            {info.telefone && <p className="mt-2 font-medium">Telefone: {info.telefone}</p>}
          </div>
        ) : etapa === "cpf" ? (
          <form onSubmit={pedir} className="mt-6 space-y-4">
            <p className="text-center text-sm text-muted-foreground">
              Informe seu CPF. Enviaremos um código para o e-mail cadastrado na clínica.
            </p>
            <div className="space-y-2">
              <Label htmlFor="cpf">CPF</Label>
              <Input
                id="cpf"
                inputMode="numeric"
                autoComplete="off"
                value={cpf}
                onChange={(e) => setCpf(formatarCPF(e.target.value))}
                placeholder="000.000.000-00"
              />
            </div>
            {erro && <p className="text-sm text-destructive">{erro}</p>}
            <Button type="submit" className="w-full" disabled={enviando || cpf.length < 14}>
              {enviando ? "Enviando…" : "Receber código"}
            </Button>
          </form>
        ) : (
          <form onSubmit={verificar} className="mt-6 space-y-4">
            {aviso && <p className="text-center text-sm text-muted-foreground">{aviso}</p>}
            <div className="space-y-2">
              <Label htmlFor="codigo">Código de 6 números</Label>
              <Input
                id="codigo"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                value={codigo}
                onChange={(e) => setCodigo(e.target.value.replace(/\D/g, "").slice(0, 6))}
              />
            </div>
            {erro && <p className="text-sm text-destructive">{erro}</p>}
            <Button type="submit" className="w-full" disabled={enviando || codigo.length !== 6}>
              {enviando ? "Conferindo…" : "Entrar"}
            </Button>
            <div className="flex justify-between text-sm">
              <button
                type="button"
                className="text-primary hover:underline"
                onClick={() => {
                  setEtapa("cpf");
                  setCodigo("");
                  setErro(null);
                }}
              >
                Trocar CPF
              </button>
              <button
                type="button"
                className="text-primary hover:underline"
                disabled={enviando}
                onClick={() => void pedir()}
              >
                Enviar novo código
              </button>
            </div>
            <p className="text-xs text-muted-foreground">
              Não recebeu? Confira a caixa de spam ou procure a recepção para atualizar seu e-mail.
            </p>
          </form>
        )}
      </div>
    </MolduraPortal>
  );
}

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

function Inicio({ clinica, primeiroNome }: { clinica: string | null; primeiroNome: string }) {
  const resumoFn = useServerFn(resumoInicio);
  const { data: r } = useQuery({
    queryKey: ["portal-resumo", clinica],
    queryFn: () => resumoFn({ data: { clinica } }),
  });
  const atalhos = [
    {
      to: "/paciente/agendamentos" as const,
      Icone: Calendar,
      t: "Agendamentos",
      s: "Confirmar ou cancelar",
    },
    {
      to: "/paciente/documentos" as const,
      Icone: FileText,
      t: "Documentos",
      s: "Resultados e laudos",
    },
    {
      to: "/paciente/financeiro" as const,
      Icone: Wallet,
      t: "Financeiro",
      s: "Pagamentos e notas",
    },
    {
      to: "/paciente/cadastro" as const,
      Icone: User,
      t: "Meu cadastro",
      s: "Ver e pedir atualização",
    },
  ];
  return (
    <>
      <h1 className="text-2xl font-semibold">Olá, {primeiroNome}</h1>
      <div className="mt-4 space-y-2">
        <Card className="p-4">
          <p className="text-xs text-muted-foreground">Próxima consulta</p>
          {!r ? (
            <p className="text-sm text-muted-foreground">Carregando…</p>
          ) : r.proxima ? (
            <p className="text-sm font-medium">
              {new Date(r.proxima.inicio).toLocaleString("pt-BR", {
                timeZone: "America/Sao_Paulo",
                weekday: "short",
                day: "2-digit",
                month: "2-digit",
                hour: "2-digit",
                minute: "2-digit",
              })}
              {r.proxima.profissional ? ` · ${r.proxima.profissional}` : ""}
            </p>
          ) : (
            <p className="text-sm">Nenhuma consulta marcada.</p>
          )}
        </Card>
        {r && (
          <div className="grid grid-cols-2 gap-2">
            <Card className="p-4">
              <p className="text-xs text-muted-foreground">Documentos novos</p>
              <p className="text-lg font-semibold">{r.documentosNovos}</p>
            </Card>
            <Card className="p-4">
              <p className="text-xs text-muted-foreground">Pendências</p>
              <p className="text-lg font-semibold">
                {r.pendencias.quantidade ? brl(r.pendencias.total) : "Nenhuma"}
              </p>
            </Card>
          </div>
        )}
      </div>
      <div className="mt-6 grid grid-cols-2 gap-3">
        {atalhos.map(({ to, Icone, t, s }) => (
          <Link key={to} to={to}>
            <Card className="h-full cursor-pointer p-4 transition-all hover:border-primary/40 hover:shadow-md">
              <Icone className="mb-2 h-6 w-6 text-primary" />
              <p className="font-semibold">{t}</p>
              <p className="text-xs text-muted-foreground">{s}</p>
            </Card>
          </Link>
        ))}
      </div>
    </>
  );
}
