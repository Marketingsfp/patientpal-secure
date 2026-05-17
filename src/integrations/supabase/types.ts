export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      agendamentos: {
        Row: {
          clinica_id: string
          created_at: string
          criado_por: string | null
          fim: string
          fluxo_atualizado_em: string
          fluxo_etapa: Database["public"]["Enums"]["fluxo_etapa"]
          id: string
          inicio: string
          link_teleconsulta: string | null
          medico_id: string | null
          observacoes: string | null
          paciente_id: string | null
          paciente_nome: string
          procedimento: string | null
          status: Database["public"]["Enums"]["agendamento_status"]
          teleconsulta: boolean
          token_publico: string | null
          updated_at: string
        }
        Insert: {
          clinica_id: string
          created_at?: string
          criado_por?: string | null
          fim: string
          fluxo_atualizado_em?: string
          fluxo_etapa?: Database["public"]["Enums"]["fluxo_etapa"]
          id?: string
          inicio: string
          link_teleconsulta?: string | null
          medico_id?: string | null
          observacoes?: string | null
          paciente_id?: string | null
          paciente_nome: string
          procedimento?: string | null
          status?: Database["public"]["Enums"]["agendamento_status"]
          teleconsulta?: boolean
          token_publico?: string | null
          updated_at?: string
        }
        Update: {
          clinica_id?: string
          created_at?: string
          criado_por?: string | null
          fim?: string
          fluxo_atualizado_em?: string
          fluxo_etapa?: Database["public"]["Enums"]["fluxo_etapa"]
          id?: string
          inicio?: string
          link_teleconsulta?: string | null
          medico_id?: string | null
          observacoes?: string | null
          paciente_id?: string | null
          paciente_nome?: string
          procedimento?: string | null
          status?: Database["public"]["Enums"]["agendamento_status"]
          teleconsulta?: boolean
          token_publico?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      anamnese_modelos: {
        Row: {
          ativo: boolean
          clinica_id: string
          created_at: string
          descricao: string | null
          id: string
          nome: string
          perguntas: Json
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          clinica_id: string
          created_at?: string
          descricao?: string | null
          id?: string
          nome: string
          perguntas?: Json
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          clinica_id?: string
          created_at?: string
          descricao?: string | null
          id?: string
          nome?: string
          perguntas?: Json
          updated_at?: string
        }
        Relationships: []
      }
      anamnese_respostas: {
        Row: {
          agendamento_id: string | null
          clinica_id: string
          created_at: string
          id: string
          modelo_id: string
          paciente_id: string | null
          respondida_em: string | null
          respostas: Json
          updated_at: string
        }
        Insert: {
          agendamento_id?: string | null
          clinica_id: string
          created_at?: string
          id?: string
          modelo_id: string
          paciente_id?: string | null
          respondida_em?: string | null
          respostas?: Json
          updated_at?: string
        }
        Update: {
          agendamento_id?: string | null
          clinica_id?: string
          created_at?: string
          id?: string
          modelo_id?: string
          paciente_id?: string | null
          respondida_em?: string | null
          respostas?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "anamnese_respostas_agendamento_id_fkey"
            columns: ["agendamento_id"]
            isOneToOne: false
            referencedRelation: "agendamentos"
            referencedColumns: ["id"]
          },
        ]
      }
      boletos: {
        Row: {
          clinica_id: string
          created_at: string
          id: string
          lancamento_id: string | null
          linha_digitavel: string | null
          nosso_numero: string | null
          observacoes: string | null
          paciente_id: string | null
          pago_em: string | null
          status: string
          updated_at: string
          url_pdf: string | null
          valor: number
          vencimento: string
        }
        Insert: {
          clinica_id: string
          created_at?: string
          id?: string
          lancamento_id?: string | null
          linha_digitavel?: string | null
          nosso_numero?: string | null
          observacoes?: string | null
          paciente_id?: string | null
          pago_em?: string | null
          status?: string
          updated_at?: string
          url_pdf?: string | null
          valor: number
          vencimento: string
        }
        Update: {
          clinica_id?: string
          created_at?: string
          id?: string
          lancamento_id?: string | null
          linha_digitavel?: string | null
          nosso_numero?: string | null
          observacoes?: string | null
          paciente_id?: string | null
          pago_em?: string | null
          status?: string
          updated_at?: string
          url_pdf?: string | null
          valor?: number
          vencimento?: string
        }
        Relationships: []
      }
      campanhas_marketing: {
        Row: {
          agendada_para: string | null
          clinica_id: string
          created_at: string
          enviada_em: string | null
          id: string
          mensagem: string
          nome: string
          segmento: string | null
          status: string
          tipo: string
          total_envios: number
          updated_at: string
        }
        Insert: {
          agendada_para?: string | null
          clinica_id: string
          created_at?: string
          enviada_em?: string | null
          id?: string
          mensagem: string
          nome: string
          segmento?: string | null
          status?: string
          tipo?: string
          total_envios?: number
          updated_at?: string
        }
        Update: {
          agendada_para?: string | null
          clinica_id?: string
          created_at?: string
          enviada_em?: string | null
          id?: string
          mensagem?: string
          nome?: string
          segmento?: string | null
          status?: string
          tipo?: string
          total_envios?: number
          updated_at?: string
        }
        Relationships: []
      }
      cartoes_convenio: {
        Row: {
          ativo: boolean
          clinica_id: string
          created_at: string
          descricao: string | null
          id: string
          nome: string
          percentual_desconto: number
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          clinica_id: string
          created_at?: string
          descricao?: string | null
          id?: string
          nome: string
          percentual_desconto?: number
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          clinica_id?: string
          created_at?: string
          descricao?: string | null
          id?: string
          nome?: string
          percentual_desconto?: number
          updated_at?: string
        }
        Relationships: []
      }
      clinica_memberships: {
        Row: {
          ativo: boolean
          clinica_id: string
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          ativo?: boolean
          clinica_id: string
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          ativo?: boolean
          clinica_id?: string
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "clinica_memberships_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "clinicas"
            referencedColumns: ["id"]
          },
        ]
      }
      clinicas: {
        Row: {
          ativo: boolean
          cep: string | null
          cidade: string | null
          cnpj: string | null
          created_at: string
          email: string | null
          endereco: string | null
          estado: string | null
          id: string
          nome: string
          paytime_recipient_id: string | null
          telefone: string | null
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          cep?: string | null
          cidade?: string | null
          cnpj?: string | null
          created_at?: string
          email?: string | null
          endereco?: string | null
          estado?: string | null
          id?: string
          nome: string
          paytime_recipient_id?: string | null
          telefone?: string | null
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          cep?: string | null
          cidade?: string | null
          cnpj?: string | null
          created_at?: string
          email?: string | null
          endereco?: string | null
          estado?: string | null
          id?: string
          nome?: string
          paytime_recipient_id?: string | null
          telefone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      contrato_dependentes: {
        Row: {
          ativo: boolean
          contrato_id: string
          created_at: string
          excluido_em: string | null
          id: string
          incluido_em: string
          paciente_id: string
          paciente_nome: string
          parentesco: string | null
          tipo: string
        }
        Insert: {
          ativo?: boolean
          contrato_id: string
          created_at?: string
          excluido_em?: string | null
          id?: string
          incluido_em?: string
          paciente_id: string
          paciente_nome: string
          parentesco?: string | null
          tipo?: string
        }
        Update: {
          ativo?: boolean
          contrato_id?: string
          created_at?: string
          excluido_em?: string | null
          id?: string
          incluido_em?: string
          paciente_id?: string
          paciente_nome?: string
          parentesco?: string | null
          tipo?: string
        }
        Relationships: [
          {
            foreignKeyName: "contrato_dependentes_contrato_id_fkey"
            columns: ["contrato_id"]
            isOneToOne: false
            referencedRelation: "contratos_assinatura"
            referencedColumns: ["id"]
          },
        ]
      }
      contrato_mensalidades: {
        Row: {
          clinica_id: string
          contrato_id: string
          created_at: string
          forma_pagamento: string | null
          id: string
          juros: number | null
          lancamento_id: string | null
          multa: number | null
          numero_parcela: number
          observacoes: string | null
          pago_em: string | null
          status: string
          updated_at: string
          valor: number
          valor_pago: number | null
          vencimento: string
        }
        Insert: {
          clinica_id: string
          contrato_id: string
          created_at?: string
          forma_pagamento?: string | null
          id?: string
          juros?: number | null
          lancamento_id?: string | null
          multa?: number | null
          numero_parcela: number
          observacoes?: string | null
          pago_em?: string | null
          status?: string
          updated_at?: string
          valor?: number
          valor_pago?: number | null
          vencimento: string
        }
        Update: {
          clinica_id?: string
          contrato_id?: string
          created_at?: string
          forma_pagamento?: string | null
          id?: string
          juros?: number | null
          lancamento_id?: string | null
          multa?: number | null
          numero_parcela?: number
          observacoes?: string | null
          pago_em?: string | null
          status?: string
          updated_at?: string
          valor?: number
          valor_pago?: number | null
          vencimento?: string
        }
        Relationships: [
          {
            foreignKeyName: "contrato_mensalidades_contrato_id_fkey"
            columns: ["contrato_id"]
            isOneToOne: false
            referencedRelation: "contratos_assinatura"
            referencedColumns: ["id"]
          },
        ]
      }
      contratos_assinatura: {
        Row: {
          assinado_em: string | null
          assinatura_ip: string | null
          assinatura_svg: string | null
          clinica_id: string
          created_at: string
          criado_por: string | null
          data_fim: string | null
          data_inicio: string
          dia_vencimento: number
          forma_pagamento: string | null
          id: string
          num_parcelas: number
          numero: number
          observacoes: string | null
          paciente_id: string
          paciente_nome: string
          plano_id: string
          status: string
          taxa_adesao: number
          token_publico: string | null
          updated_at: string
          valor_mensal: number
        }
        Insert: {
          assinado_em?: string | null
          assinatura_ip?: string | null
          assinatura_svg?: string | null
          clinica_id: string
          created_at?: string
          criado_por?: string | null
          data_fim?: string | null
          data_inicio?: string
          dia_vencimento?: number
          forma_pagamento?: string | null
          id?: string
          num_parcelas?: number
          numero?: number
          observacoes?: string | null
          paciente_id: string
          paciente_nome: string
          plano_id: string
          status?: string
          taxa_adesao?: number
          token_publico?: string | null
          updated_at?: string
          valor_mensal?: number
        }
        Update: {
          assinado_em?: string | null
          assinatura_ip?: string | null
          assinatura_svg?: string | null
          clinica_id?: string
          created_at?: string
          criado_por?: string | null
          data_fim?: string | null
          data_inicio?: string
          dia_vencimento?: number
          forma_pagamento?: string | null
          id?: string
          num_parcelas?: number
          numero?: number
          observacoes?: string | null
          paciente_id?: string
          paciente_nome?: string
          plano_id?: string
          status?: string
          taxa_adesao?: number
          token_publico?: string | null
          updated_at?: string
          valor_mensal?: number
        }
        Relationships: [
          {
            foreignKeyName: "contratos_assinatura_plano_id_fkey"
            columns: ["plano_id"]
            isOneToOne: false
            referencedRelation: "planos_assinatura"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_etapas: {
        Row: {
          ativo: boolean
          clinica_id: string
          cor: string
          created_at: string
          id: string
          nome: string
          ordem: number
        }
        Insert: {
          ativo?: boolean
          clinica_id: string
          cor?: string
          created_at?: string
          id?: string
          nome: string
          ordem?: number
        }
        Update: {
          ativo?: boolean
          clinica_id?: string
          cor?: string
          created_at?: string
          id?: string
          nome?: string
          ordem?: number
        }
        Relationships: []
      }
      crm_oportunidades: {
        Row: {
          clinica_id: string
          created_at: string
          email: string | null
          etapa_id: string | null
          id: string
          nome_lead: string
          observacoes: string | null
          origem: string | null
          paciente_id: string | null
          responsavel_id: string | null
          status: Database["public"]["Enums"]["crm_status"]
          telefone: string | null
          updated_at: string
          valor_estimado: number
        }
        Insert: {
          clinica_id: string
          created_at?: string
          email?: string | null
          etapa_id?: string | null
          id?: string
          nome_lead: string
          observacoes?: string | null
          origem?: string | null
          paciente_id?: string | null
          responsavel_id?: string | null
          status?: Database["public"]["Enums"]["crm_status"]
          telefone?: string | null
          updated_at?: string
          valor_estimado?: number
        }
        Update: {
          clinica_id?: string
          created_at?: string
          email?: string | null
          etapa_id?: string | null
          id?: string
          nome_lead?: string
          observacoes?: string | null
          origem?: string | null
          paciente_id?: string | null
          responsavel_id?: string | null
          status?: Database["public"]["Enums"]["crm_status"]
          telefone?: string | null
          updated_at?: string
          valor_estimado?: number
        }
        Relationships: []
      }
      documentos_emitidos: {
        Row: {
          assinado: boolean
          assinado_em: string | null
          clinica_id: string
          conteudo: string
          created_at: string
          id: string
          medico_id: string | null
          modelo_id: string | null
          paciente_id: string | null
          tipo: Database["public"]["Enums"]["tipo_documento"]
          titulo: string
          updated_at: string
        }
        Insert: {
          assinado?: boolean
          assinado_em?: string | null
          clinica_id: string
          conteudo: string
          created_at?: string
          id?: string
          medico_id?: string | null
          modelo_id?: string | null
          paciente_id?: string | null
          tipo?: Database["public"]["Enums"]["tipo_documento"]
          titulo: string
          updated_at?: string
        }
        Update: {
          assinado?: boolean
          assinado_em?: string | null
          clinica_id?: string
          conteudo?: string
          created_at?: string
          id?: string
          medico_id?: string | null
          modelo_id?: string | null
          paciente_id?: string | null
          tipo?: Database["public"]["Enums"]["tipo_documento"]
          titulo?: string
          updated_at?: string
        }
        Relationships: []
      }
      especialidades: {
        Row: {
          ativo: boolean
          created_at: string
          descricao: string | null
          id: string
          nome: string
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          descricao?: string | null
          id?: string
          nome: string
        }
        Update: {
          ativo?: boolean
          created_at?: string
          descricao?: string | null
          id?: string
          nome?: string
        }
        Relationships: []
      }
      estoque_movimentos: {
        Row: {
          clinica_id: string
          created_at: string
          custo_unitario: number | null
          data: string
          id: string
          observacoes: string | null
          produto_id: string
          quantidade: number
          tipo: Database["public"]["Enums"]["estoque_movimento_tipo"]
        }
        Insert: {
          clinica_id: string
          created_at?: string
          custo_unitario?: number | null
          data?: string
          id?: string
          observacoes?: string | null
          produto_id: string
          quantidade: number
          tipo: Database["public"]["Enums"]["estoque_movimento_tipo"]
        }
        Update: {
          clinica_id?: string
          created_at?: string
          custo_unitario?: number | null
          data?: string
          id?: string
          observacoes?: string | null
          produto_id?: string
          quantidade?: number
          tipo?: Database["public"]["Enums"]["estoque_movimento_tipo"]
        }
        Relationships: []
      }
      estoque_produtos: {
        Row: {
          ativo: boolean
          clinica_id: string
          codigo: string | null
          created_at: string
          custo_unitario: number
          estoque_atual: number
          estoque_minimo: number
          id: string
          nome: string
          observacoes: string | null
          unidade: string
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          clinica_id: string
          codigo?: string | null
          created_at?: string
          custo_unitario?: number
          estoque_atual?: number
          estoque_minimo?: number
          id?: string
          nome: string
          observacoes?: string | null
          unidade?: string
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          clinica_id?: string
          codigo?: string | null
          created_at?: string
          custo_unitario?: number
          estoque_atual?: number
          estoque_minimo?: number
          id?: string
          nome?: string
          observacoes?: string | null
          unidade?: string
          updated_at?: string
        }
        Relationships: []
      }
      fin_alertas: {
        Row: {
          clinica_id: string
          created_at: string
          data_alerta: string
          id: string
          lancamento_id: string | null
          lido: boolean
          mensagem: string
          tipo_alerta: string
        }
        Insert: {
          clinica_id: string
          created_at?: string
          data_alerta?: string
          id?: string
          lancamento_id?: string | null
          lido?: boolean
          mensagem: string
          tipo_alerta: string
        }
        Update: {
          clinica_id?: string
          created_at?: string
          data_alerta?: string
          id?: string
          lancamento_id?: string | null
          lido?: boolean
          mensagem?: string
          tipo_alerta?: string
        }
        Relationships: [
          {
            foreignKeyName: "fin_alertas_lancamento_id_fkey"
            columns: ["lancamento_id"]
            isOneToOne: false
            referencedRelation: "fin_lancamentos"
            referencedColumns: ["id"]
          },
        ]
      }
      fin_atendimentos: {
        Row: {
          clinica_id: string
          created_at: string
          data: string
          forma_pagamento: string | null
          id: string
          lancamento_id: string | null
          medico_id: string | null
          observacoes: string | null
          paciente_id: string | null
          procedimento: string | null
          status: string
          updated_at: string
          valor_clinica: number
          valor_medico: number
          valor_total: number
        }
        Insert: {
          clinica_id: string
          created_at?: string
          data?: string
          forma_pagamento?: string | null
          id?: string
          lancamento_id?: string | null
          medico_id?: string | null
          observacoes?: string | null
          paciente_id?: string | null
          procedimento?: string | null
          status?: string
          updated_at?: string
          valor_clinica?: number
          valor_medico?: number
          valor_total?: number
        }
        Update: {
          clinica_id?: string
          created_at?: string
          data?: string
          forma_pagamento?: string | null
          id?: string
          lancamento_id?: string | null
          medico_id?: string | null
          observacoes?: string | null
          paciente_id?: string | null
          procedimento?: string | null
          status?: string
          updated_at?: string
          valor_clinica?: number
          valor_medico?: number
          valor_total?: number
        }
        Relationships: [
          {
            foreignKeyName: "fin_atendimentos_lancamento_id_fkey"
            columns: ["lancamento_id"]
            isOneToOne: false
            referencedRelation: "fin_lancamentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fin_atendimentos_medico_id_fkey"
            columns: ["medico_id"]
            isOneToOne: false
            referencedRelation: "medicos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fin_atendimentos_paciente_id_fkey"
            columns: ["paciente_id"]
            isOneToOne: false
            referencedRelation: "pacientes"
            referencedColumns: ["id"]
          },
        ]
      }
      fin_categorias: {
        Row: {
          ativo: boolean
          clinica_id: string
          cor: string
          created_at: string
          id: string
          nome: string
          tipo: Database["public"]["Enums"]["fin_tipo_lancamento"]
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          clinica_id: string
          cor?: string
          created_at?: string
          id?: string
          nome: string
          tipo: Database["public"]["Enums"]["fin_tipo_lancamento"]
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          clinica_id?: string
          cor?: string
          created_at?: string
          id?: string
          nome?: string
          tipo?: Database["public"]["Enums"]["fin_tipo_lancamento"]
          updated_at?: string
        }
        Relationships: []
      }
      fin_contas: {
        Row: {
          agencia: string | null
          ativo: boolean
          banco: string | null
          clinica_id: string
          conta: string | null
          created_at: string
          id: string
          nome: string
          saldo_inicial: number
          tipo: Database["public"]["Enums"]["fin_tipo_conta"]
          updated_at: string
        }
        Insert: {
          agencia?: string | null
          ativo?: boolean
          banco?: string | null
          clinica_id: string
          conta?: string | null
          created_at?: string
          id?: string
          nome: string
          saldo_inicial?: number
          tipo?: Database["public"]["Enums"]["fin_tipo_conta"]
          updated_at?: string
        }
        Update: {
          agencia?: string | null
          ativo?: boolean
          banco?: string | null
          clinica_id?: string
          conta?: string | null
          created_at?: string
          id?: string
          nome?: string
          saldo_inicial?: number
          tipo?: Database["public"]["Enums"]["fin_tipo_conta"]
          updated_at?: string
        }
        Relationships: []
      }
      fin_empresas: {
        Row: {
          ativo: boolean
          clinica_id: string
          cnpj: string | null
          created_at: string
          email: string | null
          id: string
          nome: string
          observacoes: string | null
          telefone: string | null
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          clinica_id: string
          cnpj?: string | null
          created_at?: string
          email?: string | null
          id?: string
          nome: string
          observacoes?: string | null
          telefone?: string | null
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          clinica_id?: string
          cnpj?: string | null
          created_at?: string
          email?: string | null
          id?: string
          nome?: string
          observacoes?: string | null
          telefone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      fin_lancamentos: {
        Row: {
          categoria_id: string | null
          clinica_id: string
          conta_id: string | null
          created_at: string
          criado_por: string | null
          data: string
          data_vencimento: string | null
          descricao: string
          empresa_id: string | null
          forma_pagamento: string | null
          id: string
          medico_id: string | null
          observacoes: string | null
          paciente_id: string | null
          status: Database["public"]["Enums"]["fin_status_lancamento"]
          tipo: Database["public"]["Enums"]["fin_tipo_lancamento"]
          updated_at: string
          valor: number
        }
        Insert: {
          categoria_id?: string | null
          clinica_id: string
          conta_id?: string | null
          created_at?: string
          criado_por?: string | null
          data?: string
          data_vencimento?: string | null
          descricao: string
          empresa_id?: string | null
          forma_pagamento?: string | null
          id?: string
          medico_id?: string | null
          observacoes?: string | null
          paciente_id?: string | null
          status?: Database["public"]["Enums"]["fin_status_lancamento"]
          tipo: Database["public"]["Enums"]["fin_tipo_lancamento"]
          updated_at?: string
          valor: number
        }
        Update: {
          categoria_id?: string | null
          clinica_id?: string
          conta_id?: string | null
          created_at?: string
          criado_por?: string | null
          data?: string
          data_vencimento?: string | null
          descricao?: string
          empresa_id?: string | null
          forma_pagamento?: string | null
          id?: string
          medico_id?: string | null
          observacoes?: string | null
          paciente_id?: string | null
          status?: Database["public"]["Enums"]["fin_status_lancamento"]
          tipo?: Database["public"]["Enums"]["fin_tipo_lancamento"]
          updated_at?: string
          valor?: number
        }
        Relationships: [
          {
            foreignKeyName: "fin_lancamentos_categoria_id_fkey"
            columns: ["categoria_id"]
            isOneToOne: false
            referencedRelation: "fin_categorias"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fin_lancamentos_conta_id_fkey"
            columns: ["conta_id"]
            isOneToOne: false
            referencedRelation: "fin_contas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fin_lancamentos_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "fin_empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fin_lancamentos_medico_id_fkey"
            columns: ["medico_id"]
            isOneToOne: false
            referencedRelation: "medicos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fin_lancamentos_paciente_id_fkey"
            columns: ["paciente_id"]
            isOneToOne: false
            referencedRelation: "pacientes"
            referencedColumns: ["id"]
          },
        ]
      }
      fin_lembretes: {
        Row: {
          clinica_id: string
          concluido: boolean
          created_at: string
          data_lembrete: string
          descricao: string | null
          id: string
          prioridade: string
          titulo: string
          updated_at: string
        }
        Insert: {
          clinica_id: string
          concluido?: boolean
          created_at?: string
          data_lembrete: string
          descricao?: string | null
          id?: string
          prioridade?: string
          titulo: string
          updated_at?: string
        }
        Update: {
          clinica_id?: string
          concluido?: boolean
          created_at?: string
          data_lembrete?: string
          descricao?: string | null
          id?: string
          prioridade?: string
          titulo?: string
          updated_at?: string
        }
        Relationships: []
      }
      fin_notas_pacientes: {
        Row: {
          clinica_id: string
          created_at: string
          data_emissao: string
          id: string
          lancamento_id: string | null
          numero: string | null
          observacoes: string | null
          paciente_id: string | null
          serie: string | null
          status: string
          updated_at: string
          url_pdf: string | null
          valor: number
        }
        Insert: {
          clinica_id: string
          created_at?: string
          data_emissao?: string
          id?: string
          lancamento_id?: string | null
          numero?: string | null
          observacoes?: string | null
          paciente_id?: string | null
          serie?: string | null
          status?: string
          updated_at?: string
          url_pdf?: string | null
          valor?: number
        }
        Update: {
          clinica_id?: string
          created_at?: string
          data_emissao?: string
          id?: string
          lancamento_id?: string | null
          numero?: string | null
          observacoes?: string | null
          paciente_id?: string | null
          serie?: string | null
          status?: string
          updated_at?: string
          url_pdf?: string | null
          valor?: number
        }
        Relationships: [
          {
            foreignKeyName: "fin_notas_pacientes_lancamento_id_fkey"
            columns: ["lancamento_id"]
            isOneToOne: false
            referencedRelation: "fin_lancamentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fin_notas_pacientes_paciente_id_fkey"
            columns: ["paciente_id"]
            isOneToOne: false
            referencedRelation: "pacientes"
            referencedColumns: ["id"]
          },
        ]
      }
      fin_regras_ia: {
        Row: {
          ativo: boolean
          categoria_id: string | null
          clinica_id: string
          created_at: string
          id: string
          nome: string
          padrao_descricao: string | null
          prioridade: number
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          categoria_id?: string | null
          clinica_id: string
          created_at?: string
          id?: string
          nome: string
          padrao_descricao?: string | null
          prioridade?: number
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          categoria_id?: string | null
          clinica_id?: string
          created_at?: string
          id?: string
          nome?: string
          padrao_descricao?: string | null
          prioridade?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fin_regras_ia_categoria_id_fkey"
            columns: ["categoria_id"]
            isOneToOne: false
            referencedRelation: "fin_categorias"
            referencedColumns: ["id"]
          },
        ]
      }
      medico_biometria: {
        Row: {
          clinica_id: string
          consentimento_em: string
          created_at: string
          descriptor: Json
          id: string
          medico_id: string
          revogado_em: string | null
          user_id: string | null
        }
        Insert: {
          clinica_id: string
          consentimento_em?: string
          created_at?: string
          descriptor: Json
          id?: string
          medico_id: string
          revogado_em?: string | null
          user_id?: string | null
        }
        Update: {
          clinica_id?: string
          consentimento_em?: string
          created_at?: string
          descriptor?: Json
          id?: string
          medico_id?: string
          revogado_em?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      medico_convenios: {
        Row: {
          ativo: boolean
          created_at: string
          id: string
          medico_id: string
          nome: string
          percentual: number | null
          tipo_repasse: string
          updated_at: string
          valor: number | null
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          id?: string
          medico_id: string
          nome: string
          percentual?: number | null
          tipo_repasse?: string
          updated_at?: string
          valor?: number | null
        }
        Update: {
          ativo?: boolean
          created_at?: string
          id?: string
          medico_id?: string
          nome?: string
          percentual?: number | null
          tipo_repasse?: string
          updated_at?: string
          valor?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "medico_convenios_medico_id_fkey"
            columns: ["medico_id"]
            isOneToOne: false
            referencedRelation: "medicos"
            referencedColumns: ["id"]
          },
        ]
      }
      medico_disponibilidades: {
        Row: {
          ativo: boolean
          clinica_id: string
          created_at: string
          dia_semana: number
          hora_fim: string
          hora_inicio: string
          id: string
          medico_id: string
          observacoes: string | null
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          clinica_id: string
          created_at?: string
          dia_semana: number
          hora_fim: string
          hora_inicio: string
          id?: string
          medico_id: string
          observacoes?: string | null
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          clinica_id?: string
          created_at?: string
          dia_semana?: number
          hora_fim?: string
          hora_inicio?: string
          id?: string
          medico_id?: string
          observacoes?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      medico_especialidades: {
        Row: {
          created_at: string
          especialidade_id: string
          medico_id: string
        }
        Insert: {
          created_at?: string
          especialidade_id: string
          medico_id: string
        }
        Update: {
          created_at?: string
          especialidade_id?: string
          medico_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "medico_especialidades_especialidade_id_fkey"
            columns: ["especialidade_id"]
            isOneToOne: false
            referencedRelation: "especialidades"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "medico_especialidades_medico_id_fkey"
            columns: ["medico_id"]
            isOneToOne: false
            referencedRelation: "medicos"
            referencedColumns: ["id"]
          },
        ]
      }
      medicos: {
        Row: {
          agencia: string | null
          ativo: boolean
          bairro: string | null
          banco: string | null
          cep: string | null
          cidade: string | null
          clinica_id: string
          complemento: string | null
          conta: string | null
          cpf: string | null
          created_at: string
          crm: string
          crm_uf: string
          data_nascimento: string | null
          email: string | null
          especialidade_id: string | null
          estado: string | null
          estado_civil: string | null
          face_atualizado_em: string | null
          face_descriptor: number[] | null
          id: string
          logradouro: string | null
          nacionalidade: string | null
          nome: string
          numero: string | null
          paytime_recipient_id: string | null
          percentual_repasse_padrao: number
          pix_chave: string | null
          rg: string | null
          telefone: string | null
          tipo_repasse: string
          updated_at: string
          user_id: string | null
          valor_repasse_padrao: number | null
        }
        Insert: {
          agencia?: string | null
          ativo?: boolean
          bairro?: string | null
          banco?: string | null
          cep?: string | null
          cidade?: string | null
          clinica_id: string
          complemento?: string | null
          conta?: string | null
          cpf?: string | null
          created_at?: string
          crm: string
          crm_uf: string
          data_nascimento?: string | null
          email?: string | null
          especialidade_id?: string | null
          estado?: string | null
          estado_civil?: string | null
          face_atualizado_em?: string | null
          face_descriptor?: number[] | null
          id?: string
          logradouro?: string | null
          nacionalidade?: string | null
          nome: string
          numero?: string | null
          paytime_recipient_id?: string | null
          percentual_repasse_padrao?: number
          pix_chave?: string | null
          rg?: string | null
          telefone?: string | null
          tipo_repasse?: string
          updated_at?: string
          user_id?: string | null
          valor_repasse_padrao?: number | null
        }
        Update: {
          agencia?: string | null
          ativo?: boolean
          bairro?: string | null
          banco?: string | null
          cep?: string | null
          cidade?: string | null
          clinica_id?: string
          complemento?: string | null
          conta?: string | null
          cpf?: string | null
          created_at?: string
          crm?: string
          crm_uf?: string
          data_nascimento?: string | null
          email?: string | null
          especialidade_id?: string | null
          estado?: string | null
          estado_civil?: string | null
          face_atualizado_em?: string | null
          face_descriptor?: number[] | null
          id?: string
          logradouro?: string | null
          nacionalidade?: string | null
          nome?: string
          numero?: string | null
          paytime_recipient_id?: string | null
          percentual_repasse_padrao?: number
          pix_chave?: string | null
          rg?: string | null
          telefone?: string | null
          tipo_repasse?: string
          updated_at?: string
          user_id?: string | null
          valor_repasse_padrao?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "medicos_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "clinicas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "medicos_especialidade_id_fkey"
            columns: ["especialidade_id"]
            isOneToOne: false
            referencedRelation: "especialidades"
            referencedColumns: ["id"]
          },
        ]
      }
      modelos_documentos: {
        Row: {
          ativo: boolean
          clinica_id: string
          conteudo: string
          created_at: string
          id: string
          nome: string
          tipo: Database["public"]["Enums"]["tipo_documento"]
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          clinica_id: string
          conteudo: string
          created_at?: string
          id?: string
          nome: string
          tipo?: Database["public"]["Enums"]["tipo_documento"]
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          clinica_id?: string
          conteudo?: string
          created_at?: string
          id?: string
          nome?: string
          tipo?: Database["public"]["Enums"]["tipo_documento"]
          updated_at?: string
        }
        Relationships: []
      }
      nfse: {
        Row: {
          clinica_id: string
          created_at: string
          data_emissao: string
          descricao_servicos: string | null
          id: string
          medico_id: string | null
          numero: string | null
          observacoes: string | null
          paciente_id: string | null
          serie: string | null
          status: string
          updated_at: string
          url_pdf: string | null
          url_xml: string | null
          valor_iss: number
          valor_servicos: number
        }
        Insert: {
          clinica_id: string
          created_at?: string
          data_emissao?: string
          descricao_servicos?: string | null
          id?: string
          medico_id?: string | null
          numero?: string | null
          observacoes?: string | null
          paciente_id?: string | null
          serie?: string | null
          status?: string
          updated_at?: string
          url_pdf?: string | null
          url_xml?: string | null
          valor_iss?: number
          valor_servicos?: number
        }
        Update: {
          clinica_id?: string
          created_at?: string
          data_emissao?: string
          descricao_servicos?: string | null
          id?: string
          medico_id?: string | null
          numero?: string | null
          observacoes?: string | null
          paciente_id?: string | null
          serie?: string | null
          status?: string
          updated_at?: string
          url_pdf?: string | null
          url_xml?: string | null
          valor_iss?: number
          valor_servicos?: number
        }
        Relationships: []
      }
      orcamento_itens: {
        Row: {
          created_at: string
          descricao: string
          id: string
          orcamento_id: string
          ordem: number
          procedimento_id: string | null
          quantidade: number
          valor_total: number
          valor_unitario: number
        }
        Insert: {
          created_at?: string
          descricao: string
          id?: string
          orcamento_id: string
          ordem?: number
          procedimento_id?: string | null
          quantidade?: number
          valor_total?: number
          valor_unitario?: number
        }
        Update: {
          created_at?: string
          descricao?: string
          id?: string
          orcamento_id?: string
          ordem?: number
          procedimento_id?: string | null
          quantidade?: number
          valor_total?: number
          valor_unitario?: number
        }
        Relationships: [
          {
            foreignKeyName: "orcamento_itens_orcamento_id_fkey"
            columns: ["orcamento_id"]
            isOneToOne: false
            referencedRelation: "orcamentos"
            referencedColumns: ["id"]
          },
        ]
      }
      orcamentos: {
        Row: {
          clinica_id: string
          created_at: string
          criado_por: string | null
          desconto: number
          forma_pagamento: string | null
          id: string
          medico_id: string | null
          medico_nome: string | null
          numero: number
          observacoes: string | null
          paciente_cpf: string | null
          paciente_id: string | null
          paciente_nome: string
          paciente_telefone: string | null
          status: string
          updated_at: string
          validade_dias: number
          valor_total: number
        }
        Insert: {
          clinica_id: string
          created_at?: string
          criado_por?: string | null
          desconto?: number
          forma_pagamento?: string | null
          id?: string
          medico_id?: string | null
          medico_nome?: string | null
          numero: number
          observacoes?: string | null
          paciente_cpf?: string | null
          paciente_id?: string | null
          paciente_nome: string
          paciente_telefone?: string | null
          status?: string
          updated_at?: string
          validade_dias?: number
          valor_total?: number
        }
        Update: {
          clinica_id?: string
          created_at?: string
          criado_por?: string | null
          desconto?: number
          forma_pagamento?: string | null
          id?: string
          medico_id?: string | null
          medico_nome?: string | null
          numero?: number
          observacoes?: string | null
          paciente_cpf?: string | null
          paciente_id?: string | null
          paciente_nome?: string
          paciente_telefone?: string | null
          status?: string
          updated_at?: string
          validade_dias?: number
          valor_total?: number
        }
        Relationships: []
      }
      paciente_biometria: {
        Row: {
          clinica_id: string
          consentimento_em: string
          created_at: string
          descriptor: Json
          id: string
          paciente_id: string
          revogado_em: string | null
        }
        Insert: {
          clinica_id: string
          consentimento_em?: string
          created_at?: string
          descriptor: Json
          id?: string
          paciente_id: string
          revogado_em?: string | null
        }
        Update: {
          clinica_id?: string
          consentimento_em?: string
          created_at?: string
          descriptor?: Json
          id?: string
          paciente_id?: string
          revogado_em?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "paciente_biometria_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "clinicas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "paciente_biometria_paciente_id_fkey"
            columns: ["paciente_id"]
            isOneToOne: false
            referencedRelation: "pacientes"
            referencedColumns: ["id"]
          },
        ]
      }
      pacientes: {
        Row: {
          ativo: boolean
          bairro: string | null
          cep: string | null
          cidade: string | null
          clinica_id: string
          complemento: string | null
          consentimento_lgpd_em: string | null
          cpf: string | null
          created_at: string
          data_nascimento: string | null
          email: string | null
          estado: string | null
          face_atualizado_em: string | null
          face_descriptor: number[] | null
          id: string
          logradouro: string | null
          nome: string
          numero: string | null
          numero_pasta: string | null
          responsavel_cpf: string | null
          responsavel_nome: string | null
          responsavel_parentesco: string | null
          responsavel_telefone: string | null
          telefone: string | null
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          bairro?: string | null
          cep?: string | null
          cidade?: string | null
          clinica_id: string
          complemento?: string | null
          consentimento_lgpd_em?: string | null
          cpf?: string | null
          created_at?: string
          data_nascimento?: string | null
          email?: string | null
          estado?: string | null
          face_atualizado_em?: string | null
          face_descriptor?: number[] | null
          id?: string
          logradouro?: string | null
          nome: string
          numero?: string | null
          numero_pasta?: string | null
          responsavel_cpf?: string | null
          responsavel_nome?: string | null
          responsavel_parentesco?: string | null
          responsavel_telefone?: string | null
          telefone?: string | null
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          bairro?: string | null
          cep?: string | null
          cidade?: string | null
          clinica_id?: string
          complemento?: string | null
          consentimento_lgpd_em?: string | null
          cpf?: string | null
          created_at?: string
          data_nascimento?: string | null
          email?: string | null
          estado?: string | null
          face_atualizado_em?: string | null
          face_descriptor?: number[] | null
          id?: string
          logradouro?: string | null
          nome?: string
          numero?: string | null
          numero_pasta?: string | null
          responsavel_cpf?: string | null
          responsavel_nome?: string | null
          responsavel_parentesco?: string | null
          responsavel_telefone?: string | null
          telefone?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pacientes_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "clinicas"
            referencedColumns: ["id"]
          },
        ]
      }
      pagamento_splits: {
        Row: {
          beneficiario_tipo: Database["public"]["Enums"]["split_beneficiario_tipo"]
          clinica_id: string
          created_at: string
          emite_nf: boolean
          id: string
          medico_id: string | null
          nfse_id: string | null
          pagamento_id: string
          paytime_recipient_id: string | null
          percentual: number | null
          prestador_id: string | null
          rotulo: string | null
          status: string
          valor: number
        }
        Insert: {
          beneficiario_tipo: Database["public"]["Enums"]["split_beneficiario_tipo"]
          clinica_id: string
          created_at?: string
          emite_nf?: boolean
          id?: string
          medico_id?: string | null
          nfse_id?: string | null
          pagamento_id: string
          paytime_recipient_id?: string | null
          percentual?: number | null
          prestador_id?: string | null
          rotulo?: string | null
          status?: string
          valor: number
        }
        Update: {
          beneficiario_tipo?: Database["public"]["Enums"]["split_beneficiario_tipo"]
          clinica_id?: string
          created_at?: string
          emite_nf?: boolean
          id?: string
          medico_id?: string | null
          nfse_id?: string | null
          pagamento_id?: string
          paytime_recipient_id?: string | null
          percentual?: number | null
          prestador_id?: string | null
          rotulo?: string | null
          status?: string
          valor?: number
        }
        Relationships: [
          {
            foreignKeyName: "pagamento_splits_pagamento_id_fkey"
            columns: ["pagamento_id"]
            isOneToOne: false
            referencedRelation: "pagamentos"
            referencedColumns: ["id"]
          },
        ]
      }
      pagamentos: {
        Row: {
          agendamento_id: string | null
          atendimento_id: string | null
          autorizacao: string | null
          clinica_id: string
          created_at: string
          criado_por: string | null
          forma: Database["public"]["Enums"]["pagamento_forma"]
          id: string
          nsu: string | null
          observacoes: string | null
          paciente_id: string | null
          parcelas: number
          paytime_payload: Json | null
          paytime_transaction_id: string | null
          procedimento_id: string | null
          status: Database["public"]["Enums"]["pagamento_status"]
          updated_at: string
          valor_bruto: number
          valor_liquido: number
          valor_taxa: number
        }
        Insert: {
          agendamento_id?: string | null
          atendimento_id?: string | null
          autorizacao?: string | null
          clinica_id: string
          created_at?: string
          criado_por?: string | null
          forma?: Database["public"]["Enums"]["pagamento_forma"]
          id?: string
          nsu?: string | null
          observacoes?: string | null
          paciente_id?: string | null
          parcelas?: number
          paytime_payload?: Json | null
          paytime_transaction_id?: string | null
          procedimento_id?: string | null
          status?: Database["public"]["Enums"]["pagamento_status"]
          updated_at?: string
          valor_bruto: number
          valor_liquido?: number
          valor_taxa?: number
        }
        Update: {
          agendamento_id?: string | null
          atendimento_id?: string | null
          autorizacao?: string | null
          clinica_id?: string
          created_at?: string
          criado_por?: string | null
          forma?: Database["public"]["Enums"]["pagamento_forma"]
          id?: string
          nsu?: string | null
          observacoes?: string | null
          paciente_id?: string | null
          parcelas?: number
          paytime_payload?: Json | null
          paytime_transaction_id?: string | null
          procedimento_id?: string | null
          status?: Database["public"]["Enums"]["pagamento_status"]
          updated_at?: string
          valor_bruto?: number
          valor_liquido?: number
          valor_taxa?: number
        }
        Relationships: []
      }
      planos_assinatura: {
        Row: {
          ativo: boolean
          clinica_id: string
          created_at: string
          descricao_beneficios: string | null
          fidelidade_meses: number
          id: string
          max_agregados: number
          max_dependentes: number
          nome: string
          num_parcelas: number
          taxa_adesao: number
          template_contrato: string | null
          tipo: string
          updated_at: string
          valor_mensal: number
          vigencia_meses: number
        }
        Insert: {
          ativo?: boolean
          clinica_id: string
          created_at?: string
          descricao_beneficios?: string | null
          fidelidade_meses?: number
          id?: string
          max_agregados?: number
          max_dependentes?: number
          nome: string
          num_parcelas?: number
          taxa_adesao?: number
          template_contrato?: string | null
          tipo?: string
          updated_at?: string
          valor_mensal?: number
          vigencia_meses?: number
        }
        Update: {
          ativo?: boolean
          clinica_id?: string
          created_at?: string
          descricao_beneficios?: string | null
          fidelidade_meses?: number
          id?: string
          max_agregados?: number
          max_dependentes?: number
          nome?: string
          num_parcelas?: number
          taxa_adesao?: number
          template_contrato?: string | null
          tipo?: string
          updated_at?: string
          valor_mensal?: number
          vigencia_meses?: number
        }
        Relationships: []
      }
      prestadores: {
        Row: {
          agencia: string | null
          ativo: boolean
          banco: string | null
          clinica_id: string
          cnpj: string | null
          conta: string | null
          created_at: string
          email: string | null
          emite_nf_propria: boolean
          id: string
          inscricao_municipal: string | null
          nome: string
          observacoes: string | null
          pix_chave: string | null
          responsavel: string | null
          telefone: string | null
          tipo: Database["public"]["Enums"]["prestador_tipo"]
          updated_at: string
        }
        Insert: {
          agencia?: string | null
          ativo?: boolean
          banco?: string | null
          clinica_id: string
          cnpj?: string | null
          conta?: string | null
          created_at?: string
          email?: string | null
          emite_nf_propria?: boolean
          id?: string
          inscricao_municipal?: string | null
          nome: string
          observacoes?: string | null
          pix_chave?: string | null
          responsavel?: string | null
          telefone?: string | null
          tipo?: Database["public"]["Enums"]["prestador_tipo"]
          updated_at?: string
        }
        Update: {
          agencia?: string | null
          ativo?: boolean
          banco?: string | null
          clinica_id?: string
          cnpj?: string | null
          conta?: string | null
          created_at?: string
          email?: string | null
          emite_nf_propria?: boolean
          id?: string
          inscricao_municipal?: string | null
          nome?: string
          observacoes?: string | null
          pix_chave?: string | null
          responsavel?: string | null
          telefone?: string | null
          tipo?: Database["public"]["Enums"]["prestador_tipo"]
          updated_at?: string
        }
        Relationships: []
      }
      procedimento_split_regras: {
        Row: {
          ativo: boolean
          beneficiario_tipo: Database["public"]["Enums"]["split_beneficiario_tipo"]
          clinica_id: string
          created_at: string
          emite_nf: boolean
          id: string
          medico_id: string | null
          observacoes: string | null
          ordem: number
          percentual: number | null
          prestador_id: string | null
          procedimento_id: string
          rotulo: string | null
          updated_at: string
          valor_fixo: number | null
        }
        Insert: {
          ativo?: boolean
          beneficiario_tipo: Database["public"]["Enums"]["split_beneficiario_tipo"]
          clinica_id: string
          created_at?: string
          emite_nf?: boolean
          id?: string
          medico_id?: string | null
          observacoes?: string | null
          ordem?: number
          percentual?: number | null
          prestador_id?: string | null
          procedimento_id: string
          rotulo?: string | null
          updated_at?: string
          valor_fixo?: number | null
        }
        Update: {
          ativo?: boolean
          beneficiario_tipo?: Database["public"]["Enums"]["split_beneficiario_tipo"]
          clinica_id?: string
          created_at?: string
          emite_nf?: boolean
          id?: string
          medico_id?: string | null
          observacoes?: string | null
          ordem?: number
          percentual?: number | null
          prestador_id?: string | null
          procedimento_id?: string
          rotulo?: string | null
          updated_at?: string
          valor_fixo?: number | null
        }
        Relationships: []
      }
      procedimentos: {
        Row: {
          ativo: boolean
          clinica_id: string
          codigo: string | null
          created_at: string
          duracao_minutos: number
          grupo: string | null
          id: string
          nome: string
          observacoes: string | null
          preparo: string | null
          tipo: Database["public"]["Enums"]["procedimento_tipo"]
          updated_at: string
          valor_cartao: number
          valor_cartao_consulta: number
          valor_cartao_credito: number
          valor_cartao_debito: number
          valor_cartao_desconto: number
          valor_dinheiro: number
          valor_dinheiro_pix: number
          valor_padrao: number
          valor_pix: number
        }
        Insert: {
          ativo?: boolean
          clinica_id: string
          codigo?: string | null
          created_at?: string
          duracao_minutos?: number
          grupo?: string | null
          id?: string
          nome: string
          observacoes?: string | null
          preparo?: string | null
          tipo?: Database["public"]["Enums"]["procedimento_tipo"]
          updated_at?: string
          valor_cartao?: number
          valor_cartao_consulta?: number
          valor_cartao_credito?: number
          valor_cartao_debito?: number
          valor_cartao_desconto?: number
          valor_dinheiro?: number
          valor_dinheiro_pix?: number
          valor_padrao?: number
          valor_pix?: number
        }
        Update: {
          ativo?: boolean
          clinica_id?: string
          codigo?: string | null
          created_at?: string
          duracao_minutos?: number
          grupo?: string | null
          id?: string
          nome?: string
          observacoes?: string | null
          preparo?: string | null
          tipo?: Database["public"]["Enums"]["procedimento_tipo"]
          updated_at?: string
          valor_cartao?: number
          valor_cartao_consulta?: number
          valor_cartao_credito?: number
          valor_cartao_debito?: number
          valor_cartao_desconto?: number
          valor_dinheiro?: number
          valor_dinheiro_pix?: number
          valor_padrao?: number
          valor_pix?: number
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          id: string
          nome: string
          telefone: string | null
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          id: string
          nome: string
          telefone?: string | null
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          id?: string
          nome?: string
          telefone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      prontuario_modelos: {
        Row: {
          ativo: boolean
          clinica_id: string
          created_at: string
          especialidade_id: string | null
          id: string
          nome: string
          prompt_ia: string | null
          secoes: Json
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          clinica_id: string
          created_at?: string
          especialidade_id?: string | null
          id?: string
          nome: string
          prompt_ia?: string | null
          secoes?: Json
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          clinica_id?: string
          created_at?: string
          especialidade_id?: string | null
          id?: string
          nome?: string
          prompt_ia?: string | null
          secoes?: Json
          updated_at?: string
        }
        Relationships: []
      }
      prontuarios: {
        Row: {
          clinica_id: string
          conduta: string | null
          created_at: string
          data: string
          exame_fisico: string | null
          hipotese_diagnostica: string | null
          historia_doenca: string | null
          id: string
          medico_id: string | null
          observacoes: string | null
          paciente_id: string
          prescricao: string | null
          queixa_principal: string | null
          updated_at: string
        }
        Insert: {
          clinica_id: string
          conduta?: string | null
          created_at?: string
          data?: string
          exame_fisico?: string | null
          hipotese_diagnostica?: string | null
          historia_doenca?: string | null
          id?: string
          medico_id?: string | null
          observacoes?: string | null
          paciente_id: string
          prescricao?: string | null
          queixa_principal?: string | null
          updated_at?: string
        }
        Update: {
          clinica_id?: string
          conduta?: string | null
          created_at?: string
          data?: string
          exame_fisico?: string | null
          hipotese_diagnostica?: string | null
          historia_doenca?: string | null
          id?: string
          medico_id?: string | null
          observacoes?: string | null
          paciente_id?: string
          prescricao?: string | null
          queixa_principal?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      regras_rateio: {
        Row: {
          ativo: boolean
          clinica_id: string
          created_at: string
          especialidade_id: string | null
          forma_pagamento: Database["public"]["Enums"]["forma_pagamento"] | null
          id: string
          medico_id: string | null
          nome: string
          observacoes: string | null
          percentual_clinica: number
          percentual_medico: number
          prioridade: number
          procedimento: string | null
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          clinica_id: string
          created_at?: string
          especialidade_id?: string | null
          forma_pagamento?:
            | Database["public"]["Enums"]["forma_pagamento"]
            | null
          id?: string
          medico_id?: string | null
          nome: string
          observacoes?: string | null
          percentual_clinica: number
          percentual_medico: number
          prioridade?: number
          procedimento?: string | null
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          clinica_id?: string
          created_at?: string
          especialidade_id?: string | null
          forma_pagamento?:
            | Database["public"]["Enums"]["forma_pagamento"]
            | null
          id?: string
          medico_id?: string | null
          nome?: string
          observacoes?: string | null
          percentual_clinica?: number
          percentual_medico?: number
          prioridade?: number
          procedimento?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "regras_rateio_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "clinicas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "regras_rateio_especialidade_id_fkey"
            columns: ["especialidade_id"]
            isOneToOne: false
            referencedRelation: "especialidades"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "regras_rateio_medico_id_fkey"
            columns: ["medico_id"]
            isOneToOne: false
            referencedRelation: "medicos"
            referencedColumns: ["id"]
          },
        ]
      }
      senhas: {
        Row: {
          atendida_em: string | null
          cancelada_em: string | null
          chamada_em: string | null
          chamada_por: string | null
          clinica_id: string
          codigo: string
          data_dia: string
          emitida_em: string
          guiche: string | null
          id: string
          identificado_por_facial: boolean
          numero: number
          paciente_id: string | null
          status: Database["public"]["Enums"]["status_senha"]
          tipo: Database["public"]["Enums"]["tipo_senha"]
        }
        Insert: {
          atendida_em?: string | null
          cancelada_em?: string | null
          chamada_em?: string | null
          chamada_por?: string | null
          clinica_id: string
          codigo: string
          data_dia?: string
          emitida_em?: string
          guiche?: string | null
          id?: string
          identificado_por_facial?: boolean
          numero: number
          paciente_id?: string | null
          status?: Database["public"]["Enums"]["status_senha"]
          tipo: Database["public"]["Enums"]["tipo_senha"]
        }
        Update: {
          atendida_em?: string | null
          cancelada_em?: string | null
          chamada_em?: string | null
          chamada_por?: string | null
          clinica_id?: string
          codigo?: string
          data_dia?: string
          emitida_em?: string
          guiche?: string | null
          id?: string
          identificado_por_facial?: boolean
          numero?: number
          paciente_id?: string | null
          status?: Database["public"]["Enums"]["status_senha"]
          tipo?: Database["public"]["Enums"]["tipo_senha"]
        }
        Relationships: [
          {
            foreignKeyName: "senhas_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "clinicas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "senhas_paciente_id_fkey"
            columns: ["paciente_id"]
            isOneToOne: false
            referencedRelation: "pacientes"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_templates: {
        Row: {
          ativo: boolean
          clinica_id: string
          created_at: string
          evento: string
          id: string
          mensagem: string
          nome: string
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          clinica_id: string
          created_at?: string
          evento: string
          id?: string
          mensagem: string
          nome: string
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          clinica_id?: string
          created_at?: string
          evento?: string
          id?: string
          mensagem?: string
          nome?: string
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      assinar_contrato_publico: {
        Args: { _assinatura_svg: string; _ip: string; _token: string }
        Returns: string
      }
      can_manage_clinica: {
        Args: { _clinica_id: string; _user_id: string }
        Returns: boolean
      }
      chamar_proxima_senha: {
        Args: { _clinica_id: string; _guiche: string }
        Returns: {
          atendida_em: string | null
          cancelada_em: string | null
          chamada_em: string | null
          chamada_por: string | null
          clinica_id: string
          codigo: string
          data_dia: string
          emitida_em: string
          guiche: string | null
          id: string
          identificado_por_facial: boolean
          numero: number
          paciente_id: string | null
          status: Database["public"]["Enums"]["status_senha"]
          tipo: Database["public"]["Enums"]["tipo_senha"]
        }
        SetofOptions: {
          from: "*"
          to: "senhas"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      consulta_publica: { Args: { _token: string }; Returns: Json }
      contrato_publico: { Args: { _token: string }; Returns: Json }
      criar_clinica_com_admin: {
        Args: {
          _cidade?: string
          _cnpj?: string
          _estado?: string
          _nome: string
          _telefone?: string
        }
        Returns: string
      }
      emitir_senha: {
        Args: {
          _clinica_id: string
          _identificado_facial?: boolean
          _paciente_id?: string
          _tipo: Database["public"]["Enums"]["tipo_senha"]
        }
        Returns: {
          atendida_em: string | null
          cancelada_em: string | null
          chamada_em: string | null
          chamada_por: string | null
          clinica_id: string
          codigo: string
          data_dia: string
          emitida_em: string
          guiche: string | null
          id: string
          identificado_por_facial: boolean
          numero: number
          paciente_id: string | null
          status: Database["public"]["Enums"]["status_senha"]
          tipo: Database["public"]["Enums"]["tipo_senha"]
        }
        SetofOptions: {
          from: "*"
          to: "senhas"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      has_role: {
        Args: {
          _clinica_id: string
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_member: {
        Args: { _clinica_id: string; _user_id: string }
        Returns: boolean
      }
      medicos_face_lista: {
        Args: { _clinica_id: string }
        Returns: {
          descriptor: Json
          email: string
          medico_id: string
          nome: string
          user_id: string
        }[]
      }
      meus_cartoes: { Args: never; Returns: Json }
      minhas_consultas: {
        Args: never
        Returns: {
          clinica_nome: string
          fim: string
          id: string
          inicio: string
          medico_especialidade: string
          medico_nome: string
          paciente_nome: string
          procedimento: string
          status: Database["public"]["Enums"]["agendamento_status"]
          teleconsulta: boolean
          token_publico: string
        }[]
      }
      pacientes_face_lista: {
        Args: { _clinica_id: string }
        Returns: {
          descriptor: Json
          id: string
          nome: string
        }[]
      }
      pendencias_paciente: { Args: { _paciente_id: string }; Returns: Json }
      salvar_anamnese_publica: {
        Args: { _modelo_id: string; _respostas: Json; _token: string }
        Returns: string
      }
      seed_prontuario_modelos_padrao: {
        Args: { _clinica_id: string }
        Returns: undefined
      }
      user_is_any_manager: { Args: { _user_id: string }; Returns: boolean }
    }
    Enums: {
      agendamento_status:
        | "agendado"
        | "confirmado"
        | "realizado"
        | "cancelado"
        | "faltou"
      app_role:
        | "admin"
        | "gestor"
        | "medico"
        | "enfermeiro"
        | "recepcao"
        | "financeiro"
      crm_status: "aberta" | "ganha" | "perdida"
      estoque_movimento_tipo: "entrada" | "saida" | "ajuste"
      fin_status_lancamento: "pendente" | "confirmado" | "cancelado"
      fin_tipo_conta: "caixa" | "banco" | "cartao" | "maquininha" | "outro"
      fin_tipo_lancamento: "receita" | "despesa"
      fluxo_etapa:
        | "aguardando_recepcao"
        | "recepcao"
        | "caixa"
        | "triagem"
        | "atendimento"
        | "exame"
        | "finalizado"
      forma_pagamento:
        | "dinheiro"
        | "pix"
        | "cartao_credito"
        | "cartao_debito"
        | "convenio"
        | "cartao_proprio"
        | "boleto"
        | "transferencia"
      pagamento_forma:
        | "paytime_credito"
        | "paytime_debito"
        | "paytime_pix"
        | "dinheiro"
        | "pix"
        | "cartao_credito"
        | "cartao_debito"
        | "boleto"
        | "outro"
      pagamento_status:
        | "pendente"
        | "autorizado"
        | "capturado"
        | "falhou"
        | "estornado"
        | "cancelado"
      prestador_tipo:
        | "laboratorio"
        | "clinica_imagem"
        | "locador_equipamento"
        | "parceiro_pj"
        | "outro"
      procedimento_tipo: "consulta" | "exame" | "procedimento"
      split_beneficiario_tipo: "clinica" | "medico" | "prestador" | "outro"
      status_senha: "emitida" | "chamada" | "atendida" | "cancelada"
      tipo_documento:
        | "atestado"
        | "receita"
        | "laudo"
        | "declaracao"
        | "contrato"
        | "outro"
      tipo_senha: "N" | "P" | "E" | "R"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      agendamento_status: [
        "agendado",
        "confirmado",
        "realizado",
        "cancelado",
        "faltou",
      ],
      app_role: [
        "admin",
        "gestor",
        "medico",
        "enfermeiro",
        "recepcao",
        "financeiro",
      ],
      crm_status: ["aberta", "ganha", "perdida"],
      estoque_movimento_tipo: ["entrada", "saida", "ajuste"],
      fin_status_lancamento: ["pendente", "confirmado", "cancelado"],
      fin_tipo_conta: ["caixa", "banco", "cartao", "maquininha", "outro"],
      fin_tipo_lancamento: ["receita", "despesa"],
      fluxo_etapa: [
        "aguardando_recepcao",
        "recepcao",
        "caixa",
        "triagem",
        "atendimento",
        "exame",
        "finalizado",
      ],
      forma_pagamento: [
        "dinheiro",
        "pix",
        "cartao_credito",
        "cartao_debito",
        "convenio",
        "cartao_proprio",
        "boleto",
        "transferencia",
      ],
      pagamento_forma: [
        "paytime_credito",
        "paytime_debito",
        "paytime_pix",
        "dinheiro",
        "pix",
        "cartao_credito",
        "cartao_debito",
        "boleto",
        "outro",
      ],
      pagamento_status: [
        "pendente",
        "autorizado",
        "capturado",
        "falhou",
        "estornado",
        "cancelado",
      ],
      prestador_tipo: [
        "laboratorio",
        "clinica_imagem",
        "locador_equipamento",
        "parceiro_pj",
        "outro",
      ],
      procedimento_tipo: ["consulta", "exame", "procedimento"],
      split_beneficiario_tipo: ["clinica", "medico", "prestador", "outro"],
      status_senha: ["emitida", "chamada", "atendida", "cancelada"],
      tipo_documento: [
        "atestado",
        "receita",
        "laudo",
        "declaracao",
        "contrato",
        "outro",
      ],
      tipo_senha: ["N", "P", "E", "R"],
    },
  },
} as const
