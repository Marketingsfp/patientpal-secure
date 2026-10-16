import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { Calendar, User } from "lucide-react";
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

export const Route = createFileRoute("/paciente/")({
  component: PortalInicio,
  head: () => ({
    meta: [
      { title: "Área do Paciente" },
      { name: "description", content: "Veja seus agendamentos e dados de cadastro com segurança." },
      { property: "og:title", content: "Área do Paciente" },
      { property: "og:description", content: "Veja seus agendamentos e dados de cadastro com segurança." },
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
        {() => (
          <>
            <h1 className="text-2xl font-semibold">Olá, {data.primeiroNome}</h1>
            <p className="text-sm text-muted-foreground">O que você quer ver?</p>
            <div className="mt-6 grid grid-cols-2 gap-3">
              <Link to="/paciente/agendamentos">
                <Card className="cursor-pointer p-4 transition-all hover:border-primary/40 hover:shadow-md">
                  <Calendar className="mb-2 h-6 w-6 text-primary" />
                  <p className="font-semibold">Agendamentos</p>
                  <p className="text-xs text-muted-foreground">Confirmar ou cancelar</p>
                </Card>
              </Link>
              <Link to="/paciente/cadastro">
                <Card className="cursor-pointer p-4 transition-all hover:border-primary/40 hover:shadow-md">
                  <User className="mb-2 h-6 w-6 text-primary" />
                  <p className="font-semibold">Meu cadastro</p>
                  <p className="text-xs text-muted-foreground">Ver e pedir atualização</p>
                </Card>
              </Link>
            </div>
          </>
        )}
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
          <div role="alert" className="mt-4 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm">
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
              <button type="button" className="text-primary hover:underline" onClick={() => { setEtapa("cpf"); setCodigo(""); setErro(null); }}>
                Trocar CPF
              </button>
              <button type="button" className="text-primary hover:underline" disabled={enviando} onClick={() => void pedir()}>
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
