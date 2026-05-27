## Objetivo

Mover os ícones **"Cadastrar biometria facial"** (`ScanFace`) e **"Ver prontuário"** (`FileHeart`) da listagem `/app/clientes` para dentro da página de edição do cliente, transformando cada um em uma aba do formulário.

## Mudanças

### 1. `src/components/clientes/cliente-form.tsx` — adicionar 2 novas abas

A `TabsList` passa de 3 para **5 colunas** (`grid-cols-5`):

```
Dados | Endereço | Responsável | Biometria | Prontuário
```

As abas Biometria e Prontuário só renderizam conteúdo útil em modo edição (`paciente !== null`); em "Novo cliente" mostram aviso "Salve o cadastro para usar este recurso".

**Aba Biometria** (move toda a lógica de `app.clientes.index.tsx`):
- Estado local: `hasBiometria` (boolean), `consentOpen`, `faceOpen`.
- Mostra status (Cadastrada / Não cadastrada).
- Botão "Cadastrar biometria" → abre diálogo de consentimento LGPD (mesmo texto atual) → abre `FaceCaptureDialog`.
- Se já cadastrada: botão "Remover biometria" (mesma confirmação atual).
- Reaproveita `FaceCaptureDialog`, mesmas queries em `paciente_biometria`.

**Aba Prontuário** (move o diálogo atual para conteúdo inline):
- Carrega a lista de prontuários (mesma query atual em `prontuarios` + join `medicos`) ao montar/quando o paciente muda.
- Renderiza a mesma lista de cards de atendimentos que hoje aparece no Dialog (sem o Dialog).
- Estado de loading e mensagem "Nenhum registro" idênticos aos atuais.

### 2. `src/routes/_authenticated/app.clientes.index.tsx` — remover o que foi movido

- Remover os botões `ScanFace` e `FileHeart` da coluna "Ações" (sobram apenas Editar e Excluir).
- Remover o estado e funções relacionados: `faceFor`, `consentFor`, `prontFor`, `prontList`, `prontLoading`, `hasBiometria`, `abrirProntuario`, `salvarBiometria`, `revogarBiometria`, e os `useEffect` que carregam biometrias.
- Remover os Dialogs de consentimento LGPD e de Prontuário, e o `FaceCaptureDialog`.
- Remover imports não usados (`ScanFace`, `FileHeart`, `FaceCaptureDialog`, `Loader2` se ficar órfão, `DialogFooter` se ficar órfão).
- A coluna "Ações" pode estreitar (de `w-40` para `w-24`).

## Fora do escopo

- Não muda o diálogo de "Novo cliente" (continua sem essas abas funcionais — apenas com o aviso de "salve primeiro").
- Não muda fluxo de captura facial (`FaceCaptureDialog`) nem o conteúdo do termo LGPD.
- Não cria página separada de prontuário — fica embutida como aba dentro de "Editar cliente".
