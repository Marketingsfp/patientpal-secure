## Problema observado

Contrato #20261894 (Quédima) mostra **Pagas 12/24** porque, ao renovar por
extensão (mesmo convênio), a RPC `renovar_contrato_extensao` acrescenta as 12
novas mensalidades (nº 13 a 24) **no mesmo contrato**. Não há um contrato
"filho" — é o mesmo `contrato_id` com dois ciclos de 12 parcelas.

Consulta confirmou:
- 24 linhas em `contrato_mensalidades` para o contrato atual (1‑12 pagas,
  13‑24 pendentes).
- 1 linha em `contrato_renovacoes` com `tipo='extensao'` e
  `parcelas_geradas=12`.

Não é regra de negócio nova: é a mesma correção que já foi feita para
"contratos anteriores do mesmo paciente", agora aplicada aos **ciclos de
renovação por extensão dentro do mesmo contrato**.

## O que muda (apenas visual, sem tocar em banco)

Alteração restrita a `src/components/pages/contratos-page.tsx`.

1. Carregar `contrato_renovacoes` do contrato atual (ordenadas por
   `created_at`) para conhecer os tamanhos de cada ciclo (`parcelas_geradas`).
2. Calcular ciclos a partir de `numero_parcela` (ignorando adesão/taxa com
   `numero_parcela <= 0`):
   - Ciclo 1 = parcelas 1 até `num_parcelas` do contrato original (12).
   - Ciclo 2 = próximas `parcelas_geradas` (13–24).
   - E assim por diante para futuras renovações.
3. **Card "Pagas X/Y"** passa a refletir apenas o **ciclo atual** (o último),
   ficando 0/12 logo após a renovação e evoluindo conforme os pagamentos.
4. Nova seção **"Ciclos anteriores deste contrato"** (padrão visual idêntico
   ao "Contratos anteriores deste paciente"), listando cada ciclo antigo com:
   Ciclo, Período (venc. da 1ª → última parcela), Parcelas pagas (ex.: 12/12),
   Tipo (Original / Renovação por extensão).
5. Na tabela **Mensalidades**, inserir uma linha de cabeçalho separadora
   entre ciclos (ex.: "Renovação — 15/06/2026 a 15/05/2027") para deixar
   claro onde começa cada ciclo. Adesão e Taxa de inclusão continuam no topo,
   fora de qualquer ciclo.
6. Drill‑down do card "Pagas" continua mostrando pagamentos, mas restrito ao
   ciclo atual, para bater com o denominador.

## Fora do escopo

- Não altero RPCs (`renovar_contrato_extensao`, `troca_plano`) nem o banco.
- Não altero a lógica de pagamento/reversão das parcelas.
- Não mexo em cards "Recebido" e "A receber" — continuam somando o contrato
  todo (dinheiro real recebido/a receber não muda por causa da visão em
  ciclos).

## Validação

- Abrir contrato #20261894: card deve mostrar **Pagas 0/12** (ciclo atual);
  seção "Ciclos anteriores deste contrato" com 1 linha (Original 12/12);
  tabela Mensalidades com um separador antes da parcela 13.
- Abrir um contrato sem renovação: nada muda (sem seção de ciclos, contagem
  igual à atual).
- Abrir contrato renovado com troca de plano: continua funcionando como hoje
  (esse fluxo já gera contrato novo e cai na seção "Contratos anteriores do
  mesmo paciente").
