## Objetivo
Ao clicar em **Editar** dentro do popup **"Informações do cliente"** da Agenda, abrir a edição do paciente em um **dialog na própria aba**, em vez de navegar para `/app/clientes/:id/editar`. O usuário permanece na Agenda, salva, e o dialog fecha.

## Análise (4 eixos)
- **Financeiro:** neutro.
- **Operacional:** elimina troca de aba/rota e o "voltar" — recepção economiza cliques em toda edição feita a partir da Agenda.
- **Experiência:** contexto da Agenda preservado (filtros, data, agendamento aberto).
- **Segurança:** nenhuma mudança de permissão — o `ClienteForm` já respeita `usePodeEscrever("clientes")` internamente e RLS de `pacientes` continua igual.

## Clínica-alvo
Confirmar antes de implementar: aplicar em **todas as 3 clínicas** (é ajuste puramente de UI da Agenda, sem regra de negócio)? Assumo que sim salvo indicação contrária.

## Escopo
Um único arquivo: `src/routes/_authenticated/app.agenda.tsx`.

Alteração pontual no bloco do `Dialog` "Informações do cliente" (linhas ~7981-8046):

1. Trocar o `onClick` do botão **Editar** (hoje faz `window.location.href = /app/clientes/${id}/editar`) por abrir um novo estado `editarPacienteOpen`.
2. Renderizar, logo abaixo do dialog atual, um novo `<Dialog>` com o componente já existente `ClienteForm` (de `@/components/clientes/cliente-form`), passando:
   - `clinicaId={clinicaAtual.clinica_id}`
   - `paciente={pacInfo}` (já carregado)
   - `readOnly={!podeEscreverClientes}` — usar `usePodeEscrever("clientes")`, mesmo hook usado na página dedicada
   - `onCancel` → fecha o dialog
   - `onSaved` → fecha o dialog, fecha o popup "Informações do cliente" e recarrega os dados do paciente/agenda (invalidar a query de agendamentos do dia para refletir nome/telefone se mudarem)

## Fora do escopo
- Não alterar `ClienteForm`, rotas de clientes, permissões nem regra de negócio.
- Não mexer nas outras entradas de edição (menu Clientes continua funcionando igual, com página dedicada).
- Não tocar em outras clínicas de forma diferenciada (usa a mesma UI global).

## Riscos
- Baixo. O `ClienteForm` é o mesmo usado em `app.clientes.$pacienteId.editar.tsx`, então o comportamento de salvar/validar é idêntico.
- Possível "dialog dentro de dialog": será encadeado (fechar o de edição volta para o de informações), padrão já usado em outros pontos do sistema.

## Validação
- Abrir agendamento → clicar no nome do paciente → **Editar**: o formulário abre no mesmo dialog, sem trocar de rota.
- Salvar: toast de sucesso, dialog fecha, permanece na Agenda com filtros preservados.
- Cancelar: fecha sem alterar nada.
- Usuário sem permissão em "clientes": campos ficam em modo leitura (mesmo comportamento da página dedicada).