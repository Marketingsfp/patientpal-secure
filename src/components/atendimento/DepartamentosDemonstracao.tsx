import { useState } from "react";
import { DepartamentosView } from "./DepartamentosView";
import { DEPARTAMENTOS_INICIAIS, type DadosDepartamentos } from "@/lib/atendimento/departamentos";
import { SemCaixaAlta } from "@/components/ui/caixa-alta";

export function DepartamentosDemonstracao() {
  const [dados, setDados] = useState<DadosDepartamentos>(() => ({
    departamentos: DEPARTAMENTOS_INICIAIS.map((nome, i) => ({
      id: String(i + 1),
      nome,
      ativo: true,
    })),
    atendentes: [
      { userId: "ana", nome: "Ana Martins", departamentoId: "1", presenca: "ONLINE" },
      { userId: "bruna", nome: "Bruna Lima", departamentoId: "2", presenca: "ONLINE" },
      { userId: "carla", nome: "Carla Souza", departamentoId: "2", presenca: "ONLINE" },
      { userId: "diana", nome: "Diana Alves", departamentoId: "3", presenca: "PAUSA" },
      { userId: "elisa", nome: "Elisa Santos", departamentoId: "4", presenca: "OFFLINE" },
      { userId: "fernanda", nome: "Fernanda Costa", departamentoId: null, presenca: "ONLINE" },
    ],
  }));
  return (
    <SemCaixaAlta>
      <main className="mx-auto max-w-6xl p-4 md:p-8">
        <DepartamentosView
          demonstracao
          dados={dados}
          salvarDepartamento={async (id, nome) => {
            if (
              dados.departamentos.some(
                (d) =>
                  d.id !== id &&
                  d.nome.trim().toLocaleLowerCase("pt-BR") ===
                    nome.trim().toLocaleLowerCase("pt-BR"),
              )
            )
              throw new Error("Já existe um departamento com esse nome.");
            setDados((atual) => ({
              ...atual,
              departamentos: id
                ? atual.departamentos.map((d) => (d.id === id ? { ...d, nome } : d))
                : [...atual.departamentos, { id: crypto.randomUUID(), nome, ativo: true }],
            }));
          }}
          vincularAtendente={async (userId, departamentoId) => {
            setDados((atual) => ({
              ...atual,
              atendentes: atual.atendentes.map((a) =>
                a.userId === userId ? { ...a, departamentoId } : a,
              ),
            }));
          }}
        />
      </main>
    </SemCaixaAlta>
  );
}
