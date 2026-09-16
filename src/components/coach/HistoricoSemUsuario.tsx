/**
 * Coach WhatsApp — "Histórico sem usuário".
 *
 * O histórico migrado do projeto antigo casa pelo NOME da atendente (coluna
 * `atendente`, texto). Quem já existe como usuário do ClinicaOS foi vinculado
 * (nome do perfil + `user_id`). O que sobra são nomes antigos sem usuário: se a
 * gestora cadastrar essa pessoa em Equipe, o nome do perfil quase sempre é
 * diferente (nome completo, maiúsculas) e o histórico ficaria órfão.
 *
 * Esta seção lista esses nomes e permite apontar cada um para um usuário ativo
 * da clínica. A troca em si é feita no banco pela função
 * `coach_vincular_atendente`, que renomeia e preenche `user_id` em todas as
 * tabelas do Coach e soma o tempo de estudo quando houver linha repetida.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link2, Loader2, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type Linha = { atendente: string | null; user_id: string | null };

type NomeOrfao = {
  nome: string;
  analises: number;
  treinos: number;
  provas: number;
  total: number;
};

type UsuarioClinica = { id: string; nome: string };

const TABELAS = [
  "coach_analises",
  "coach_roleplay_sessions",
  "coach_provas",
  "coach_tempo_estudo",
  "coach_eventos_seguranca",
  "coach_desempenho_metas",
] as const;

async function carregarOrfaos(clinicaId: string): Promise<NomeOrfao[]> {
  const resultados = await Promise.all(
    TABELAS.map(async (tabela) => {
      const { data } = await supabase
        .from(tabela)
        .select("atendente,user_id")
        .eq("clinica_id", clinicaId)
        .limit(5000);
      return { tabela, linhas: (data ?? []) as unknown as Linha[] };
    }),
  );

  // Um nome só é considerado órfão quando NENHUM registro dele tem usuário.
  const comUsuario = new Set<string>();
  const contagens = new Map<string, NomeOrfao>();

  for (const { tabela, linhas } of resultados) {
    for (const linha of linhas) {
      const nome = (linha.atendente ?? "").trim();
      if (!nome) continue;
      if (linha.user_id) {
        comUsuario.add(nome);
        continue;
      }
      const atual =
        contagens.get(nome) ?? { nome, analises: 0, treinos: 0, provas: 0, total: 0 };
      if (tabela === "coach_analises") atual.analises += 1;
      if (tabela === "coach_roleplay_sessions") atual.treinos += 1;
      if (tabela === "coach_provas") atual.provas += 1;
      atual.total += 1;
      contagens.set(nome, atual);
    }
  }

  return Array.from(contagens.values())
    .filter((n) => !comUsuario.has(n.nome))
    .sort((a, b) => b.total - a.total || a.nome.localeCompare(b.nome, "pt-BR"));
}

async function carregarUsuarios(clinicaId: string): Promise<UsuarioClinica[]> {
  const { data: membros } = await supabase
    .from("clinica_memberships")
    .select("user_id")
    .eq("clinica_id", clinicaId)
    .eq("ativo", true);
  const ids = (membros ?? []).map((m) => m.user_id);
  if (ids.length === 0) return [];
  const { data: perfis } = await supabase.from("profiles").select("id,nome").in("id", ids);
  return (perfis ?? [])
    .map((p) => ({ id: p.id, nome: (p.nome ?? "").trim() }))
    .filter((p) => p.nome.length > 0)
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
}

export function HistoricoSemUsuario({
  clinicaId,
  onVinculado,
}: {
  clinicaId: string | null;
  onVinculado?: () => void;
}) {
  const [orfaos, setOrfaos] = useState<NomeOrfao[]>([]);
  const [usuarios, setUsuarios] = useState<UsuarioClinica[]>([]);
  const [escolha, setEscolha] = useState<Record<string, string>>({});
  const [salvando, setSalvando] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const recarregar = useCallback(async () => {
    if (!clinicaId) {
      setOrfaos([]);
      setUsuarios([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const [lista, pessoas] = await Promise.all([
      carregarOrfaos(clinicaId),
      carregarUsuarios(clinicaId),
    ]);
    setOrfaos(lista);
    setUsuarios(pessoas);
    setLoading(false);
  }, [clinicaId]);

  useEffect(() => {
    void recarregar();
  }, [recarregar]);

  async function vincular(nome: string) {
    const userId = escolha[nome];
    if (!clinicaId || !userId) return;
    setSalvando(nome);
    const { data, error } = await supabase.rpc("coach_vincular_atendente", {
      _clinica_id: clinicaId,
      _nome_antigo: nome,
      _user_id: userId,
    });
    setSalvando(null);
    if (error) {
      toast.error(error.message);
      return;
    }
    const novo = (data as { novo_nome?: string } | null)?.novo_nome ?? "";
    toast.success(novo ? `Histórico de "${nome}" vinculado a ${novo}.` : "Histórico vinculado.");
    setEscolha((e) => {
      const copia = { ...e };
      delete copia[nome];
      return copia;
    });
    await recarregar();
    onVinculado?.();
  }

  const vazio = useMemo(() => !loading && orfaos.length === 0, [loading, orfaos.length]);

  return (
    <div className="rounded-xl border bg-card p-5 shadow-sm">
      <div className="mb-1 flex items-center gap-2">
        <UserPlus className="h-4 w-4 text-muted-foreground" />
        <h2 className="text-lg font-semibold tracking-tight">Histórico sem usuário</h2>
      </div>
      <p className="mb-4 text-sm text-muted-foreground">
        Nomes que vieram do histórico antigo e ainda não estão ligados a um usuário do sistema.
        Ao vincular, o histórico passa a usar o nome do perfil e continua com a pessoa.
      </p>

      {loading ? (
        <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
        </div>
      ) : vazio ? (
        <p className="py-4 text-sm text-muted-foreground">
          Todo o histórico desta clínica já está ligado a um usuário.
        </p>
      ) : (
        <ul className="space-y-3">
          {orfaos.map((o) => (
            <li
              key={o.nome}
              className="flex flex-col gap-3 rounded-lg border bg-secondary/30 p-3 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0">
                <p className="truncate font-medium">{o.nome}</p>
                <p className="text-xs text-muted-foreground">
                  {o.treinos} treino{o.treinos === 1 ? "" : "s"} · {o.provas} prova
                  {o.provas === 1 ? "" : "s"} · {o.analises} análise
                  {o.analises === 1 ? "" : "s"} · {o.total} registro
                  {o.total === 1 ? "" : "s"} no total
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Select
                  value={escolha[o.nome] ?? ""}
                  onValueChange={(v) => setEscolha((e) => ({ ...e, [o.nome]: v }))}
                >
                  <SelectTrigger className="w-[220px]">
                    <SelectValue placeholder="Vincular a usuário" />
                  </SelectTrigger>
                  <SelectContent>
                    {usuarios.map((u) => (
                      <SelectItem key={u.id} value={u.id}>
                        {u.nome}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  size="sm"
                  disabled={!escolha[o.nome] || salvando === o.nome}
                  onClick={() => void vincular(o.nome)}
                >
                  {salvando === o.nome ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Link2 className="mr-2 h-4 w-4" />
                  )}
                  Vincular
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
