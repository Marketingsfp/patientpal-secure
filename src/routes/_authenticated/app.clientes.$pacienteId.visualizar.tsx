import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowLeft, Pencil, Users } from "lucide-react";
import { mostrarErro } from "@/lib/traduzir-erro";
import { supabase } from "@/integrations/supabase/client";
import { useClinica } from "@/hooks/use-clinica";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import type { Paciente } from "@/components/clientes/cliente-form";
import { PacienteCartoesBeneficios } from "@/components/clientes/paciente-cartoes-beneficios";
import { PacienteAtendimentosResumo } from "@/components/clientes/paciente-atendimentos-resumo";
import { IdadeIcon, calcIdadeAnos } from "@/components/idade-icon";

export const Route = createFileRoute("/_authenticated/app/clientes/$pacienteId/visualizar")({
  component: VisualizarClientePage,
  head: () => ({ meta: [{ title: "Visualizar cliente — ClinicaOS" }] }),
});

type PacienteFull = Paciente & {
  codigo_prontuario?: string | null;
  codigo_prontuario_anterior?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

function fmtCPF(v: string | null | undefined): string {
  if (!v) return "—";
  const d = v.replace(/\D/g, "");
  if (d.length !== 11) return v;
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}
function fmtTel(v: string | null | undefined): string {
  if (!v) return "—";
  const d = v.replace(/\D/g, "");
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return v;
}
function fmtNasc(d: string | null | undefined): string {
  if (!d) return "—";
  const [y, m, day] = d.split("-");
  if (!y || !m || !day) return "—";
  return `${day}/${m}/${y}`;
}
function fmtCEP(v: string | null | undefined): string {
  if (!v) return "—";
  const d = v.replace(/\D/g, "");
  if (d.length !== 8) return v;
  return `${d.slice(0, 5)}-${d.slice(5)}`;
}
function fmtSexo(v: string | null | undefined): string {
  switch (v) {
    case "masculino": return "Masculino";
    case "feminino": return "Feminino";
    case "outro": return "Outro";
    case "nao_informar":
    case null:
    case undefined:
    case "": return "Não informado";
    default: return v;
  }
}
function fmtDate(v: string | null | undefined): string {
  if (!v) return "—";
  const d = new Date(v);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("pt-BR");
}

function VisualizarClientePage() {
  const { pacienteId } = Route.useParams();
  const navigate = useNavigate();
  const { clinicaAtual } = useClinica();
  const [paciente, setPaciente] = useState<PacienteFull | null>(null);
  const [fotoUrl, setFotoUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setNotFound(false);
    void supabase.from("pacientes").select("*").eq("id", pacienteId).single()
      .then(async ({ data, error }) => {
        if (!active) return;
        if (error || !data) {
          setNotFound(true);
          setLoading(false);
          if (error) mostrarErro(error);
          return;
        }
        setPaciente(data as PacienteFull);
        if ((data as PacienteFull).foto_url) {
          const { data: signed } = await supabase.storage
            .from("pacientes-fotos")
            .createSignedUrl((data as PacienteFull).foto_url as string, 3600);
          if (active && signed?.signedUrl) setFotoUrl(signed.signedUrl);
        }
        setLoading(false);
      });
    return () => { active = false; };
  }, [pacienteId]);

  const voltar = () => navigate({ to: "/app/clientes" });
  const idade = paciente ? calcIdadeAnos(paciente.data_nascimento) : null;
  const endereco = paciente ? [
    paciente.logradouro,
    paciente.numero,
    paciente.complemento,
  ].filter(Boolean).join(", ") : "";
  const cidadeUf = paciente
    ? [paciente.cidade, paciente.estado].filter(Boolean).join("/")
    : "";

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <Button variant="outline" size="sm" onClick={voltar}>
            <ArrowLeft className="h-4 w-4 mr-2" /> Voltar
          </Button>
          <div>
            <h1 className="text-2xl font-semibold flex items-center gap-2">
              <Users className="h-6 w-6 text-primary" /> Visualizar cliente
            </h1>
            {paciente && (
              <p className="text-sm text-muted-foreground">
                Somente leitura — use “Editar” para alterar dados.
              </p>
            )}
          </div>
        </div>
        {paciente && (
          <Button asChild size="sm">
            <Link to="/app/clientes/$pacienteId/editar" params={{ pacienteId: paciente.id }}>
              <Pencil className="h-4 w-4 mr-2" /> Editar
            </Link>
          </Button>
        )}
      </div>

      {loading ? (
        <div className="rounded-lg border border-border bg-card p-6">
          <p className="text-sm text-muted-foreground">Carregando…</p>
        </div>
      ) : notFound || !paciente ? (
        <div className="rounded-lg border border-border bg-card p-6">
          <p className="text-sm text-muted-foreground">Paciente não encontrado.</p>
        </div>
      ) : (
        <>
          {/* Cabeçalho do paciente */}
          <div className="rounded-lg border border-border bg-card p-6">
            <div className="flex items-start gap-4 flex-wrap">
              <div className="h-24 w-24 rounded-full overflow-hidden border bg-muted flex items-center justify-center shrink-0">
                {fotoUrl ? (
                  <img src={fotoUrl} alt={paciente.nome} className="h-full w-full object-cover" />
                ) : (
                  <Users className="h-10 w-10 text-muted-foreground" />
                )}
              </div>
              <div className="flex-1 min-w-[240px]">
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="text-xl font-semibold">{paciente.nome}</h2>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${paciente.ativo ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300" : "bg-muted text-muted-foreground"}`}>
                    {paciente.ativo ? "Ativo" : "Inativo"}
                  </span>
                </div>
                <div className="mt-2 flex items-center gap-3 flex-wrap text-sm text-muted-foreground">
                  {paciente.codigo_prontuario && (
                    <span className="font-mono text-xs px-1.5 py-0.5 rounded bg-muted">
                      Prontuário {paciente.codigo_prontuario}
                    </span>
                  )}
                  {paciente.numero_pasta && (
                    <span className="font-mono text-xs px-1.5 py-0.5 rounded bg-muted">
                      Pasta {paciente.numero_pasta}
                    </span>
                  )}
                  {idade !== null && idade >= 0 && (
                    <span className="inline-flex items-center gap-1.5">
                      {idade} {idade === 1 ? "ano" : "anos"}
                      <IdadeIcon nascimento={paciente.data_nascimento} size={18} />
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Dados pessoais */}
          <Section title="Dados pessoais">
            <Info k="Nome" v={paciente.nome} />
            <Info k="CPF" v={fmtCPF(paciente.cpf)} />
            <Info k="Nascimento" v={fmtNasc(paciente.data_nascimento)} />
            <Info k="Sexo" v={fmtSexo(paciente.sexo)} />
            <Info k="Situação" v={paciente.ativo ? "Ativo" : "Inativo"} />
          </Section>

          {/* Contato */}
          <Section title="Contato">
            <Info k="Telefone" v={fmtTel(paciente.telefone)} />
            <Info k="Telefone 2" v={fmtTel(paciente.telefone2)} />
            <Info k="E-mail" v={paciente.email ?? "—"} />
          </Section>

          {/* Endereço */}
          <Section title="Endereço">
            <Info k="CEP" v={fmtCEP(paciente.cep)} />
            <Info k="Endereço" v={endereco || "—"} />
            <Info k="Bairro" v={paciente.bairro ?? "—"} />
            <Info k="Cidade/UF" v={cidadeUf || "—"} />
          </Section>

          {/* Responsável */}
          {(paciente.responsavel_nome || paciente.responsavel_cpf ||
            paciente.responsavel_telefone || paciente.responsavel_parentesco) && (
            <Section title="Responsável">
              <Info k="Nome" v={paciente.responsavel_nome ?? "—"} />
              <Info k="CPF" v={fmtCPF(paciente.responsavel_cpf)} />
              <Info k="Telefone" v={fmtTel(paciente.responsavel_telefone)} />
              <Info k="Parentesco" v={paciente.responsavel_parentesco ?? "—"} />
            </Section>
          )}

          {/* Identificadores e metadados */}
          <Section title="Identificadores">
            <Info k="Prontuário" v={paciente.codigo_prontuario ?? "—"} />
            <Info k="Prontuário anterior" v={paciente.codigo_prontuario_anterior ?? "—"} />
            <Info k="Número de pasta" v={paciente.numero_pasta ?? "—"} />
            <Info k="Cadastrado em" v={fmtDate(paciente.created_at)} />
            {paciente.updated_at && <Info k="Atualizado em" v={fmtDate(paciente.updated_at)} />}
          </Section>

          {clinicaAtual && (
            <>
              <Separator />
              <PacienteCartoesBeneficios pacienteId={paciente.id} clinicaId={clinicaAtual.clinica_id} />
              <PacienteAtendimentosResumo pacienteId={paciente.id} clinicaId={clinicaAtual.clinica_id} />
            </>
          )}
        </>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border bg-card p-6">
      <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-4">{title}</h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-4 text-sm">
        {children}
      </div>
    </div>
  );
}

function Info({ k, v }: { k: string; v: string }) {
  return (
    <div className="min-w-0">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{k}</div>
      <div className="break-words">{v || "—"}</div>
    </div>
  );
}