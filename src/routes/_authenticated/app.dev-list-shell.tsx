import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useClinica } from "@/hooks/use-clinica";
import { Button } from "@/components/ui/button";
import {
  ListShell,
  VirtualList,
  QuickFilters,
  CommandPalette,
  useCommandPaletteToggle,
  useDefaultScreenEntries,
  type StatusTab,
  type QuickFilterOption,
} from "@/components/list-shell";

export const Route = createFileRoute("/_authenticated/app/dev-list-shell")({
  component: DevListShellPreview,
  head: () => ({
    meta: [
      { title: "Preview — List Shell (dev)" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
});

type Status = "todos" | "aberto" | "pendente" | "concluido" | "cancelado";
type ChipKey = "hoje" | "semana" | "mes" | "particular" | "associado" | "cartao";

interface DemoRow {
  id: number;
  paciente: string;
  status: Status;
  modalidade: "particular" | "associado" | "cartao";
  valor: number;
  criadoEm: string;
}

const NOMES = [
  "Ana Souza", "Bruno Lima", "Carla Dias", "Diego Alves", "Elis Rocha",
  "Fábio Nunes", "Gabi Prado", "Hugo Ramos", "Iris Melo", "João Pires",
  "Kátia Fonseca", "Léo Barros", "Marta Silva", "Nina Costa", "Otávio Reis",
];

function seedRows(n: number): DemoRow[] {
  const statuses: Status[] = ["aberto", "pendente", "concluido", "cancelado"];
  const mods: DemoRow["modalidade"][] = ["particular", "associado", "cartao"];
  const rows: DemoRow[] = [];
  for (let i = 0; i < n; i++) {
    rows.push({
      id: i + 1,
      paciente: `${NOMES[i % NOMES.length]} #${(i + 1).toString().padStart(4, "0")}`,
      status: statuses[i % statuses.length],
      modalidade: mods[i % mods.length],
      valor: 80 + ((i * 37) % 1200),
      criadoEm: new Date(Date.now() - i * 3600_000).toISOString().slice(0, 10),
    });
  }
  return rows;
}

const ALL_ROWS = seedRows(2500);

function DevListShellPreview() {
  const { clinicaAtual } = useClinica();
  const isAdmin = clinicaAtual?.role === "admin";

  const [busca, setBusca] = useState("");
  const [status, setStatus] = useState<Status>("todos");
  const [chips, setChips] = useState<ChipKey[]>([]);
  const [limit, setLimit] = useState(200);

  const [paletteOpen, setPaletteOpen] = useCommandPaletteToggle();
  const screenEntries = useDefaultScreenEntries();

  const filtered = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return ALL_ROWS.filter((r) => {
      if (status !== "todos" && r.status !== status) return false;
      if (chips.includes("particular") && r.modalidade !== "particular") return false;
      if (chips.includes("associado") && r.modalidade !== "associado") return false;
      if (chips.includes("cartao") && r.modalidade !== "cartao") return false;
      if (q && !r.paciente.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [busca, status, chips]);

  const visible = filtered.slice(0, limit);

  const tabs: StatusTab<Status>[] = [
    { value: "todos", label: "Todos", count: ALL_ROWS.length },
    { value: "aberto", label: "Abertos", count: ALL_ROWS.filter((r) => r.status === "aberto").length },
    { value: "pendente", label: "Pendentes", count: ALL_ROWS.filter((r) => r.status === "pendente").length },
    { value: "concluido", label: "Concluídos", count: ALL_ROWS.filter((r) => r.status === "concluido").length },
    { value: "cancelado", label: "Cancelados", count: ALL_ROWS.filter((r) => r.status === "cancelado").length },
  ];

  const chipOptions: QuickFilterOption<ChipKey>[] = [
    { value: "hoje", label: "Hoje" },
    { value: "semana", label: "Semana" },
    { value: "mes", label: "Mês" },
    { value: "particular", label: "Particular" },
    { value: "associado", label: "Associado" },
    { value: "cartao", label: "Cartão de Benefícios" },
  ];

  if (!isAdmin) {
    return (
      <div className="p-6 text-sm text-muted-foreground">
        Rota de preview restrita a administradores.
      </div>
    );
  }

  return (
    <div className="h-[calc(100vh-4rem)] p-4 flex flex-col gap-3">
      <div className="text-xs text-muted-foreground border border-dashed rounded-md p-2">
        <strong>Preview A1 — List Shell (não é tela de produção).</strong>{" "}
        Componentes: <code>ListShell</code>, <code>VirtualList</code>, <code>QuickFilters</code>, <code>CommandPalette</code>.
        Pressione <kbd className="px-1 py-0.5 rounded bg-muted text-[10px]">Ctrl/⌘+K</kbd> para abrir a Busca Universal.
      </div>

      <ListShell<Status>
        title={
          <div>
            <h1 className="text-xl font-semibold">Demo — Lista virtualizada</h1>
            <p className="text-xs text-muted-foreground">
              {filtered.length.toLocaleString("pt-BR")} registros filtrados · exibindo {Math.min(limit, filtered.length)}
            </p>
          </div>
        }
        actions={
          <Button size="sm" variant="outline" onClick={() => setPaletteOpen(true)}>
            Abrir Ctrl+K
          </Button>
        }
        searchValue={busca}
        onSearchChange={setBusca}
        searchPlaceholder="Buscar paciente…"
        tabs={tabs}
        tabValue={status}
        onTabChange={setStatus}
        chips={<QuickFilters options={chipOptions} value={chips} onChange={setChips} multi />}
        empty="Nenhum registro para os filtros atuais."
      >
        <VirtualList
          items={visible}
          estimateSize={44}
          onEndReached={() => setLimit((l) => Math.min(l + 200, filtered.length))}
          getKey={(r) => r.id}
          renderItem={(r) => (
            <div className="grid grid-cols-[80px_1fr_120px_100px_100px] items-center gap-3 px-3 h-11 border-b border-border/60 text-sm">
              <span className="font-mono text-xs text-muted-foreground">#{r.id}</span>
              <span className="truncate">{r.paciente}</span>
              <span className="text-xs">
                <ModalidadeBadge value={r.modalidade} />
              </span>
              <span className="text-xs">
                <StatusBadge value={r.status} />
              </span>
              <span className="text-right tabular-nums">
                R$ {r.valor.toFixed(2).replace(".", ",")}
              </span>
            </div>
          )}
        />
      </ListShell>

      <CommandPalette
        open={paletteOpen}
        onOpenChange={setPaletteOpen}
        entries={screenEntries}
        placeholder="Buscar telas, pacientes, orçamentos… (demo)"
      />
    </div>
  );
}

function StatusBadge({ value }: { value: Status }) {
  const map: Record<Status, string> = {
    todos: "bg-muted text-muted-foreground",
    aberto: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
    pendente: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
    concluido: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300",
    cancelado: "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300",
  };
  return <span className={`px-2 py-0.5 rounded-full text-[10px] ${map[value]}`}>{value}</span>;
}

function ModalidadeBadge({ value }: { value: DemoRow["modalidade"] }) {
  const label = value === "particular" ? "Particular" : value === "associado" ? "Associado" : "Cartão";
  return <span className="px-2 py-0.5 rounded-full text-[10px] border border-border text-muted-foreground">{label}</span>;
}