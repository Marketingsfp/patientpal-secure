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
      agendamento_historico_notas: {
        Row: {
          agendamento_id: string
          clinica_id: string
          created_at: string
          id: string
          texto: string
          user_email: string | null
          user_nome: string | null
        }
        Insert: {
          agendamento_id: string
          clinica_id: string
          created_at?: string
          id?: string
          texto: string
          user_email?: string | null
          user_nome?: string | null
        }
        Update: {
          agendamento_id?: string
          clinica_id?: string
          created_at?: string
          id?: string
          texto?: string
          user_email?: string | null
          user_nome?: string | null
        }
        Relationships: []
      }
      agendamento_orcamento_itens: {
        Row: {
          agendamento_id: string
          clinica_id: string
          created_at: string
          id: string
          orcamento_id: string
          orcamento_item_id: string
        }
        Insert: {
          agendamento_id: string
          clinica_id: string
          created_at?: string
          id?: string
          orcamento_id: string
          orcamento_item_id: string
        }
        Update: {
          agendamento_id?: string
          clinica_id?: string
          created_at?: string
          id?: string
          orcamento_id?: string
          orcamento_item_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "agendamento_orcamento_itens_agendamento_id_fkey"
            columns: ["agendamento_id"]
            isOneToOne: false
            referencedRelation: "agendamentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agendamento_orcamento_itens_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "clinicas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agendamento_orcamento_itens_orcamento_id_fkey"
            columns: ["orcamento_id"]
            isOneToOne: false
            referencedRelation: "orcamentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agendamento_orcamento_itens_orcamento_item_id_fkey"
            columns: ["orcamento_item_id"]
            isOneToOne: false
            referencedRelation: "orcamento_itens"
            referencedColumns: ["id"]
          },
        ]
      }
      agendamentos: {
        Row: {
          agenda_id: string | null
          atendimento_grupo_id: string | null
          cancelamento_em: string | null
          cancelamento_motivo: string | null
          cancelamento_por: string | null
          clinica_id: string
          convenio_autorizado: boolean
          convenio_autorizado_em: string | null
          convenio_autorizado_por: string | null
          created_at: string
          criado_por: string | null
          data_pagamento: string | null
          edit_lock_at: string | null
          edit_lock_by: string | null
          edit_lock_by_nome: string | null
          enfermagem_recurso_id: string | null
          especialidade_id: string | null
          executado_em: string | null
          executado_por: string | null
          ficha_numero: number | null
          fim: string
          fluxo_atualizado_em: string
          fluxo_etapa: Database["public"]["Enums"]["fluxo_etapa"]
          forma_pagamento_prevista: string | null
          id: string
          id_externo: string | null
          inicio: string
          is_mock_data: boolean
          link_teleconsulta: string | null
          medico_id: string | null
          observacoes: string | null
          orcamento_id: string | null
          orcamento_item_id: string | null
          origem_clinica_id: string | null
          origem_clinica_nome: string | null
          origem_externa: boolean
          origem_gr_numero: string | null
          origem_integracao: string | null
          origem_valor: number | null
          paciente_id: string | null
          paciente_nome: string
          pacote_id: string | null
          prioridade: Database["public"]["Enums"]["agendamento_prioridade"]
          procedimento: string | null
          reagendamento_em: string | null
          reagendamento_motivo: string | null
          reagendamento_por: string | null
          sem_faturamento: boolean
          sem_faturamento_autorizado_por: string | null
          sem_faturamento_autorizado_por_nome: string | null
          sem_faturamento_em: string | null
          sem_faturamento_motivo: string | null
          sem_faturamento_por: string | null
          sem_faturamento_por_nome: string | null
          sinalizado_em: string | null
          sinalizado_por: string | null
          sinalizado_por_nome: string | null
          solicitacao_pendente: boolean
          status: Database["public"]["Enums"]["agendamento_status"]
          teleconsulta: boolean
          tipo_atendimento: string
          token_publico: string | null
          updated_at: string
          valor_cobranca: number | null
        }
        Insert: {
          agenda_id?: string | null
          atendimento_grupo_id?: string | null
          cancelamento_em?: string | null
          cancelamento_motivo?: string | null
          cancelamento_por?: string | null
          clinica_id: string
          convenio_autorizado?: boolean
          convenio_autorizado_em?: string | null
          convenio_autorizado_por?: string | null
          created_at?: string
          criado_por?: string | null
          data_pagamento?: string | null
          edit_lock_at?: string | null
          edit_lock_by?: string | null
          edit_lock_by_nome?: string | null
          enfermagem_recurso_id?: string | null
          especialidade_id?: string | null
          executado_em?: string | null
          executado_por?: string | null
          ficha_numero?: number | null
          fim: string
          fluxo_atualizado_em?: string
          fluxo_etapa?: Database["public"]["Enums"]["fluxo_etapa"]
          forma_pagamento_prevista?: string | null
          id?: string
          id_externo?: string | null
          inicio: string
          is_mock_data?: boolean
          link_teleconsulta?: string | null
          medico_id?: string | null
          observacoes?: string | null
          orcamento_id?: string | null
          orcamento_item_id?: string | null
          origem_clinica_id?: string | null
          origem_clinica_nome?: string | null
          origem_externa?: boolean
          origem_gr_numero?: string | null
          origem_integracao?: string | null
          origem_valor?: number | null
          paciente_id?: string | null
          paciente_nome: string
          pacote_id?: string | null
          prioridade?: Database["public"]["Enums"]["agendamento_prioridade"]
          procedimento?: string | null
          reagendamento_em?: string | null
          reagendamento_motivo?: string | null
          reagendamento_por?: string | null
          sem_faturamento?: boolean
          sem_faturamento_autorizado_por?: string | null
          sem_faturamento_autorizado_por_nome?: string | null
          sem_faturamento_em?: string | null
          sem_faturamento_motivo?: string | null
          sem_faturamento_por?: string | null
          sem_faturamento_por_nome?: string | null
          sinalizado_em?: string | null
          sinalizado_por?: string | null
          sinalizado_por_nome?: string | null
          solicitacao_pendente?: boolean
          status?: Database["public"]["Enums"]["agendamento_status"]
          teleconsulta?: boolean
          tipo_atendimento?: string
          token_publico?: string | null
          updated_at?: string
          valor_cobranca?: number | null
        }
        Update: {
          agenda_id?: string | null
          atendimento_grupo_id?: string | null
          cancelamento_em?: string | null
          cancelamento_motivo?: string | null
          cancelamento_por?: string | null
          clinica_id?: string
          convenio_autorizado?: boolean
          convenio_autorizado_em?: string | null
          convenio_autorizado_por?: string | null
          created_at?: string
          criado_por?: string | null
          data_pagamento?: string | null
          edit_lock_at?: string | null
          edit_lock_by?: string | null
          edit_lock_by_nome?: string | null
          enfermagem_recurso_id?: string | null
          especialidade_id?: string | null
          executado_em?: string | null
          executado_por?: string | null
          ficha_numero?: number | null
          fim?: string
          fluxo_atualizado_em?: string
          fluxo_etapa?: Database["public"]["Enums"]["fluxo_etapa"]
          forma_pagamento_prevista?: string | null
          id?: string
          id_externo?: string | null
          inicio?: string
          is_mock_data?: boolean
          link_teleconsulta?: string | null
          medico_id?: string | null
          observacoes?: string | null
          orcamento_id?: string | null
          orcamento_item_id?: string | null
          origem_clinica_id?: string | null
          origem_clinica_nome?: string | null
          origem_externa?: boolean
          origem_gr_numero?: string | null
          origem_integracao?: string | null
          origem_valor?: number | null
          paciente_id?: string | null
          paciente_nome?: string
          pacote_id?: string | null
          prioridade?: Database["public"]["Enums"]["agendamento_prioridade"]
          procedimento?: string | null
          reagendamento_em?: string | null
          reagendamento_motivo?: string | null
          reagendamento_por?: string | null
          sem_faturamento?: boolean
          sem_faturamento_autorizado_por?: string | null
          sem_faturamento_autorizado_por_nome?: string | null
          sem_faturamento_em?: string | null
          sem_faturamento_motivo?: string | null
          sem_faturamento_por?: string | null
          sem_faturamento_por_nome?: string | null
          sinalizado_em?: string | null
          sinalizado_por?: string | null
          sinalizado_por_nome?: string | null
          solicitacao_pendente?: boolean
          status?: Database["public"]["Enums"]["agendamento_status"]
          teleconsulta?: boolean
          tipo_atendimento?: string
          token_publico?: string | null
          updated_at?: string
          valor_cobranca?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "agendamentos_agenda_id_fkey"
            columns: ["agenda_id"]
            isOneToOne: false
            referencedRelation: "medico_agendas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agendamentos_enfermagem_recurso_id_fkey"
            columns: ["enfermagem_recurso_id"]
            isOneToOne: false
            referencedRelation: "enfermagem_recursos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agendamentos_especialidade_id_fkey"
            columns: ["especialidade_id"]
            isOneToOne: false
            referencedRelation: "especialidades"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agendamentos_medico_id_fkey"
            columns: ["medico_id"]
            isOneToOne: false
            referencedRelation: "medicos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agendamentos_orcamento_id_fkey"
            columns: ["orcamento_id"]
            isOneToOne: false
            referencedRelation: "orcamentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agendamentos_orcamento_item_id_fkey"
            columns: ["orcamento_item_id"]
            isOneToOne: false
            referencedRelation: "orcamento_itens"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agendamentos_origem_clinica_id_fkey"
            columns: ["origem_clinica_id"]
            isOneToOne: false
            referencedRelation: "clinicas"
            referencedColumns: ["id"]
          },
        ]
      }
      agendamentos_fim_backup_20260805: {
        Row: {
          agendamento_id: string
          criado_em: string
          fim_antigo: string | null
          inicio: string
        }
        Insert: {
          agendamento_id: string
          criado_em?: string
          fim_antigo?: string | null
          inicio: string
        }
        Update: {
          agendamento_id?: string
          criado_em?: string
          fim_antigo?: string | null
          inicio?: string
        }
        Relationships: []
      }
      agendamentos_respacamento_backup_20260805: {
        Row: {
          fim: string | null
          id: string
          inicio: string | null
          removido: boolean | null
          salvo_em: string | null
        }
        Insert: {
          fim?: string | null
          id: string
          inicio?: string | null
          removido?: boolean | null
          salvo_em?: string | null
        }
        Update: {
          fim?: string | null
          id?: string
          inicio?: string | null
          removido?: boolean | null
          salvo_em?: string | null
        }
        Relationships: []
      }
      alertas_enfermagem: {
        Row: {
          clinica_id: string
          contatado_em: string | null
          created_at: string
          descricao: string | null
          id: string
          mensagem_sugerida: string | null
          observacao_contato: string | null
          origem: string
          origem_id: string | null
          paciente_id: string | null
          paciente_nome: string | null
          resolvido_em: string | null
          responsavel_id: string | null
          severidade: Database["public"]["Enums"]["resultado_status"]
          status: Database["public"]["Enums"]["alerta_enf_status"]
          titulo: string
          updated_at: string
        }
        Insert: {
          clinica_id: string
          contatado_em?: string | null
          created_at?: string
          descricao?: string | null
          id?: string
          mensagem_sugerida?: string | null
          observacao_contato?: string | null
          origem?: string
          origem_id?: string | null
          paciente_id?: string | null
          paciente_nome?: string | null
          resolvido_em?: string | null
          responsavel_id?: string | null
          severidade?: Database["public"]["Enums"]["resultado_status"]
          status?: Database["public"]["Enums"]["alerta_enf_status"]
          titulo: string
          updated_at?: string
        }
        Update: {
          clinica_id?: string
          contatado_em?: string | null
          created_at?: string
          descricao?: string | null
          id?: string
          mensagem_sugerida?: string | null
          observacao_contato?: string | null
          origem?: string
          origem_id?: string | null
          paciente_id?: string | null
          paciente_nome?: string | null
          resolvido_em?: string | null
          responsavel_id?: string | null
          severidade?: Database["public"]["Enums"]["resultado_status"]
          status?: Database["public"]["Enums"]["alerta_enf_status"]
          titulo?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "alertas_enfermagem_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "clinicas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "alertas_enfermagem_paciente_id_fkey"
            columns: ["paciente_id"]
            isOneToOne: false
            referencedRelation: "pacientes"
            referencedColumns: ["id"]
          },
        ]
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
      atend_agente_presenca: {
        Row: {
          aceita_novas: boolean
          clinica_id: string
          created_at: string
          id: string
          status: string
          updated_at: string
          user_id: string
          visto_em: string
        }
        Insert: {
          aceita_novas?: boolean
          clinica_id: string
          created_at?: string
          id?: string
          status?: string
          updated_at?: string
          user_id: string
          visto_em?: string
        }
        Update: {
          aceita_novas?: boolean
          clinica_id?: string
          created_at?: string
          id?: string
          status?: string
          updated_at?: string
          user_id?: string
          visto_em?: string
        }
        Relationships: []
      }
      atend_avaliacoes: {
        Row: {
          clinica_id: string
          comentario: string | null
          conversa_id: string
          created_at: string
          id: string
          nota: number
        }
        Insert: {
          clinica_id: string
          comentario?: string | null
          conversa_id: string
          created_at?: string
          id?: string
          nota: number
        }
        Update: {
          clinica_id?: string
          comentario?: string | null
          conversa_id?: string
          created_at?: string
          id?: string
          nota?: number
        }
        Relationships: [
          {
            foreignKeyName: "atend_avaliacoes_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "clinicas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "atend_avaliacoes_conversa_id_fkey"
            columns: ["conversa_id"]
            isOneToOne: false
            referencedRelation: "atend_conversas"
            referencedColumns: ["id"]
          },
        ]
      }
      atend_bot_configs: {
        Row: {
          ai_model: string | null
          ai_prompt: string | null
          ativo: boolean
          bot_type: string
          clinica_id: string
          created_at: string
          departamento_id: string | null
          fallback_departamento_id: string | null
          flow_definition: Json | null
          id: string
          max_ai_interactions: number
          menu_options: Json | null
          updated_at: string
          welcome_message: string | null
        }
        Insert: {
          ai_model?: string | null
          ai_prompt?: string | null
          ativo?: boolean
          bot_type?: string
          clinica_id: string
          created_at?: string
          departamento_id?: string | null
          fallback_departamento_id?: string | null
          flow_definition?: Json | null
          id?: string
          max_ai_interactions?: number
          menu_options?: Json | null
          updated_at?: string
          welcome_message?: string | null
        }
        Update: {
          ai_model?: string | null
          ai_prompt?: string | null
          ativo?: boolean
          bot_type?: string
          clinica_id?: string
          created_at?: string
          departamento_id?: string | null
          fallback_departamento_id?: string | null
          flow_definition?: Json | null
          id?: string
          max_ai_interactions?: number
          menu_options?: Json | null
          updated_at?: string
          welcome_message?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "atend_bot_configs_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "clinicas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "atend_bot_configs_departamento_id_fkey"
            columns: ["departamento_id"]
            isOneToOne: false
            referencedRelation: "atend_departamentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "atend_bot_configs_fallback_departamento_id_fkey"
            columns: ["fallback_departamento_id"]
            isOneToOne: false
            referencedRelation: "atend_departamentos"
            referencedColumns: ["id"]
          },
        ]
      }
      atend_conversa_eventos: {
        Row: {
          clinica_id: string
          conversa_id: string
          created_at: string
          departamento_id: string | null
          detalhes: Json | null
          evento: string
          id: string
          motivo: string | null
          user_id: string | null
        }
        Insert: {
          clinica_id: string
          conversa_id: string
          created_at?: string
          departamento_id?: string | null
          detalhes?: Json | null
          evento: string
          id?: string
          motivo?: string | null
          user_id?: string | null
        }
        Update: {
          clinica_id?: string
          conversa_id?: string
          created_at?: string
          departamento_id?: string | null
          detalhes?: Json | null
          evento?: string
          id?: string
          motivo?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "atend_conversa_eventos_conversa_id_fkey"
            columns: ["conversa_id"]
            isOneToOne: false
            referencedRelation: "atend_conversas"
            referencedColumns: ["id"]
          },
        ]
      }
      atend_conversas: {
        Row: {
          aguardando_desde: string | null
          ai_enabled: boolean
          ai_tentativas: number
          assigned_at: string | null
          atribuicao_origem: string | null
          atribuida_user_id: string | null
          awaiting_patient_since: string | null
          canal: string
          clinica_id: string
          closed_at: string | null
          contato_nome: string | null
          contato_paciente_id: string | null
          contato_telefone: string | null
          contato_telefone_norm: string | null
          created_at: string
          departamento_id: string | null
          fila_posicao: number | null
          handoff_em: string | null
          handoff_motivo: string | null
          handoff_resumo: Json | null
          id: string
          identidade_confirmada: boolean
          identidade_perguntada_em: string | null
          identidade_tentativas: number
          is_teste: boolean
          janela_24h_em: string | null
          last_assigned_user_id: string | null
          nina_fluxo_estado: Json | null
          numero_conversa: number
          owner_type: string
          patient_response_deadline: string | null
          primeiro_resp_em: string | null
          prioridade: number
          protocol_number: string | null
          protocolo_atendimento: string | null
          protocolo_em: string | null
          protocolo_sessao_id: string | null
          resolved_at: string | null
          resolved_by: string | null
          sentimento: string | null
          sentimento_score: number | null
          sla_first_response_seg: number | null
          status: string
          ultima_msg_em: string
          ultima_msg_preview: string | null
          unread_count: number
          updated_at: string
        }
        Insert: {
          aguardando_desde?: string | null
          ai_enabled?: boolean
          ai_tentativas?: number
          assigned_at?: string | null
          atribuicao_origem?: string | null
          atribuida_user_id?: string | null
          awaiting_patient_since?: string | null
          canal?: string
          clinica_id: string
          closed_at?: string | null
          contato_nome?: string | null
          contato_paciente_id?: string | null
          contato_telefone?: string | null
          contato_telefone_norm?: string | null
          created_at?: string
          departamento_id?: string | null
          fila_posicao?: number | null
          handoff_em?: string | null
          handoff_motivo?: string | null
          handoff_resumo?: Json | null
          id?: string
          identidade_confirmada?: boolean
          identidade_perguntada_em?: string | null
          identidade_tentativas?: number
          is_teste?: boolean
          janela_24h_em?: string | null
          last_assigned_user_id?: string | null
          nina_fluxo_estado?: Json | null
          numero_conversa?: number
          owner_type?: string
          patient_response_deadline?: string | null
          primeiro_resp_em?: string | null
          prioridade?: number
          protocol_number?: string | null
          protocolo_atendimento?: string | null
          protocolo_em?: string | null
          protocolo_sessao_id?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          sentimento?: string | null
          sentimento_score?: number | null
          sla_first_response_seg?: number | null
          status?: string
          ultima_msg_em?: string
          ultima_msg_preview?: string | null
          unread_count?: number
          updated_at?: string
        }
        Update: {
          aguardando_desde?: string | null
          ai_enabled?: boolean
          ai_tentativas?: number
          assigned_at?: string | null
          atribuicao_origem?: string | null
          atribuida_user_id?: string | null
          awaiting_patient_since?: string | null
          canal?: string
          clinica_id?: string
          closed_at?: string | null
          contato_nome?: string | null
          contato_paciente_id?: string | null
          contato_telefone?: string | null
          contato_telefone_norm?: string | null
          created_at?: string
          departamento_id?: string | null
          fila_posicao?: number | null
          handoff_em?: string | null
          handoff_motivo?: string | null
          handoff_resumo?: Json | null
          id?: string
          identidade_confirmada?: boolean
          identidade_perguntada_em?: string | null
          identidade_tentativas?: number
          is_teste?: boolean
          janela_24h_em?: string | null
          last_assigned_user_id?: string | null
          nina_fluxo_estado?: Json | null
          numero_conversa?: number
          owner_type?: string
          patient_response_deadline?: string | null
          primeiro_resp_em?: string | null
          prioridade?: number
          protocol_number?: string | null
          protocolo_atendimento?: string | null
          protocolo_em?: string | null
          protocolo_sessao_id?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          sentimento?: string | null
          sentimento_score?: number | null
          sla_first_response_seg?: number | null
          status?: string
          ultima_msg_em?: string
          ultima_msg_preview?: string | null
          unread_count?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "atend_conversas_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "clinicas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "atend_conversas_contato_paciente_id_fkey"
            columns: ["contato_paciente_id"]
            isOneToOne: false
            referencedRelation: "pacientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "atend_conversas_departamento_id_fkey"
            columns: ["departamento_id"]
            isOneToOne: false
            referencedRelation: "atend_departamentos"
            referencedColumns: ["id"]
          },
        ]
      }
      atend_departamento_membros: {
        Row: {
          clinica_id: string
          created_at: string
          departamento_id: string
          id: string
          max_simultaneas: number
          queue_locked: boolean
          role: string
          user_id: string
        }
        Insert: {
          clinica_id: string
          created_at?: string
          departamento_id: string
          id?: string
          max_simultaneas?: number
          queue_locked?: boolean
          role?: string
          user_id: string
        }
        Update: {
          clinica_id?: string
          created_at?: string
          departamento_id?: string
          id?: string
          max_simultaneas?: number
          queue_locked?: boolean
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "atend_departamento_membros_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "clinicas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "atend_departamento_membros_departamento_id_fkey"
            columns: ["departamento_id"]
            isOneToOne: false
            referencedRelation: "atend_departamentos"
            referencedColumns: ["id"]
          },
        ]
      }
      atend_departamentos: {
        Row: {
          ativo: boolean
          clinica_id: string
          created_at: string
          descricao: string | null
          distribuicao: string
          id: string
          nome: string
          prioridade: number
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          clinica_id: string
          created_at?: string
          descricao?: string | null
          distribuicao?: string
          id?: string
          nome: string
          prioridade?: number
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          clinica_id?: string
          created_at?: string
          descricao?: string | null
          distribuicao?: string
          id?: string
          nome?: string
          prioridade?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "atend_departamentos_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "clinicas"
            referencedColumns: ["id"]
          },
        ]
      }
      atend_handoff_resumos: {
        Row: {
          clinica_id: string
          conversa_id: string
          created_at: string
          desfecho: string | null
          erro: string | null
          handoff_em: string
          id: string
          motivo: string | null
          payload: Json | null
          resolvido_em: string | null
          resolvido_por: string | null
          situacao: string
          status: string
          updated_at: string
          versao: number
        }
        Insert: {
          clinica_id: string
          conversa_id: string
          created_at?: string
          desfecho?: string | null
          erro?: string | null
          handoff_em: string
          id?: string
          motivo?: string | null
          payload?: Json | null
          resolvido_em?: string | null
          resolvido_por?: string | null
          situacao?: string
          status?: string
          updated_at?: string
          versao?: number
        }
        Update: {
          clinica_id?: string
          conversa_id?: string
          created_at?: string
          desfecho?: string | null
          erro?: string | null
          handoff_em?: string
          id?: string
          motivo?: string | null
          payload?: Json | null
          resolvido_em?: string | null
          resolvido_por?: string | null
          situacao?: string
          status?: string
          updated_at?: string
          versao?: number
        }
        Relationships: [
          {
            foreignKeyName: "atend_handoff_resumos_conversa_id_fkey"
            columns: ["conversa_id"]
            isOneToOne: false
            referencedRelation: "atend_conversas"
            referencedColumns: ["id"]
          },
        ]
      }
      atend_horarios: {
        Row: {
          ativo: boolean
          canal: string
          clinica_id: string
          created_at: string
          dia_semana: number
          hora_fim: string
          hora_inicio: string
          id: string
        }
        Insert: {
          ativo?: boolean
          canal?: string
          clinica_id: string
          created_at?: string
          dia_semana: number
          hora_fim: string
          hora_inicio: string
          id?: string
        }
        Update: {
          ativo?: boolean
          canal?: string
          clinica_id?: string
          created_at?: string
          dia_semana?: number
          hora_fim?: string
          hora_inicio?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "atend_horarios_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "clinicas"
            referencedColumns: ["id"]
          },
        ]
      }
      atend_kb: {
        Row: {
          categoria: string | null
          clinica_id: string
          conteudo: string
          created_at: string
          id: string
          publicado: boolean
          tags: string[] | null
          titulo: string
          updated_at: string
        }
        Insert: {
          categoria?: string | null
          clinica_id: string
          conteudo: string
          created_at?: string
          id?: string
          publicado?: boolean
          tags?: string[] | null
          titulo: string
          updated_at?: string
        }
        Update: {
          categoria?: string | null
          clinica_id?: string
          conteudo?: string
          created_at?: string
          id?: string
          publicado?: boolean
          tags?: string[] | null
          titulo?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "atend_kb_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "clinicas"
            referencedColumns: ["id"]
          },
        ]
      }
      atend_macros: {
        Row: {
          atalho: string
          ativo: boolean
          clinica_id: string
          conteudo: string
          created_at: string
          id: string
          titulo: string
          updated_at: string
        }
        Insert: {
          atalho: string
          ativo?: boolean
          clinica_id: string
          conteudo: string
          created_at?: string
          id?: string
          titulo: string
          updated_at?: string
        }
        Update: {
          atalho?: string
          ativo?: boolean
          clinica_id?: string
          conteudo?: string
          created_at?: string
          id?: string
          titulo?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "atend_macros_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "clinicas"
            referencedColumns: ["id"]
          },
        ]
      }
      atend_msg_fora_horario: {
        Row: {
          ativo: boolean
          clinica_id: string
          mensagem: string
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          clinica_id: string
          mensagem?: string
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          clinica_id?: string
          mensagem?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "atend_msg_fora_horario_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: true
            referencedRelation: "clinicas"
            referencedColumns: ["id"]
          },
        ]
      }
      atend_notas_internas: {
        Row: {
          autor_nome: string | null
          autor_user_id: string
          clinica_id: string
          conteudo: string
          conversa_id: string
          created_at: string
          id: string
        }
        Insert: {
          autor_nome?: string | null
          autor_user_id: string
          clinica_id: string
          conteudo: string
          conversa_id: string
          created_at?: string
          id?: string
        }
        Update: {
          autor_nome?: string | null
          autor_user_id?: string
          clinica_id?: string
          conteudo?: string
          conversa_id?: string
          created_at?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "atend_notas_internas_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "clinicas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "atend_notas_internas_conversa_id_fkey"
            columns: ["conversa_id"]
            isOneToOne: false
            referencedRelation: "atend_conversas"
            referencedColumns: ["id"]
          },
        ]
      }
      atend_numeros_autorizados: {
        Row: {
          clinica_id: string
          created_at: string
          id: string
          nota: string | null
          telefone: string
        }
        Insert: {
          clinica_id: string
          created_at?: string
          id?: string
          nota?: string | null
          telefone: string
        }
        Update: {
          clinica_id?: string
          created_at?: string
          id?: string
          nota?: string | null
          telefone?: string
        }
        Relationships: [
          {
            foreignKeyName: "atend_numeros_autorizados_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "clinicas"
            referencedColumns: ["id"]
          },
        ]
      }
      atend_pausas_log: {
        Row: {
          clinica_id: string
          finalizada_em: string | null
          id: string
          iniciada_em: string
          reason_id: string | null
          user_id: string
        }
        Insert: {
          clinica_id: string
          finalizada_em?: string | null
          id?: string
          iniciada_em?: string
          reason_id?: string | null
          user_id: string
        }
        Update: {
          clinica_id?: string
          finalizada_em?: string | null
          id?: string
          iniciada_em?: string
          reason_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "atend_pausas_log_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "clinicas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "atend_pausas_log_reason_id_fkey"
            columns: ["reason_id"]
            isOneToOne: false
            referencedRelation: "atend_pause_reasons"
            referencedColumns: ["id"]
          },
        ]
      }
      atend_pause_reasons: {
        Row: {
          ativo: boolean
          clinica_id: string
          conta_trabalhado: boolean
          cor: string | null
          created_at: string
          icone: string | null
          id: string
          nome: string
          tolerancia_minutos: number
        }
        Insert: {
          ativo?: boolean
          clinica_id: string
          conta_trabalhado?: boolean
          cor?: string | null
          created_at?: string
          icone?: string | null
          id?: string
          nome: string
          tolerancia_minutos?: number
        }
        Update: {
          ativo?: boolean
          clinica_id?: string
          conta_trabalhado?: boolean
          cor?: string | null
          created_at?: string
          icone?: string | null
          id?: string
          nome?: string
          tolerancia_minutos?: number
        }
        Relationships: [
          {
            foreignKeyName: "atend_pause_reasons_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "clinicas"
            referencedColumns: ["id"]
          },
        ]
      }
      atend_protocolo_atendimento_config: {
        Row: {
          ativo: boolean
          clinica_id: string
          created_at: string
          prefixo: string
          proximo_seq: number
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          clinica_id: string
          created_at?: string
          prefixo?: string
          proximo_seq?: number
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          clinica_id?: string
          created_at?: string
          prefixo?: string
          proximo_seq?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "atend_protocolo_atendimento_config_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: true
            referencedRelation: "clinicas"
            referencedColumns: ["id"]
          },
        ]
      }
      atend_protocolo_config: {
        Row: {
          clinica_id: string
          formato: string
          prefixo: string
          proximo_seq: number
          updated_at: string
          zerar_anualmente: boolean
        }
        Insert: {
          clinica_id: string
          formato?: string
          prefixo?: string
          proximo_seq?: number
          updated_at?: string
          zerar_anualmente?: boolean
        }
        Update: {
          clinica_id?: string
          formato?: string
          prefixo?: string
          proximo_seq?: number
          updated_at?: string
          zerar_anualmente?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "atend_protocolo_config_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: true
            referencedRelation: "clinicas"
            referencedColumns: ["id"]
          },
        ]
      }
      atend_resposta_favoritos: {
        Row: {
          clinica_id: string
          created_at: string
          resposta_id: string
          user_id: string
        }
        Insert: {
          clinica_id: string
          created_at?: string
          resposta_id: string
          user_id: string
        }
        Update: {
          clinica_id?: string
          created_at?: string
          resposta_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "atend_resposta_favoritos_resposta_id_fkey"
            columns: ["resposta_id"]
            isOneToOne: false
            referencedRelation: "atend_respostas_rapidas"
            referencedColumns: ["id"]
          },
        ]
      }
      atend_resposta_usos: {
        Row: {
          clinica_id: string
          conversa_id: string | null
          created_at: string
          id: string
          resposta_id: string | null
          user_id: string
        }
        Insert: {
          clinica_id: string
          conversa_id?: string | null
          created_at?: string
          id?: string
          resposta_id?: string | null
          user_id: string
        }
        Update: {
          clinica_id?: string
          conversa_id?: string | null
          created_at?: string
          id?: string
          resposta_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "atend_resposta_usos_resposta_id_fkey"
            columns: ["resposta_id"]
            isOneToOne: false
            referencedRelation: "atend_respostas_rapidas"
            referencedColumns: ["id"]
          },
        ]
      }
      atend_respostas_rapidas: {
        Row: {
          ativo: boolean
          categoria: string | null
          clinica_id: string
          comando: string
          conteudo: string
          created_at: string
          created_by: string | null
          escopo: string
          id: string
          nome: string
          owner_user_id: string | null
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          categoria?: string | null
          clinica_id: string
          comando: string
          conteudo: string
          created_at?: string
          created_by?: string | null
          escopo?: string
          id?: string
          nome: string
          owner_user_id?: string | null
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          categoria?: string | null
          clinica_id?: string
          comando?: string
          conteudo?: string
          created_at?: string
          created_by?: string | null
          escopo?: string
          id?: string
          nome?: string
          owner_user_id?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      atend_routing_rules: {
        Row: {
          ativo: boolean
          canal: string | null
          clinica_id: string
          created_at: string
          departamento_id: string | null
          dias_semana: number[]
          horario_fim: string | null
          horario_inicio: string | null
          id: string
          mensagem_auto: string | null
          nome: string
          ordem: number
          palavras_chave: string[]
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          canal?: string | null
          clinica_id: string
          created_at?: string
          departamento_id?: string | null
          dias_semana?: number[]
          horario_fim?: string | null
          horario_inicio?: string | null
          id?: string
          mensagem_auto?: string | null
          nome: string
          ordem?: number
          palavras_chave?: string[]
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          canal?: string | null
          clinica_id?: string
          created_at?: string
          departamento_id?: string | null
          dias_semana?: number[]
          horario_fim?: string | null
          horario_inicio?: string | null
          id?: string
          mensagem_auto?: string | null
          nome?: string
          ordem?: number
          palavras_chave?: string[]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "atend_routing_rules_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "clinicas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "atend_routing_rules_departamento_id_fkey"
            columns: ["departamento_id"]
            isOneToOne: false
            referencedRelation: "atend_departamentos"
            referencedColumns: ["id"]
          },
        ]
      }
      atend_transferencias: {
        Row: {
          clinica_id: string
          conversa_id: string
          created_at: string
          de_departamento_id: string | null
          de_user_id: string | null
          id: string
          motivo: string | null
          para_departamento_id: string | null
          para_user_id: string | null
        }
        Insert: {
          clinica_id: string
          conversa_id: string
          created_at?: string
          de_departamento_id?: string | null
          de_user_id?: string | null
          id?: string
          motivo?: string | null
          para_departamento_id?: string | null
          para_user_id?: string | null
        }
        Update: {
          clinica_id?: string
          conversa_id?: string
          created_at?: string
          de_departamento_id?: string | null
          de_user_id?: string | null
          id?: string
          motivo?: string | null
          para_departamento_id?: string | null
          para_user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "atend_transferencias_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "clinicas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "atend_transferencias_conversa_id_fkey"
            columns: ["conversa_id"]
            isOneToOne: false
            referencedRelation: "atend_conversas"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_log: {
        Row: {
          action: string
          clinica_id: string | null
          created_at: string
          dados_antes: Json | null
          dados_depois: Json | null
          id: string
          ip_address: unknown
          record_id: string | null
          table_name: string
          user_agent: string | null
          user_email: string | null
          user_id: string | null
        }
        Insert: {
          action: string
          clinica_id?: string | null
          created_at?: string
          dados_antes?: Json | null
          dados_depois?: Json | null
          id?: string
          ip_address?: unknown
          record_id?: string | null
          table_name: string
          user_agent?: string | null
          user_email?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string
          clinica_id?: string | null
          created_at?: string
          dados_antes?: Json | null
          dados_depois?: Json | null
          id?: string
          ip_address?: unknown
          record_id?: string | null
          table_name?: string
          user_agent?: string | null
          user_email?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      backup_execucoes: {
        Row: {
          arquivos: number | null
          bytes: number | null
          clinica_id: string | null
          created_at: string
          data_ref: string
          erro: string | null
          finalizado_em: string | null
          id: string
          iniciado_em: string
          status: string
          tabelas: number | null
          updated_at: string
        }
        Insert: {
          arquivos?: number | null
          bytes?: number | null
          clinica_id?: string | null
          created_at?: string
          data_ref: string
          erro?: string | null
          finalizado_em?: string | null
          id?: string
          iniciado_em?: string
          status?: string
          tabelas?: number | null
          updated_at?: string
        }
        Update: {
          arquivos?: number | null
          bytes?: number | null
          clinica_id?: string | null
          created_at?: string
          data_ref?: string
          erro?: string | null
          finalizado_em?: string | null
          id?: string
          iniciado_em?: string
          status?: string
          tabelas?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "backup_execucoes_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "clinicas"
            referencedColumns: ["id"]
          },
        ]
      }
      boletos: {
        Row: {
          banco: string | null
          clinica_id: string
          codigo_barras: string | null
          contrato_id: string | null
          created_at: string
          emitido_em: string | null
          erro_emissao: string | null
          id: string
          lancamento_id: string | null
          linha_digitavel: string | null
          mensalidade_id: string | null
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
          banco?: string | null
          clinica_id: string
          codigo_barras?: string | null
          contrato_id?: string | null
          created_at?: string
          emitido_em?: string | null
          erro_emissao?: string | null
          id?: string
          lancamento_id?: string | null
          linha_digitavel?: string | null
          mensalidade_id?: string | null
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
          banco?: string | null
          clinica_id?: string
          codigo_barras?: string | null
          contrato_id?: string | null
          created_at?: string
          emitido_em?: string | null
          erro_emissao?: string | null
          id?: string
          lancamento_id?: string | null
          linha_digitavel?: string | null
          mensalidade_id?: string | null
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
        Relationships: [
          {
            foreignKeyName: "boletos_contrato_id_fkey"
            columns: ["contrato_id"]
            isOneToOne: false
            referencedRelation: "contratos_assinatura"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "boletos_mensalidade_id_fkey"
            columns: ["mensalidade_id"]
            isOneToOne: false
            referencedRelation: "contrato_mensalidades"
            referencedColumns: ["id"]
          },
        ]
      }
      busca_ativa_contatos: {
        Row: {
          clinica_id: string
          criado_em: string
          id: string
          observacao: string | null
          origem: string
          paciente_id: string
          procedimento: string
          registrado_por: string | null
          resultado: string
        }
        Insert: {
          clinica_id: string
          criado_em?: string
          id?: string
          observacao?: string | null
          origem?: string
          paciente_id: string
          procedimento?: string
          registrado_por?: string | null
          resultado: string
        }
        Update: {
          clinica_id?: string
          criado_em?: string
          id?: string
          observacao?: string | null
          origem?: string
          paciente_id?: string
          procedimento?: string
          registrado_por?: string | null
          resultado?: string
        }
        Relationships: [
          {
            foreignKeyName: "busca_ativa_contatos_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "clinicas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "busca_ativa_contatos_paciente_id_fkey"
            columns: ["paciente_id"]
            isOneToOne: false
            referencedRelation: "pacientes"
            referencedColumns: ["id"]
          },
        ]
      }
      caixa_movimentos: {
        Row: {
          clinica_id: string
          created_at: string
          descricao: string | null
          destino_nome: string | null
          destino_user_id: string | null
          forma_pagamento: string | null
          id: string
          lancamento_id: string | null
          sessao_id: string
          tipo: Database["public"]["Enums"]["caixa_mov_tipo"]
          user_id: string
          valor: number
        }
        Insert: {
          clinica_id: string
          created_at?: string
          descricao?: string | null
          destino_nome?: string | null
          destino_user_id?: string | null
          forma_pagamento?: string | null
          id?: string
          lancamento_id?: string | null
          sessao_id: string
          tipo: Database["public"]["Enums"]["caixa_mov_tipo"]
          user_id: string
          valor?: number
        }
        Update: {
          clinica_id?: string
          created_at?: string
          descricao?: string | null
          destino_nome?: string | null
          destino_user_id?: string | null
          forma_pagamento?: string | null
          id?: string
          lancamento_id?: string | null
          sessao_id?: string
          tipo?: Database["public"]["Enums"]["caixa_mov_tipo"]
          user_id?: string
          valor?: number
        }
        Relationships: [
          {
            foreignKeyName: "caixa_movimentos_sessao_id_fkey"
            columns: ["sessao_id"]
            isOneToOne: false
            referencedRelation: "caixa_sessoes"
            referencedColumns: ["id"]
          },
        ]
      }
      caixa_sessoes: {
        Row: {
          aberto_em: string
          clinica_id: string
          created_at: string
          diferenca: number | null
          fechado_em: string | null
          id: string
          observacoes: string | null
          status: Database["public"]["Enums"]["caixa_sessao_status"]
          updated_at: string
          user_id: string
          user_nome: string | null
          valor_abertura: number
          valor_fechamento_calculado: number | null
          valor_fechamento_informado: number | null
        }
        Insert: {
          aberto_em?: string
          clinica_id: string
          created_at?: string
          diferenca?: number | null
          fechado_em?: string | null
          id?: string
          observacoes?: string | null
          status?: Database["public"]["Enums"]["caixa_sessao_status"]
          updated_at?: string
          user_id: string
          user_nome?: string | null
          valor_abertura?: number
          valor_fechamento_calculado?: number | null
          valor_fechamento_informado?: number | null
        }
        Update: {
          aberto_em?: string
          clinica_id?: string
          created_at?: string
          diferenca?: number | null
          fechado_em?: string | null
          id?: string
          observacoes?: string | null
          status?: Database["public"]["Enums"]["caixa_sessao_status"]
          updated_at?: string
          user_id?: string
          user_nome?: string | null
          valor_abertura?: number
          valor_fechamento_calculado?: number | null
          valor_fechamento_informado?: number | null
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
      cargos: {
        Row: {
          ativo: boolean
          cbo: string | null
          clinica_id: string
          created_at: string
          descricao: string | null
          id: string
          nome: string
          salario_base: number | null
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          cbo?: string | null
          clinica_id: string
          created_at?: string
          descricao?: string | null
          id?: string
          nome: string
          salario_base?: number | null
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          cbo?: string | null
          clinica_id?: string
          created_at?: string
          descricao?: string | null
          id?: string
          nome?: string
          salario_base?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cargos_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "clinicas"
            referencedColumns: ["id"]
          },
        ]
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
      cb_beneficios: {
        Row: {
          ativo: boolean
          clinica_id: string
          convenio_id: string
          created_at: string
          descricao: string | null
          escopo: string
          especialidade_id: string | null
          excedente_modo: string | null
          excedente_percentual: number | null
          excedente_valor: number | null
          id: string
          inicio_a_partir: number
          limite_escopo: string | null
          limite_periodo: string | null
          limite_qtd: number | null
          limite_uso: string
          nome: string
          periodicidade: string
          pessoa: string
          prioridade: number
          procedimento_id: string | null
          procedimento_ids: string[]
          tipo_desconto: string
          updated_at: string
          valor_desconto: number | null
          valor_outros: number | null
        }
        Insert: {
          ativo?: boolean
          clinica_id: string
          convenio_id: string
          created_at?: string
          descricao?: string | null
          escopo?: string
          especialidade_id?: string | null
          excedente_modo?: string | null
          excedente_percentual?: number | null
          excedente_valor?: number | null
          id?: string
          inicio_a_partir?: number
          limite_escopo?: string | null
          limite_periodo?: string | null
          limite_qtd?: number | null
          limite_uso?: string
          nome: string
          periodicidade?: string
          pessoa?: string
          prioridade?: number
          procedimento_id?: string | null
          procedimento_ids?: string[]
          tipo_desconto?: string
          updated_at?: string
          valor_desconto?: number | null
          valor_outros?: number | null
        }
        Update: {
          ativo?: boolean
          clinica_id?: string
          convenio_id?: string
          created_at?: string
          descricao?: string | null
          escopo?: string
          especialidade_id?: string | null
          excedente_modo?: string | null
          excedente_percentual?: number | null
          excedente_valor?: number | null
          id?: string
          inicio_a_partir?: number
          limite_escopo?: string | null
          limite_periodo?: string | null
          limite_qtd?: number | null
          limite_uso?: string
          nome?: string
          periodicidade?: string
          pessoa?: string
          prioridade?: number
          procedimento_id?: string | null
          procedimento_ids?: string[]
          tipo_desconto?: string
          updated_at?: string
          valor_desconto?: number | null
          valor_outros?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "cb_beneficios_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "clinicas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cb_beneficios_convenio_id_fkey"
            columns: ["convenio_id"]
            isOneToOne: false
            referencedRelation: "cb_convenios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cb_beneficios_especialidade_id_fkey"
            columns: ["especialidade_id"]
            isOneToOne: false
            referencedRelation: "especialidades"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cb_beneficios_procedimento_id_fkey"
            columns: ["procedimento_id"]
            isOneToOne: false
            referencedRelation: "procedimentos"
            referencedColumns: ["id"]
          },
        ]
      }
      cb_convenio_faixas: {
        Row: {
          convenio_id: string
          created_at: string
          id: string
          updated_at: string
          valor_mensal: number
          vidas_ate: number | null
          vidas_de: number
        }
        Insert: {
          convenio_id: string
          created_at?: string
          id?: string
          updated_at?: string
          valor_mensal?: number
          vidas_ate?: number | null
          vidas_de: number
        }
        Update: {
          convenio_id?: string
          created_at?: string
          id?: string
          updated_at?: string
          valor_mensal?: number
          vidas_ate?: number | null
          vidas_de?: number
        }
        Relationships: [
          {
            foreignKeyName: "cb_convenio_faixas_convenio_id_fkey"
            columns: ["convenio_id"]
            isOneToOne: false
            referencedRelation: "cb_convenios"
            referencedColumns: ["id"]
          },
        ]
      }
      cb_convenio_regras: {
        Row: {
          ativo: boolean
          carencia_mensalidades: number
          clinica_id: string
          convenio_id: string
          created_at: string
          especialidade_id: string | null
          excedente_modo: string | null
          excedente_percentual: number | null
          excedente_valor: number | null
          gratuito: boolean
          grupo_gratuidade: string | null
          id: string
          limite_escopo: string | null
          limite_periodo: string | null
          limite_qtd: number | null
          modo: string
          nome_padrao: string | null
          percentual: number | null
          percentual_cartao: number | null
          prioridade: number
          procedimento_id: string | null
          tipo: string | null
          updated_at: string
          valor: number | null
          valor_cartao: number | null
          valor_outros: number | null
        }
        Insert: {
          ativo?: boolean
          carencia_mensalidades?: number
          clinica_id: string
          convenio_id: string
          created_at?: string
          especialidade_id?: string | null
          excedente_modo?: string | null
          excedente_percentual?: number | null
          excedente_valor?: number | null
          gratuito?: boolean
          grupo_gratuidade?: string | null
          id?: string
          limite_escopo?: string | null
          limite_periodo?: string | null
          limite_qtd?: number | null
          modo: string
          nome_padrao?: string | null
          percentual?: number | null
          percentual_cartao?: number | null
          prioridade?: number
          procedimento_id?: string | null
          tipo?: string | null
          updated_at?: string
          valor?: number | null
          valor_cartao?: number | null
          valor_outros?: number | null
        }
        Update: {
          ativo?: boolean
          carencia_mensalidades?: number
          clinica_id?: string
          convenio_id?: string
          created_at?: string
          especialidade_id?: string | null
          excedente_modo?: string | null
          excedente_percentual?: number | null
          excedente_valor?: number | null
          gratuito?: boolean
          grupo_gratuidade?: string | null
          id?: string
          limite_escopo?: string | null
          limite_periodo?: string | null
          limite_qtd?: number | null
          modo?: string
          nome_padrao?: string | null
          percentual?: number | null
          percentual_cartao?: number | null
          prioridade?: number
          procedimento_id?: string | null
          tipo?: string | null
          updated_at?: string
          valor?: number | null
          valor_cartao?: number | null
          valor_outros?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "cb_convenio_regras_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "clinicas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cb_convenio_regras_convenio_id_fkey"
            columns: ["convenio_id"]
            isOneToOne: false
            referencedRelation: "cb_convenios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cb_convenio_regras_especialidade_id_fkey"
            columns: ["especialidade_id"]
            isOneToOne: false
            referencedRelation: "especialidades"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cb_convenio_regras_procedimento_id_fkey"
            columns: ["procedimento_id"]
            isOneToOne: false
            referencedRelation: "procedimentos"
            referencedColumns: ["id"]
          },
        ]
      }
      cb_convenios: {
        Row: {
          acrescimo_cartao_modo: string | null
          acrescimo_cartao_percentual: number
          acrescimo_cartao_valor: number
          adesao_no_ato: boolean
          ativo: boolean
          beneficios: string | null
          clinica_id: string
          created_at: string
          descricao: string | null
          fidelidade_meses: number
          id: string
          informativo_html: string | null
          max_dependentes: number
          modalidade: string | null
          modelo_contrato: string | null
          nome: string
          num_parcelas: number
          taxa_adesao: number
          taxa_inclusao_dependente: number
          termo_inclusao_html: string | null
          updated_at: string
          valor_mensal: number
          vigencia_meses: number
        }
        Insert: {
          acrescimo_cartao_modo?: string | null
          acrescimo_cartao_percentual?: number
          acrescimo_cartao_valor?: number
          adesao_no_ato?: boolean
          ativo?: boolean
          beneficios?: string | null
          clinica_id: string
          created_at?: string
          descricao?: string | null
          fidelidade_meses?: number
          id?: string
          informativo_html?: string | null
          max_dependentes?: number
          modalidade?: string | null
          modelo_contrato?: string | null
          nome: string
          num_parcelas?: number
          taxa_adesao?: number
          taxa_inclusao_dependente?: number
          termo_inclusao_html?: string | null
          updated_at?: string
          valor_mensal?: number
          vigencia_meses?: number
        }
        Update: {
          acrescimo_cartao_modo?: string | null
          acrescimo_cartao_percentual?: number
          acrescimo_cartao_valor?: number
          adesao_no_ato?: boolean
          ativo?: boolean
          beneficios?: string | null
          clinica_id?: string
          created_at?: string
          descricao?: string | null
          fidelidade_meses?: number
          id?: string
          informativo_html?: string | null
          max_dependentes?: number
          modalidade?: string | null
          modelo_contrato?: string | null
          nome?: string
          num_parcelas?: number
          taxa_adesao?: number
          taxa_inclusao_dependente?: number
          termo_inclusao_html?: string | null
          updated_at?: string
          valor_mensal?: number
          vigencia_meses?: number
        }
        Relationships: [
          {
            foreignKeyName: "cb_convenios_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "clinicas"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_canais: {
        Row: {
          clinica_id: string
          created_at: string
          criado_por: string
          id: string
          nome: string | null
          setor_id: string | null
          tipo: Database["public"]["Enums"]["chat_canal_tipo"]
          updated_at: string
        }
        Insert: {
          clinica_id: string
          created_at?: string
          criado_por: string
          id?: string
          nome?: string | null
          setor_id?: string | null
          tipo?: Database["public"]["Enums"]["chat_canal_tipo"]
          updated_at?: string
        }
        Update: {
          clinica_id?: string
          created_at?: string
          criado_por?: string
          id?: string
          nome?: string | null
          setor_id?: string | null
          tipo?: Database["public"]["Enums"]["chat_canal_tipo"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_canais_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "clinicas"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_leituras: {
        Row: {
          canal_id: string
          id: string
          ultima_lida_em: string
          user_id: string
        }
        Insert: {
          canal_id: string
          id?: string
          ultima_lida_em?: string
          user_id: string
        }
        Update: {
          canal_id?: string
          id?: string
          ultima_lida_em?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_leituras_canal_id_fkey"
            columns: ["canal_id"]
            isOneToOne: false
            referencedRelation: "chat_canais"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_membros: {
        Row: {
          canal_id: string
          created_at: string
          id: string
          papel: string
          silenciado: boolean
          user_id: string
        }
        Insert: {
          canal_id: string
          created_at?: string
          id?: string
          papel?: string
          silenciado?: boolean
          user_id: string
        }
        Update: {
          canal_id?: string
          created_at?: string
          id?: string
          papel?: string
          silenciado?: boolean
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_membros_canal_id_fkey"
            columns: ["canal_id"]
            isOneToOne: false
            referencedRelation: "chat_canais"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_mensagens: {
        Row: {
          anexo_tipo: string | null
          anexo_url: string | null
          autor_id: string
          canal_id: string
          clinica_id: string
          created_at: string
          deletada_em: string | null
          editada_em: string | null
          id: string
          reply_to: string | null
          texto: string | null
        }
        Insert: {
          anexo_tipo?: string | null
          anexo_url?: string | null
          autor_id: string
          canal_id: string
          clinica_id: string
          created_at?: string
          deletada_em?: string | null
          editada_em?: string | null
          id?: string
          reply_to?: string | null
          texto?: string | null
        }
        Update: {
          anexo_tipo?: string | null
          anexo_url?: string | null
          autor_id?: string
          canal_id?: string
          clinica_id?: string
          created_at?: string
          deletada_em?: string | null
          editada_em?: string | null
          id?: string
          reply_to?: string | null
          texto?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "chat_mensagens_canal_id_fkey"
            columns: ["canal_id"]
            isOneToOne: false
            referencedRelation: "chat_canais"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_mensagens_reply_to_fkey"
            columns: ["reply_to"]
            isOneToOne: false
            referencedRelation: "chat_mensagens"
            referencedColumns: ["id"]
          },
        ]
      }
      clima_diario: {
        Row: {
          choveu: boolean
          clinica_id: string
          created_at: string
          data: string
          fonte: string
          id: string
          precipitacao_mm: number | null
          temp_max: number | null
          temp_min: number | null
          weather_code: number | null
        }
        Insert: {
          choveu?: boolean
          clinica_id: string
          created_at?: string
          data: string
          fonte?: string
          id?: string
          precipitacao_mm?: number | null
          temp_max?: number | null
          temp_min?: number | null
          weather_code?: number | null
        }
        Update: {
          choveu?: boolean
          clinica_id?: string
          created_at?: string
          data?: string
          fonte?: string
          id?: string
          precipitacao_mm?: number | null
          temp_max?: number | null
          temp_min?: number | null
          weather_code?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "clima_diario_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "clinicas"
            referencedColumns: ["id"]
          },
        ]
      }
      clinica_feature_flags: {
        Row: {
          ativo: boolean
          clinica_id: string
          config: Json
          created_at: string
          created_by: string | null
          descricao: string | null
          flag_key: string
          id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          ativo?: boolean
          clinica_id: string
          config?: Json
          created_at?: string
          created_by?: string | null
          descricao?: string | null
          flag_key: string
          id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          ativo?: boolean
          clinica_id?: string
          config?: Json
          created_at?: string
          created_by?: string | null
          descricao?: string | null
          flag_key?: string
          id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "clinica_feature_flags_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "clinicas"
            referencedColumns: ["id"]
          },
        ]
      }
      clinica_memberships: {
        Row: {
          ativo: boolean
          clinica_id: string
          created_at: string
          id: string
          pode_autorizar: boolean
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          ativo?: boolean
          clinica_id: string
          created_at?: string
          id?: string
          pode_autorizar?: boolean
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          ativo?: boolean
          clinica_id?: string
          created_at?: string
          id?: string
          pode_autorizar?: boolean
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
      clinica_tts_config: {
        Row: {
          clinica_id: string
          enabled: boolean
          piper_voice: string | null
          rate: number
          updated_at: string
          updated_by: string | null
          voice: string | null
        }
        Insert: {
          clinica_id: string
          enabled?: boolean
          piper_voice?: string | null
          rate?: number
          updated_at?: string
          updated_by?: string | null
          voice?: string | null
        }
        Update: {
          clinica_id?: string
          enabled?: boolean
          piper_voice?: string | null
          rate?: number
          updated_at?: string
          updated_by?: string | null
          voice?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "clinica_tts_config_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: true
            referencedRelation: "clinicas"
            referencedColumns: ["id"]
          },
        ]
      }
      clinicas: {
        Row: {
          ativo: boolean
          base_importada: boolean
          branding: Json
          cep: string | null
          cidade: string | null
          cnpj: string | null
          created_at: string
          email: string | null
          endereco: string | null
          estado: string | null
          id: string
          latitude: number | null
          longitude: number | null
          nfse_modo_emissao: string
          nome: string
          paytime_recipient_id: string | null
          pix_beneficiario: string | null
          pix_chave: string | null
          raio_metros: number
          telefone: string | null
          token_publico: string | null
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          base_importada?: boolean
          branding?: Json
          cep?: string | null
          cidade?: string | null
          cnpj?: string | null
          created_at?: string
          email?: string | null
          endereco?: string | null
          estado?: string | null
          id?: string
          latitude?: number | null
          longitude?: number | null
          nfse_modo_emissao?: string
          nome: string
          paytime_recipient_id?: string | null
          pix_beneficiario?: string | null
          pix_chave?: string | null
          raio_metros?: number
          telefone?: string | null
          token_publico?: string | null
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          base_importada?: boolean
          branding?: Json
          cep?: string | null
          cidade?: string | null
          cnpj?: string | null
          created_at?: string
          email?: string | null
          endereco?: string | null
          estado?: string | null
          id?: string
          latitude?: number | null
          longitude?: number | null
          nfse_modo_emissao?: string
          nome?: string
          paytime_recipient_id?: string | null
          pix_beneficiario?: string | null
          pix_chave?: string | null
          raio_metros?: number
          telefone?: string | null
          token_publico?: string | null
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
          taxa_adesao: number
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
          taxa_adesao?: number
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
          taxa_adesao?: number
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
      contrato_renovacoes: {
        Row: {
          clinica_id: string
          contrato_id: string
          contrato_novo_id: string | null
          convenio_anterior_id: string | null
          convenio_novo_id: string | null
          created_at: string
          dependentes_incluidos: Json | null
          id: string
          observacao: string | null
          parcelas_geradas: number
          periodo_fim: string | null
          periodo_inicio: string | null
          tipo: string
          usuario_id: string | null
          valor_anterior: number
          valor_novo: number
        }
        Insert: {
          clinica_id: string
          contrato_id: string
          contrato_novo_id?: string | null
          convenio_anterior_id?: string | null
          convenio_novo_id?: string | null
          created_at?: string
          dependentes_incluidos?: Json | null
          id?: string
          observacao?: string | null
          parcelas_geradas?: number
          periodo_fim?: string | null
          periodo_inicio?: string | null
          tipo: string
          usuario_id?: string | null
          valor_anterior?: number
          valor_novo?: number
        }
        Update: {
          clinica_id?: string
          contrato_id?: string
          contrato_novo_id?: string | null
          convenio_anterior_id?: string | null
          convenio_novo_id?: string | null
          created_at?: string
          dependentes_incluidos?: Json | null
          id?: string
          observacao?: string | null
          parcelas_geradas?: number
          periodo_fim?: string | null
          periodo_inicio?: string | null
          tipo?: string
          usuario_id?: string | null
          valor_anterior?: number
          valor_novo?: number
        }
        Relationships: [
          {
            foreignKeyName: "contrato_renovacoes_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "clinicas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contrato_renovacoes_contrato_id_fkey"
            columns: ["contrato_id"]
            isOneToOne: false
            referencedRelation: "contratos_assinatura"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contrato_renovacoes_contrato_novo_id_fkey"
            columns: ["contrato_novo_id"]
            isOneToOne: false
            referencedRelation: "contratos_assinatura"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contrato_renovacoes_convenio_anterior_id_fkey"
            columns: ["convenio_anterior_id"]
            isOneToOne: false
            referencedRelation: "cb_convenios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contrato_renovacoes_convenio_novo_id_fkey"
            columns: ["convenio_novo_id"]
            isOneToOne: false
            referencedRelation: "cb_convenios"
            referencedColumns: ["id"]
          },
        ]
      }
      contratos_assinatura: {
        Row: {
          assinado_em: string | null
          assinatura_ip: string | null
          assinatura_svg: string | null
          cancelado_em: string | null
          cancelamento_motivo: string | null
          clinica_id: string
          contrato_origem_id: string | null
          convenio_id: string | null
          created_at: string
          criado_por: string | null
          data_fim: string | null
          data_inicio: string
          dia_vencimento: number
          forma_pagamento: string | null
          id: string
          migrar_apos: string | null
          num_parcelas: number
          numero: number
          numero_renovacoes: number
          observacoes: string | null
          origem: string
          paciente_id: string
          paciente_nome: string
          plano_id: string | null
          renovado_em: string | null
          sem_carencia: boolean
          sem_carencia_em: string | null
          sem_carencia_motivo: string | null
          sem_carencia_por: string | null
          status: string
          tabela_legada: boolean
          taxa_adesao: number
          teste: boolean
          titular_apenas_financeiro: boolean
          token_publico: string | null
          updated_at: string
          valor_mensal: number
        }
        Insert: {
          assinado_em?: string | null
          assinatura_ip?: string | null
          assinatura_svg?: string | null
          cancelado_em?: string | null
          cancelamento_motivo?: string | null
          clinica_id: string
          contrato_origem_id?: string | null
          convenio_id?: string | null
          created_at?: string
          criado_por?: string | null
          data_fim?: string | null
          data_inicio?: string
          dia_vencimento?: number
          forma_pagamento?: string | null
          id?: string
          migrar_apos?: string | null
          num_parcelas?: number
          numero?: number
          numero_renovacoes?: number
          observacoes?: string | null
          origem?: string
          paciente_id: string
          paciente_nome: string
          plano_id?: string | null
          renovado_em?: string | null
          sem_carencia?: boolean
          sem_carencia_em?: string | null
          sem_carencia_motivo?: string | null
          sem_carencia_por?: string | null
          status?: string
          tabela_legada?: boolean
          taxa_adesao?: number
          teste?: boolean
          titular_apenas_financeiro?: boolean
          token_publico?: string | null
          updated_at?: string
          valor_mensal?: number
        }
        Update: {
          assinado_em?: string | null
          assinatura_ip?: string | null
          assinatura_svg?: string | null
          cancelado_em?: string | null
          cancelamento_motivo?: string | null
          clinica_id?: string
          contrato_origem_id?: string | null
          convenio_id?: string | null
          created_at?: string
          criado_por?: string | null
          data_fim?: string | null
          data_inicio?: string
          dia_vencimento?: number
          forma_pagamento?: string | null
          id?: string
          migrar_apos?: string | null
          num_parcelas?: number
          numero?: number
          numero_renovacoes?: number
          observacoes?: string | null
          origem?: string
          paciente_id?: string
          paciente_nome?: string
          plano_id?: string | null
          renovado_em?: string | null
          sem_carencia?: boolean
          sem_carencia_em?: string | null
          sem_carencia_motivo?: string | null
          sem_carencia_por?: string | null
          status?: string
          tabela_legada?: boolean
          taxa_adesao?: number
          teste?: boolean
          titular_apenas_financeiro?: boolean
          token_publico?: string | null
          updated_at?: string
          valor_mensal?: number
        }
        Relationships: [
          {
            foreignKeyName: "contratos_assinatura_contrato_origem_id_fkey"
            columns: ["contrato_origem_id"]
            isOneToOne: false
            referencedRelation: "contratos_assinatura"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contratos_assinatura_convenio_id_fkey"
            columns: ["convenio_id"]
            isOneToOne: false
            referencedRelation: "cb_convenios"
            referencedColumns: ["id"]
          },
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
      dev_relatorio_destinatarios: {
        Row: {
          ativo: boolean
          created_at: string
          id: string
          nome: string
          telefone: string
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          id?: string
          nome: string
          telefone: string
        }
        Update: {
          ativo?: boolean
          created_at?: string
          id?: string
          nome?: string
          telefone?: string
        }
        Relationships: []
      }
      dev_relatorio_entradas: {
        Row: {
          area: string | null
          chave_loop: string | null
          created_at: string
          created_by: string | null
          data: string
          descricao: string | null
          hora: string
          id: string
          loop_manual: boolean
          loop_motivo: string | null
          origem: string
          tipo: string
          titulo: string
          updated_at: string
        }
        Insert: {
          area?: string | null
          chave_loop?: string | null
          created_at?: string
          created_by?: string | null
          data?: string
          descricao?: string | null
          hora?: string
          id?: string
          loop_manual?: boolean
          loop_motivo?: string | null
          origem?: string
          tipo?: string
          titulo: string
          updated_at?: string
        }
        Update: {
          area?: string | null
          chave_loop?: string | null
          created_at?: string
          created_by?: string | null
          data?: string
          descricao?: string | null
          hora?: string
          id?: string
          loop_manual?: boolean
          loop_motivo?: string | null
          origem?: string
          tipo?: string
          titulo?: string
          updated_at?: string
        }
        Relationships: []
      }
      dev_relatorio_envios: {
        Row: {
          data: string
          destinatarios: number
          enviado_em: string
          erro: string | null
          id: string
          mensagem: string | null
          status: string
        }
        Insert: {
          data: string
          destinatarios?: number
          enviado_em?: string
          erro?: string | null
          id?: string
          mensagem?: string | null
          status?: string
        }
        Update: {
          data?: string
          destinatarios?: number
          enviado_em?: string
          erro?: string | null
          id?: string
          mensagem?: string | null
          status?: string
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
      enfermagem_recurso_atendentes: {
        Row: {
          clinica_id: string
          created_at: string
          id: string
          recurso_id: string
          user_id: string
        }
        Insert: {
          clinica_id: string
          created_at?: string
          id?: string
          recurso_id: string
          user_id: string
        }
        Update: {
          clinica_id?: string
          created_at?: string
          id?: string
          recurso_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "enfermagem_recurso_atendentes_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "clinicas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "enfermagem_recurso_atendentes_recurso_id_fkey"
            columns: ["recurso_id"]
            isOneToOne: false
            referencedRelation: "enfermagem_recursos"
            referencedColumns: ["id"]
          },
        ]
      }
      enfermagem_recurso_disponibilidades: {
        Row: {
          ativo: boolean
          clinica_id: string
          created_at: string
          dia_semana: number
          hora_fim: string
          hora_inicio: string
          id: string
          intervalo_min: number | null
          limite_pacientes: number | null
          observacoes: string | null
          recurso_id: string
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
          intervalo_min?: number | null
          limite_pacientes?: number | null
          observacoes?: string | null
          recurso_id: string
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
          intervalo_min?: number | null
          limite_pacientes?: number | null
          observacoes?: string | null
          recurso_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "enfermagem_recurso_disponibilidades_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "clinicas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "enfermagem_recurso_disponibilidades_recurso_id_fkey"
            columns: ["recurso_id"]
            isOneToOne: false
            referencedRelation: "enfermagem_recursos"
            referencedColumns: ["id"]
          },
        ]
      }
      enfermagem_recurso_procedimentos: {
        Row: {
          created_at: string
          procedimento_id: string
          recurso_id: string
        }
        Insert: {
          created_at?: string
          procedimento_id: string
          recurso_id: string
        }
        Update: {
          created_at?: string
          procedimento_id?: string
          recurso_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "enfermagem_recurso_procedimentos_procedimento_id_fkey"
            columns: ["procedimento_id"]
            isOneToOne: false
            referencedRelation: "procedimentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "enfermagem_recurso_procedimentos_recurso_id_fkey"
            columns: ["recurso_id"]
            isOneToOne: false
            referencedRelation: "enfermagem_recursos"
            referencedColumns: ["id"]
          },
        ]
      }
      enfermagem_recursos: {
        Row: {
          ativo: boolean
          clinica_id: string
          cor: string | null
          created_at: string
          descricao: string | null
          duracao_padrao_min: number
          id: string
          nome: string
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          clinica_id: string
          cor?: string | null
          created_at?: string
          descricao?: string | null
          duracao_padrao_min?: number
          id?: string
          nome: string
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          clinica_id?: string
          cor?: string | null
          created_at?: string
          descricao?: string | null
          duracao_padrao_min?: number
          id?: string
          nome?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "enfermagem_recursos_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "clinicas"
            referencedColumns: ["id"]
          },
        ]
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
      estoque_lotes: {
        Row: {
          clinica_id: string
          created_at: string
          custo_unitario: number
          fornecedor: string | null
          id: string
          lote: string | null
          observacoes: string | null
          produto_id: string
          quantidade: number
          quantidade_inicial: number
          updated_at: string
          validade: string | null
        }
        Insert: {
          clinica_id: string
          created_at?: string
          custo_unitario?: number
          fornecedor?: string | null
          id?: string
          lote?: string | null
          observacoes?: string | null
          produto_id: string
          quantidade?: number
          quantidade_inicial?: number
          updated_at?: string
          validade?: string | null
        }
        Update: {
          clinica_id?: string
          created_at?: string
          custo_unitario?: number
          fornecedor?: string | null
          id?: string
          lote?: string | null
          observacoes?: string | null
          produto_id?: string
          quantidade?: number
          quantidade_inicial?: number
          updated_at?: string
          validade?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "estoque_lotes_produto_id_fkey"
            columns: ["produto_id"]
            isOneToOne: false
            referencedRelation: "estoque_produtos"
            referencedColumns: ["id"]
          },
        ]
      }
      estoque_movimentos: {
        Row: {
          clinica_id: string
          created_at: string
          custo_unitario: number | null
          data: string
          id: string
          lote_id: string | null
          motivo: string | null
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
          lote_id?: string | null
          motivo?: string | null
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
          lote_id?: string | null
          motivo?: string | null
          observacoes?: string | null
          produto_id?: string
          quantidade?: number
          tipo?: Database["public"]["Enums"]["estoque_movimento_tipo"]
        }
        Relationships: [
          {
            foreignKeyName: "estoque_movimentos_lote_id_fkey"
            columns: ["lote_id"]
            isOneToOne: false
            referencedRelation: "estoque_lotes"
            referencedColumns: ["id"]
          },
        ]
      }
      estoque_produtos: {
        Row: {
          ativo: boolean
          categoria: string
          clinica_id: string
          codigo: string | null
          created_at: string
          custo_unitario: number
          estoque_atual: number
          estoque_minimo: number
          fornecedor: string | null
          id: string
          nome: string
          observacoes: string | null
          unidade: string
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          categoria?: string
          clinica_id: string
          codigo?: string | null
          created_at?: string
          custo_unitario?: number
          estoque_atual?: number
          estoque_minimo?: number
          fornecedor?: string | null
          id?: string
          nome: string
          observacoes?: string | null
          unidade?: string
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          categoria?: string
          clinica_id?: string
          codigo?: string | null
          created_at?: string
          custo_unitario?: number
          estoque_atual?: number
          estoque_minimo?: number
          fornecedor?: string | null
          id?: string
          nome?: string
          observacoes?: string | null
          unidade?: string
          updated_at?: string
        }
        Relationships: []
      }
      estorno_solicitacoes: {
        Row: {
          agendamento_id: string | null
          caixa_movimento_id: string | null
          clinica_id: string
          created_at: string
          data_estorno: string | null
          data_pagamento_original: string | null
          descricao: string | null
          id: string
          lancamento_id: string | null
          motivo: string
          paciente_nome: string | null
          resolvido_em: string | null
          resolvido_por: string | null
          resposta: string | null
          solicitado_em: string
          solicitado_por: string
          status: string
          tipo: string
          updated_at: string
          valor: number | null
        }
        Insert: {
          agendamento_id?: string | null
          caixa_movimento_id?: string | null
          clinica_id: string
          created_at?: string
          data_estorno?: string | null
          data_pagamento_original?: string | null
          descricao?: string | null
          id?: string
          lancamento_id?: string | null
          motivo: string
          paciente_nome?: string | null
          resolvido_em?: string | null
          resolvido_por?: string | null
          resposta?: string | null
          solicitado_em?: string
          solicitado_por: string
          status?: string
          tipo?: string
          updated_at?: string
          valor?: number | null
        }
        Update: {
          agendamento_id?: string | null
          caixa_movimento_id?: string | null
          clinica_id?: string
          created_at?: string
          data_estorno?: string | null
          data_pagamento_original?: string | null
          descricao?: string | null
          id?: string
          lancamento_id?: string | null
          motivo?: string
          paciente_nome?: string | null
          resolvido_em?: string | null
          resolvido_por?: string | null
          resposta?: string | null
          solicitado_em?: string
          solicitado_por?: string
          status?: string
          tipo?: string
          updated_at?: string
          valor?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "estorno_solicitacoes_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "clinicas"
            referencedColumns: ["id"]
          },
        ]
      }
      exame_resultados: {
        Row: {
          classificado_em: string | null
          classificado_por: string | null
          clinica_id: string
          created_at: string
          created_by: string | null
          data_coleta: string | null
          ia_classificacao: Json | null
          ia_mensagem_paciente: string | null
          ia_recomendacao: string | null
          ia_resumo: string | null
          id: string
          origem: string | null
          paciente_id: string
          paciente_nome: string | null
          resultado_texto: string
          status: Database["public"]["Enums"]["resultado_status"]
          tipo_exame: string
          updated_at: string
        }
        Insert: {
          classificado_em?: string | null
          classificado_por?: string | null
          clinica_id: string
          created_at?: string
          created_by?: string | null
          data_coleta?: string | null
          ia_classificacao?: Json | null
          ia_mensagem_paciente?: string | null
          ia_recomendacao?: string | null
          ia_resumo?: string | null
          id?: string
          origem?: string | null
          paciente_id: string
          paciente_nome?: string | null
          resultado_texto: string
          status?: Database["public"]["Enums"]["resultado_status"]
          tipo_exame: string
          updated_at?: string
        }
        Update: {
          classificado_em?: string | null
          classificado_por?: string | null
          clinica_id?: string
          created_at?: string
          created_by?: string | null
          data_coleta?: string | null
          ia_classificacao?: Json | null
          ia_mensagem_paciente?: string | null
          ia_recomendacao?: string | null
          ia_resumo?: string | null
          id?: string
          origem?: string | null
          paciente_id?: string
          paciente_nome?: string | null
          resultado_texto?: string
          status?: Database["public"]["Enums"]["resultado_status"]
          tipo_exame?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "exame_resultados_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "clinicas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exame_resultados_paciente_id_fkey"
            columns: ["paciente_id"]
            isOneToOne: false
            referencedRelation: "pacientes"
            referencedColumns: ["id"]
          },
        ]
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
          agendamento_id: string | null
          clinica_id: string
          created_at: string
          data: string
          forma_pagamento: string | null
          id: string
          lancamento_id: string | null
          laudo_de_atendimento_id: string | null
          laudo_emitido_em: string | null
          laudo_lancamento_id: string | null
          laudo_status: string | null
          medico_id: string | null
          medico_laudador_id: string | null
          nfse_id: string | null
          observacoes: string | null
          orcamento_item_id: string | null
          paciente_id: string | null
          procedimento: string | null
          repasse_conta_id: string | null
          repasse_forma_pagamento: string | null
          repasse_lancamento_id: string | null
          repasse_lock_id: string | null
          repasse_pago: boolean
          repasse_pago_at: string | null
          repasse_pago_em: string | null
          repasse_pago_por: string | null
          status: string
          teste: boolean
          updated_at: string
          valor_clinica: number
          valor_laudo: number
          valor_medico: number
          valor_total: number
        }
        Insert: {
          agendamento_id?: string | null
          clinica_id: string
          created_at?: string
          data?: string
          forma_pagamento?: string | null
          id?: string
          lancamento_id?: string | null
          laudo_de_atendimento_id?: string | null
          laudo_emitido_em?: string | null
          laudo_lancamento_id?: string | null
          laudo_status?: string | null
          medico_id?: string | null
          medico_laudador_id?: string | null
          nfse_id?: string | null
          observacoes?: string | null
          orcamento_item_id?: string | null
          paciente_id?: string | null
          procedimento?: string | null
          repasse_conta_id?: string | null
          repasse_forma_pagamento?: string | null
          repasse_lancamento_id?: string | null
          repasse_lock_id?: string | null
          repasse_pago?: boolean
          repasse_pago_at?: string | null
          repasse_pago_em?: string | null
          repasse_pago_por?: string | null
          status?: string
          teste?: boolean
          updated_at?: string
          valor_clinica?: number
          valor_laudo?: number
          valor_medico?: number
          valor_total?: number
        }
        Update: {
          agendamento_id?: string | null
          clinica_id?: string
          created_at?: string
          data?: string
          forma_pagamento?: string | null
          id?: string
          lancamento_id?: string | null
          laudo_de_atendimento_id?: string | null
          laudo_emitido_em?: string | null
          laudo_lancamento_id?: string | null
          laudo_status?: string | null
          medico_id?: string | null
          medico_laudador_id?: string | null
          nfse_id?: string | null
          observacoes?: string | null
          orcamento_item_id?: string | null
          paciente_id?: string | null
          procedimento?: string | null
          repasse_conta_id?: string | null
          repasse_forma_pagamento?: string | null
          repasse_lancamento_id?: string | null
          repasse_lock_id?: string | null
          repasse_pago?: boolean
          repasse_pago_at?: string | null
          repasse_pago_em?: string | null
          repasse_pago_por?: string | null
          status?: string
          teste?: boolean
          updated_at?: string
          valor_clinica?: number
          valor_laudo?: number
          valor_medico?: number
          valor_total?: number
        }
        Relationships: [
          {
            foreignKeyName: "fin_atendimentos_agendamento_id_fkey"
            columns: ["agendamento_id"]
            isOneToOne: false
            referencedRelation: "agendamentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fin_atendimentos_lancamento_id_fkey"
            columns: ["lancamento_id"]
            isOneToOne: false
            referencedRelation: "fin_lancamentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fin_atendimentos_laudo_de_atendimento_id_fkey"
            columns: ["laudo_de_atendimento_id"]
            isOneToOne: false
            referencedRelation: "fin_atendimentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fin_atendimentos_laudo_lancamento_id_fkey"
            columns: ["laudo_lancamento_id"]
            isOneToOne: false
            referencedRelation: "fin_atendimentos"
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
            foreignKeyName: "fin_atendimentos_medico_laudador_id_fkey"
            columns: ["medico_laudador_id"]
            isOneToOne: false
            referencedRelation: "medicos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fin_atendimentos_nfse_id_fkey"
            columns: ["nfse_id"]
            isOneToOne: false
            referencedRelation: "nfse"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fin_atendimentos_orcamento_item_id_fkey"
            columns: ["orcamento_item_id"]
            isOneToOne: false
            referencedRelation: "orcamento_itens"
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
          bandeira: string | null
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
          bandeira?: string | null
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
          bandeira?: string | null
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
          agendamento_id: string | null
          autorizacao_cartao: string | null
          bandeira_cartao: string | null
          categoria_id: string | null
          clinica_id: string
          composicao_pagamento: Json | null
          conta_id: string | null
          contrato_id: string | null
          convenio_id: string | null
          convenio_modalidade: string | null
          created_at: string
          criado_por: string | null
          data: string
          data_cartao: string | null
          data_vencimento: string | null
          descricao: string
          emitir_nfse: boolean
          empresa_id: string | null
          forma_pagamento: string | null
          grupo_pagamento_id: string | null
          id: string
          laudo_emitido_em: string | null
          laudo_lancamento_id: string | null
          laudo_lote_id: string | null
          laudo_status: string | null
          medico_id: string | null
          medico_laudador_id: string | null
          observacoes: string | null
          paciente_id: string | null
          parcelas: number | null
          repasse_conta_id: string | null
          repasse_forma_pagamento: string | null
          repasse_lancamento_id: string | null
          repasse_lock_id: string | null
          repasse_pago: boolean
          repasse_pago_at: string | null
          repasse_pago_em: string | null
          repasse_pago_por: string | null
          status: Database["public"]["Enums"]["fin_status_lancamento"]
          tipo: Database["public"]["Enums"]["fin_tipo_lancamento"]
          updated_at: string
          valor: number
          valor_laudo: number
          valor_liquido_cartao: number | null
          valor_medico_override: number | null
        }
        Insert: {
          agendamento_id?: string | null
          autorizacao_cartao?: string | null
          bandeira_cartao?: string | null
          categoria_id?: string | null
          clinica_id: string
          composicao_pagamento?: Json | null
          conta_id?: string | null
          contrato_id?: string | null
          convenio_id?: string | null
          convenio_modalidade?: string | null
          created_at?: string
          criado_por?: string | null
          data?: string
          data_cartao?: string | null
          data_vencimento?: string | null
          descricao: string
          emitir_nfse?: boolean
          empresa_id?: string | null
          forma_pagamento?: string | null
          grupo_pagamento_id?: string | null
          id?: string
          laudo_emitido_em?: string | null
          laudo_lancamento_id?: string | null
          laudo_lote_id?: string | null
          laudo_status?: string | null
          medico_id?: string | null
          medico_laudador_id?: string | null
          observacoes?: string | null
          paciente_id?: string | null
          parcelas?: number | null
          repasse_conta_id?: string | null
          repasse_forma_pagamento?: string | null
          repasse_lancamento_id?: string | null
          repasse_lock_id?: string | null
          repasse_pago?: boolean
          repasse_pago_at?: string | null
          repasse_pago_em?: string | null
          repasse_pago_por?: string | null
          status?: Database["public"]["Enums"]["fin_status_lancamento"]
          tipo: Database["public"]["Enums"]["fin_tipo_lancamento"]
          updated_at?: string
          valor: number
          valor_laudo?: number
          valor_liquido_cartao?: number | null
          valor_medico_override?: number | null
        }
        Update: {
          agendamento_id?: string | null
          autorizacao_cartao?: string | null
          bandeira_cartao?: string | null
          categoria_id?: string | null
          clinica_id?: string
          composicao_pagamento?: Json | null
          conta_id?: string | null
          contrato_id?: string | null
          convenio_id?: string | null
          convenio_modalidade?: string | null
          created_at?: string
          criado_por?: string | null
          data?: string
          data_cartao?: string | null
          data_vencimento?: string | null
          descricao?: string
          emitir_nfse?: boolean
          empresa_id?: string | null
          forma_pagamento?: string | null
          grupo_pagamento_id?: string | null
          id?: string
          laudo_emitido_em?: string | null
          laudo_lancamento_id?: string | null
          laudo_lote_id?: string | null
          laudo_status?: string | null
          medico_id?: string | null
          medico_laudador_id?: string | null
          observacoes?: string | null
          paciente_id?: string | null
          parcelas?: number | null
          repasse_conta_id?: string | null
          repasse_forma_pagamento?: string | null
          repasse_lancamento_id?: string | null
          repasse_lock_id?: string | null
          repasse_pago?: boolean
          repasse_pago_at?: string | null
          repasse_pago_em?: string | null
          repasse_pago_por?: string | null
          status?: Database["public"]["Enums"]["fin_status_lancamento"]
          tipo?: Database["public"]["Enums"]["fin_tipo_lancamento"]
          updated_at?: string
          valor?: number
          valor_laudo?: number
          valor_liquido_cartao?: number | null
          valor_medico_override?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "fin_lancamentos_agendamento_id_fkey"
            columns: ["agendamento_id"]
            isOneToOne: false
            referencedRelation: "agendamentos"
            referencedColumns: ["id"]
          },
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
            foreignKeyName: "fin_lancamentos_contrato_id_fkey"
            columns: ["contrato_id"]
            isOneToOne: false
            referencedRelation: "contratos_assinatura"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fin_lancamentos_convenio_id_fkey"
            columns: ["convenio_id"]
            isOneToOne: false
            referencedRelation: "cb_convenios"
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
            foreignKeyName: "fin_lancamentos_laudo_lancamento_id_fkey"
            columns: ["laudo_lancamento_id"]
            isOneToOne: false
            referencedRelation: "fin_atendimentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fin_lancamentos_laudo_lote_id_fkey"
            columns: ["laudo_lote_id"]
            isOneToOne: false
            referencedRelation: "fin_laudo_lotes"
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
            foreignKeyName: "fin_lancamentos_medico_laudador_id_fkey"
            columns: ["medico_laudador_id"]
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
      fin_laudo_lotes: {
        Row: {
          agenda_medico_id: string
          clinica_id: string
          created_at: string
          criado_por: string | null
          id: string
          observacoes: string | null
          periodo_fim: string
          periodo_inicio: string
          total_ecgs: number
          total_repasse: number
          updated_at: string
        }
        Insert: {
          agenda_medico_id: string
          clinica_id: string
          created_at?: string
          criado_por?: string | null
          id?: string
          observacoes?: string | null
          periodo_fim: string
          periodo_inicio: string
          total_ecgs?: number
          total_repasse?: number
          updated_at?: string
        }
        Update: {
          agenda_medico_id?: string
          clinica_id?: string
          created_at?: string
          criado_por?: string | null
          id?: string
          observacoes?: string | null
          periodo_fim?: string
          periodo_inicio?: string
          total_ecgs?: number
          total_repasse?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fin_laudo_lotes_agenda_medico_id_fkey"
            columns: ["agenda_medico_id"]
            isOneToOne: false
            referencedRelation: "medicos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fin_laudo_lotes_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "clinicas"
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
      fin_repasse_terceiro: {
        Row: {
          atendimento_id: string | null
          clinica_id: string
          created_at: string
          data: string
          executante_medico_id: string | null
          id: string
          lancamento_id: string | null
          origem: string
          percentual: number | null
          repasse_conta_id: string | null
          repasse_forma_pagamento: string | null
          repasse_lancamento_id: string | null
          repasse_pago: boolean
          repasse_pago_at: string
          repasse_pago_em: string | null
          repasse_pago_por: string | null
          terceiro_medico_id: string
          valor: number
        }
        Insert: {
          atendimento_id?: string | null
          clinica_id: string
          created_at?: string
          data: string
          executante_medico_id?: string | null
          id?: string
          lancamento_id?: string | null
          origem: string
          percentual?: number | null
          repasse_conta_id?: string | null
          repasse_forma_pagamento?: string | null
          repasse_lancamento_id?: string | null
          repasse_pago?: boolean
          repasse_pago_at?: string
          repasse_pago_em?: string | null
          repasse_pago_por?: string | null
          terceiro_medico_id: string
          valor: number
        }
        Update: {
          atendimento_id?: string | null
          clinica_id?: string
          created_at?: string
          data?: string
          executante_medico_id?: string | null
          id?: string
          lancamento_id?: string | null
          origem?: string
          percentual?: number | null
          repasse_conta_id?: string | null
          repasse_forma_pagamento?: string | null
          repasse_lancamento_id?: string | null
          repasse_pago?: boolean
          repasse_pago_at?: string
          repasse_pago_em?: string | null
          repasse_pago_por?: string | null
          terceiro_medico_id?: string
          valor?: number
        }
        Relationships: [
          {
            foreignKeyName: "fin_repasse_terceiro_atendimento_id_fkey"
            columns: ["atendimento_id"]
            isOneToOne: false
            referencedRelation: "fin_atendimentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fin_repasse_terceiro_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "clinicas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fin_repasse_terceiro_executante_medico_id_fkey"
            columns: ["executante_medico_id"]
            isOneToOne: false
            referencedRelation: "medicos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fin_repasse_terceiro_lancamento_id_fkey"
            columns: ["lancamento_id"]
            isOneToOne: false
            referencedRelation: "fin_lancamentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fin_repasse_terceiro_repasse_lancamento_id_fkey"
            columns: ["repasse_lancamento_id"]
            isOneToOne: false
            referencedRelation: "fin_lancamentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fin_repasse_terceiro_terceiro_medico_id_fkey"
            columns: ["terceiro_medico_id"]
            isOneToOne: false
            referencedRelation: "medicos"
            referencedColumns: ["id"]
          },
        ]
      }
      fisio_avaliacoes: {
        Row: {
          clinica_id: string
          created_at: string
          diagnostico_funcional: string | null
          historia: string | null
          id: string
          objetivos: string | null
          observacoes: string | null
          paciente_id: string
          plano_tratamento: string | null
          profissional_id: string | null
          queixa_principal: string | null
          ultima_atualizacao_por: string | null
          updated_at: string
        }
        Insert: {
          clinica_id: string
          created_at?: string
          diagnostico_funcional?: string | null
          historia?: string | null
          id?: string
          objetivos?: string | null
          observacoes?: string | null
          paciente_id: string
          plano_tratamento?: string | null
          profissional_id?: string | null
          queixa_principal?: string | null
          ultima_atualizacao_por?: string | null
          updated_at?: string
        }
        Update: {
          clinica_id?: string
          created_at?: string
          diagnostico_funcional?: string | null
          historia?: string | null
          id?: string
          objetivos?: string | null
          observacoes?: string | null
          paciente_id?: string
          plano_tratamento?: string | null
          profissional_id?: string | null
          queixa_principal?: string | null
          ultima_atualizacao_por?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      fisio_marcacoes: {
        Row: {
          clinica_id: string
          created_at: string
          created_by: string | null
          data: string
          id: string
          intensidade: number | null
          lado: string
          paciente_id: string
          profissional_id: string | null
          queixa: string | null
          regiao: string
          tipo: Database["public"]["Enums"]["fisio_marcacao_tipo"]
          tratamento: string | null
          updated_at: string
          vista: string
        }
        Insert: {
          clinica_id: string
          created_at?: string
          created_by?: string | null
          data?: string
          id?: string
          intensidade?: number | null
          lado?: string
          paciente_id: string
          profissional_id?: string | null
          queixa?: string | null
          regiao: string
          tipo?: Database["public"]["Enums"]["fisio_marcacao_tipo"]
          tratamento?: string | null
          updated_at?: string
          vista?: string
        }
        Update: {
          clinica_id?: string
          created_at?: string
          created_by?: string | null
          data?: string
          id?: string
          intensidade?: number | null
          lado?: string
          paciente_id?: string
          profissional_id?: string | null
          queixa?: string | null
          regiao?: string
          tipo?: Database["public"]["Enums"]["fisio_marcacao_tipo"]
          tratamento?: string | null
          updated_at?: string
          vista?: string
        }
        Relationships: []
      }
      fisio_pacotes: {
        Row: {
          clinica_id: string
          created_at: string
          created_by: string | null
          data_inicio: string
          descricao: string
          id: string
          observacoes: string | null
          orcamento_id: string | null
          orcamento_item_id: string | null
          paciente_id: string
          procedimento_id: string | null
          profissional_id: string | null
          status: string
          total_sessoes: number
          updated_at: string
          valor_total: number
        }
        Insert: {
          clinica_id: string
          created_at?: string
          created_by?: string | null
          data_inicio?: string
          descricao: string
          id?: string
          observacoes?: string | null
          orcamento_id?: string | null
          orcamento_item_id?: string | null
          paciente_id: string
          procedimento_id?: string | null
          profissional_id?: string | null
          status?: string
          total_sessoes: number
          updated_at?: string
          valor_total?: number
        }
        Update: {
          clinica_id?: string
          created_at?: string
          created_by?: string | null
          data_inicio?: string
          descricao?: string
          id?: string
          observacoes?: string | null
          orcamento_id?: string | null
          orcamento_item_id?: string | null
          paciente_id?: string
          procedimento_id?: string | null
          profissional_id?: string | null
          status?: string
          total_sessoes?: number
          updated_at?: string
          valor_total?: number
        }
        Relationships: [
          {
            foreignKeyName: "fisio_pacotes_orcamento_id_fkey"
            columns: ["orcamento_id"]
            isOneToOne: false
            referencedRelation: "orcamentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fisio_pacotes_orcamento_item_id_fkey"
            columns: ["orcamento_item_id"]
            isOneToOne: false
            referencedRelation: "orcamento_itens"
            referencedColumns: ["id"]
          },
        ]
      }
      fisio_sessoes: {
        Row: {
          agendamento_id: string | null
          clinica_id: string
          created_at: string
          data_prevista: string | null
          dor_antes: number | null
          dor_depois: number | null
          evolucao: string | null
          id: string
          numero: number
          pacote_id: string
          profissional_id: string | null
          realizada_em: string | null
          registrado_por: string | null
          status: string
          updated_at: string
        }
        Insert: {
          agendamento_id?: string | null
          clinica_id: string
          created_at?: string
          data_prevista?: string | null
          dor_antes?: number | null
          dor_depois?: number | null
          evolucao?: string | null
          id?: string
          numero: number
          pacote_id: string
          profissional_id?: string | null
          realizada_em?: string | null
          registrado_por?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          agendamento_id?: string | null
          clinica_id?: string
          created_at?: string
          data_prevista?: string | null
          dor_antes?: number | null
          dor_depois?: number | null
          evolucao?: string | null
          id?: string
          numero?: number
          pacote_id?: string
          profissional_id?: string | null
          realizada_em?: string | null
          registrado_por?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fisio_sessoes_agendamento_id_fkey"
            columns: ["agendamento_id"]
            isOneToOne: false
            referencedRelation: "agendamentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fisio_sessoes_pacote_id_fkey"
            columns: ["pacote_id"]
            isOneToOne: false
            referencedRelation: "fisio_pacotes"
            referencedColumns: ["id"]
          },
        ]
      }
      gr_impressoes: {
        Row: {
          agendamento_id: string | null
          clinica_id: string
          created_at: string
          ficha_numero: number | null
          id: string
          impresso_por: string | null
          impresso_por_nome: string | null
          mensalidade_id: string | null
          tipo: string
          via_numero: number
        }
        Insert: {
          agendamento_id?: string | null
          clinica_id: string
          created_at?: string
          ficha_numero?: number | null
          id?: string
          impresso_por?: string | null
          impresso_por_nome?: string | null
          mensalidade_id?: string | null
          tipo?: string
          via_numero: number
        }
        Update: {
          agendamento_id?: string | null
          clinica_id?: string
          created_at?: string
          ficha_numero?: number | null
          id?: string
          impresso_por?: string | null
          impresso_por_nome?: string | null
          mensalidade_id?: string | null
          tipo?: string
          via_numero?: number
        }
        Relationships: [
          {
            foreignKeyName: "gr_impressoes_mensalidade_id_fkey"
            columns: ["mensalidade_id"]
            isOneToOne: false
            referencedRelation: "contrato_mensalidades"
            referencedColumns: ["id"]
          },
        ]
      }
      hiperdia_registros: {
        Row: {
          clinica_id: string
          created_at: string
          data_registro: string
          glicemia_jejum: number | null
          glicemia_pos_prandial: number | null
          id: string
          medico_id: string | null
          observacoes: string | null
          paciente_id: string
          peso: number | null
          pressao_diastolica: number | null
          pressao_sistolica: number | null
          registrado_por: string | null
          updated_at: string
        }
        Insert: {
          clinica_id: string
          created_at?: string
          data_registro?: string
          glicemia_jejum?: number | null
          glicemia_pos_prandial?: number | null
          id?: string
          medico_id?: string | null
          observacoes?: string | null
          paciente_id: string
          peso?: number | null
          pressao_diastolica?: number | null
          pressao_sistolica?: number | null
          registrado_por?: string | null
          updated_at?: string
        }
        Update: {
          clinica_id?: string
          created_at?: string
          data_registro?: string
          glicemia_jejum?: number | null
          glicemia_pos_prandial?: number | null
          id?: string
          medico_id?: string | null
          observacoes?: string | null
          paciente_id?: string
          peso?: number | null
          pressao_diastolica?: number | null
          pressao_sistolica?: number | null
          registrado_por?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "hiperdia_registros_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "clinicas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hiperdia_registros_medico_id_fkey"
            columns: ["medico_id"]
            isOneToOne: false
            referencedRelation: "medicos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hiperdia_registros_paciente_id_fkey"
            columns: ["paciente_id"]
            isOneToOne: false
            referencedRelation: "pacientes"
            referencedColumns: ["id"]
          },
        ]
      }
      hr_banco_horas: {
        Row: {
          clinica_id: string
          competencia: string
          contrato_id: string
          created_at: string
          horas_devidas: number
          horas_trabalhadas: number
          id: string
          observacoes: string | null
          saldo: number
          updated_at: string
        }
        Insert: {
          clinica_id: string
          competencia: string
          contrato_id: string
          created_at?: string
          horas_devidas?: number
          horas_trabalhadas?: number
          id?: string
          observacoes?: string | null
          saldo?: number
          updated_at?: string
        }
        Update: {
          clinica_id?: string
          competencia?: string
          contrato_id?: string
          created_at?: string
          horas_devidas?: number
          horas_trabalhadas?: number
          id?: string
          observacoes?: string | null
          saldo?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "hr_banco_horas_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "clinicas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_banco_horas_contrato_id_fkey"
            columns: ["contrato_id"]
            isOneToOne: false
            referencedRelation: "hr_contratos"
            referencedColumns: ["id"]
          },
        ]
      }
      hr_contratos: {
        Row: {
          carga_horaria_semanal: number
          cargo_id: string | null
          clinica_id: string
          convenio_contrato_id: string | null
          cpf: string | null
          created_at: string
          data_admissao: string
          data_demissao: string | null
          data_nascimento: string | null
          email: string | null
          funcionario_nome: string
          id: string
          numero: number
          observacoes: string | null
          paciente_id: string | null
          regime: string
          salario: number
          setor_id: string | null
          sexo: string
          status: string
          telefone: string | null
          unidade_id: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          carga_horaria_semanal?: number
          cargo_id?: string | null
          clinica_id: string
          convenio_contrato_id?: string | null
          cpf?: string | null
          created_at?: string
          data_admissao?: string
          data_demissao?: string | null
          data_nascimento?: string | null
          email?: string | null
          funcionario_nome: string
          id?: string
          numero?: number
          observacoes?: string | null
          paciente_id?: string | null
          regime?: string
          salario?: number
          setor_id?: string | null
          sexo?: string
          status?: string
          telefone?: string | null
          unidade_id?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          carga_horaria_semanal?: number
          cargo_id?: string | null
          clinica_id?: string
          convenio_contrato_id?: string | null
          cpf?: string | null
          created_at?: string
          data_admissao?: string
          data_demissao?: string | null
          data_nascimento?: string | null
          email?: string | null
          funcionario_nome?: string
          id?: string
          numero?: number
          observacoes?: string | null
          paciente_id?: string | null
          regime?: string
          salario?: number
          setor_id?: string | null
          sexo?: string
          status?: string
          telefone?: string | null
          unidade_id?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "hr_contratos_cargo_id_fkey"
            columns: ["cargo_id"]
            isOneToOne: false
            referencedRelation: "cargos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_contratos_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "clinicas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_contratos_convenio_contrato_id_fkey"
            columns: ["convenio_contrato_id"]
            isOneToOne: false
            referencedRelation: "contratos_assinatura"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_contratos_paciente_id_fkey"
            columns: ["paciente_id"]
            isOneToOne: false
            referencedRelation: "pacientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_contratos_setor_id_fkey"
            columns: ["setor_id"]
            isOneToOne: false
            referencedRelation: "setores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_contratos_unidade_id_fkey"
            columns: ["unidade_id"]
            isOneToOne: false
            referencedRelation: "unidades"
            referencedColumns: ["id"]
          },
        ]
      }
      hr_escalas: {
        Row: {
          clinica_id: string
          contrato_id: string
          created_at: string
          dia_semana: number
          hora_entrada: string | null
          hora_saida: string | null
          id: string
          intervalo_fim: string | null
          intervalo_inicio: string | null
        }
        Insert: {
          clinica_id: string
          contrato_id: string
          created_at?: string
          dia_semana: number
          hora_entrada?: string | null
          hora_saida?: string | null
          id?: string
          intervalo_fim?: string | null
          intervalo_inicio?: string | null
        }
        Update: {
          clinica_id?: string
          contrato_id?: string
          created_at?: string
          dia_semana?: number
          hora_entrada?: string | null
          hora_saida?: string | null
          id?: string
          intervalo_fim?: string | null
          intervalo_inicio?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "hr_escalas_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "clinicas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_escalas_contrato_id_fkey"
            columns: ["contrato_id"]
            isOneToOne: false
            referencedRelation: "hr_contratos"
            referencedColumns: ["id"]
          },
        ]
      }
      hr_ferias: {
        Row: {
          abono_pecuniario: boolean
          aprovado_em: string | null
          aprovado_por: string | null
          clinica_id: string
          contrato_id: string
          created_at: string
          dias: number | null
          fim: string | null
          id: string
          inicio: string | null
          observacoes: string | null
          periodo_aquisitivo_fim: string
          periodo_aquisitivo_inicio: string
          status: string
          updated_at: string
        }
        Insert: {
          abono_pecuniario?: boolean
          aprovado_em?: string | null
          aprovado_por?: string | null
          clinica_id: string
          contrato_id: string
          created_at?: string
          dias?: number | null
          fim?: string | null
          id?: string
          inicio?: string | null
          observacoes?: string | null
          periodo_aquisitivo_fim: string
          periodo_aquisitivo_inicio: string
          status?: string
          updated_at?: string
        }
        Update: {
          abono_pecuniario?: boolean
          aprovado_em?: string | null
          aprovado_por?: string | null
          clinica_id?: string
          contrato_id?: string
          created_at?: string
          dias?: number | null
          fim?: string | null
          id?: string
          inicio?: string | null
          observacoes?: string | null
          periodo_aquisitivo_fim?: string
          periodo_aquisitivo_inicio?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "hr_ferias_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "clinicas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_ferias_contrato_id_fkey"
            columns: ["contrato_id"]
            isOneToOne: false
            referencedRelation: "hr_contratos"
            referencedColumns: ["id"]
          },
        ]
      }
      hr_holerites: {
        Row: {
          clinica_id: string
          competencia: string
          contrato_id: string
          created_at: string
          descontos: Json
          id: string
          liquido: number
          observacoes: string | null
          pago_em: string | null
          proventos: Json
          salario_base: number
          status: string
          total_descontos: number
          total_proventos: number
          updated_at: string
        }
        Insert: {
          clinica_id: string
          competencia: string
          contrato_id: string
          created_at?: string
          descontos?: Json
          id?: string
          liquido?: number
          observacoes?: string | null
          pago_em?: string | null
          proventos?: Json
          salario_base?: number
          status?: string
          total_descontos?: number
          total_proventos?: number
          updated_at?: string
        }
        Update: {
          clinica_id?: string
          competencia?: string
          contrato_id?: string
          created_at?: string
          descontos?: Json
          id?: string
          liquido?: number
          observacoes?: string | null
          pago_em?: string | null
          proventos?: Json
          salario_base?: number
          status?: string
          total_descontos?: number
          total_proventos?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "hr_holerites_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "clinicas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_holerites_contrato_id_fkey"
            columns: ["contrato_id"]
            isOneToOne: false
            referencedRelation: "hr_contratos"
            referencedColumns: ["id"]
          },
        ]
      }
      hr_pontos: {
        Row: {
          ajustado: boolean
          ajustado_por: string | null
          clinica_id: string
          contrato_id: string | null
          created_at: string
          dentro_raio: boolean | null
          id: string
          latitude: number | null
          longitude: number | null
          marcado_em: string
          observacao: string | null
          tipo: string
          unidade_id: string | null
          user_id: string
        }
        Insert: {
          ajustado?: boolean
          ajustado_por?: string | null
          clinica_id: string
          contrato_id?: string | null
          created_at?: string
          dentro_raio?: boolean | null
          id?: string
          latitude?: number | null
          longitude?: number | null
          marcado_em?: string
          observacao?: string | null
          tipo: string
          unidade_id?: string | null
          user_id: string
        }
        Update: {
          ajustado?: boolean
          ajustado_por?: string | null
          clinica_id?: string
          contrato_id?: string | null
          created_at?: string
          dentro_raio?: boolean | null
          id?: string
          latitude?: number | null
          longitude?: number | null
          marcado_em?: string
          observacao?: string | null
          tipo?: string
          unidade_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "hr_pontos_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "clinicas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_pontos_contrato_id_fkey"
            columns: ["contrato_id"]
            isOneToOne: false
            referencedRelation: "hr_contratos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_pontos_unidade_id_fkey"
            columns: ["unidade_id"]
            isOneToOne: false
            referencedRelation: "unidades"
            referencedColumns: ["id"]
          },
        ]
      }
      intake_rate_limit: {
        Row: {
          chave: string
          contador: number
          created_at: string
          id: string
          janela: string
          janela_inicio: string
          updated_at: string
        }
        Insert: {
          chave: string
          contador?: number
          created_at?: string
          id?: string
          janela: string
          janela_inicio?: string
          updated_at?: string
        }
        Update: {
          chave?: string
          contador?: number
          created_at?: string
          id?: string
          janela?: string
          janela_inicio?: string
          updated_at?: string
        }
        Relationships: []
      }
      integracao_api_keys: {
        Row: {
          ativo: boolean
          clinica_id: string
          created_at: string
          criado_por: string | null
          escopos: string[]
          expira_em: string | null
          id: string
          key_hash: string
          key_prefix: string
          limite_pacientes_por_dia: number
          limite_pacientes_por_minuto: number
          limite_por_dia: number
          limite_por_minuto: number
          nome: string
          origem_integracao: string
          ultima_utilizacao_em: string | null
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          clinica_id: string
          created_at?: string
          criado_por?: string | null
          escopos?: string[]
          expira_em?: string | null
          id?: string
          key_hash: string
          key_prefix: string
          limite_pacientes_por_dia?: number
          limite_pacientes_por_minuto?: number
          limite_por_dia?: number
          limite_por_minuto?: number
          nome: string
          origem_integracao: string
          ultima_utilizacao_em?: string | null
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          clinica_id?: string
          created_at?: string
          criado_por?: string | null
          escopos?: string[]
          expira_em?: string | null
          id?: string
          key_hash?: string
          key_prefix?: string
          limite_pacientes_por_dia?: number
          limite_pacientes_por_minuto?: number
          limite_por_dia?: number
          limite_por_minuto?: number
          nome?: string
          origem_integracao?: string
          ultima_utilizacao_em?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "integracao_api_keys_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "clinicas"
            referencedColumns: ["id"]
          },
        ]
      }
      integracao_idempotencia: {
        Row: {
          api_key_id: string
          body_hash: string
          concluido: boolean
          created_at: string
          id: string
          idempotency_key: string
          response_json: Json | null
          status_http: number | null
          updated_at: string
        }
        Insert: {
          api_key_id: string
          body_hash: string
          concluido?: boolean
          created_at?: string
          id?: string
          idempotency_key: string
          response_json?: Json | null
          status_http?: number | null
          updated_at?: string
        }
        Update: {
          api_key_id?: string
          body_hash?: string
          concluido?: boolean
          created_at?: string
          id?: string
          idempotency_key?: string
          response_json?: Json | null
          status_http?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "integracao_idempotencia_api_key_id_fkey"
            columns: ["api_key_id"]
            isOneToOne: false
            referencedRelation: "integracao_api_keys"
            referencedColumns: ["id"]
          },
        ]
      }
      integracao_rate_limit: {
        Row: {
          api_key_id: string
          contador: number
          id: string
          janela: string
          janela_inicio: string
          updated_at: string
        }
        Insert: {
          api_key_id: string
          contador?: number
          id?: string
          janela: string
          janela_inicio: string
          updated_at?: string
        }
        Update: {
          api_key_id?: string
          contador?: number
          id?: string
          janela?: string
          janela_inicio?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "integracao_rate_limit_api_key_id_fkey"
            columns: ["api_key_id"]
            isOneToOne: false
            referencedRelation: "integracao_api_keys"
            referencedColumns: ["id"]
          },
        ]
      }
      integracao_requisicoes: {
        Row: {
          api_key_id: string | null
          clinica_id: string | null
          created_at: string
          duracao_ms: number | null
          erro_codigo: string | null
          erro_resumo: string | null
          id: string
          id_externo: string | null
          ip: string | null
          metodo: string
          request_id: string
          rota: string
          status_http: number
        }
        Insert: {
          api_key_id?: string | null
          clinica_id?: string | null
          created_at?: string
          duracao_ms?: number | null
          erro_codigo?: string | null
          erro_resumo?: string | null
          id?: string
          id_externo?: string | null
          ip?: string | null
          metodo: string
          request_id: string
          rota: string
          status_http: number
        }
        Update: {
          api_key_id?: string | null
          clinica_id?: string | null
          created_at?: string
          duracao_ms?: number | null
          erro_codigo?: string | null
          erro_resumo?: string | null
          id?: string
          id_externo?: string | null
          ip?: string | null
          metodo?: string
          request_id?: string
          rota?: string
          status_http?: number
        }
        Relationships: [
          {
            foreignKeyName: "integracao_requisicoes_api_key_id_fkey"
            columns: ["api_key_id"]
            isOneToOne: false
            referencedRelation: "integracao_api_keys"
            referencedColumns: ["id"]
          },
        ]
      }
      integration_secrets: {
        Row: {
          chave: string
          clinica_id: string
          created_at: string
          descricao: string | null
          id: string
          updated_at: string
          valor: string
        }
        Insert: {
          chave: string
          clinica_id: string
          created_at?: string
          descricao?: string | null
          id?: string
          updated_at?: string
          valor: string
        }
        Update: {
          chave?: string
          clinica_id?: string
          created_at?: string
          descricao?: string | null
          id?: string
          updated_at?: string
          valor?: string
        }
        Relationships: [
          {
            foreignKeyName: "integration_secrets_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "clinicas"
            referencedColumns: ["id"]
          },
        ]
      }
      lab_allowlist_contatos: {
        Row: {
          created_at: string
          criado_por: string | null
          descricao: string | null
          id: string
          tipo: string
          updated_at: string
          valor: string
        }
        Insert: {
          created_at?: string
          criado_por?: string | null
          descricao?: string | null
          id?: string
          tipo: string
          updated_at?: string
          valor: string
        }
        Update: {
          created_at?: string
          criado_por?: string | null
          descricao?: string | null
          id?: string
          tipo?: string
          updated_at?: string
          valor?: string
        }
        Relationships: []
      }
      lgpd_solicitacoes: {
        Row: {
          clinica_id: string
          created_at: string
          descricao: string | null
          id: string
          respondido_em: string | null
          respondido_por: string | null
          resposta: string | null
          status: string
          tipo: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          clinica_id: string
          created_at?: string
          descricao?: string | null
          id?: string
          respondido_em?: string | null
          respondido_por?: string | null
          resposta?: string | null
          status?: string
          tipo: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          clinica_id?: string
          created_at?: string
          descricao?: string | null
          id?: string
          respondido_em?: string | null
          respondido_por?: string | null
          resposta?: string | null
          status?: string
          tipo?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lgpd_solicitacoes_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "clinicas"
            referencedColumns: ["id"]
          },
        ]
      }
      lms_certificados: {
        Row: {
          clinica_id: string
          codigo_verificacao: string
          curso_id: string
          emitido_em: string
          id: string
          user_id: string
        }
        Insert: {
          clinica_id: string
          codigo_verificacao?: string
          curso_id: string
          emitido_em?: string
          id?: string
          user_id: string
        }
        Update: {
          clinica_id?: string
          codigo_verificacao?: string
          curso_id?: string
          emitido_em?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "lms_certificados_curso_id_fkey"
            columns: ["curso_id"]
            isOneToOne: false
            referencedRelation: "lms_cursos"
            referencedColumns: ["id"]
          },
        ]
      }
      lms_cursos: {
        Row: {
          capa_url: string | null
          carga_horaria_min: number | null
          clinica_id: string
          created_at: string
          criado_por: string | null
          descricao: string | null
          id: string
          publicado: boolean
          titulo: string
          updated_at: string
        }
        Insert: {
          capa_url?: string | null
          carga_horaria_min?: number | null
          clinica_id: string
          created_at?: string
          criado_por?: string | null
          descricao?: string | null
          id?: string
          publicado?: boolean
          titulo: string
          updated_at?: string
        }
        Update: {
          capa_url?: string | null
          carga_horaria_min?: number | null
          clinica_id?: string
          created_at?: string
          criado_por?: string | null
          descricao?: string | null
          id?: string
          publicado?: boolean
          titulo?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "lms_cursos_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "clinicas"
            referencedColumns: ["id"]
          },
        ]
      }
      lms_licoes: {
        Row: {
          conteudo: string | null
          created_at: string
          curso_id: string
          duracao_min: number | null
          id: string
          modulo_id: string
          ordem: number
          tipo: Database["public"]["Enums"]["lms_licao_tipo"]
          titulo: string
          video_url: string | null
        }
        Insert: {
          conteudo?: string | null
          created_at?: string
          curso_id: string
          duracao_min?: number | null
          id?: string
          modulo_id: string
          ordem?: number
          tipo?: Database["public"]["Enums"]["lms_licao_tipo"]
          titulo: string
          video_url?: string | null
        }
        Update: {
          conteudo?: string | null
          created_at?: string
          curso_id?: string
          duracao_min?: number | null
          id?: string
          modulo_id?: string
          ordem?: number
          tipo?: Database["public"]["Enums"]["lms_licao_tipo"]
          titulo?: string
          video_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lms_licoes_curso_id_fkey"
            columns: ["curso_id"]
            isOneToOne: false
            referencedRelation: "lms_cursos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lms_licoes_modulo_id_fkey"
            columns: ["modulo_id"]
            isOneToOne: false
            referencedRelation: "lms_modulos"
            referencedColumns: ["id"]
          },
        ]
      }
      lms_modulos: {
        Row: {
          created_at: string
          curso_id: string
          id: string
          ordem: number
          titulo: string
        }
        Insert: {
          created_at?: string
          curso_id: string
          id?: string
          ordem?: number
          titulo: string
        }
        Update: {
          created_at?: string
          curso_id?: string
          id?: string
          ordem?: number
          titulo?: string
        }
        Relationships: [
          {
            foreignKeyName: "lms_modulos_curso_id_fkey"
            columns: ["curso_id"]
            isOneToOne: false
            referencedRelation: "lms_cursos"
            referencedColumns: ["id"]
          },
        ]
      }
      lms_progresso: {
        Row: {
          concluida_em: string
          curso_id: string
          id: string
          licao_id: string
          nota: number | null
          user_id: string
        }
        Insert: {
          concluida_em?: string
          curso_id: string
          id?: string
          licao_id: string
          nota?: number | null
          user_id: string
        }
        Update: {
          concluida_em?: string
          curso_id?: string
          id?: string
          licao_id?: string
          nota?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "lms_progresso_curso_id_fkey"
            columns: ["curso_id"]
            isOneToOne: false
            referencedRelation: "lms_cursos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lms_progresso_licao_id_fkey"
            columns: ["licao_id"]
            isOneToOne: false
            referencedRelation: "lms_licoes"
            referencedColumns: ["id"]
          },
        ]
      }
      lms_quizzes: {
        Row: {
          created_at: string
          id: string
          licao_id: string
          nota_minima: number
          perguntas: Json
        }
        Insert: {
          created_at?: string
          id?: string
          licao_id: string
          nota_minima?: number
          perguntas?: Json
        }
        Update: {
          created_at?: string
          id?: string
          licao_id?: string
          nota_minima?: number
          perguntas?: Json
        }
        Relationships: [
          {
            foreignKeyName: "lms_quizzes_licao_id_fkey"
            columns: ["licao_id"]
            isOneToOne: false
            referencedRelation: "lms_licoes"
            referencedColumns: ["id"]
          },
        ]
      }
      lms_trilhas_cargo: {
        Row: {
          cargo_id: string
          clinica_id: string
          curso_id: string
          id: string
          obrigatorio: boolean
        }
        Insert: {
          cargo_id: string
          clinica_id: string
          curso_id: string
          id?: string
          obrigatorio?: boolean
        }
        Update: {
          cargo_id?: string
          clinica_id?: string
          curso_id?: string
          id?: string
          obrigatorio?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "lms_trilhas_cargo_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "clinicas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lms_trilhas_cargo_curso_id_fkey"
            columns: ["curso_id"]
            isOneToOne: false
            referencedRelation: "lms_cursos"
            referencedColumns: ["id"]
          },
        ]
      }
      medico_agenda_procedimentos: {
        Row: {
          agenda_id: string
          clinica_id: string
          created_at: string
          id: string
          procedimento_id: string
        }
        Insert: {
          agenda_id: string
          clinica_id: string
          created_at?: string
          id?: string
          procedimento_id: string
        }
        Update: {
          agenda_id?: string
          clinica_id?: string
          created_at?: string
          id?: string
          procedimento_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "medico_agenda_procedimentos_agenda_id_fkey"
            columns: ["agenda_id"]
            isOneToOne: false
            referencedRelation: "medico_agendas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "medico_agenda_procedimentos_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "clinicas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "medico_agenda_procedimentos_procedimento_id_fkey"
            columns: ["procedimento_id"]
            isOneToOne: false
            referencedRelation: "procedimentos"
            referencedColumns: ["id"]
          },
        ]
      }
      medico_agendas: {
        Row: {
          ativo: boolean
          clinica_id: string
          cor: string | null
          created_at: string
          id: string
          medico_id: string | null
          nome: string
          ordem: number
          ordem_chegada: boolean
          sala: string | null
          tipo_recurso: string | null
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          clinica_id: string
          cor?: string | null
          created_at?: string
          id?: string
          medico_id?: string | null
          nome: string
          ordem?: number
          ordem_chegada?: boolean
          sala?: string | null
          tipo_recurso?: string | null
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          clinica_id?: string
          cor?: string | null
          created_at?: string
          id?: string
          medico_id?: string | null
          nome?: string
          ordem?: number
          ordem_chegada?: boolean
          sala?: string | null
          tipo_recurso?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "medico_agendas_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "clinicas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "medico_agendas_medico_id_fkey"
            columns: ["medico_id"]
            isOneToOne: false
            referencedRelation: "medicos"
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
          cartao_consulta_valor: number | null
          cartao_desconto_valor: number | null
          convenio_percentual: number | null
          convenio_tipo_repasse: string | null
          convenio_valor: number | null
          created_at: string
          id: string
          medico_id: string
          nome: string
          percentual: number | null
          percentual_terceiro: number | null
          terceiro_id: string | null
          tipo_repasse: string
          tipo_repasse_terceiro: string
          updated_at: string
          valor: number | null
          valor_terceiro: number | null
        }
        Insert: {
          ativo?: boolean
          cartao_consulta_valor?: number | null
          cartao_desconto_valor?: number | null
          convenio_percentual?: number | null
          convenio_tipo_repasse?: string | null
          convenio_valor?: number | null
          created_at?: string
          id?: string
          medico_id: string
          nome: string
          percentual?: number | null
          percentual_terceiro?: number | null
          terceiro_id?: string | null
          tipo_repasse?: string
          tipo_repasse_terceiro?: string
          updated_at?: string
          valor?: number | null
          valor_terceiro?: number | null
        }
        Update: {
          ativo?: boolean
          cartao_consulta_valor?: number | null
          cartao_desconto_valor?: number | null
          convenio_percentual?: number | null
          convenio_tipo_repasse?: string | null
          convenio_valor?: number | null
          created_at?: string
          id?: string
          medico_id?: string
          nome?: string
          percentual?: number | null
          percentual_terceiro?: number | null
          terceiro_id?: string | null
          tipo_repasse?: string
          tipo_repasse_terceiro?: string
          updated_at?: string
          valor?: number | null
          valor_terceiro?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "medico_convenios_medico_id_fkey"
            columns: ["medico_id"]
            isOneToOne: false
            referencedRelation: "medicos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "medico_convenios_terceiro_id_fkey"
            columns: ["terceiro_id"]
            isOneToOne: false
            referencedRelation: "medicos"
            referencedColumns: ["id"]
          },
        ]
      }
      medico_disponibilidades: {
        Row: {
          agenda_id: string
          ativo: boolean
          clinica_id: string
          created_at: string
          dia_semana: number
          hora_fim: string
          hora_inicio: string
          id: string
          intervalo_min: number | null
          limite_pacientes: number | null
          medico_id: string
          observacoes: string | null
          updated_at: string
          vigencia_fim: string | null
          vigencia_inicio: string | null
        }
        Insert: {
          agenda_id: string
          ativo?: boolean
          clinica_id: string
          created_at?: string
          dia_semana: number
          hora_fim: string
          hora_inicio: string
          id?: string
          intervalo_min?: number | null
          limite_pacientes?: number | null
          medico_id: string
          observacoes?: string | null
          updated_at?: string
          vigencia_fim?: string | null
          vigencia_inicio?: string | null
        }
        Update: {
          agenda_id?: string
          ativo?: boolean
          clinica_id?: string
          created_at?: string
          dia_semana?: number
          hora_fim?: string
          hora_inicio?: string
          id?: string
          intervalo_min?: number | null
          limite_pacientes?: number | null
          medico_id?: string
          observacoes?: string | null
          updated_at?: string
          vigencia_fim?: string | null
          vigencia_inicio?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "medico_disponibilidades_agenda_id_fkey"
            columns: ["agenda_id"]
            isOneToOne: false
            referencedRelation: "medico_agendas"
            referencedColumns: ["id"]
          },
        ]
      }
      medico_especialidades: {
        Row: {
          created_at: string
          especialidade_id: string
          medico_id: string
          rqe_numero: string | null
          tem_rqe: boolean
        }
        Insert: {
          created_at?: string
          especialidade_id: string
          medico_id: string
          rqe_numero?: string | null
          tem_rqe?: boolean
        }
        Update: {
          created_at?: string
          especialidade_id?: string
          medico_id?: string
          rqe_numero?: string | null
          tem_rqe?: boolean
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
      medico_expediente_encerramento: {
        Row: {
          clinica_id: string
          data: string
          encerrado_em: string
          encerrado_por: string | null
          id: string
          medico_id: string
          motivo: string | null
        }
        Insert: {
          clinica_id: string
          data?: string
          encerrado_em?: string
          encerrado_por?: string | null
          id?: string
          medico_id: string
          motivo?: string | null
        }
        Update: {
          clinica_id?: string
          data?: string
          encerrado_em?: string
          encerrado_por?: string | null
          id?: string
          medico_id?: string
          motivo?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "medico_expediente_encerramento_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "clinicas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "medico_expediente_encerramento_medico_id_fkey"
            columns: ["medico_id"]
            isOneToOne: false
            referencedRelation: "medicos"
            referencedColumns: ["id"]
          },
        ]
      }
      medico_procedimentos: {
        Row: {
          created_at: string
          especialidade_id: string | null
          id: string
          medico_id: string
          procedimento_id: string
        }
        Insert: {
          created_at?: string
          especialidade_id?: string | null
          id?: string
          medico_id: string
          procedimento_id: string
        }
        Update: {
          created_at?: string
          especialidade_id?: string | null
          id?: string
          medico_id?: string
          procedimento_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "medico_procedimentos_especialidade_id_fkey"
            columns: ["especialidade_id"]
            isOneToOne: false
            referencedRelation: "especialidades"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "medico_procedimentos_medico_id_fkey"
            columns: ["medico_id"]
            isOneToOne: false
            referencedRelation: "medicos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "medico_procedimentos_procedimento_id_fkey"
            columns: ["procedimento_id"]
            isOneToOne: false
            referencedRelation: "procedimentos"
            referencedColumns: ["id"]
          },
        ]
      }
      medico_repasse_laudo: {
        Row: {
          agenda_medico_id: string
          ativo: boolean
          clinica_id: string
          created_at: string
          id: string
          laudador_medico_id: string
          percentual: number | null
          tipo_repasse: string
          updated_at: string
          valor: number | null
        }
        Insert: {
          agenda_medico_id: string
          ativo?: boolean
          clinica_id: string
          created_at?: string
          id?: string
          laudador_medico_id: string
          percentual?: number | null
          tipo_repasse: string
          updated_at?: string
          valor?: number | null
        }
        Update: {
          agenda_medico_id?: string
          ativo?: boolean
          clinica_id?: string
          created_at?: string
          id?: string
          laudador_medico_id?: string
          percentual?: number | null
          tipo_repasse?: string
          updated_at?: string
          valor?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "medico_repasse_laudo_agenda_medico_id_fkey"
            columns: ["agenda_medico_id"]
            isOneToOne: false
            referencedRelation: "medicos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "medico_repasse_laudo_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "clinicas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "medico_repasse_laudo_laudador_medico_id_fkey"
            columns: ["laudador_medico_id"]
            isOneToOne: false
            referencedRelation: "medicos"
            referencedColumns: ["id"]
          },
        ]
      }
      medicos: {
        Row: {
          aceita_cartao_beneficios: boolean
          agencia: string | null
          ativo: boolean
          bairro: string | null
          banco: string | null
          cb_percentual_repasse: number | null
          cb_tipo_repasse: string | null
          cb_valor_repasse: number | null
          cep: string | null
          cidade: string | null
          clinica_id: string
          complemento: string | null
          conta: string | null
          convenio_contrato_id: string | null
          cpf: string | null
          created_at: string
          crm: string
          crm_uf: string
          data_nascimento: string | null
          duracao_consulta_min: number
          email: string | null
          especialidade_id: string | null
          estado: string | null
          estado_civil: string | null
          face_atualizado_em: string | null
          face_descriptor: number[] | null
          id: string
          legacy_id: number | null
          logradouro: string | null
          nacionalidade: string | null
          nome: string
          numero: string | null
          paciente_id: string | null
          paytime_recipient_id: string | null
          percentual_repasse_padrao: number
          pix_chave: string | null
          procedimento_padrao_em_branco: boolean
          procedimento_padrao_id: string | null
          rg: string | null
          rqe_especialidade: string | null
          rqes: Json
          sexo: string
          telefone: string | null
          telefone2: string | null
          tem_rqe: boolean
          tipo_repasse: string
          updated_at: string
          usa_sistema: boolean
          user_id: string | null
          valor_repasse_padrao: number | null
        }
        Insert: {
          aceita_cartao_beneficios?: boolean
          agencia?: string | null
          ativo?: boolean
          bairro?: string | null
          banco?: string | null
          cb_percentual_repasse?: number | null
          cb_tipo_repasse?: string | null
          cb_valor_repasse?: number | null
          cep?: string | null
          cidade?: string | null
          clinica_id: string
          complemento?: string | null
          conta?: string | null
          convenio_contrato_id?: string | null
          cpf?: string | null
          created_at?: string
          crm: string
          crm_uf: string
          data_nascimento?: string | null
          duracao_consulta_min?: number
          email?: string | null
          especialidade_id?: string | null
          estado?: string | null
          estado_civil?: string | null
          face_atualizado_em?: string | null
          face_descriptor?: number[] | null
          id?: string
          legacy_id?: number | null
          logradouro?: string | null
          nacionalidade?: string | null
          nome: string
          numero?: string | null
          paciente_id?: string | null
          paytime_recipient_id?: string | null
          percentual_repasse_padrao?: number
          pix_chave?: string | null
          procedimento_padrao_em_branco?: boolean
          procedimento_padrao_id?: string | null
          rg?: string | null
          rqe_especialidade?: string | null
          rqes?: Json
          sexo?: string
          telefone?: string | null
          telefone2?: string | null
          tem_rqe?: boolean
          tipo_repasse?: string
          updated_at?: string
          usa_sistema?: boolean
          user_id?: string | null
          valor_repasse_padrao?: number | null
        }
        Update: {
          aceita_cartao_beneficios?: boolean
          agencia?: string | null
          ativo?: boolean
          bairro?: string | null
          banco?: string | null
          cb_percentual_repasse?: number | null
          cb_tipo_repasse?: string | null
          cb_valor_repasse?: number | null
          cep?: string | null
          cidade?: string | null
          clinica_id?: string
          complemento?: string | null
          conta?: string | null
          convenio_contrato_id?: string | null
          cpf?: string | null
          created_at?: string
          crm?: string
          crm_uf?: string
          data_nascimento?: string | null
          duracao_consulta_min?: number
          email?: string | null
          especialidade_id?: string | null
          estado?: string | null
          estado_civil?: string | null
          face_atualizado_em?: string | null
          face_descriptor?: number[] | null
          id?: string
          legacy_id?: number | null
          logradouro?: string | null
          nacionalidade?: string | null
          nome?: string
          numero?: string | null
          paciente_id?: string | null
          paytime_recipient_id?: string | null
          percentual_repasse_padrao?: number
          pix_chave?: string | null
          procedimento_padrao_em_branco?: boolean
          procedimento_padrao_id?: string | null
          rg?: string | null
          rqe_especialidade?: string | null
          rqes?: Json
          sexo?: string
          telefone?: string | null
          telefone2?: string | null
          tem_rqe?: boolean
          tipo_repasse?: string
          updated_at?: string
          usa_sistema?: boolean
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
            foreignKeyName: "medicos_convenio_contrato_id_fkey"
            columns: ["convenio_contrato_id"]
            isOneToOne: false
            referencedRelation: "contratos_assinatura"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "medicos_especialidade_id_fkey"
            columns: ["especialidade_id"]
            isOneToOne: false
            referencedRelation: "especialidades"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "medicos_paciente_id_fkey"
            columns: ["paciente_id"]
            isOneToOne: false
            referencedRelation: "pacientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "medicos_procedimento_padrao_id_fkey"
            columns: ["procedimento_padrao_id"]
            isOneToOne: false
            referencedRelation: "procedimentos"
            referencedColumns: ["id"]
          },
        ]
      }
      mkt_envios: {
        Row: {
          campanha_id: string | null
          canal: string
          clinica_id: string
          created_at: string
          destinatario: string
          enviado_em: string | null
          erro: string | null
          id: string
          status: string
          updated_at: string
        }
        Insert: {
          campanha_id?: string | null
          canal?: string
          clinica_id: string
          created_at?: string
          destinatario: string
          enviado_em?: string | null
          erro?: string | null
          id?: string
          status?: string
          updated_at?: string
        }
        Update: {
          campanha_id?: string | null
          canal?: string
          clinica_id?: string
          created_at?: string
          destinatario?: string
          enviado_em?: string | null
          erro?: string | null
          id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "mkt_envios_campanha_id_fkey"
            columns: ["campanha_id"]
            isOneToOne: false
            referencedRelation: "campanhas_marketing"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mkt_envios_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "clinicas"
            referencedColumns: ["id"]
          },
        ]
      }
      mkt_landing_pages: {
        Row: {
          campos: Json
          clinica_id: string
          conteudo_html: string | null
          cor_primaria: string | null
          created_at: string
          created_by: string | null
          cta_label: string | null
          hero_imagem_url: string | null
          id: string
          slug: string
          status: string
          subtitulo: string | null
          titulo: string
          updated_at: string
        }
        Insert: {
          campos?: Json
          clinica_id: string
          conteudo_html?: string | null
          cor_primaria?: string | null
          created_at?: string
          created_by?: string | null
          cta_label?: string | null
          hero_imagem_url?: string | null
          id?: string
          slug: string
          status?: string
          subtitulo?: string | null
          titulo: string
          updated_at?: string
        }
        Update: {
          campos?: Json
          clinica_id?: string
          conteudo_html?: string | null
          cor_primaria?: string | null
          created_at?: string
          created_by?: string | null
          cta_label?: string | null
          hero_imagem_url?: string | null
          id?: string
          slug?: string
          status?: string
          subtitulo?: string | null
          titulo?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "mkt_landing_pages_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "clinicas"
            referencedColumns: ["id"]
          },
        ]
      }
      mkt_leads: {
        Row: {
          clinica_id: string
          created_at: string
          dados: Json | null
          email: string | null
          id: string
          landing_page_id: string | null
          mensagem: string | null
          nome: string
          origem: string | null
          paciente_id: string | null
          status: string
          telefone: string | null
          updated_at: string
        }
        Insert: {
          clinica_id: string
          created_at?: string
          dados?: Json | null
          email?: string | null
          id?: string
          landing_page_id?: string | null
          mensagem?: string | null
          nome: string
          origem?: string | null
          paciente_id?: string | null
          status?: string
          telefone?: string | null
          updated_at?: string
        }
        Update: {
          clinica_id?: string
          created_at?: string
          dados?: Json | null
          email?: string | null
          id?: string
          landing_page_id?: string | null
          mensagem?: string | null
          nome?: string
          origem?: string | null
          paciente_id?: string | null
          status?: string
          telefone?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "mkt_leads_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "clinicas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mkt_leads_landing_page_id_fkey"
            columns: ["landing_page_id"]
            isOneToOne: false
            referencedRelation: "mkt_landing_pages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mkt_leads_paciente_id_fkey"
            columns: ["paciente_id"]
            isOneToOne: false
            referencedRelation: "pacientes"
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
          agendamento_id: string | null
          aliquota_iss: number | null
          cancelada_em: string | null
          cancelada_motivo: string | null
          clinica_id: string
          codigo_verificacao: string | null
          created_at: string
          data_emissao: string
          descricao_servicos: string | null
          emitente_id: string | null
          emitida_por: string | null
          erro_mensagem: string | null
          focus_ref: string | null
          focus_status: string | null
          id: string
          medico_id: string | null
          numero: string | null
          observacoes: string | null
          orcamento_id: string | null
          paciente_id: string | null
          pagamento_id: string | null
          pagamento_ids: string[]
          payload_envio: Json | null
          payload_resposta: Json | null
          rps_numero: number | null
          rps_serie: string | null
          serie: string | null
          status: string
          tomador_documento: string | null
          tomador_email: string | null
          tomador_endereco: Json | null
          tomador_nome: string | null
          updated_at: string
          url_pdf: string | null
          url_xml: string | null
          valor_iss: number
          valor_liquido: number | null
          valor_servicos: number
        }
        Insert: {
          agendamento_id?: string | null
          aliquota_iss?: number | null
          cancelada_em?: string | null
          cancelada_motivo?: string | null
          clinica_id: string
          codigo_verificacao?: string | null
          created_at?: string
          data_emissao?: string
          descricao_servicos?: string | null
          emitente_id?: string | null
          emitida_por?: string | null
          erro_mensagem?: string | null
          focus_ref?: string | null
          focus_status?: string | null
          id?: string
          medico_id?: string | null
          numero?: string | null
          observacoes?: string | null
          orcamento_id?: string | null
          paciente_id?: string | null
          pagamento_id?: string | null
          pagamento_ids?: string[]
          payload_envio?: Json | null
          payload_resposta?: Json | null
          rps_numero?: number | null
          rps_serie?: string | null
          serie?: string | null
          status?: string
          tomador_documento?: string | null
          tomador_email?: string | null
          tomador_endereco?: Json | null
          tomador_nome?: string | null
          updated_at?: string
          url_pdf?: string | null
          url_xml?: string | null
          valor_iss?: number
          valor_liquido?: number | null
          valor_servicos?: number
        }
        Update: {
          agendamento_id?: string | null
          aliquota_iss?: number | null
          cancelada_em?: string | null
          cancelada_motivo?: string | null
          clinica_id?: string
          codigo_verificacao?: string | null
          created_at?: string
          data_emissao?: string
          descricao_servicos?: string | null
          emitente_id?: string | null
          emitida_por?: string | null
          erro_mensagem?: string | null
          focus_ref?: string | null
          focus_status?: string | null
          id?: string
          medico_id?: string | null
          numero?: string | null
          observacoes?: string | null
          orcamento_id?: string | null
          paciente_id?: string | null
          pagamento_id?: string | null
          pagamento_ids?: string[]
          payload_envio?: Json | null
          payload_resposta?: Json | null
          rps_numero?: number | null
          rps_serie?: string | null
          serie?: string | null
          status?: string
          tomador_documento?: string | null
          tomador_email?: string | null
          tomador_endereco?: Json | null
          tomador_nome?: string | null
          updated_at?: string
          url_pdf?: string | null
          url_xml?: string | null
          valor_iss?: number
          valor_liquido?: number | null
          valor_servicos?: number
        }
        Relationships: [
          {
            foreignKeyName: "nfse_agendamento_id_fkey"
            columns: ["agendamento_id"]
            isOneToOne: false
            referencedRelation: "agendamentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nfse_emitente_id_fkey"
            columns: ["emitente_id"]
            isOneToOne: false
            referencedRelation: "nfse_emitentes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nfse_orcamento_id_fkey"
            columns: ["orcamento_id"]
            isOneToOne: false
            referencedRelation: "orcamentos"
            referencedColumns: ["id"]
          },
        ]
      }
      nfse_agendamentos: {
        Row: {
          agendamento_id: string
          clinica_id: string
          created_at: string
          id: string
          nfse_id: string
        }
        Insert: {
          agendamento_id: string
          clinica_id: string
          created_at?: string
          id?: string
          nfse_id: string
        }
        Update: {
          agendamento_id?: string
          clinica_id?: string
          created_at?: string
          id?: string
          nfse_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "nfse_agendamentos_agendamento_id_fkey"
            columns: ["agendamento_id"]
            isOneToOne: false
            referencedRelation: "agendamentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nfse_agendamentos_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "clinicas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nfse_agendamentos_nfse_id_fkey"
            columns: ["nfse_id"]
            isOneToOne: false
            referencedRelation: "nfse"
            referencedColumns: ["id"]
          },
        ]
      }
      nfse_emitentes: {
        Row: {
          aliquota_iss: number
          ativo: boolean
          bairro: string
          cep: string
          certificado_pfx_base64: string | null
          certificado_senha: string | null
          certificado_validade: string | null
          clinica_id: string
          cnpj: string
          codigo_cnae: string | null
          codigo_municipio: string
          codigo_tributario_municipio: string | null
          complemento: string | null
          created_at: string
          descricao_servico_padrao: string | null
          email: string | null
          focus_ambiente: string
          focus_token_homologacao: string | null
          focus_token_producao: string | null
          id: string
          incentivador_cultural: boolean
          inscricao_estadual: string | null
          inscricao_municipal: string
          item_lista_servico: string
          logradouro: string
          municipio: string
          nome: string
          nome_fantasia: string | null
          numero: string
          optante_simples: boolean
          padrao: boolean
          razao_social: string
          regime_tributario: string
          rps_proximo_numero: number
          rps_serie: string
          telefone: string | null
          uf: string
          updated_at: string
          usar_ambiente_nacional: boolean
        }
        Insert: {
          aliquota_iss?: number
          ativo?: boolean
          bairro: string
          cep: string
          certificado_pfx_base64?: string | null
          certificado_senha?: string | null
          certificado_validade?: string | null
          clinica_id: string
          cnpj: string
          codigo_cnae?: string | null
          codigo_municipio: string
          codigo_tributario_municipio?: string | null
          complemento?: string | null
          created_at?: string
          descricao_servico_padrao?: string | null
          email?: string | null
          focus_ambiente?: string
          focus_token_homologacao?: string | null
          focus_token_producao?: string | null
          id?: string
          incentivador_cultural?: boolean
          inscricao_estadual?: string | null
          inscricao_municipal: string
          item_lista_servico?: string
          logradouro: string
          municipio: string
          nome: string
          nome_fantasia?: string | null
          numero: string
          optante_simples?: boolean
          padrao?: boolean
          razao_social: string
          regime_tributario?: string
          rps_proximo_numero?: number
          rps_serie?: string
          telefone?: string | null
          uf: string
          updated_at?: string
          usar_ambiente_nacional?: boolean
        }
        Update: {
          aliquota_iss?: number
          ativo?: boolean
          bairro?: string
          cep?: string
          certificado_pfx_base64?: string | null
          certificado_senha?: string | null
          certificado_validade?: string | null
          clinica_id?: string
          cnpj?: string
          codigo_cnae?: string | null
          codigo_municipio?: string
          codigo_tributario_municipio?: string | null
          complemento?: string | null
          created_at?: string
          descricao_servico_padrao?: string | null
          email?: string | null
          focus_ambiente?: string
          focus_token_homologacao?: string | null
          focus_token_producao?: string | null
          id?: string
          incentivador_cultural?: boolean
          inscricao_estadual?: string | null
          inscricao_municipal?: string
          item_lista_servico?: string
          logradouro?: string
          municipio?: string
          nome?: string
          nome_fantasia?: string | null
          numero?: string
          optante_simples?: boolean
          padrao?: boolean
          razao_social?: string
          regime_tributario?: string
          rps_proximo_numero?: number
          rps_serie?: string
          telefone?: string | null
          uf?: string
          updated_at?: string
          usar_ambiente_nacional?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "nfse_emitentes_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "clinicas"
            referencedColumns: ["id"]
          },
        ]
      }
      nina_aprendizado_versoes: {
        Row: {
          alterado_por: string | null
          aprendizado_id: string
          clinica_id: string
          conteudo: string
          created_at: string
          id: string
          status: string
          versao: number
        }
        Insert: {
          alterado_por?: string | null
          aprendizado_id: string
          clinica_id: string
          conteudo: string
          created_at?: string
          id?: string
          status: string
          versao: number
        }
        Update: {
          alterado_por?: string | null
          aprendizado_id?: string
          clinica_id?: string
          conteudo?: string
          created_at?: string
          id?: string
          status?: string
          versao?: number
        }
        Relationships: [
          {
            foreignKeyName: "nina_aprendizado_versoes_aprendizado_id_fkey"
            columns: ["aprendizado_id"]
            isOneToOne: false
            referencedRelation: "nina_aprendizados"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nina_aprendizado_versoes_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "clinicas"
            referencedColumns: ["id"]
          },
        ]
      }
      nina_aprendizados: {
        Row: {
          acertos: number
          aprovado_em: string | null
          aprovado_por: string | null
          canal: string
          clinica_id: string
          confianca: number
          conteudo: string
          created_at: string
          criado_por: string | null
          erros: number
          id: string
          origem: string
          origem_ref: string | null
          status: string
          tags: string[]
          tipo: string
          titulo: string
          updated_at: string
          usos: number
          valido_ate: string | null
          versao: number
        }
        Insert: {
          acertos?: number
          aprovado_em?: string | null
          aprovado_por?: string | null
          canal?: string
          clinica_id: string
          confianca?: number
          conteudo: string
          created_at?: string
          criado_por?: string | null
          erros?: number
          id?: string
          origem?: string
          origem_ref?: string | null
          status?: string
          tags?: string[]
          tipo: string
          titulo: string
          updated_at?: string
          usos?: number
          valido_ate?: string | null
          versao?: number
        }
        Update: {
          acertos?: number
          aprovado_em?: string | null
          aprovado_por?: string | null
          canal?: string
          clinica_id?: string
          confianca?: number
          conteudo?: string
          created_at?: string
          criado_por?: string | null
          erros?: number
          id?: string
          origem?: string
          origem_ref?: string | null
          status?: string
          tags?: string[]
          tipo?: string
          titulo?: string
          updated_at?: string
          usos?: number
          valido_ate?: string | null
          versao?: number
        }
        Relationships: [
          {
            foreignKeyName: "nina_aprendizados_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "clinicas"
            referencedColumns: ["id"]
          },
        ]
      }
      nina_avaliacoes_ia: {
        Row: {
          canal: string
          clinica_id: string
          conversa_id: string | null
          created_at: string
          id: string
          modelo: string | null
          nota: number | null
          pergunta: string
          problema: string | null
          resposta: string
          sugestao: string | null
        }
        Insert: {
          canal?: string
          clinica_id: string
          conversa_id?: string | null
          created_at?: string
          id?: string
          modelo?: string | null
          nota?: number | null
          pergunta: string
          problema?: string | null
          resposta: string
          sugestao?: string | null
        }
        Update: {
          canal?: string
          clinica_id?: string
          conversa_id?: string | null
          created_at?: string
          id?: string
          modelo?: string | null
          nota?: number | null
          pergunta?: string
          problema?: string | null
          resposta?: string
          sugestao?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "nina_avaliacoes_ia_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "clinicas"
            referencedColumns: ["id"]
          },
        ]
      }
      nina_cat_profissionais: {
        Row: {
          atende_consultorio: boolean | null
          aviso_dia: string | null
          aviso_valido_ate: string | null
          aviso_valido_de: string | null
          clinica_id: string
          convenios: Json
          created_at: string
          criado_por: string | null
          especialidades: Json
          formas_pagamento: Json
          horarios: Json
          id: string
          medico_id: string | null
          nome: string
          nota_interna: string | null
          observacao_publica: string | null
          publicado_em: string | null
          publicado_por: string | null
          rascunho: Json | null
          status: string
          tipo_atendimento: string | null
          unidade_id: string | null
          updated_at: string
        }
        Insert: {
          atende_consultorio?: boolean | null
          aviso_dia?: string | null
          aviso_valido_ate?: string | null
          aviso_valido_de?: string | null
          clinica_id: string
          convenios?: Json
          created_at?: string
          criado_por?: string | null
          especialidades?: Json
          formas_pagamento?: Json
          horarios?: Json
          id?: string
          medico_id?: string | null
          nome: string
          nota_interna?: string | null
          observacao_publica?: string | null
          publicado_em?: string | null
          publicado_por?: string | null
          rascunho?: Json | null
          status?: string
          tipo_atendimento?: string | null
          unidade_id?: string | null
          updated_at?: string
        }
        Update: {
          atende_consultorio?: boolean | null
          aviso_dia?: string | null
          aviso_valido_ate?: string | null
          aviso_valido_de?: string | null
          clinica_id?: string
          convenios?: Json
          created_at?: string
          criado_por?: string | null
          especialidades?: Json
          formas_pagamento?: Json
          horarios?: Json
          id?: string
          medico_id?: string | null
          nome?: string
          nota_interna?: string | null
          observacao_publica?: string | null
          publicado_em?: string | null
          publicado_por?: string | null
          rascunho?: Json | null
          status?: string
          tipo_atendimento?: string | null
          unidade_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "nina_cat_profissionais_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "clinicas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nina_cat_profissionais_medico_id_fkey"
            columns: ["medico_id"]
            isOneToOne: false
            referencedRelation: "medicos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nina_cat_profissionais_unidade_id_fkey"
            columns: ["unidade_id"]
            isOneToOne: false
            referencedRelation: "unidades"
            referencedColumns: ["id"]
          },
        ]
      }
      nina_cat_servicos: {
        Row: {
          clinica_id: string
          created_at: string
          criado_por: string | null
          descricao_publica: string | null
          executantes: Json
          formas_pagamento: Json
          id: string
          nome: string
          nota_interna: string | null
          preparo: string | null
          procedimento_id: string | null
          publicado_em: string | null
          publicado_por: string | null
          rascunho: Json | null
          restricoes: string | null
          status: string
          updated_at: string
          valor: number | null
          valor_observacao: string | null
        }
        Insert: {
          clinica_id: string
          created_at?: string
          criado_por?: string | null
          descricao_publica?: string | null
          executantes?: Json
          formas_pagamento?: Json
          id?: string
          nome: string
          nota_interna?: string | null
          preparo?: string | null
          procedimento_id?: string | null
          publicado_em?: string | null
          publicado_por?: string | null
          rascunho?: Json | null
          restricoes?: string | null
          status?: string
          updated_at?: string
          valor?: number | null
          valor_observacao?: string | null
        }
        Update: {
          clinica_id?: string
          created_at?: string
          criado_por?: string | null
          descricao_publica?: string | null
          executantes?: Json
          formas_pagamento?: Json
          id?: string
          nome?: string
          nota_interna?: string | null
          preparo?: string | null
          procedimento_id?: string | null
          publicado_em?: string | null
          publicado_por?: string | null
          rascunho?: Json | null
          restricoes?: string | null
          status?: string
          updated_at?: string
          valor?: number | null
          valor_observacao?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "nina_cat_servicos_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "clinicas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nina_cat_servicos_procedimento_id_fkey"
            columns: ["procedimento_id"]
            isOneToOne: false
            referencedRelation: "procedimentos"
            referencedColumns: ["id"]
          },
        ]
      }
      nina_execucao_evidencias: {
        Row: {
          clinica_id: string | null
          created_at: string
          etapas: Json
          execucao_id: string
          lacunas: string[]
        }
        Insert: {
          clinica_id?: string | null
          created_at?: string
          etapas?: Json
          execucao_id: string
          lacunas?: string[]
        }
        Update: {
          clinica_id?: string | null
          created_at?: string
          etapas?: Json
          execucao_id?: string
          lacunas?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "nina_execucao_evidencias_execucao_id_fkey"
            columns: ["execucao_id"]
            isOneToOne: true
            referencedRelation: "nina_execucoes"
            referencedColumns: ["id"]
          },
        ]
      }
      nina_execucoes: {
        Row: {
          clinica_id: string | null
          conversation_id: string | null
          created_at: string
          error_category: string | null
          handoff: boolean
          id: string
          input_tokens: number | null
          knowledge_status: string | null
          latency_ms: number
          mensagens_entrada: string[]
          model: string
          output_tokens: number | null
          perfil: string
          retries: number
          route_reason: string
          success: boolean
          thinking_level: string
          tool_calls: string[]
        }
        Insert: {
          clinica_id?: string | null
          conversation_id?: string | null
          created_at?: string
          error_category?: string | null
          handoff?: boolean
          id?: string
          input_tokens?: number | null
          knowledge_status?: string | null
          latency_ms?: number
          mensagens_entrada?: string[]
          model: string
          output_tokens?: number | null
          perfil: string
          retries?: number
          route_reason: string
          success?: boolean
          thinking_level: string
          tool_calls?: string[]
        }
        Update: {
          clinica_id?: string | null
          conversation_id?: string | null
          created_at?: string
          error_category?: string | null
          handoff?: boolean
          id?: string
          input_tokens?: number | null
          knowledge_status?: string | null
          latency_ms?: number
          mensagens_entrada?: string[]
          model?: string
          output_tokens?: number | null
          perfil?: string
          retries?: number
          route_reason?: string
          success?: boolean
          thinking_level?: string
          tool_calls?: string[]
        }
        Relationships: []
      }
      nina_feedback: {
        Row: {
          aprendizado_id: string | null
          avaliacao: number
          canal: string
          categoria: string | null
          clinica_id: string
          conversa_id: string | null
          correcao: string | null
          created_at: string
          criado_por: string | null
          id: string
          pergunta: string
          resposta: string
        }
        Insert: {
          aprendizado_id?: string | null
          avaliacao: number
          canal?: string
          categoria?: string | null
          clinica_id: string
          conversa_id?: string | null
          correcao?: string | null
          created_at?: string
          criado_por?: string | null
          id?: string
          pergunta: string
          resposta: string
        }
        Update: {
          aprendizado_id?: string | null
          avaliacao?: number
          canal?: string
          categoria?: string | null
          clinica_id?: string
          conversa_id?: string | null
          correcao?: string | null
          created_at?: string
          criado_por?: string | null
          id?: string
          pergunta?: string
          resposta?: string
        }
        Relationships: [
          {
            foreignKeyName: "nina_feedback_aprendizado_id_fkey"
            columns: ["aprendizado_id"]
            isOneToOne: false
            referencedRelation: "nina_aprendizados"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nina_feedback_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "clinicas"
            referencedColumns: ["id"]
          },
        ]
      }
      nina_feedback_acoes: {
        Row: {
          camada: string
          clinica_id: string
          concluido_em: string | null
          concluido_por: string | null
          created_at: string
          criado_por: string
          evidencia: Json | null
          feedback_id: string
          homologado: boolean
          id: string
          instrucao: string
          observacao: string | null
          root_cause: string
          status: string
          tipo: string
          titulo: string
          updated_at: string
          valor_atual: string | null
          valor_novo: string | null
        }
        Insert: {
          camada: string
          clinica_id: string
          concluido_em?: string | null
          concluido_por?: string | null
          created_at?: string
          criado_por: string
          evidencia?: Json | null
          feedback_id: string
          homologado?: boolean
          id?: string
          instrucao: string
          observacao?: string | null
          root_cause: string
          status?: string
          tipo: string
          titulo: string
          updated_at?: string
          valor_atual?: string | null
          valor_novo?: string | null
        }
        Update: {
          camada?: string
          clinica_id?: string
          concluido_em?: string | null
          concluido_por?: string | null
          created_at?: string
          criado_por?: string
          evidencia?: Json | null
          feedback_id?: string
          homologado?: boolean
          id?: string
          instrucao?: string
          observacao?: string | null
          root_cause?: string
          status?: string
          tipo?: string
          titulo?: string
          updated_at?: string
          valor_atual?: string | null
          valor_novo?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "nina_feedback_acoes_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "clinicas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nina_feedback_acoes_feedback_id_fkey"
            columns: ["feedback_id"]
            isOneToOne: false
            referencedRelation: "nina_feedback_erros"
            referencedColumns: ["id"]
          },
        ]
      }
      nina_feedback_erros: {
        Row: {
          aplicacao_evidencia: Json | null
          aplicacao_resumo: string | null
          aplicacao_tipo: string | null
          aplicado_em: string | null
          aplicado_por: string | null
          auditoria_status: string | null
          categoria: string
          clinica_id: string
          conversa_id: string | null
          correcao: string | null
          correcao_original: string | null
          created_at: string
          diagnosticado_em: string | null
          diagnosticado_por: string | null
          execucao_id: string | null
          grupo_chave: string | null
          grupo_titulo: string | null
          id: string
          knowledge_consultado_em: string | null
          knowledge_snapshot: Json | null
          knowledge_status: string | null
          mensagem_id: string | null
          mensagem_texto: string | null
          motivo_rejeicao: string | null
          motivo_reversao: string | null
          observacao: string | null
          origem: string
          pergunta_texto: string | null
          prioridade: string | null
          reportado_por: string
          revertido_em: string | null
          revertido_por: string | null
          revisado_em: string | null
          revisado_por: string | null
          root_cause: string | null
          status: string
          unidade_id: string | null
          updated_at: string
          validacao_em: string | null
          validacao_resposta: string | null
          validacao_status: string | null
        }
        Insert: {
          aplicacao_evidencia?: Json | null
          aplicacao_resumo?: string | null
          aplicacao_tipo?: string | null
          aplicado_em?: string | null
          aplicado_por?: string | null
          auditoria_status?: string | null
          categoria: string
          clinica_id: string
          conversa_id?: string | null
          correcao?: string | null
          correcao_original?: string | null
          created_at?: string
          diagnosticado_em?: string | null
          diagnosticado_por?: string | null
          execucao_id?: string | null
          grupo_chave?: string | null
          grupo_titulo?: string | null
          id?: string
          knowledge_consultado_em?: string | null
          knowledge_snapshot?: Json | null
          knowledge_status?: string | null
          mensagem_id?: string | null
          mensagem_texto?: string | null
          motivo_rejeicao?: string | null
          motivo_reversao?: string | null
          observacao?: string | null
          origem?: string
          pergunta_texto?: string | null
          prioridade?: string | null
          reportado_por: string
          revertido_em?: string | null
          revertido_por?: string | null
          revisado_em?: string | null
          revisado_por?: string | null
          root_cause?: string | null
          status?: string
          unidade_id?: string | null
          updated_at?: string
          validacao_em?: string | null
          validacao_resposta?: string | null
          validacao_status?: string | null
        }
        Update: {
          aplicacao_evidencia?: Json | null
          aplicacao_resumo?: string | null
          aplicacao_tipo?: string | null
          aplicado_em?: string | null
          aplicado_por?: string | null
          auditoria_status?: string | null
          categoria?: string
          clinica_id?: string
          conversa_id?: string | null
          correcao?: string | null
          correcao_original?: string | null
          created_at?: string
          diagnosticado_em?: string | null
          diagnosticado_por?: string | null
          execucao_id?: string | null
          grupo_chave?: string | null
          grupo_titulo?: string | null
          id?: string
          knowledge_consultado_em?: string | null
          knowledge_snapshot?: Json | null
          knowledge_status?: string | null
          mensagem_id?: string | null
          mensagem_texto?: string | null
          motivo_rejeicao?: string | null
          motivo_reversao?: string | null
          observacao?: string | null
          origem?: string
          pergunta_texto?: string | null
          prioridade?: string | null
          reportado_por?: string
          revertido_em?: string | null
          revertido_por?: string | null
          revisado_em?: string | null
          revisado_por?: string | null
          root_cause?: string | null
          status?: string
          unidade_id?: string | null
          updated_at?: string
          validacao_em?: string | null
          validacao_resposta?: string | null
          validacao_status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "nina_feedback_erros_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "clinicas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nina_feedback_erros_execucao_id_fkey"
            columns: ["execucao_id"]
            isOneToOne: false
            referencedRelation: "nina_execucoes"
            referencedColumns: ["id"]
          },
        ]
      }
      nina_feedback_versoes: {
        Row: {
          acao_id: string | null
          aplicado_por: string
          aprovado_por: string | null
          camada: string
          clinica_id: string
          created_at: string
          evidencia: Json
          feedback_id: string
          id: string
          item: string | null
          kb_base_id_anterior: string | null
          kb_versao_anterior: number | null
          kb_versao_nova: number | null
          motivo: string | null
          motivo_reversao: string | null
          reportado_por: string | null
          revertido_em: string | null
          revertido_por: string | null
          root_cause: string | null
          status: string
          teste_detalhe: Json | null
          teste_em: string | null
          teste_resposta: string | null
          teste_status: string
          tipo: string
          updated_at: string
          valor_anterior: string | null
          valor_novo: string | null
          versao: number
        }
        Insert: {
          acao_id?: string | null
          aplicado_por: string
          aprovado_por?: string | null
          camada: string
          clinica_id: string
          created_at?: string
          evidencia?: Json
          feedback_id: string
          id?: string
          item?: string | null
          kb_base_id_anterior?: string | null
          kb_versao_anterior?: number | null
          kb_versao_nova?: number | null
          motivo?: string | null
          motivo_reversao?: string | null
          reportado_por?: string | null
          revertido_em?: string | null
          revertido_por?: string | null
          root_cause?: string | null
          status?: string
          teste_detalhe?: Json | null
          teste_em?: string | null
          teste_resposta?: string | null
          teste_status?: string
          tipo: string
          updated_at?: string
          valor_anterior?: string | null
          valor_novo?: string | null
          versao?: number
        }
        Update: {
          acao_id?: string | null
          aplicado_por?: string
          aprovado_por?: string | null
          camada?: string
          clinica_id?: string
          created_at?: string
          evidencia?: Json
          feedback_id?: string
          id?: string
          item?: string | null
          kb_base_id_anterior?: string | null
          kb_versao_anterior?: number | null
          kb_versao_nova?: number | null
          motivo?: string | null
          motivo_reversao?: string | null
          reportado_por?: string | null
          revertido_em?: string | null
          revertido_por?: string | null
          root_cause?: string | null
          status?: string
          teste_detalhe?: Json | null
          teste_em?: string | null
          teste_resposta?: string | null
          teste_status?: string
          tipo?: string
          updated_at?: string
          valor_anterior?: string | null
          valor_novo?: string | null
          versao?: number
        }
        Relationships: [
          {
            foreignKeyName: "nina_feedback_versoes_acao_id_fkey"
            columns: ["acao_id"]
            isOneToOne: false
            referencedRelation: "nina_feedback_acoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nina_feedback_versoes_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "clinicas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nina_feedback_versoes_feedback_id_fkey"
            columns: ["feedback_id"]
            isOneToOne: false
            referencedRelation: "nina_feedback_erros"
            referencedColumns: ["id"]
          },
        ]
      }
      nina_kb_bases: {
        Row: {
          arquivo_hash: string | null
          arquivo_nome: string
          arquivo_tamanho: number | null
          arquivo_tipo: string | null
          ativada_em: string | null
          clinica_id: string
          created_at: string
          enviado_por: string | null
          enviado_por_nome: string | null
          erros: Json
          id: string
          linhas_lidas: number
          processado_em: string | null
          registros_total: number
          status: string
          storage_path: string | null
          titulo: string
          updated_at: string
          validacao: Json
          versao: number
        }
        Insert: {
          arquivo_hash?: string | null
          arquivo_nome: string
          arquivo_tamanho?: number | null
          arquivo_tipo?: string | null
          ativada_em?: string | null
          clinica_id: string
          created_at?: string
          enviado_por?: string | null
          enviado_por_nome?: string | null
          erros?: Json
          id?: string
          linhas_lidas?: number
          processado_em?: string | null
          registros_total?: number
          status?: string
          storage_path?: string | null
          titulo?: string
          updated_at?: string
          validacao?: Json
          versao?: number
        }
        Update: {
          arquivo_hash?: string | null
          arquivo_nome?: string
          arquivo_tamanho?: number | null
          arquivo_tipo?: string | null
          ativada_em?: string | null
          clinica_id?: string
          created_at?: string
          enviado_por?: string | null
          enviado_por_nome?: string | null
          erros?: Json
          id?: string
          linhas_lidas?: number
          processado_em?: string | null
          registros_total?: number
          status?: string
          storage_path?: string | null
          titulo?: string
          updated_at?: string
          validacao?: Json
          versao?: number
        }
        Relationships: [
          {
            foreignKeyName: "nina_kb_bases_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "clinicas"
            referencedColumns: ["id"]
          },
        ]
      }
      nina_kb_consultas: {
        Row: {
          base_id: string | null
          canal: string
          clinica_id: string
          created_at: string
          encontrados: Json
          id: string
          intencao: string | null
          pergunta: string | null
          registro_usado: string | null
          resposta: string | null
          score: number | null
          termos: string[] | null
          versao: number | null
        }
        Insert: {
          base_id?: string | null
          canal?: string
          clinica_id: string
          created_at?: string
          encontrados?: Json
          id?: string
          intencao?: string | null
          pergunta?: string | null
          registro_usado?: string | null
          resposta?: string | null
          score?: number | null
          termos?: string[] | null
          versao?: number | null
        }
        Update: {
          base_id?: string | null
          canal?: string
          clinica_id?: string
          created_at?: string
          encontrados?: Json
          id?: string
          intencao?: string | null
          pergunta?: string | null
          registro_usado?: string | null
          resposta?: string | null
          score?: number | null
          termos?: string[] | null
          versao?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "nina_kb_consultas_base_id_fkey"
            columns: ["base_id"]
            isOneToOne: false
            referencedRelation: "nina_kb_bases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nina_kb_consultas_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "clinicas"
            referencedColumns: ["id"]
          },
        ]
      }
      nina_kb_registros: {
        Row: {
          aba_origem: string | null
          base_id: string
          bruto: Json
          categoria: string | null
          clinica_id: string
          created_at: string
          dia: string | null
          embedding: string | null
          extras: Json
          horario: string | null
          id: string
          linha_origem: number | null
          medico: string | null
          observacoes: string | null
          preco_cartao: number | null
          preco_dinheiro: number | null
          preparo: string | null
          procedimento: string | null
          secao: string | null
          texto_busca: string
          tipo: string | null
          versao: number
        }
        Insert: {
          aba_origem?: string | null
          base_id: string
          bruto?: Json
          categoria?: string | null
          clinica_id: string
          created_at?: string
          dia?: string | null
          embedding?: string | null
          extras?: Json
          horario?: string | null
          id?: string
          linha_origem?: number | null
          medico?: string | null
          observacoes?: string | null
          preco_cartao?: number | null
          preco_dinheiro?: number | null
          preparo?: string | null
          procedimento?: string | null
          secao?: string | null
          texto_busca?: string
          tipo?: string | null
          versao?: number
        }
        Update: {
          aba_origem?: string | null
          base_id?: string
          bruto?: Json
          categoria?: string | null
          clinica_id?: string
          created_at?: string
          dia?: string | null
          embedding?: string | null
          extras?: Json
          horario?: string | null
          id?: string
          linha_origem?: number | null
          medico?: string | null
          observacoes?: string | null
          preco_cartao?: number | null
          preco_dinheiro?: number | null
          preparo?: string | null
          procedimento?: string | null
          secao?: string | null
          texto_busca?: string
          tipo?: string | null
          versao?: number
        }
        Relationships: [
          {
            foreignKeyName: "nina_kb_registros_base_id_fkey"
            columns: ["base_id"]
            isOneToOne: false
            referencedRelation: "nina_kb_bases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nina_kb_registros_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "clinicas"
            referencedColumns: ["id"]
          },
        ]
      }
      nina_teste_leads: {
        Row: {
          clinica_id: string
          conversa_id: string | null
          created_at: string
          environment: string
          id: string
          indice: number
          is_test: boolean
          nome: string
          sessao_seq: number
          source_channel: string
          status: string
          telefone_base: string
          telefone_sessao: string
          updated_at: string
        }
        Insert: {
          clinica_id: string
          conversa_id?: string | null
          created_at?: string
          environment?: string
          id?: string
          indice: number
          is_test?: boolean
          nome: string
          sessao_seq?: number
          source_channel?: string
          status?: string
          telefone_base: string
          telefone_sessao: string
          updated_at?: string
        }
        Update: {
          clinica_id?: string
          conversa_id?: string | null
          created_at?: string
          environment?: string
          id?: string
          indice?: number
          is_test?: boolean
          nome?: string
          sessao_seq?: number
          source_channel?: string
          status?: string
          telefone_base?: string
          telefone_sessao?: string
          updated_at?: string
        }
        Relationships: []
      }
      nina_testes_regressao: {
        Row: {
          ativo: boolean
          clinica_id: string
          created_at: string
          criado_por: string | null
          id: string
          origem_feedback_id: string | null
          pergunta: string
          resposta_esperada: string
          ultima_execucao: string | null
          ultimo_resultado: string | null
        }
        Insert: {
          ativo?: boolean
          clinica_id: string
          created_at?: string
          criado_por?: string | null
          id?: string
          origem_feedback_id?: string | null
          pergunta: string
          resposta_esperada: string
          ultima_execucao?: string | null
          ultimo_resultado?: string | null
        }
        Update: {
          ativo?: boolean
          clinica_id?: string
          created_at?: string
          criado_por?: string | null
          id?: string
          origem_feedback_id?: string | null
          pergunta?: string
          resposta_esperada?: string
          ultima_execucao?: string | null
          ultimo_resultado?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "nina_testes_regressao_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "clinicas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nina_testes_regressao_origem_feedback_id_fkey"
            columns: ["origem_feedback_id"]
            isOneToOne: false
            referencedRelation: "nina_feedback"
            referencedColumns: ["id"]
          },
        ]
      }
      odonto_anamnese: {
        Row: {
          alergias: string | null
          bebida_alcoolica: boolean | null
          bruxismo: boolean | null
          cirurgias: string | null
          clinica_id: string
          created_at: string
          doencas: string | null
          em_tratamento_desc: string | null
          em_tratamento_medico: boolean | null
          fumante: boolean | null
          gestante: boolean | null
          id: string
          medicamentos: string | null
          motivo_consulta: string | null
          observacoes: string | null
          paciente_id: string
          respondida_em: string | null
          respondida_por: string | null
          sangramento_gengival: boolean | null
          sensibilidade: boolean | null
          ultima_visita_dentista: string | null
          updated_at: string
        }
        Insert: {
          alergias?: string | null
          bebida_alcoolica?: boolean | null
          bruxismo?: boolean | null
          cirurgias?: string | null
          clinica_id: string
          created_at?: string
          doencas?: string | null
          em_tratamento_desc?: string | null
          em_tratamento_medico?: boolean | null
          fumante?: boolean | null
          gestante?: boolean | null
          id?: string
          medicamentos?: string | null
          motivo_consulta?: string | null
          observacoes?: string | null
          paciente_id: string
          respondida_em?: string | null
          respondida_por?: string | null
          sangramento_gengival?: boolean | null
          sensibilidade?: boolean | null
          ultima_visita_dentista?: string | null
          updated_at?: string
        }
        Update: {
          alergias?: string | null
          bebida_alcoolica?: boolean | null
          bruxismo?: boolean | null
          cirurgias?: string | null
          clinica_id?: string
          created_at?: string
          doencas?: string | null
          em_tratamento_desc?: string | null
          em_tratamento_medico?: boolean | null
          fumante?: boolean | null
          gestante?: boolean | null
          id?: string
          medicamentos?: string | null
          motivo_consulta?: string | null
          observacoes?: string | null
          paciente_id?: string
          respondida_em?: string | null
          respondida_por?: string | null
          sangramento_gengival?: boolean | null
          sensibilidade?: boolean | null
          ultima_visita_dentista?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      odonto_dentes: {
        Row: {
          clinica_id: string
          created_at: string
          data: string
          dente: number
          face: string
          id: string
          observacoes: string | null
          paciente_id: string
          procedimento: string | null
          profissional_id: string | null
          status: Database["public"]["Enums"]["odonto_status"]
          updated_at: string
        }
        Insert: {
          clinica_id: string
          created_at?: string
          data?: string
          dente: number
          face?: string
          id?: string
          observacoes?: string | null
          paciente_id: string
          procedimento?: string | null
          profissional_id?: string | null
          status?: Database["public"]["Enums"]["odonto_status"]
          updated_at?: string
        }
        Update: {
          clinica_id?: string
          created_at?: string
          data?: string
          dente?: number
          face?: string
          id?: string
          observacoes?: string | null
          paciente_id?: string
          procedimento?: string | null
          profissional_id?: string | null
          status?: Database["public"]["Enums"]["odonto_status"]
          updated_at?: string
        }
        Relationships: []
      }
      odonto_evolucoes: {
        Row: {
          agendamento_id: string | null
          anexos: Json | null
          clinica_id: string
          created_at: string
          created_by: string | null
          data: string
          dentes: number[] | null
          descricao: string
          id: string
          paciente_id: string
          procedimento: string | null
          profissional_id: string | null
          titulo: string | null
          updated_at: string
        }
        Insert: {
          agendamento_id?: string | null
          anexos?: Json | null
          clinica_id: string
          created_at?: string
          created_by?: string | null
          data?: string
          dentes?: number[] | null
          descricao: string
          id?: string
          paciente_id: string
          procedimento?: string | null
          profissional_id?: string | null
          titulo?: string | null
          updated_at?: string
        }
        Update: {
          agendamento_id?: string | null
          anexos?: Json | null
          clinica_id?: string
          created_at?: string
          created_by?: string | null
          data?: string
          dentes?: number[] | null
          descricao?: string
          id?: string
          paciente_id?: string
          procedimento?: string | null
          profissional_id?: string | null
          titulo?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "odonto_evolucoes_agendamento_id_fkey"
            columns: ["agendamento_id"]
            isOneToOne: false
            referencedRelation: "agendamentos"
            referencedColumns: ["id"]
          },
        ]
      }
      odonto_imagens: {
        Row: {
          altura: number | null
          categoria: Database["public"]["Enums"]["odonto_imagem_categoria"]
          clinica_id: string
          created_at: string
          criado_por: string | null
          data_exame: string
          deletado_em: string | null
          dentes: number[]
          descricao: string | null
          id: string
          largura: number | null
          mime_type: string
          paciente_id: string
          prontuario_id: string | null
          storage_path: string
          tags: string[]
          tamanho_bytes: number | null
          updated_at: string
        }
        Insert: {
          altura?: number | null
          categoria?: Database["public"]["Enums"]["odonto_imagem_categoria"]
          clinica_id: string
          created_at?: string
          criado_por?: string | null
          data_exame?: string
          deletado_em?: string | null
          dentes?: number[]
          descricao?: string | null
          id?: string
          largura?: number | null
          mime_type: string
          paciente_id: string
          prontuario_id?: string | null
          storage_path: string
          tags?: string[]
          tamanho_bytes?: number | null
          updated_at?: string
        }
        Update: {
          altura?: number | null
          categoria?: Database["public"]["Enums"]["odonto_imagem_categoria"]
          clinica_id?: string
          created_at?: string
          criado_por?: string | null
          data_exame?: string
          deletado_em?: string | null
          dentes?: number[]
          descricao?: string | null
          id?: string
          largura?: number | null
          mime_type?: string
          paciente_id?: string
          prontuario_id?: string | null
          storage_path?: string
          tags?: string[]
          tamanho_bytes?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "odonto_imagens_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "clinicas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "odonto_imagens_paciente_id_fkey"
            columns: ["paciente_id"]
            isOneToOne: false
            referencedRelation: "pacientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "odonto_imagens_prontuario_id_fkey"
            columns: ["prontuario_id"]
            isOneToOne: false
            referencedRelation: "odonto_prontuarios"
            referencedColumns: ["id"]
          },
        ]
      }
      odonto_prontuarios: {
        Row: {
          clinica_id: string
          created_at: string
          historia_dental: string | null
          id: string
          observacoes: string | null
          paciente_id: string
          plano_tratamento: string | null
          queixa_principal: string | null
          ultima_atualizacao_por: string | null
          updated_at: string
        }
        Insert: {
          clinica_id: string
          created_at?: string
          historia_dental?: string | null
          id?: string
          observacoes?: string | null
          paciente_id: string
          plano_tratamento?: string | null
          queixa_principal?: string | null
          ultima_atualizacao_por?: string | null
          updated_at?: string
        }
        Update: {
          clinica_id?: string
          created_at?: string
          historia_dental?: string | null
          id?: string
          observacoes?: string | null
          paciente_id?: string
          plano_tratamento?: string | null
          queixa_principal?: string | null
          ultima_atualizacao_por?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      orcamento_itens: {
        Row: {
          agendado_em: string | null
          agendamento_id: string | null
          cancelado_em: string | null
          concluido_em: string | null
          created_at: string
          dentes: number[] | null
          descricao: string
          fin_atendimento_id: string | null
          id: string
          motivo_nao_aplicavel: string | null
          orcamento_id: string
          ordem: number
          pago_em: string | null
          procedimento_id: string | null
          quantidade: number
          saldo_pago_em: string | null
          sinal_pago_em: string | null
          sinal_valor: number | null
          status_alterado_em: string | null
          status_alterado_por: string | null
          status_fin_em: string | null
          status_financeiro: string
          status_item: string
          status_op_em: string | null
          status_operacional: string
          valor_pago: number
          valor_total: number
          valor_unitario: number
          valores_formas: Json | null
        }
        Insert: {
          agendado_em?: string | null
          agendamento_id?: string | null
          cancelado_em?: string | null
          concluido_em?: string | null
          created_at?: string
          dentes?: number[] | null
          descricao: string
          fin_atendimento_id?: string | null
          id?: string
          motivo_nao_aplicavel?: string | null
          orcamento_id: string
          ordem?: number
          pago_em?: string | null
          procedimento_id?: string | null
          quantidade?: number
          saldo_pago_em?: string | null
          sinal_pago_em?: string | null
          sinal_valor?: number | null
          status_alterado_em?: string | null
          status_alterado_por?: string | null
          status_fin_em?: string | null
          status_financeiro?: string
          status_item?: string
          status_op_em?: string | null
          status_operacional?: string
          valor_pago?: number
          valor_total?: number
          valor_unitario?: number
          valores_formas?: Json | null
        }
        Update: {
          agendado_em?: string | null
          agendamento_id?: string | null
          cancelado_em?: string | null
          concluido_em?: string | null
          created_at?: string
          dentes?: number[] | null
          descricao?: string
          fin_atendimento_id?: string | null
          id?: string
          motivo_nao_aplicavel?: string | null
          orcamento_id?: string
          ordem?: number
          pago_em?: string | null
          procedimento_id?: string | null
          quantidade?: number
          saldo_pago_em?: string | null
          sinal_pago_em?: string | null
          sinal_valor?: number | null
          status_alterado_em?: string | null
          status_alterado_por?: string | null
          status_fin_em?: string | null
          status_financeiro?: string
          status_item?: string
          status_op_em?: string | null
          status_operacional?: string
          valor_pago?: number
          valor_total?: number
          valor_unitario?: number
          valores_formas?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "orcamento_itens_agendamento_id_fkey"
            columns: ["agendamento_id"]
            isOneToOne: false
            referencedRelation: "agendamentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orcamento_itens_fin_atendimento_id_fkey"
            columns: ["fin_atendimento_id"]
            isOneToOne: false
            referencedRelation: "fin_atendimentos"
            referencedColumns: ["id"]
          },
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
          atualizado_por: string | null
          categoria: string
          clinica_id: string
          clinica_solicitante: string | null
          created_at: string
          criado_por: string | null
          desconto: number
          especialidade_id: string | null
          forma_pagamento: string | null
          id: string
          medico_externo: boolean
          medico_id: string | null
          medico_nome: string | null
          numero: number
          observacoes: string | null
          paciente_id: string | null
          paciente_nome: string
          paciente_telefone: string | null
          serie: string
          status: string
          updated_at: string
          validade_dias: number
          valor_total: number
          valores_pagamento: Json | null
        }
        Insert: {
          atualizado_por?: string | null
          categoria?: string
          clinica_id: string
          clinica_solicitante?: string | null
          created_at?: string
          criado_por?: string | null
          desconto?: number
          especialidade_id?: string | null
          forma_pagamento?: string | null
          id?: string
          medico_externo?: boolean
          medico_id?: string | null
          medico_nome?: string | null
          numero: number
          observacoes?: string | null
          paciente_id?: string | null
          paciente_nome: string
          paciente_telefone?: string | null
          serie?: string
          status?: string
          updated_at?: string
          validade_dias?: number
          valor_total?: number
          valores_pagamento?: Json | null
        }
        Update: {
          atualizado_por?: string | null
          categoria?: string
          clinica_id?: string
          clinica_solicitante?: string | null
          created_at?: string
          criado_por?: string | null
          desconto?: number
          especialidade_id?: string | null
          forma_pagamento?: string | null
          id?: string
          medico_externo?: boolean
          medico_id?: string | null
          medico_nome?: string | null
          numero?: number
          observacoes?: string | null
          paciente_id?: string | null
          paciente_nome?: string
          paciente_telefone?: string | null
          serie?: string
          status?: string
          updated_at?: string
          validade_dias?: number
          valor_total?: number
          valores_pagamento?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "orcamentos_especialidade_id_fkey"
            columns: ["especialidade_id"]
            isOneToOne: false
            referencedRelation: "especialidades"
            referencedColumns: ["id"]
          },
        ]
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
          codigo_prontuario: string | null
          codigo_prontuario_anterior: string | null
          complemento: string | null
          consentimento_lgpd_em: string | null
          cpf: string | null
          cpf_digits: string | null
          created_at: string
          data_nascimento: string | null
          email: string | null
          estado: string | null
          face_atualizado_em: string | null
          face_descriptor: number[] | null
          foto_atualizado_em: string | null
          foto_url: string | null
          id: string
          is_mock_data: boolean
          legacy_id: number | null
          logradouro: string | null
          nome: string
          numero: string | null
          numero_pasta: string | null
          origem: string | null
          pasta_ortodontica: string | null
          prontuarios_anteriores: string | null
          responsavel_cpf: string | null
          responsavel_nome: string | null
          responsavel_parentesco: string | null
          responsavel_telefone: string | null
          sexo: string
          telefone: string | null
          telefone_norm: string | null
          telefone2: string | null
          telefone2_norm: string | null
          teste: boolean
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          bairro?: string | null
          cep?: string | null
          cidade?: string | null
          clinica_id: string
          codigo_prontuario?: string | null
          codigo_prontuario_anterior?: string | null
          complemento?: string | null
          consentimento_lgpd_em?: string | null
          cpf?: string | null
          cpf_digits?: string | null
          created_at?: string
          data_nascimento?: string | null
          email?: string | null
          estado?: string | null
          face_atualizado_em?: string | null
          face_descriptor?: number[] | null
          foto_atualizado_em?: string | null
          foto_url?: string | null
          id?: string
          is_mock_data?: boolean
          legacy_id?: number | null
          logradouro?: string | null
          nome: string
          numero?: string | null
          numero_pasta?: string | null
          origem?: string | null
          pasta_ortodontica?: string | null
          prontuarios_anteriores?: string | null
          responsavel_cpf?: string | null
          responsavel_nome?: string | null
          responsavel_parentesco?: string | null
          responsavel_telefone?: string | null
          sexo?: string
          telefone?: string | null
          telefone_norm?: string | null
          telefone2?: string | null
          telefone2_norm?: string | null
          teste?: boolean
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          bairro?: string | null
          cep?: string | null
          cidade?: string | null
          clinica_id?: string
          codigo_prontuario?: string | null
          codigo_prontuario_anterior?: string | null
          complemento?: string | null
          consentimento_lgpd_em?: string | null
          cpf?: string | null
          cpf_digits?: string | null
          created_at?: string
          data_nascimento?: string | null
          email?: string | null
          estado?: string | null
          face_atualizado_em?: string | null
          face_descriptor?: number[] | null
          foto_atualizado_em?: string | null
          foto_url?: string | null
          id?: string
          is_mock_data?: boolean
          legacy_id?: number | null
          logradouro?: string | null
          nome?: string
          numero?: string | null
          numero_pasta?: string | null
          origem?: string | null
          pasta_ortodontica?: string | null
          prontuarios_anteriores?: string | null
          responsavel_cpf?: string | null
          responsavel_nome?: string | null
          responsavel_parentesco?: string | null
          responsavel_telefone?: string | null
          sexo?: string
          telefone?: string | null
          telefone_norm?: string | null
          telefone2?: string | null
          telefone2_norm?: string | null
          teste?: boolean
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
            referencedRelation: "fin_lancamentos"
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
      perfil_permissoes: {
        Row: {
          acesso: Database["public"]["Enums"]["modulo_acesso"]
          created_at: string
          id: string
          modulo: string
          perfil_id: string
          updated_at: string
        }
        Insert: {
          acesso?: Database["public"]["Enums"]["modulo_acesso"]
          created_at?: string
          id?: string
          modulo: string
          perfil_id: string
          updated_at?: string
        }
        Update: {
          acesso?: Database["public"]["Enums"]["modulo_acesso"]
          created_at?: string
          id?: string
          modulo?: string
          perfil_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "perfil_permissoes_perfil_id_fkey"
            columns: ["perfil_id"]
            isOneToOne: false
            referencedRelation: "perfis_acesso"
            referencedColumns: ["id"]
          },
        ]
      }
      perfis_acesso: {
        Row: {
          ativo: boolean
          chave: string
          clinica_id: string
          created_at: string
          descricao: string | null
          id: string
          nome: string
          sistema: boolean
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          chave: string
          clinica_id: string
          created_at?: string
          descricao?: string | null
          id?: string
          nome: string
          sistema?: boolean
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          chave?: string
          clinica_id?: string
          created_at?: string
          descricao?: string | null
          id?: string
          nome?: string
          sistema?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "perfis_acesso_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "clinicas"
            referencedColumns: ["id"]
          },
        ]
      }
      permissions: {
        Row: {
          chave: string
          created_at: string
          descricao: string
          id: string
          modulo: string
        }
        Insert: {
          chave: string
          created_at?: string
          descricao: string
          id?: string
          modulo: string
        }
        Update: {
          chave?: string
          created_at?: string
          descricao?: string
          id?: string
          modulo?: string
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
      planos_assinatura_arquivo: {
        Row: {
          ativo: boolean | null
          clinica_id: string
          created_at: string | null
          descricao_beneficios: string | null
          fidelidade_meses: number | null
          id: string | null
          max_agregados: number | null
          max_dependentes: number | null
          nome: string | null
          num_parcelas: number | null
          taxa_adesao: number | null
          template_contrato: string | null
          tipo: string | null
          updated_at: string | null
          valor_mensal: number | null
          vigencia_meses: number | null
        }
        Insert: {
          ativo?: boolean | null
          clinica_id: string
          created_at?: string | null
          descricao_beneficios?: string | null
          fidelidade_meses?: number | null
          id?: string | null
          max_agregados?: number | null
          max_dependentes?: number | null
          nome?: string | null
          num_parcelas?: number | null
          taxa_adesao?: number | null
          template_contrato?: string | null
          tipo?: string | null
          updated_at?: string | null
          valor_mensal?: number | null
          vigencia_meses?: number | null
        }
        Update: {
          ativo?: boolean | null
          clinica_id?: string
          created_at?: string | null
          descricao_beneficios?: string | null
          fidelidade_meses?: number | null
          id?: string | null
          max_agregados?: number | null
          max_dependentes?: number | null
          nome?: string | null
          num_parcelas?: number | null
          taxa_adesao?: number | null
          template_contrato?: string | null
          tipo?: string | null
          updated_at?: string | null
          valor_mensal?: number | null
          vigencia_meses?: number | null
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
      procedimento_cb_convenio_valores: {
        Row: {
          clinica_id: string
          convenio_id: string
          created_at: string
          id: string
          origem: string
          procedimento_id: string
          updated_at: string
          valor_dinheiro: number
          valor_outros: number
        }
        Insert: {
          clinica_id: string
          convenio_id: string
          created_at?: string
          id?: string
          origem?: string
          procedimento_id: string
          updated_at?: string
          valor_dinheiro?: number
          valor_outros?: number
        }
        Update: {
          clinica_id?: string
          convenio_id?: string
          created_at?: string
          id?: string
          origem?: string
          procedimento_id?: string
          updated_at?: string
          valor_dinheiro?: number
          valor_outros?: number
        }
        Relationships: [
          {
            foreignKeyName: "procedimento_cb_convenio_valores_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "clinicas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "procedimento_cb_convenio_valores_convenio_id_fkey"
            columns: ["convenio_id"]
            isOneToOne: false
            referencedRelation: "cb_convenios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "procedimento_cb_convenio_valores_procedimento_id_fkey"
            columns: ["procedimento_id"]
            isOneToOne: false
            referencedRelation: "procedimentos"
            referencedColumns: ["id"]
          },
        ]
      }
      procedimento_especialidades: {
        Row: {
          clinica_id: string
          created_at: string
          especialidade_id: string
          procedimento_id: string
        }
        Insert: {
          clinica_id: string
          created_at?: string
          especialidade_id: string
          procedimento_id: string
        }
        Update: {
          clinica_id?: string
          created_at?: string
          especialidade_id?: string
          procedimento_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "procedimento_especialidades_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "clinicas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "procedimento_especialidades_especialidade_id_fkey"
            columns: ["especialidade_id"]
            isOneToOne: false
            referencedRelation: "especialidades"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "procedimento_especialidades_procedimento_id_fkey"
            columns: ["procedimento_id"]
            isOneToOne: false
            referencedRelation: "procedimentos"
            referencedColumns: ["id"]
          },
        ]
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
      procedimento_unidade_regras: {
        Row: {
          agenda_obrigatoria: boolean | null
          clinica_id: string
          cor_agenda: string | null
          created_at: string
          equipamento_obrigatorio: boolean | null
          exige_autorizacao: boolean | null
          exige_preparo: boolean | null
          exige_termo: boolean | null
          fluxo_atendimento: string | null
          id: string
          medico_obrigatorio: boolean | null
          permite_encaixe: boolean | null
          permite_orcamento: boolean | null
          permite_venda_direta: boolean | null
          procedimento_id: string
          sala_obrigatoria: boolean | null
          tempo_padrao_min: number | null
          tipo_procedimento: string | null
          unidade_id: string
          updated_at: string
        }
        Insert: {
          agenda_obrigatoria?: boolean | null
          clinica_id: string
          cor_agenda?: string | null
          created_at?: string
          equipamento_obrigatorio?: boolean | null
          exige_autorizacao?: boolean | null
          exige_preparo?: boolean | null
          exige_termo?: boolean | null
          fluxo_atendimento?: string | null
          id?: string
          medico_obrigatorio?: boolean | null
          permite_encaixe?: boolean | null
          permite_orcamento?: boolean | null
          permite_venda_direta?: boolean | null
          procedimento_id: string
          sala_obrigatoria?: boolean | null
          tempo_padrao_min?: number | null
          tipo_procedimento?: string | null
          unidade_id: string
          updated_at?: string
        }
        Update: {
          agenda_obrigatoria?: boolean | null
          clinica_id?: string
          cor_agenda?: string | null
          created_at?: string
          equipamento_obrigatorio?: boolean | null
          exige_autorizacao?: boolean | null
          exige_preparo?: boolean | null
          exige_termo?: boolean | null
          fluxo_atendimento?: string | null
          id?: string
          medico_obrigatorio?: boolean | null
          permite_encaixe?: boolean | null
          permite_orcamento?: boolean | null
          permite_venda_direta?: boolean | null
          procedimento_id?: string
          sala_obrigatoria?: boolean | null
          tempo_padrao_min?: number | null
          tipo_procedimento?: string | null
          unidade_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "procedimento_unidade_regras_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "clinicas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "procedimento_unidade_regras_procedimento_id_fkey"
            columns: ["procedimento_id"]
            isOneToOne: false
            referencedRelation: "procedimentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "procedimento_unidade_regras_unidade_id_fkey"
            columns: ["unidade_id"]
            isOneToOne: false
            referencedRelation: "unidades"
            referencedColumns: ["id"]
          },
        ]
      }
      procedimentos: {
        Row: {
          agenda_obrigatoria: boolean
          ativo: boolean
          ciclo_dias: number | null
          clinica_id: string
          codigo: string | null
          cor_agenda: string | null
          created_at: string
          duracao_minutos: number
          equipamento_obrigatorio: boolean
          exige_autorizacao: boolean
          exige_preparo: boolean
          exige_termo: boolean
          fluxo_atendimento: string | null
          grupo: string | null
          id: string
          medico_obrigatorio: boolean
          nome: string
          observacoes: string | null
          permite_encaixe: boolean
          permite_orcamento: boolean
          permite_venda_direta: boolean
          preparo: string | null
          requer_laudo: boolean
          requer_medico: boolean
          requer_sala: boolean
          sala_obrigatoria: boolean
          sessoes_incluidas: number | null
          tempo_padrao_min: number
          tipo: string
          tipo_destino: string | null
          tipo_procedimento: string | null
          tipo_recurso: string | null
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
          valor_variavel: boolean
        }
        Insert: {
          agenda_obrigatoria?: boolean
          ativo?: boolean
          ciclo_dias?: number | null
          clinica_id: string
          codigo?: string | null
          cor_agenda?: string | null
          created_at?: string
          duracao_minutos?: number
          equipamento_obrigatorio?: boolean
          exige_autorizacao?: boolean
          exige_preparo?: boolean
          exige_termo?: boolean
          fluxo_atendimento?: string | null
          grupo?: string | null
          id?: string
          medico_obrigatorio?: boolean
          nome: string
          observacoes?: string | null
          permite_encaixe?: boolean
          permite_orcamento?: boolean
          permite_venda_direta?: boolean
          preparo?: string | null
          requer_laudo?: boolean
          requer_medico?: boolean
          requer_sala?: boolean
          sala_obrigatoria?: boolean
          sessoes_incluidas?: number | null
          tempo_padrao_min?: number
          tipo?: string
          tipo_destino?: string | null
          tipo_procedimento?: string | null
          tipo_recurso?: string | null
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
          valor_variavel?: boolean
        }
        Update: {
          agenda_obrigatoria?: boolean
          ativo?: boolean
          ciclo_dias?: number | null
          clinica_id?: string
          codigo?: string | null
          cor_agenda?: string | null
          created_at?: string
          duracao_minutos?: number
          equipamento_obrigatorio?: boolean
          exige_autorizacao?: boolean
          exige_preparo?: boolean
          exige_termo?: boolean
          fluxo_atendimento?: string | null
          grupo?: string | null
          id?: string
          medico_obrigatorio?: boolean
          nome?: string
          observacoes?: string | null
          permite_encaixe?: boolean
          permite_orcamento?: boolean
          permite_venda_direta?: boolean
          preparo?: string | null
          requer_laudo?: boolean
          requer_medico?: boolean
          requer_sala?: boolean
          sala_obrigatoria?: boolean
          sessoes_incluidas?: number | null
          tempo_padrao_min?: number
          tipo?: string
          tipo_destino?: string | null
          tipo_procedimento?: string | null
          tipo_recurso?: string | null
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
          valor_variavel?: boolean
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          id: string
          nome: string
          preferencias_ui: Json
          telefone: string | null
          telefone2: string | null
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          id: string
          nome: string
          preferencias_ui?: Json
          telefone?: string | null
          telefone2?: string | null
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          id?: string
          nome?: string
          preferencias_ui?: Json
          telefone?: string | null
          telefone2?: string | null
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
      prontuario_sequencia: {
        Row: {
          atualizado_em: string
          clinica_id: string
          proximo: number
        }
        Insert: {
          atualizado_em?: string
          clinica_id: string
          proximo: number
        }
        Update: {
          atualizado_em?: string
          clinica_id?: string
          proximo?: number
        }
        Relationships: [
          {
            foreignKeyName: "prontuario_sequencia_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: true
            referencedRelation: "clinicas"
            referencedColumns: ["id"]
          },
        ]
      }
      prontuarios: {
        Row: {
          agendamento_id: string | null
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
          agendamento_id?: string | null
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
          agendamento_id?: string | null
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
        Relationships: [
          {
            foreignKeyName: "prontuarios_agendamento_id_fkey"
            columns: ["agendamento_id"]
            isOneToOne: false
            referencedRelation: "agendamentos"
            referencedColumns: ["id"]
          },
        ]
      }
      qa_cb_casos: {
        Row: {
          caso: number
          cenario: string
          clinica_id: string
          contrato_id: string | null
          convenio_id: string | null
          convenio_nome: string | null
          created_at: string
          detalhe: string | null
          execucao: string
          forma: string | null
          id: string
          observacao: string | null
          paciente_id: string | null
          passou: boolean
          procedimento_id: string | null
          procedimento_nome: string | null
          valor_esperado: number
          valor_obtido: number
          valor_particular: number
        }
        Insert: {
          caso: number
          cenario: string
          clinica_id: string
          contrato_id?: string | null
          convenio_id?: string | null
          convenio_nome?: string | null
          created_at?: string
          detalhe?: string | null
          execucao: string
          forma?: string | null
          id?: string
          observacao?: string | null
          paciente_id?: string | null
          passou?: boolean
          procedimento_id?: string | null
          procedimento_nome?: string | null
          valor_esperado?: number
          valor_obtido?: number
          valor_particular?: number
        }
        Update: {
          caso?: number
          cenario?: string
          clinica_id?: string
          contrato_id?: string | null
          convenio_id?: string | null
          convenio_nome?: string | null
          created_at?: string
          detalhe?: string | null
          execucao?: string
          forma?: string | null
          id?: string
          observacao?: string | null
          paciente_id?: string | null
          passou?: boolean
          procedimento_id?: string | null
          procedimento_nome?: string | null
          valor_esperado?: number
          valor_obtido?: number
          valor_particular?: number
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
      role_permissions: {
        Row: {
          cargo_id: string
          clinica_id: string
          created_at: string
          id: string
          permission_id: string
        }
        Insert: {
          cargo_id: string
          clinica_id: string
          created_at?: string
          id?: string
          permission_id: string
        }
        Update: {
          cargo_id?: string
          clinica_id?: string
          created_at?: string
          id?: string
          permission_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "role_permissions_cargo_id_fkey"
            columns: ["cargo_id"]
            isOneToOne: false
            referencedRelation: "cargos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "role_permissions_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "clinicas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "role_permissions_permission_id_fkey"
            columns: ["permission_id"]
            isOneToOne: false
            referencedRelation: "permissions"
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
      setores: {
        Row: {
          ativo: boolean
          clinica_id: string
          created_at: string
          descricao: string | null
          id: string
          nome: string
          responsavel_id: string | null
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          clinica_id: string
          created_at?: string
          descricao?: string | null
          id?: string
          nome: string
          responsavel_id?: string | null
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          clinica_id?: string
          created_at?: string
          descricao?: string | null
          id?: string
          nome?: string
          responsavel_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "setores_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "clinicas"
            referencedColumns: ["id"]
          },
        ]
      }
      sistema_planos: {
        Row: {
          ativo: boolean
          codigo_plano: number
          created_at: string
          data: string
          descricao: string
          id: string
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          codigo_plano: number
          created_at?: string
          data?: string
          descricao: string
          id?: string
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          codigo_plano?: number
          created_at?: string
          data?: string
          descricao?: string
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      tipos_servico: {
        Row: {
          ativo: boolean
          created_at: string
          id: string
          nome: string
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          id?: string
          nome: string
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          created_at?: string
          id?: string
          nome?: string
          updated_at?: string
        }
        Relationships: []
      }
      triagens_enfermagem: {
        Row: {
          agendamento_id: string | null
          alergias: string | null
          altura_cm: number | null
          classificacao_risco: string | null
          clinica_id: string
          created_at: string
          doencas: string[] | null
          enfermeira_id: string | null
          enfermeira_nome: string | null
          freq_cardiaca: number | null
          glicemia: number | null
          id: string
          imc: number | null
          medicamentos: string | null
          motivo_prioridade: string | null
          observacoes: string | null
          pa_diastolica: number | null
          pa_sistolica: number | null
          paciente_id: string | null
          peso_kg: number | null
          prioridade: string | null
          queixa_principal: string | null
          saturacao: number | null
          temperatura: number | null
          updated_at: string
        }
        Insert: {
          agendamento_id?: string | null
          alergias?: string | null
          altura_cm?: number | null
          classificacao_risco?: string | null
          clinica_id: string
          created_at?: string
          doencas?: string[] | null
          enfermeira_id?: string | null
          enfermeira_nome?: string | null
          freq_cardiaca?: number | null
          glicemia?: number | null
          id?: string
          imc?: number | null
          medicamentos?: string | null
          motivo_prioridade?: string | null
          observacoes?: string | null
          pa_diastolica?: number | null
          pa_sistolica?: number | null
          paciente_id?: string | null
          peso_kg?: number | null
          prioridade?: string | null
          queixa_principal?: string | null
          saturacao?: number | null
          temperatura?: number | null
          updated_at?: string
        }
        Update: {
          agendamento_id?: string | null
          alergias?: string | null
          altura_cm?: number | null
          classificacao_risco?: string | null
          clinica_id?: string
          created_at?: string
          doencas?: string[] | null
          enfermeira_id?: string | null
          enfermeira_nome?: string | null
          freq_cardiaca?: number | null
          glicemia?: number | null
          id?: string
          imc?: number | null
          medicamentos?: string | null
          motivo_prioridade?: string | null
          observacoes?: string | null
          pa_diastolica?: number | null
          pa_sistolica?: number | null
          paciente_id?: string | null
          peso_kg?: number | null
          prioridade?: string | null
          queixa_principal?: string | null
          saturacao?: number | null
          temperatura?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      unidades: {
        Row: {
          ativo: boolean
          cep: string | null
          cidade: string | null
          clinica_id: string
          created_at: string
          email: string | null
          endereco: string | null
          estado: string | null
          id: string
          latitude: number | null
          longitude: number | null
          nome: string
          raio_metros: number | null
          telefone: string | null
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          cep?: string | null
          cidade?: string | null
          clinica_id: string
          created_at?: string
          email?: string | null
          endereco?: string | null
          estado?: string | null
          id?: string
          latitude?: number | null
          longitude?: number | null
          nome: string
          raio_metros?: number | null
          telefone?: string | null
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          cep?: string | null
          cidade?: string | null
          clinica_id?: string
          created_at?: string
          email?: string | null
          endereco?: string | null
          estado?: string | null
          id?: string
          latitude?: number | null
          longitude?: number | null
          nome?: string
          raio_metros?: number | null
          telefone?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "unidades_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "clinicas"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          clinica_id: string | null
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role_global"]
          user_id: string
        }
        Insert: {
          clinica_id?: string | null
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role_global"]
          user_id: string
        }
        Update: {
          clinica_id?: string | null
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role_global"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_roles_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "clinicas"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_configs: {
        Row: {
          access_token: string | null
          app_secret: string | null
          ativo: boolean
          clinica_id: string
          created_at: string
          display_name: string | null
          display_phone_number: string | null
          horario_fim: string | null
          horario_inicio: string | null
          phone_number_id: string | null
          ultimo_teste_em: string | null
          ultimo_teste_erro: string | null
          ultimo_teste_ok: boolean | null
          updated_at: string
          verify_token: string
          waba_id: string | null
          welcome_message: string | null
        }
        Insert: {
          access_token?: string | null
          app_secret?: string | null
          ativo?: boolean
          clinica_id: string
          created_at?: string
          display_name?: string | null
          display_phone_number?: string | null
          horario_fim?: string | null
          horario_inicio?: string | null
          phone_number_id?: string | null
          ultimo_teste_em?: string | null
          ultimo_teste_erro?: string | null
          ultimo_teste_ok?: boolean | null
          updated_at?: string
          verify_token?: string
          waba_id?: string | null
          welcome_message?: string | null
        }
        Update: {
          access_token?: string | null
          app_secret?: string | null
          ativo?: boolean
          clinica_id?: string
          created_at?: string
          display_name?: string | null
          display_phone_number?: string | null
          horario_fim?: string | null
          horario_inicio?: string | null
          phone_number_id?: string | null
          ultimo_teste_em?: string | null
          ultimo_teste_erro?: string | null
          ultimo_teste_ok?: boolean | null
          updated_at?: string
          verify_token?: string
          waba_id?: string | null
          welcome_message?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_configs_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: true
            referencedRelation: "clinicas"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_mensagens: {
        Row: {
          body: string | null
          canal: string
          clinica_id: string
          conversa_id: string | null
          created_at: string
          direction: string
          enviada_por: string | null
          execucao_id: string | null
          from_number: string | null
          id: string
          is_teste: boolean
          media_mime: string | null
          media_url: string | null
          quoted_message_id: string | null
          raw: Json | null
          read_at: string | null
          recebida_em: string
          status: string | null
          tipo: string
          to_number: string | null
          transcricao: string | null
          wa_message_id: string | null
        }
        Insert: {
          body?: string | null
          canal?: string
          clinica_id: string
          conversa_id?: string | null
          created_at?: string
          direction: string
          enviada_por?: string | null
          execucao_id?: string | null
          from_number?: string | null
          id?: string
          is_teste?: boolean
          media_mime?: string | null
          media_url?: string | null
          quoted_message_id?: string | null
          raw?: Json | null
          read_at?: string | null
          recebida_em?: string
          status?: string | null
          tipo?: string
          to_number?: string | null
          transcricao?: string | null
          wa_message_id?: string | null
        }
        Update: {
          body?: string | null
          canal?: string
          clinica_id?: string
          conversa_id?: string | null
          created_at?: string
          direction?: string
          enviada_por?: string | null
          execucao_id?: string | null
          from_number?: string | null
          id?: string
          is_teste?: boolean
          media_mime?: string | null
          media_url?: string | null
          quoted_message_id?: string | null
          raw?: Json | null
          read_at?: string | null
          recebida_em?: string
          status?: string | null
          tipo?: string
          to_number?: string | null
          transcricao?: string | null
          wa_message_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_mensagens_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "clinicas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_mensagens_conversa_id_fkey"
            columns: ["conversa_id"]
            isOneToOne: false
            referencedRelation: "atend_conversas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_mensagens_execucao_id_fkey"
            columns: ["execucao_id"]
            isOneToOne: false
            referencedRelation: "nina_execucoes"
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
      whatsapp_webhook_logs: {
        Row: {
          assinatura: string | null
          clinica_id: string
          corpo: string | null
          headers: Json
          id: string
          metodo: string
          recebido_em: string
          resultado: string | null
        }
        Insert: {
          assinatura?: string | null
          clinica_id: string
          corpo?: string | null
          headers?: Json
          id?: string
          metodo: string
          recebido_em?: string
          resultado?: string | null
        }
        Update: {
          assinatura?: string | null
          clinica_id?: string
          corpo?: string | null
          headers?: Json
          id?: string
          metodo?: string
          recebido_em?: string
          resultado?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      nfse_emitentes_publico: {
        Row: {
          aliquota_iss: number | null
          ativo: boolean | null
          bairro: string | null
          cep: string | null
          certificado_validade: string | null
          clinica_id: string | null
          cnpj: string | null
          codigo_cnae: string | null
          codigo_municipio: string | null
          codigo_tributario_municipio: string | null
          complemento: string | null
          created_at: string | null
          descricao_servico_padrao: string | null
          email: string | null
          focus_ambiente: string | null
          id: string | null
          incentivador_cultural: boolean | null
          inscricao_estadual: string | null
          inscricao_municipal: string | null
          item_lista_servico: string | null
          logradouro: string | null
          municipio: string | null
          nome: string | null
          nome_fantasia: string | null
          numero: string | null
          optante_simples: boolean | null
          padrao: boolean | null
          razao_social: string | null
          regime_tributario: string | null
          rps_proximo_numero: number | null
          rps_serie: string | null
          telefone: string | null
          uf: string | null
          updated_at: string | null
          usar_ambiente_nacional: boolean | null
        }
        Relationships: []
      }
      v_pacientes_duplicados_suspeitos: {
        Row: {
          chave: string | null
          clinica_id: string | null
          ids: string[] | null
          qtd: number | null
          tipo: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      __actor_set_trocar_convenio: { Args: never; Returns: undefined }
      __plpgsql_show_dependency_tb:
        | {
            Args: {
              anycompatiblerangetype?: unknown
              anycompatibletype?: unknown
              anyelememttype?: unknown
              anyenumtype?: unknown
              anyrangetype?: unknown
              funcoid: unknown
              relid?: unknown
            }
            Returns: {
              name: string
              oid: unknown
              params: string
              schema: string
              type: string
            }[]
          }
        | {
            Args: {
              anycompatiblerangetype?: unknown
              anycompatibletype?: unknown
              anyelememttype?: unknown
              anyenumtype?: unknown
              anyrangetype?: unknown
              name: string
              relid?: unknown
            }
            Returns: {
              name: string
              oid: unknown
              params: string
              schema: string
              type: string
            }[]
          }
      _composicao_partes: {
        Args: { p_comp: Json }
        Returns: {
          forma: string
          valor: number
        }[]
      }
      _do_fix_phones_prontuarios_mj: {
        Args: never
        Returns: {
          atualizados: number
        }[]
      }
      _do_fix_prontuario_oldest_mj: {
        Args: never
        Returns: {
          atualizados: number
        }[]
      }
      _do_import_pacientes_mj: { Args: never; Returns: number }
      _do_merge_pacientes_dup_mj: {
        Args: never
        Returns: {
          grupos: number
          mesclados: number
        }[]
      }
      _mj_apply_batch: { Args: { p_limit?: number }; Returns: number }
      _mj_null_all: { Args: never; Returns: number }
      _mj_set_batch: { Args: { _limit?: number }; Returns: number }
      _mj_tmp_batch: { Args: { _limit?: number }; Returns: number }
      _parse_misto_obs: {
        Args: { p_obs: string }
        Returns: {
          forma: string
          valor: number
        }[]
      }
      agenda_slot_lock: { Args: { _id: string }; Returns: Json }
      agenda_slot_unlock: { Args: { _id: string }; Returns: undefined }
      agendamento_historico: {
        Args: { _agendamento_id: string }
        Returns: Json
      }
      agendamento_slot_vazio: { Args: { _id: string }; Returns: boolean }
      agendar_online: {
        Args: {
          _agenda_id?: string
          _clinica_id: string
          _especialidade_id?: string
          _fim: string
          _inicio: string
          _medico_id: string
          _observacoes?: string
          _procedimento?: string
        }
        Returns: string
      }
      agendar_publico: {
        Args: {
          _agenda_id?: string
          _clinica_id: string
          _cpf?: string
          _email?: string
          _especialidade_id?: string
          _fim: string
          _inicio: string
          _medico_id: string
          _nome: string
          _observacoes?: string
          _procedimento?: string
          _telefone?: string
        }
        Returns: string
      }
      aplicar_tipo_convenio_lote: { Args: { _ids: string[] }; Returns: Json }
      assinar_contrato_publico: {
        Args: { _assinatura_svg: string; _ip: string; _token: string }
        Returns: string
      }
      atend_auto_assign_conversa: {
        Args: {
          _clinica_id: string
          _conversa_id: string
          _departamento_id?: string
          _origem?: string
        }
        Returns: string
      }
      atend_claim_conversa: {
        Args: { _clinica_id: string; _conversa_id: string; _user_id: string }
        Returns: boolean
      }
      atend_distribuir_fila: {
        Args: { _clinica_id: string; _max?: number }
        Returns: number
      }
      atend_espera_por_conversa: {
        Args: { _clinica_id: string; _is_teste?: boolean }
        Returns: {
          aguardando_desde: string
          conversa_id: string
        }[]
      }
      atend_gerar_protocolo: { Args: { _clinica_id: string }; Returns: string }
      atend_gerar_protocolo_atendimento: {
        Args: {
          _clinica_id: string
          _conversa_id: string
          _session_id?: string
        }
        Returns: {
          novo: boolean
          protocolo: string
        }[]
      }
      atend_usuario_e_admin: {
        Args: { _clinica_id: string; _user_id: string }
        Returns: boolean
      }
      buscar_contratos: {
        Args: {
          _clinica_id: string
          _limit?: number
          _offset?: number
          _termo?: string
        }
        Returns: {
          codigo_prontuario: string
          contrato: Json
          parcela_atrasada: boolean
          parcelas_pagas: number
          parcelas_total: number
          vendedor_nome: string
        }[]
      }
      buscar_paciente_contato: {
        Args: {
          _clinica_id: string
          _cpf?: string
          _nome?: string
          _telefone?: string
        }
        Returns: {
          associado: boolean
          contrato_id: string
          convenio_id: string
          convenio_nome: string
          cpf: string
          data_nascimento: string
          id: string
          nome: string
          telefone: string
        }[]
      }
      buscar_pacientes: {
        Args: {
          _clinica_id: string
          _limit?: number
          _offset?: number
          _termo: string
        }
        Returns: {
          ativo: boolean
          bairro: string | null
          cep: string | null
          cidade: string | null
          clinica_id: string
          codigo_prontuario: string | null
          codigo_prontuario_anterior: string | null
          complemento: string | null
          consentimento_lgpd_em: string | null
          cpf: string | null
          cpf_digits: string | null
          created_at: string
          data_nascimento: string | null
          email: string | null
          estado: string | null
          face_atualizado_em: string | null
          face_descriptor: number[] | null
          foto_atualizado_em: string | null
          foto_url: string | null
          id: string
          is_mock_data: boolean
          legacy_id: number | null
          logradouro: string | null
          nome: string
          numero: string | null
          numero_pasta: string | null
          origem: string | null
          pasta_ortodontica: string | null
          prontuarios_anteriores: string | null
          responsavel_cpf: string | null
          responsavel_nome: string | null
          responsavel_parentesco: string | null
          responsavel_telefone: string | null
          sexo: string
          telefone: string | null
          telefone_norm: string | null
          telefone2: string | null
          telefone2_norm: string | null
          teste: boolean
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "pacientes"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      buscar_pacientes_agenda: {
        Args: { _clinica_ids: string[]; _limite?: number; _termo: string }
        Returns: {
          clinica_id: string
          codigo_prontuario: string
          cpf: string
          data_nascimento: string
          id: string
          nome: string
          numero_pasta: string
          telefone: string
        }[]
      }
      buscar_pacientes_global: {
        Args: { _clinica_ids: string[]; _limite?: number; _termo: string }
        Returns: {
          associado_convenio: string
          associado_tipo: string
          cadastro_incompleto: boolean
          clinica_id: string
          codigo_prontuario: string
          codigo_prontuario_anterior: string
          cpf: string
          data_nascimento: string
          email: string
          id: string
          match_reason: string
          match_score: number
          nome: string
          numero_pasta: string
          telefone: string
          ultima_consulta: string
        }[]
      }
      buscar_universal: {
        Args: {
          _clinica_ids: string[]
          _limite?: number
          _termo: string
          _tipos?: string[]
        }
        Returns: {
          criado_em: string
          hint: string
          id: string
          payload: Json
          score: number
          subtitulo: string
          tipo: string
          titulo: string
        }[]
      }
      can_manage_clinica: {
        Args: { _clinica_id: string; _user_id: string }
        Returns: boolean
      }
      can_manage_medicos: {
        Args: { _clinica_id: string; _user_id: string }
        Returns: boolean
      }
      cancelar_item: {
        Args: {
          p_confirmar_cascata?: boolean
          p_item_id: string
          p_motivo: string
        }
        Returns: Json
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
      chamar_proxima_senha_tipo: {
        Args: {
          _clinica_id: string
          _guiche: string
          _tipo?: Database["public"]["Enums"]["tipo_senha"]
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
      checkin_agendamento: { Args: { _token: string }; Returns: Json }
      clinicas_do_usuario: { Args: never; Returns: string[] }
      clinicas_publicas: {
        Args: never
        Returns: {
          id: string
          nome: string
        }[]
      }
      consulta_publica: { Args: { _token: string }; Returns: Json }
      contar_vinculos_paciente: { Args: { _id: string }; Returns: Json }
      contrato_dias_tolerancia: { Args: never; Returns: number }
      contrato_historico: { Args: { _contrato_id: string }; Returns: Json }
      contrato_publico: { Args: { _token: string }; Returns: Json }
      converter_item_agendamento: {
        Args: { p_item_id: string; p_payload: Json }
        Returns: Json
      }
      converter_item_venda: {
        Args: {
          p_caixa_sessao_id: string
          p_desconto?: number
          p_forma_pagamento: string
          p_item_id: string
        }
        Returns: Json
      }
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
      criar_contrato_assinatura: {
        Args: {
          _clinica_id: string
          _convenio_id: string
          _criado_por: string
          _data_fim: string
          _data_inicio: string
          _dependentes: Json
          _dia_vencimento: number
          _forma_pagamento: string
          _mensalidades: Json
          _num_parcelas: number
          _observacoes: string
          _paciente_id: string
          _paciente_nome: string
          _taxa_adesao: number
          _valor_mensal: number
        }
        Returns: Json
      }
      criar_solicitacao_site: {
        Args: {
          _clinica_id: string
          _especialidade_id: string
          _fim: string
          _id_externo: string
          _inicio: string
          _medico_id: string
          _observacoes: string
          _paciente_id: string
          _paciente_nome: string
          _procedimento: string
        }
        Returns: string
      }
      cubo_bi_financeiro_agregado: {
        Args: {
          _clinica_id: string
          _col_key?: string
          _fim: string
          _ini: string
          _measure_agg?: string
          _measure_field?: string
          _row_key: string
          _sub_row_key?: string
          _sub_sub_row_key?: string
        }
        Returns: {
          col_value: string
          row_value: string
          sub_row_value: string
          sub_sub_row_value: string
          valor: number
        }[]
      }
      dashboard_blocos_periodo: {
        Args: { p_clinica: string; p_fim: string; p_ini: string }
        Returns: Json
      }
      desfazer_baixa_atendimento: {
        Args: {
          _clinica_id: string
          _id: string
          _motivo?: string
          _origem: string
        }
        Returns: Json
      }
      each: { Args: { hs: unknown }; Returns: Record<string, unknown>[] }
      emitir_nfse_orcamento: { Args: { p_orcamento_id: string }; Returns: Json }
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
      emitir_senha_publica: {
        Args: {
          _clinica_id: string
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
      especialidades_paciente: {
        Args: { _clinica_id: string }
        Returns: {
          id: string
          nome: string
        }[]
      }
      especialidades_publicas: {
        Args: { _clinica_id: string }
        Returns: {
          id: string
          nome: string
        }[]
      }
      estornar_lancamento_receita: {
        Args: { _clinica_id: string; _lancamento_id: string }
        Returns: Json
      }
      estornar_repasse_atendimento: {
        Args: {
          _clinica_id: string
          _id: string
          _motivo?: string
          _origem: string
          _valor_medico?: number
        }
        Returns: Json
      }
      estornar_sangria: {
        Args: { _clinica_id?: string; _movimento_id: string }
        Returns: Json
      }
      estorno_receita_destinos: {
        Args: { _lancamento_id: string; _uid: string }
        Returns: {
          clinica_id: string
          descricao: string
          dono_destino: string
          forma_pagamento: string
          lancamento_id: string
          origem: string
          sessao_destino: string
          valor: number
        }[]
      }
      excluir_paciente_duplicado: { Args: { _id: string }; Returns: Json }
      feature_flag_ativa: {
        Args: { _clinica_id: string; _flag_key: string }
        Returns: boolean
      }
      fila_caixa_hoje: {
        Args: { _clinica_id: string; _data?: string }
        Returns: {
          desconto_origem: string
          id: string
          inicio: string
          ja_pago: boolean
          medico_nome: string
          paciente_id: string
          paciente_nome: string
          procedimento: string
          valor: number
          valor_cartao: number
        }[]
      }
      fin_atendimentos_matriz:
        | {
            Args: { _clinica: string }
            Returns: {
              ano: number
              cartao: number
              exames: number
              mes: number
              particular: number
            }[]
          }
        | {
            Args: { _clinica: string; _fim: string; _ini: string }
            Returns: {
              ano: number
              cartao: number
              exames: number
              mes: number
              particular: number
            }[]
          }
      fin_resumo_categoria: {
        Args: {
          p_clinica: string
          p_fim: string
          p_ini: string
          p_status?: string
        }
        Returns: {
          categoria_id: string
          tipo: string
          total: number
        }[]
      }
      fin_resumo_periodo: {
        Args: { p_clinica: string; p_fim: string; p_ini: string }
        Returns: {
          qtd: number
          status: string
          tipo: string
          total: number
        }[]
      }
      fin_serie_diaria: {
        Args: {
          p_clinica: string
          p_fim: string
          p_ini: string
          p_status?: string
        }
        Returns: {
          data: string
          tipo: string
          total: number
        }[]
      }
      finalizar_pagamento_agrupado: {
        Args: {
          _clinica_id: string
          _criado_por: string
          _forma_pagamento: string
          _grupo_id: string
          _itens: Json
        }
        Returns: Json
      }
      fn_agendamento_coberto_por_pacote: {
        Args: { _agendamento_id: string }
        Returns: {
          coberto: boolean
          descricao: string
          numero: number
          pacote_id: string
          total: number
          valor_pago: number
        }[]
      }
      fn_hist_quem: {
        Args: { _clinica: string; _email: string; _user_id: string }
        Returns: Json
      }
      fn_norm_proc: { Args: { _t: string }; Returns: string }
      fn_pacotes_do_paciente: {
        Args: { _paciente_id: string }
        Returns: {
          agendamento_id: string
          data_inicio: string
          data_prevista: string
          descricao: string
          numero: number
          pacote_id: string
          sessao_id: string
          sessao_status: string
          status: string
          total_sessoes: number
          valor_pago: number
          valor_total: number
        }[]
      }
      fn_proc_chaves: { Args: { _texto: string }; Returns: string[] }
      fn_procedimento_por_texto: {
        Args: { _clinica_id: string; _texto: string }
        Returns: string
      }
      fn_registrar_lancamento_e_caixa: {
        Args: { p_lancamento: Json; p_movimento?: Json }
        Returns: Json
      }
      fn_regras_procedimento: {
        Args: { p_procedimento_id: string; p_unidade_id?: string }
        Returns: Json
      }
      fn_relatorio_sessoes: {
        Args: { _ate: string; _clinica_id: string; _de: string; _modo?: string }
        Returns: {
          dias_parado: number
          faltas: number
          origem: string
          paciente_id: string
          paciente_nome: string
          pendencia: string
          procedimento: string
          profissional: string
          prontuario: string
          proxima_data: string
          realizadas: number
          restantes: number
          situacao_financeira: string
          total_sessoes: number
          ultima_data: string
          valor_contratado: number
          valor_pago: number
        }[]
      }
      get_horarios_disponiveis: {
        Args: {
          _clinica_id: string
          _dias?: number
          _especialidade_id?: string
          _limite?: number
          _medico_id?: string
        }
        Returns: {
          agenda_id: string
          agenda_nome: string
          capacidade: number
          especialidade_id: string
          especialidade_nome: string
          fim: string
          inicio: string
          medico_id: string
          medico_nome: string
          ocupados: number
        }[]
      }
      get_orcamento_conversao: {
        Args: { p_orcamento_id: string }
        Returns: Json
      }
      get_ultimo_agendamento_paciente: {
        Args: { _paciente_id: string }
        Returns: {
          clinica_id: string
          especialidade_id: string
          especialidade_nome: string
          inicio: string
          medico_id: string
          medico_nome: string
          procedimento: string
        }[]
      }
      grupos_duplicados_pacientes: {
        Args: {
          _clinica_ids: string[]
          _limite?: number
          _offset?: number
          _tipo: string
        }
        Returns: {
          chave: string
          clinica_id: string
          ids: string[]
          qtd: number
          tipo: string
        }[]
      }
      has_any_role: {
        Args: {
          _clinica_id: string
          _roles: Database["public"]["Enums"]["app_role"][]
          _user_id: string
        }
        Returns: boolean
      }
      has_module_access: {
        Args: {
          _clinica_id: string
          _modulo: string
          _nivel?: string
          _user_id: string
        }
        Returns: boolean
      }
      has_role: {
        Args: {
          _clinica_id: string
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      has_role_global: {
        Args: {
          _clinica_id?: string
          _role: Database["public"]["Enums"]["app_role_global"]
          _user_id: string
        }
        Returns: boolean
      }
      horarios_disponiveis_paciente: {
        Args: {
          _clinica_id: string
          _de?: string
          _dias?: number
          _especialidade_id?: string
          _limite?: number
          _medico_id?: string
        }
        Returns: {
          agenda_id: string
          agenda_nome: string
          capacidade: number
          especialidade_id: string
          especialidade_nome: string
          fim: string
          inicio: string
          medico_id: string
          medico_nome: string
          ocupados: number
        }[]
      }
      horarios_disponiveis_publico: {
        Args: {
          _clinica_id: string
          _de?: string
          _dias?: number
          _especialidade_id?: string
          _limite?: number
          _medico_id?: string
        }
        Returns: {
          agenda_id: string
          agenda_nome: string
          capacidade: number
          especialidade_id: string
          especialidade_nome: string
          fim: string
          inicio: string
          medico_id: string
          medico_nome: string
          ocupados: number
        }[]
      }
      hr_convenio_add_dependente: {
        Args: {
          _hr_contrato_id: string
          _paciente_id: string
          _parentesco: string
        }
        Returns: string
      }
      hr_convenio_remove_dependente: {
        Args: { _dependente_id: string }
        Returns: undefined
      }
      hr_toggle_convenio_funcionario: {
        Args: {
          _habilitar: boolean
          _hr_contrato_id: string
          _titular_paciente_id: string
        }
        Returns: string
      }
      intake_consumir_rate_limit: {
        Args: {
          _chave: string
          _janela: string
          _limite: number
          _segundos: number
        }
        Returns: boolean
      }
      integracao_criar_api_key: {
        Args: {
          _clinica_id: string
          _escopos?: string[]
          _expira_em?: string
          _limite_pacientes_por_dia?: number
          _limite_pacientes_por_minuto?: number
          _limite_por_dia?: number
          _limite_por_minuto?: number
          _nome: string
          _origem_integracao: string
        }
        Returns: Json
      }
      integracao_rate_limit_consumir: {
        Args: {
          _api_key_id: string
          _janela: string
          _janela_inicio: string
          _limite: number
        }
        Returns: Json
      }
      integracao_resolver_paciente: {
        Args: {
          _clinica_id: string
          _cpf_digits: string
          _data_nascimento: string
          _email?: string
          _nome: string
          _sexo?: string
          _telefone: string
        }
        Returns: Json
      }
      integracao_revogar_api_key: { Args: { _id: string }; Returns: boolean }
      is_admin_global: { Args: { _user_id: string }; Returns: boolean }
      is_admin_ou_gestor: { Args: { _user_id: string }; Returns: boolean }
      is_chat_member: {
        Args: { _canal_id: string; _user_id: string }
        Returns: boolean
      }
      is_financeiro_clinica: {
        Args: { _clinica_id: string; _user_id: string }
        Returns: boolean
      }
      is_gestor_de_alguma_clinica: {
        Args: { _user_id: string }
        Returns: boolean
      }
      is_global_admin: { Args: { _user_id: string }; Returns: boolean }
      is_medico: {
        Args: { _clinica_id: string; _user_id: string }
        Returns: boolean
      }
      is_member: {
        Args: { _clinica_id: string; _user_id: string }
        Returns: boolean
      }
      is_platform_admin: { Args: { _user_id: string }; Returns: boolean }
      kpis_clientes_v2: {
        Args: { _clinica_id: string }
        Returns: {
          aniversariantes: number
          associados: number
          ativos: number
          inativos: number
          novos30d: number
          sem_cpf: number
          sem_telefone: number
          total: number
        }[]
      }
      listar_atendimentos_convenio_pendentes: {
        Args: {
          _ate?: string
          _clinica_ids: string[]
          _de?: string
          _limite?: number
        }
        Returns: {
          clinica_id: string
          contrato_numero: number
          convenio_nome: string
          id: string
          inicio: string
          ja_pago: boolean
          medico_nome: string
          paciente_id: string
          paciente_nome: string
          procedimento: string
          status: string
        }[]
      }
      listar_contratos_sem_convenio: {
        Args: { _clinica_ids: string[] }
        Returns: {
          clinica_id: string
          data_inicio: string
          id: string
          numero: number
          paciente_id: string
          paciente_nome: string
          qtd_dependentes: number
          valor_mensal: number
        }[]
      }
      listar_duplicados_pacientes: {
        Args: {
          _clinica_ids: string[]
          _limite?: number
          _offset?: number
          _tipo?: string
        }
        Returns: {
          chave: string
          clinica_id: string
          ids: string[]
          pacientes: Json
          qtd: number
          tipo: string
        }[]
      }
      listar_nfse_emitentes_publico: {
        Args: never
        Returns: {
          aliquota_iss: number
          ativo: boolean
          bairro: string
          cep: string
          certificado_validade: string
          clinica_id: string
          cnpj: string
          codigo_cnae: string
          codigo_municipio: string
          codigo_tributario_municipio: string
          complemento: string
          created_at: string
          descricao_servico_padrao: string
          email: string
          focus_ambiente: string
          id: string
          incentivador_cultural: boolean
          inscricao_estadual: string
          inscricao_municipal: string
          item_lista_servico: string
          logradouro: string
          municipio: string
          nome: string
          nome_fantasia: string
          numero: string
          optante_simples: boolean
          padrao: boolean
          razao_social: string
          regime_tributario: string
          rps_proximo_numero: number
          rps_serie: string
          telefone: string
          uf: string
          updated_at: string
          usar_ambiente_nacional: boolean
        }[]
      }
      listar_saldos_em_aberto: {
        Args: { _busca?: string; _clinica_id: string; _limite?: number }
        Returns: {
          agendamento_id: string
          inicio: string
          medico_nome: string
          paciente_id: string
          paciente_nome: string
          procedimento: string
          saldo: number
          ultimo_pagamento: string
          valor_cobranca: number
          valor_pago: number
        }[]
      }
      listar_unidades_basico: {
        Args: never
        Returns: {
          cidade: string
          estado: string
          id: string
          nome: string
        }[]
      }
      log_action: {
        Args: {
          _action: string
          _clinica_id?: string
          _dados_antes?: Json
          _dados_depois?: Json
          _record_id: string
          _table_name: string
        }
        Returns: undefined
      }
      marcar_item_nao_aplicavel: {
        Args: { p_item_id: string; p_motivo: string }
        Returns: Json
      }
      medico_convenio_add_dependente: {
        Args: { _medico_id: string; _paciente_id: string; _parentesco: string }
        Returns: string
      }
      medico_convenio_remove_dependente: {
        Args: { _dependente_id: string }
        Returns: undefined
      }
      medico_dados_sensiveis: { Args: { _medico_id: string }; Returns: Json }
      medico_toggle_convenio_funcionario: {
        Args: {
          _habilitar: boolean
          _medico_id: string
          _titular_paciente_id: string
        }
        Returns: string
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
      medicos_repasse_lista: {
        Args: { _clinica_id: string }
        Returns: {
          id: string
          percentual_repasse_padrao: number
          tipo_repasse: string
          valor_repasse_padrao: number
        }[]
      }
      merge_pacientes: { Args: { _ids: string[] }; Returns: string }
      meus_cartoes: { Args: never; Returns: Json }
      minhas_clinicas_paciente: {
        Args: never
        Returns: {
          clinica_id: string
          clinica_nome: string
          paciente_id: string
          paciente_nome: string
        }[]
      }
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
      nina_execucoes_expurgo: { Args: { _dias?: number }; Returns: number }
      nina_fb_pode_revisar: {
        Args: { _clinica_id: string; _user_id: string }
        Returns: boolean
      }
      nina_kb_buscar_semantico: {
        Args: { p_base_id: string; p_embedding: string; p_limite?: number }
        Returns: {
          aba_origem: string
          categoria: string
          dia: string
          horario: string
          id: string
          linha_origem: number
          medico: string
          observacoes: string
          preco_cartao: number
          preco_dinheiro: number
          preparo: string
          procedimento: string
          similaridade: number
          tipo: string
        }[]
      }
      normalizar_telefone: { Args: { _tel: string }; Returns: string }
      normalizar_termo_busca: { Args: { _termo: string }; Returns: string }
      paciente_cartao_inadimplente: {
        Args: { _clinica_id: string; _paciente_id: string }
        Returns: Json
      }
      paciente_cartao_status: {
        Args: { _clinica_id: string; _paciente_id: string }
        Returns: Json
      }
      paciente_pendencias_cadastro: {
        Args: { _paciente_id: string }
        Returns: {
          contato_ok: boolean
          documentacao_ok: boolean
          endereco_ok: boolean
          faltantes: string[]
          nfse_ok: boolean
        }[]
      }
      paciente_resumo_recepcao: {
        Args: { _clinica_id: string; _paciente_id: string }
        Returns: {
          cadastro_incompleto: boolean
          convenio_nome: string
          empresa_nome: string
          faltantes: string[]
          idade: number
          nome: string
          paciente_id: string
          pendencia_qtd: number
          pendencia_valor: number
          telefone: string
          tipo: string
          ultima_consulta_data: string
          ultima_consulta_especialidade: string
          ultima_consulta_medico: string
          ultimo_exame_data: string
          ultimo_exame_nome: string
          whatsapp_valido: boolean
        }[]
      }
      pacientes_aniversariantes_hoje: {
        Args: { _clinica_id: string; _limite?: number }
        Returns: {
          ativo: boolean
          bairro: string | null
          cep: string | null
          cidade: string | null
          clinica_id: string
          codigo_prontuario: string | null
          codigo_prontuario_anterior: string | null
          complemento: string | null
          consentimento_lgpd_em: string | null
          cpf: string | null
          cpf_digits: string | null
          created_at: string
          data_nascimento: string | null
          email: string | null
          estado: string | null
          face_atualizado_em: string | null
          face_descriptor: number[] | null
          foto_atualizado_em: string | null
          foto_url: string | null
          id: string
          is_mock_data: boolean
          legacy_id: number | null
          logradouro: string | null
          nome: string
          numero: string | null
          numero_pasta: string | null
          origem: string | null
          pasta_ortodontica: string | null
          prontuarios_anteriores: string | null
          responsavel_cpf: string | null
          responsavel_nome: string | null
          responsavel_parentesco: string | null
          responsavel_telefone: string | null
          sexo: string
          telefone: string | null
          telefone_norm: string | null
          telefone2: string | null
          telefone2_norm: string | null
          teste: boolean
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "pacientes"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      pacientes_face_lista: {
        Args: { _clinica_id: string }
        Returns: {
          descriptor: Json
          id: string
          nome: string
        }[]
      }
      pagar_repasse_medico: {
        Args: {
          _agenda_ids: string[]
          _clinica_id: string
          _conta_id: string
          _criado_por: string
          _data: string
          _forma_pagamento: string
          _manual_ids: string[]
          _medico_id: string
          _medico_nome: string
          _total: number
        }
        Returns: string
      }
      pagar_repasse_medico_com_terceiros: {
        Args: {
          _agenda_ids: string[]
          _clinica_id: string
          _conta_id: string
          _criado_por: string
          _data: string
          _forma_pagamento: string
          _manual_ids: string[]
          _medico_id: string
          _medico_nome: string
          _terceiros?: Json
          _total: number
        }
        Returns: Json
      }
      painel_executivo_periodo: {
        Args: {
          p_ate: string
          p_clinica: string
          p_de: string
          p_fim: string
          p_ini: string
        }
        Returns: Json
      }
      painel_grs_periodo: {
        Args: { p_clinica: string; p_fim: string; p_ini: string }
        Returns: {
          grs: number
          novos: number
          pacientes: number
          recorrentes: number
        }[]
      }
      painel_senhas_publicas: {
        Args: { _clinica_id: string }
        Returns: {
          chamada_em: string
          codigo: string
          guiche: string
          id: string
          paciente_id: string
          paciente_nome: string
          status: string
          tipo: string
        }[]
      }
      pendencias_paciente: { Args: { _paciente_id: string }; Returns: Json }
      plpgsql_check_function:
        | {
            Args: {
              all_warnings?: boolean
              anycompatiblerangetype?: unknown
              anycompatibletype?: unknown
              anyelememttype?: unknown
              anyenumtype?: unknown
              anyrangetype?: unknown
              compatibility_warnings?: boolean
              constant_tracing?: boolean
              extra_warnings?: boolean
              fatal_errors?: boolean
              format?: string
              funcoid: unknown
              incomment_options_usage_warning?: boolean
              newtable?: unknown
              oldtable?: unknown
              other_warnings?: boolean
              performance_warnings?: boolean
              relid?: unknown
              security_warnings?: boolean
              use_incomment_options?: boolean
              without_warnings?: boolean
            }
            Returns: string[]
          }
        | {
            Args: {
              all_warnings?: boolean
              anycompatiblerangetype?: unknown
              anycompatibletype?: unknown
              anyelememttype?: unknown
              anyenumtype?: unknown
              anyrangetype?: unknown
              compatibility_warnings?: boolean
              constant_tracing?: boolean
              extra_warnings?: boolean
              fatal_errors?: boolean
              format?: string
              incomment_options_usage_warning?: boolean
              name: string
              newtable?: unknown
              oldtable?: unknown
              other_warnings?: boolean
              performance_warnings?: boolean
              relid?: unknown
              security_warnings?: boolean
              use_incomment_options?: boolean
              without_warnings?: boolean
            }
            Returns: string[]
          }
      plpgsql_check_function_tb:
        | {
            Args: {
              all_warnings?: boolean
              anycompatiblerangetype?: unknown
              anycompatibletype?: unknown
              anyelememttype?: unknown
              anyenumtype?: unknown
              anyrangetype?: unknown
              compatibility_warnings?: boolean
              constant_tracing?: boolean
              extra_warnings?: boolean
              fatal_errors?: boolean
              funcoid: unknown
              incomment_options_usage_warning?: boolean
              newtable?: unknown
              oldtable?: unknown
              other_warnings?: boolean
              performance_warnings?: boolean
              relid?: unknown
              security_warnings?: boolean
              use_incomment_options?: boolean
              without_warnings?: boolean
            }
            Returns: {
              context: string
              detail: string
              functionid: unknown
              hint: string
              level: string
              lineno: number
              message: string
              position: number
              query: string
              sqlstate: string
              statement: string
            }[]
          }
        | {
            Args: {
              all_warnings?: boolean
              anycompatiblerangetype?: unknown
              anycompatibletype?: unknown
              anyelememttype?: unknown
              anyenumtype?: unknown
              anyrangetype?: unknown
              compatibility_warnings?: boolean
              constant_tracing?: boolean
              extra_warnings?: boolean
              fatal_errors?: boolean
              incomment_options_usage_warning?: boolean
              name: string
              newtable?: unknown
              oldtable?: unknown
              other_warnings?: boolean
              performance_warnings?: boolean
              relid?: unknown
              security_warnings?: boolean
              use_incomment_options?: boolean
              without_warnings?: boolean
            }
            Returns: {
              context: string
              detail: string
              functionid: unknown
              hint: string
              level: string
              lineno: number
              message: string
              position: number
              query: string
              sqlstate: string
              statement: string
            }[]
          }
      plpgsql_check_pragma: { Args: { name: string[] }; Returns: number }
      plpgsql_check_profiler: { Args: { enable?: boolean }; Returns: boolean }
      plpgsql_check_tracer: {
        Args: { enable?: boolean; verbosity?: string }
        Returns: boolean
      }
      plpgsql_coverage_branches:
        | { Args: { funcoid: unknown }; Returns: number }
        | { Args: { name: string }; Returns: number }
      plpgsql_coverage_statements:
        | { Args: { funcoid: unknown }; Returns: number }
        | { Args: { name: string }; Returns: number }
      plpgsql_profiler_function_statements_tb:
        | {
            Args: { funcoid: unknown }
            Returns: {
              avg_time: number
              block_num: number
              exec_stmts: number
              exec_stmts_err: number
              lineno: number
              max_time: number
              parent_note: string
              parent_stmtid: number
              processed_rows: number
              queryid: number
              stmtid: number
              stmtname: string
              total_time: number
            }[]
          }
        | {
            Args: { name: string }
            Returns: {
              avg_time: number
              block_num: number
              exec_stmts: number
              exec_stmts_err: number
              lineno: number
              max_time: number
              parent_note: string
              parent_stmtid: number
              processed_rows: number
              queryid: number
              stmtid: number
              stmtname: string
              total_time: number
            }[]
          }
      plpgsql_profiler_function_tb:
        | {
            Args: { funcoid: unknown }
            Returns: {
              avg_time: number
              cmds_on_row: number
              exec_stmts: number
              exec_stmts_err: number
              lineno: number
              max_time: number[]
              processed_rows: number[]
              queryids: number[]
              source: string
              stmt_lineno: number
              total_time: number
            }[]
          }
        | {
            Args: { name: string }
            Returns: {
              avg_time: number
              cmds_on_row: number
              exec_stmts: number
              exec_stmts_err: number
              lineno: number
              max_time: number[]
              processed_rows: number[]
              queryids: number[]
              source: string
              stmt_lineno: number
              total_time: number
            }[]
          }
      plpgsql_profiler_functions_all: {
        Args: never
        Returns: {
          avg_time: number
          exec_count: number
          exec_stmts_err: number
          funcoid: unknown
          max_time: number
          min_time: number
          stddev_time: number
          total_time: number
        }[]
      }
      plpgsql_profiler_install_fake_queryid_hook: {
        Args: never
        Returns: undefined
      }
      plpgsql_profiler_remove_fake_queryid_hook: {
        Args: never
        Returns: undefined
      }
      plpgsql_profiler_reset: { Args: { funcoid: unknown }; Returns: undefined }
      plpgsql_profiler_reset_all: { Args: never; Returns: undefined }
      plpgsql_show_dependency_tb:
        | {
            Args: {
              anycompatiblerangetype?: unknown
              anycompatibletype?: unknown
              anyelememttype?: unknown
              anyenumtype?: unknown
              anyrangetype?: unknown
              fnname: string
              relid?: unknown
            }
            Returns: {
              name: string
              oid: unknown
              params: string
              schema: string
              type: string
            }[]
          }
        | {
            Args: {
              anycompatiblerangetype?: unknown
              anycompatibletype?: unknown
              anyelememttype?: unknown
              anyenumtype?: unknown
              anyrangetype?: unknown
              funcoid: unknown
              relid?: unknown
            }
            Returns: {
              name: string
              oid: unknown
              params: string
              schema: string
              type: string
            }[]
          }
      pode_escrever_modulo: {
        Args: { _clinica_id: string; _modulos: string[]; _user_id: string }
        Returns: boolean
      }
      procedimentos_popularidade: {
        Args: { p_clinica_id: string }
        Returns: {
          procedimento: string
          total: number
        }[]
      }
      prontuario_sequencia_ajustar: {
        Args: { _clinica_id: string; _ultima_pasta: number }
        Returns: {
          proximo: number
          pulados: number
        }[]
      }
      prontuario_sequencia_ver: {
        Args: { _clinica_id: string }
        Returns: {
          atualizado_em: string
          proximo: number
        }[]
      }
      reagendar_atendimento: {
        Args: {
          _destino_id: string
          _motivo?: string
          _origem_id: string
          _trilha_msg: string
        }
        Returns: Json
      }
      rechamar_senha: {
        Args: { _id: string }
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
      renovar_contrato_extensao: {
        Args: {
          _contrato_id: string
          _data_renovacao?: string
          _dependentes?: Json
          _observacao?: string
          _valor_mensal?: number
        }
        Returns: Json
      }
      renovar_contrato_troca_plano: {
        Args: {
          _cobrar_taxa_adesao?: boolean
          _contrato_id: string
          _convenio_novo_id: string
          _data_renovacao?: string
          _dependentes?: Json
          _observacao?: string
          _valor_mensal?: number
        }
        Returns: Json
      }
      resolver_clinica_por_token: {
        Args: { _token: string }
        Returns: {
          base_importada: boolean
          branding: Json
          cidade: string
          estado: string
          id: string
          nome: string
        }[]
      }
      resolver_clinica_publica: {
        Args: { _clinica_id: string }
        Returns: {
          base_importada: boolean
          branding: Json
          cidade: string
          estado: string
          id: string
          nome: string
        }[]
      }
      salvar_agendamento_e_vincular_orcamento: {
        Args: {
          _clinica_id: string
          _data_pagamento: string
          _editing_id: string
          _especialidade_id: string
          _fim: string
          _forma_pagamento_prevista: string
          _inicio: string
          _medico_id: string
          _observacoes: string
          _orcamento_id: string
          _orcamento_item_ids: string[]
          _paciente_id: string
          _paciente_nome: string
          _paciente_nome_esperado_no_slot: string
          _procedimento: string
          _status: string
          _tipo_atendimento: string
        }
        Returns: Json
      }
      salvar_agendamento_multi_imagem: {
        Args: {
          _clinica_id: string
          _data_pagamento: string
          _editing_id: string
          _especialidade_id: string
          _fim: string
          _forma_pagamento_prevista: string
          _grupo_id: string
          _inicio: string
          _medico_id: string
          _observacoes: string
          _orcamento_id: string
          _orcamento_item_ids?: string[]
          _paciente_id: string
          _paciente_nome: string
          _paciente_nome_esperado_no_slot: string
          _procedimentos: string[]
          _status: string
          _tipo_atendimento: string
        }
        Returns: Json
      }
      salvar_anamnese_publica: {
        Args: { _modelo_id: string; _respostas: Json; _token: string }
        Returns: string
      }
      seed_clinica_padrao: { Args: { _clinica_id: string }; Returns: undefined }
      seed_prontuario_modelos_padrao: {
        Args: { _clinica_id: string }
        Returns: undefined
      }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
      strip_accents: { Args: { _text: string }; Returns: string }
      tipo_atendimento_padrao: {
        Args: { p_clinica_id: string; p_paciente_id: string }
        Returns: string
      }
      top_procedimentos_agendamento: {
        Args: {
          _clinica_id: string
          _especialidade_id?: string
          _janela_dias?: number
          _limit?: number
          _tipo?: string
        }
        Returns: {
          grupo: string
          nome: string
          procedimento_id: string
          quantidade: number
          tipo: string
          ultimo_uso: string
        }[]
      }
      totem_checkin_cpf: {
        Args: { _clinica_id: string; _cpf: string }
        Returns: Json
      }
      totem_checkin_paciente: {
        Args: { _clinica_id: string; _paciente_id: string }
        Returns: Json
      }
      totem_match_biometria: {
        Args: { _clinica_id: string; _descriptor: Json; _threshold?: number }
        Returns: {
          distancia: number
          nome: string
          paciente_id: string
        }[]
      }
      totem_upsert_paciente: {
        Args: {
          _clinica_id: string
          _cpf?: string
          _descriptor?: Json
          _nome: string
          _telefone?: string
        }
        Returns: string
      }
      trocar_convenio_contrato: {
        Args: {
          _contrato_id: string
          _convenio_novo_id: string
          _data_inicio?: string
          _dependentes?: Json
          _observacao?: string
          _valor_mensal?: number
        }
        Returns: Json
      }
      tts_config_publico: {
        Args: { _clinica_id: string }
        Returns: {
          enabled: boolean
          piper_voice: string
          rate: number
        }[]
      }
      unaccent: { Args: { "": string }; Returns: string }
      user_is_any_manager: { Args: { _user_id: string }; Returns: boolean }
      verificar_certificado: { Args: { _codigo: string }; Returns: Json }
      vincular_convenio_contrato: {
        Args: { _contrato_id: string; _convenio_id: string }
        Returns: Json
      }
    }
    Enums: {
      agendamento_prioridade: "normal" | "prioritario" | "urgente"
      agendamento_status:
        | "agendado"
        | "confirmado"
        | "realizado"
        | "cancelado"
        | "faltou"
      alerta_enf_status: "aberto" | "em_contato" | "resolvido" | "sem_contato"
      app_role:
        | "admin"
        | "gestor"
        | "medico"
        | "enfermeiro"
        | "recepcao"
        | "financeiro"
        | "caixa"
        | "supervisor"
      app_role_global:
        | "admin"
        | "tesouraria"
        | "medico"
        | "enfermagem"
        | "recepcao"
        | "marketing"
        | "rh"
      caixa_mov_tipo:
        | "abertura"
        | "sangria"
        | "suprimento"
        | "recebimento"
        | "despesa"
        | "fechamento"
        | "estorno"
        | "reabertura"
        | "registro"
      caixa_sessao_status: "aberto" | "fechado"
      chat_canal_tipo: "direto" | "grupo" | "setor"
      crm_status: "aberta" | "ganha" | "perdida"
      estoque_movimento_tipo: "entrada" | "saida" | "ajuste"
      fin_status_lancamento: "pendente" | "confirmado" | "cancelado"
      fin_tipo_conta: "caixa" | "banco" | "cartao" | "maquininha" | "outro"
      fin_tipo_lancamento: "receita" | "despesa"
      fisio_marcacao_tipo:
        | "dor"
        | "edema"
        | "limitacao"
        | "contratura"
        | "parestesia"
        | "cicatriz"
        | "deformidade"
        | "outro"
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
      lms_licao_tipo: "video" | "texto" | "quiz"
      modulo_acesso: "none" | "read" | "write"
      odonto_imagem_categoria:
        | "intraoral"
        | "extraoral"
        | "radiografia_periapical"
        | "radiografia_panoramica"
        | "tomografia"
        | "foto_documentacao"
        | "outro"
      odonto_status:
        | "higido"
        | "cariado"
        | "restaurado"
        | "ausente"
        | "extracao_indicada"
        | "tratamento_canal"
        | "coroa"
        | "implante"
        | "protese"
        | "fratura"
        | "selante"
        | "sangramento"
        | "mobilidade"
        | "tartaro"
        | "aparelho"
        | "faceta"
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
      resultado_status: "pendente" | "normal" | "alterado" | "critico"
      split_beneficiario_tipo: "clinica" | "medico" | "prestador" | "outro"
      status_senha: "emitida" | "chamada" | "atendida" | "cancelada"
      tipo_documento:
        | "atestado"
        | "receita"
        | "laudo"
        | "declaracao"
        | "contrato"
        | "outro"
      tipo_senha: "N" | "P" | "C" | "R" | "T" | "E"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
      agendamento_prioridade: ["normal", "prioritario", "urgente"],
      agendamento_status: [
        "agendado",
        "confirmado",
        "realizado",
        "cancelado",
        "faltou",
      ],
      alerta_enf_status: ["aberto", "em_contato", "resolvido", "sem_contato"],
      app_role: [
        "admin",
        "gestor",
        "medico",
        "enfermeiro",
        "recepcao",
        "financeiro",
        "caixa",
        "supervisor",
      ],
      app_role_global: [
        "admin",
        "tesouraria",
        "medico",
        "enfermagem",
        "recepcao",
        "marketing",
        "rh",
      ],
      caixa_mov_tipo: [
        "abertura",
        "sangria",
        "suprimento",
        "recebimento",
        "despesa",
        "fechamento",
        "estorno",
        "reabertura",
        "registro",
      ],
      caixa_sessao_status: ["aberto", "fechado"],
      chat_canal_tipo: ["direto", "grupo", "setor"],
      crm_status: ["aberta", "ganha", "perdida"],
      estoque_movimento_tipo: ["entrada", "saida", "ajuste"],
      fin_status_lancamento: ["pendente", "confirmado", "cancelado"],
      fin_tipo_conta: ["caixa", "banco", "cartao", "maquininha", "outro"],
      fin_tipo_lancamento: ["receita", "despesa"],
      fisio_marcacao_tipo: [
        "dor",
        "edema",
        "limitacao",
        "contratura",
        "parestesia",
        "cicatriz",
        "deformidade",
        "outro",
      ],
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
      lms_licao_tipo: ["video", "texto", "quiz"],
      modulo_acesso: ["none", "read", "write"],
      odonto_imagem_categoria: [
        "intraoral",
        "extraoral",
        "radiografia_periapical",
        "radiografia_panoramica",
        "tomografia",
        "foto_documentacao",
        "outro",
      ],
      odonto_status: [
        "higido",
        "cariado",
        "restaurado",
        "ausente",
        "extracao_indicada",
        "tratamento_canal",
        "coroa",
        "implante",
        "protese",
        "fratura",
        "selante",
        "sangramento",
        "mobilidade",
        "tartaro",
        "aparelho",
        "faceta",
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
      resultado_status: ["pendente", "normal", "alterado", "critico"],
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
      tipo_senha: ["N", "P", "C", "R", "T", "E"],
    },
  },
} as const
