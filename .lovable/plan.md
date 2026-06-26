## Objetivo
Permitir cadastrar/editar o e-mail (e telefone) do titular sem sair da tela de "Novo contrato" do Cartão Benefício, preservando tudo que já foi preenchido (faixa, tipo de cobrança, dependentes, observações).

## Como vai funcionar

1. Ao lado do nome do titular selecionado em `src/components/pages/contratos-page.tsx`, adiciono um ícone de lápis (✏️ "Editar dados do titular").
2. O alerta vermelho "Titular precisa ter e-mail..." ganha um botão **"Cadastrar e-mail agora"** que abre o mesmo modal — atalho direto a partir da mensagem de erro.
3. O clique abre um **Dialog modal** (sobreposto, sem trocar de rota) com os campos essenciais:
   - Nome (somente leitura, para confirmação)
   - **E-mail** (foco automático quando o motivo de abrir foi o alerta)
   - Telefone / WhatsApp
   - CPF e Data de nascimento (somente leitura)
   - Botões: **Voltar** (fecha sem salvar) e **Salvar e continuar**
4. Ao salvar:
   - `UPDATE` em `pacientes` apenas dos campos alterados (email / telefone).
   - Atualizo o paciente carregado no estado local (`titular`) com os novos valores — **nada do formulário de contrato é resetado**.
   - Modal fecha e o alerta de e-mail some automaticamente, liberando o botão "Salvar e imprimir".
5. Se o usuário clicar em **Voltar**, volta exatamente para a tela de venda como estava.

O mesmo ícone também fica disponível em cada dependente da lista, para o caso de querer corrigir um dado do dependente sem recomeçar.

## Detalhes técnicos
- Componente novo: `src/components/contratos/editar-paciente-rapido-dialog.tsx` (usa shadcn `Dialog`, `Input`, `Button`).
- Validação de e-mail com Zod (mesmo padrão já usado no projeto).
- Atualização via `supabase.from('pacientes').update(...)` respeitando RLS atual.
- Sem mudança de rota, sem `navigate`, sem recarregar — o estado do contrato (`faixa`, `tipoCobranca`, `dependentes`, `observacoes`) permanece intacto porque o modal é renderizado por cima do mesmo componente.
- Não altero regras de venda, cálculo de mensalidade nem geração de carnê/boleto.

## Fora do escopo
- Edição completa do cadastro do paciente (endereço, documentos, foto facial, etc.) — para isso continua existindo a tela `/app/pacientes`. Aqui é só o conjunto mínimo que destrava a venda.