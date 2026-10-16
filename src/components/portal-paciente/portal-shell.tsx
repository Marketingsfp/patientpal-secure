import { Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  aplicarMarcaNaAba,
  estiloCoresMarca,
  idClinicaValido,
  resolverClinicaAcesso,
  type ClinicaAcesso,
} from "@/lib/clinica-acesso";
import { aceitarTermo, minhaSessao, sairPortal } from "@/lib/portal-paciente/portal.functions";

const CHAVE = "portal_clinica_param";

/** `?clinica=` (só para teste na prévia), guardado na aba. */
export function useClinicaParamPortal(): string | null {
  const [v, setV] = useState<string | null>(null);
  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get("clinica");
    if (idClinicaValido(q)) {
      window.sessionStorage.setItem(CHAVE, q);
      setV(q);
    } else setV(window.sessionStorage.getItem(CHAVE));
  }, []);
  return v;
}

export function useMarcaPortal(clinica: string | null) {
  const [marca, setMarca] = useState<ClinicaAcesso | null>(null);
  useEffect(() => {
    void resolverClinicaAcesso(clinica ?? undefined).then((c) => {
      setMarca(c);
      aplicarMarcaNaAba(c, "Área do Paciente");
    });
  }, [clinica]);
  return marca;
}

export function MolduraPortal({
  marca,
  children,
  acoes,
}: {
  marca: ClinicaAcesso | null;
  children: ReactNode;
  acoes?: ReactNode;
}) {
  return (
    <div
      className="min-h-screen bg-muted/30"
      style={estiloCoresMarca(marca) as CSSProperties | undefined}
    >
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex max-w-2xl items-center gap-3 px-4 py-3">
          <Link to="/paciente" className="flex items-center gap-2 min-w-0">
            {marca && (marca.logo_full_url || marca.logo_url) ? (
              <img
                src={(marca.logo_full_url || marca.logo_url) as string}
                alt={`Logo ${marca.nome}`}
                className="h-9 max-w-[180px] object-contain"
              />
            ) : (
              <span className="font-semibold text-primary">Área do Paciente</span>
            )}
          </Link>
          <div className="ml-auto">{acoes}</div>
        </div>
      </header>
      <main className="mx-auto max-w-2xl px-4 py-6">{children}</main>
    </div>
  );
}

/** Exige sessão + termo aceito; senão volta para /paciente. */
export function PortalAutenticado({
  children,
}: {
  children: (clinica: string | null) => ReactNode;
}) {
  const clinica = useClinicaParamPortal();
  const marca = useMarcaPortal(clinica);
  const navigate = useNavigate();
  const qc = useQueryClient();
  const sessaoFn = useServerFn(minhaSessao);
  const aceitarFn = useServerFn(aceitarTermo);
  const sairFn = useServerFn(sairPortal);
  const [pronto, setPronto] = useState(false);
  useEffect(() => setPronto(true), []);

  const { data, isLoading } = useQuery({
    queryKey: ["portal-sessao", clinica],
    enabled: pronto,
    queryFn: () => sessaoFn({ data: { clinica } }),
  });

  useEffect(() => {
    if (data && !data.logado) navigate({ to: "/paciente", replace: true });
  }, [data, navigate]);

  const sair = async () => {
    await sairFn({ data: { clinica } });
    qc.clear();
    navigate({ to: "/paciente", replace: true });
  };

  const acoes = data?.logado ? (
    <Button variant="ghost" size="sm" onClick={sair}>
      <LogOut className="mr-1 h-4 w-4" /> Sair
    </Button>
  ) : null;

  if (isLoading || !data || !data.logado) {
    return (
      <MolduraPortal marca={marca}>
        <p className="text-sm text-muted-foreground">Carregando…</p>
      </MolduraPortal>
    );
  }

  if (data.termo) {
    const termo = data.termo;
    return (
      <MolduraPortal marca={marca} acoes={acoes}>
        <h1 className="text-xl font-semibold">{termo.titulo}</h1>
        <p className="text-xs text-muted-foreground">Versão {termo.versao}</p>
        <div className="mt-4 max-h-[55vh] overflow-y-auto whitespace-pre-wrap rounded-md border bg-card p-4 text-sm">
          {termo.texto}
        </div>
        <Button
          className="mt-4 w-full"
          onClick={async () => {
            await aceitarFn({ data: { clinica, termoId: termo.id } });
            await qc.invalidateQueries({ queryKey: ["portal-sessao"] });
          }}
        >
          Li e concordo
        </Button>
      </MolduraPortal>
    );
  }

  return (
    <MolduraPortal marca={marca} acoes={acoes}>
      {children(clinica)}
    </MolduraPortal>
  );
}
