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
      { userId: "elisa", nome: "Elisa Santos", departamentoId: "3", presenca: "OFFLINE" },
      { userId: "fernanda", nome: "Fernanda Costa", departamentoId: "1", presenca: "ONLINE" },
    ],
  }));
  return (
    <SemCaixaAlta>
      <main className="mx-auto max-w-6xl p-4 md:p-8">
        <DepartamentosView
          demonstracao
          dados={dados}
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
