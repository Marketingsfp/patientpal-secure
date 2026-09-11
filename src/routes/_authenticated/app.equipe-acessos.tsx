// Equipe e acessos — quem é da gestão nesta clínica.
//
// POR QUE ESTA TELA EXISTE
// A marcação `pode_autorizar` decide, pessoa a pessoa, quem autoriza desconto,
// cortesia e sem faturamento com a própria senha, e quem enxerga ferramenta de
// supervisão (o relatório de marcações por atendente, por exemplo). Até
// 09/09/2026 não havia NENHUMA tela capaz de ligar ou desligar essa marcação:
// o formulário `FuncionarioFormDialog` existia no código, mas nenhuma rota o
// abria, e a única forma de marcar alguém era executar um UPDATE à mão no
// banco. O dono descobriu isso ao tentar se marcar e não encontrar a tela.
//
// A tela é deliberadamente pequena: lista quem tem vínculo com a clínica e
// liga/desliga a marcação. Cadastro de funcionário, senha, setor e contrato
// continuam onde já estavam — misturar tudo aqui recriaria o formulário órfão.
//
// A gravação passa pela server function `editarMembro`, que já confere se
// quem está mexendo é gestor da clínica. A tela nunca escreve direto na
// tabela: quem manda é o servidor.

import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useClinica } from "@/hooks/use-clinica";
import { editarMembro } from "@/lib/equipe.functions";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Search, ShieldCheck, Users } from "lucide-react";
import { toast } from "sonner";
import { mostrarErro } from "@/lib/traduzir-erro";
import { confirmDialog } from "@/lib/confirm";
import {
  filtrarMembros,
  ordenarMembros,
  podeReceberMarcacaoGestao,
  rotuloRole,
  type MembroEquipe,
} from "@/lib/equipe/marcacao-gestao";

export const Route = createFileRoute("/_authenticated/app/equipe-acessos")({
  component: EquipeAcessosPage,
  head: () => ({ meta: [{ title: "Equipe e acessos — ClinicaOS" }] }),
});

function EquipeAcessosPage() {
  const { clinicaAtual } = useClinica();
  const editarMembroFn = useServerFn(editarMembro);
  const [membros, setMembros] = useState<MembroEquipe[]>([]);
  const [busca, setBusca] = useState("");
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState<string | null>(null);

  const ehGestor = clinicaAtual?.role === "admin" || clinicaAtual?.role === "gestor";

  const carregar = useCallback(async () => {
    if (!clinicaAtual) return;
    setCarregando(true);
    try {
      const { data: mems, error } = await supabase
        .from("clinica_memberships")
        .select("id, user_id, role, ativo, pode_autorizar, pode_gerir_horarios")
        .eq("clinica_id", clinicaAtual.clinica_id);
      if (error) throw error;
      const linhas = (mems ?? []) as Array<{
        id: string;
        user_id: string;
        role: string;
        ativo: boolean;
        pode_autorizar: boolean | null;
        pode_gerir_horarios: boolean | null;
      }>;
      const ids = linhas.map((l) => l.user_id);
      const nomes = new Map<string, string>();
      if (ids.length > 0) {
        const { data: perfis } = await supabase.from("profiles").select("id, nome").in("id", ids);
        for (const p of (perfis ?? []) as Array<{ id: string; nome: string | null }>) {
          if (p.nome) nomes.set(p.id, p.nome);
        }
      }
      setMembros(
        linhas.map((l) => ({
          membershipId: l.id,
          userId: l.user_id,
          // Vínculo sem perfil preenchido continua na lista: sumir com a
          // pessoa esconderia justamente o cadastro que precisa de conserto.
          nome: nomes.get(l.user_id) ?? "(sem nome cadastrado)",
          role: l.role,
          ativo: l.ativo,
          podeAutorizar: !!l.pode_autorizar,
          podeGerirHorarios: !!l.pode_gerir_horarios,
        })),
      );
    } catch (e) {
      mostrarErro(e);
    } finally {
      setCarregando(false);
    }
  }, [clinicaAtual]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  async function alternar(m: MembroEquipe) {
    if (!clinicaAtual) return;
    const ligando = !m.podeAutorizar;
    const ok = await confirmDialog(
      ligando
        ? `Marcar ${m.nome} como GESTÃO?\n\n` +
            `A partir de agora esta pessoa poderá autorizar desconto, cortesia e ` +
            `sem faturamento com a própria senha, o nome dela passa a aparecer na ` +
            `lista de quem autoriza a ação das outras, e ela enxerga os relatórios ` +
            `de supervisão (como o de marcações por atendente).`
        : `Tirar a marcação de gestão de ${m.nome}?\n\n` +
            `Ela continua com todo o acesso de sempre ao trabalho do dia. O que ` +
            `perde é autorizar sozinha e ver os relatórios de supervisão.\n\n` +
            `Cuidado para não deixar a clínica sem ninguém marcado: se não houver ` +
            `alguém autorizado presente, ninguém consegue liberar um desconto no balcão.`,
    );
    if (!ok) return;
    setSalvando(m.membershipId);
    try {
      await editarMembroFn({
        data: {
          clinicaId: clinicaAtual.clinica_id,
          membershipId: m.membershipId,
          role: m.role as never,
          ativo: m.ativo,
          podeAutorizar: ligando,
        },
      });
      setMembros((prev) =>
        prev.map((x) => (x.membershipId === m.membershipId ? { ...x, podeAutorizar: ligando } : x)),
      );
      toast.success(ligando ? `${m.nome} agora é gestão.` : `${m.nome} não é mais gestão.`);
    } catch (e) {
      mostrarErro(e);
    } finally {
      setSalvando(null);
    }
  }

  async function alternarHorarios(m: MembroEquipe) {
    if (!clinicaAtual) return;
    const ligando = !m.podeGerirHorarios;
    const ok = await confirmDialog(
      ligando
        ? `Liberar ${m.nome} para criar horário médico?\n\n` +
            `Ela poderá cadastrar, alterar e excluir os horários semanais dos médicos e gerar as vagas na agenda. Não ganha nenhum outro acesso.`
        : `Tirar de ${m.nome} a permissão de criar horário médico?\n\n` +
            `As vagas que ela já gerou continuam na agenda.`,
    );
    if (!ok) return;
    setSalvando(m.membershipId);
    try {
      await editarMembroFn({
        data: {
          clinicaId: clinicaAtual.clinica_id,
          membershipId: m.membershipId,
          role: m.role as never,
          ativo: m.ativo,
          podeGerirHorarios: ligando,
        },
      });
      setMembros((prev) =>
        prev.map((x) =>
          x.membershipId === m.membershipId ? { ...x, podeGerirHorarios: ligando } : x,
        ),
      );
      toast.success(
        ligando
          ? `${m.nome} agora cria horário médico.`
          : `${m.nome} não cria mais horário médico.`,
      );
    } catch (e) {
      mostrarErro(e);
    } finally {
      setSalvando(null);
    }
  }

  const lista = useMemo(() => ordenarMembros(filtrarMembros(membros, busca)), [membros, busca]);
  const marcados = membros.filter((m) => m.podeAutorizar && m.ativo).length;

  if (!ehGestor) {
    return (
      <div className="container mx-auto py-6">
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Esta tela é da gestão da clínica. Peça a um administrador ou gestor para abri-la.
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto space-y-4 py-6">
      <div>
        <h1 className="text-2xl font-semibold">Equipe e acessos</h1>
        <p className="text-sm text-muted-foreground">
          Quem é da gestão nesta clínica — quem autoriza desconto, cortesia e sem faturamento com a
          própria senha, e quem enxerga os relatórios de supervisão. Aqui também se libera, pessoa a
          pessoa, quem cria horário de médico e gera as vagas da agenda.
        </p>
      </div>

      <div className="rounded-lg border border-sky-200 bg-sky-50 px-4 py-3 text-[13px] leading-snug text-sky-900">
        <strong>O perfil de acesso não decide isso.</strong> Quase toda a equipe está cadastrada
        como administrador, porque é esse perfil que abre as telas administrativas — se a gestão
        fosse deduzida dali, o balcão inteiro poderia autorizar isenção e ver o desempenho das
        colegas. Por isso a marcação é feita pessoa a pessoa, aqui.
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="relative w-full max-w-sm">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por nome ou perfil…"
            className="pl-8"
          />
        </div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <ShieldCheck className="h-4 w-4" />
          {marcados} pessoa(s) marcada(s) como gestão
        </div>
      </div>

      <div className="rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Pessoa</TableHead>
              <TableHead className="w-44">Perfil de acesso</TableHead>
              <TableHead className="w-28">Situação</TableHead>
              <TableHead className="w-48 text-center">É da gestão</TableHead>
              <TableHead className="w-44 text-center">Cria horário médico</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {carregando ? (
              <TableRow>
                <TableCell colSpan={5} className="py-6 text-center text-sm text-muted-foreground">
                  Carregando a equipe…
                </TableCell>
              </TableRow>
            ) : lista.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="py-6 text-center text-sm text-muted-foreground">
                  <Users className="mx-auto mb-2 h-5 w-5 opacity-50" />
                  Ninguém encontrado com esse termo.
                </TableCell>
              </TableRow>
            ) : (
              lista.map((m) => {
                const elegivel = podeReceberMarcacaoGestao(m.role);
                return (
                  <TableRow key={m.membershipId} className={m.ativo ? "" : "opacity-60"}>
                    <TableCell className="font-medium">{m.nome}</TableCell>
                    <TableCell>{rotuloRole(m.role)}</TableCell>
                    <TableCell>
                      {m.ativo ? (
                        <span className="text-xs text-muted-foreground">Ativo</span>
                      ) : (
                        <Badge variant="outline" className="text-xs">
                          Inativo
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-center">
                      {!elegivel ? (
                        // Marcar quem não tem perfil de gestão não habilitaria
                        // nada — a alçada exige as duas condições. Dizer isso na
                        // linha evita a marcação que "não funciona".
                        <span
                          className="text-xs text-muted-foreground"
                          title="A marcação só tem efeito para os perfis Administrador, Gestor, Supervisor ou Financeiro. Troque o perfil desta pessoa antes."
                        >
                          Não se aplica a este perfil
                        </span>
                      ) : (
                        <label className="inline-flex cursor-pointer items-center gap-2">
                          <input
                            type="checkbox"
                            checked={m.podeAutorizar}
                            disabled={salvando === m.membershipId}
                            onChange={() => void alternar(m)}
                          />
                          <span className="text-xs font-medium">
                            {salvando === m.membershipId
                              ? "Salvando…"
                              : m.podeAutorizar
                                ? "Sim"
                                : "Não"}
                          </span>
                        </label>
                      )}
                    </TableCell>
                    <TableCell className="text-center">
                      {m.role === "admin" || m.role === "gestor" ? (
                        <span className="text-xs text-muted-foreground">Já tem pelo perfil</span>
                      ) : (
                        <label className="inline-flex cursor-pointer items-center gap-2">
                          <input
                            type="checkbox"
                            checked={m.podeGerirHorarios}
                            disabled={salvando === m.membershipId}
                            onChange={() => void alternarHorarios(m)}
                          />
                          <span className="text-xs font-medium">
                            {salvando === m.membershipId
                              ? "Salvando…"
                              : m.podeGerirHorarios
                                ? "Sim"
                                : "Não"}
                          </span>
                        </label>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
