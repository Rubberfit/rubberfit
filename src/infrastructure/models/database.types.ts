export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      addresses: {
        Row: {
          address_line1: string
          address_line2: string | null
          city: string
          country: string
          created_at: string
          created_by: string | null
          deleted_at: string | null
          id: string
          postal_code: string
          state: string
          tenant_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          address_line1: string
          address_line2?: string | null
          city: string
          country?: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          postal_code: string
          state: string
          tenant_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          address_line1?: string
          address_line2?: string | null
          city?: string
          country?: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          postal_code?: string
          state?: string
          tenant_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "addresses_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      cut_favorites: {
        Row: {
          created_at: string
          created_by: string | null
          cut_history_id: string
          deleted_at: string | null
          id: string
          tenant_id: string
          updated_at: string
          updated_by: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          cut_history_id: string
          deleted_at?: string | null
          id?: string
          tenant_id: string
          updated_at?: string
          updated_by?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          cut_history_id?: string
          deleted_at?: string | null
          id?: string
          tenant_id?: string
          updated_at?: string
          updated_by?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cut_favorites_cut_history_id_fkey"
            columns: ["cut_history_id"]
            isOneToOne: false
            referencedRelation: "cut_history"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cut_favorites_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      cut_history: {
        Row: {
          cost_per_sqm_cents: number | null
          created_at: string
          created_by: string | null
          cut_amount: number
          cut_date: string
          cut_length_mm: number
          cut_pieces: number
          cut_thickness_mm: number | null
          cut_width_mm: number
          deleted_at: string | null
          fab_score: number | null
          id: string
          material_type_id: string
          material_used_sqmm: number
          part_custom_dimensions: Json | null
          part_custom_height_mm: number | null
          part_custom_width_mm: number | null
          part_id: string | null
          parts_completed: number
          pdf_url: string | null
          scrap_sqmm: number
          stock_label: string | null
          tenant_id: string
          updated_at: string
          updated_by: string | null
          user_id: string | null
        }
        Insert: {
          cost_per_sqm_cents?: number | null
          created_at?: string
          created_by?: string | null
          cut_amount?: number
          cut_date?: string
          cut_length_mm: number
          cut_pieces?: number
          cut_thickness_mm?: number | null
          cut_width_mm: number
          deleted_at?: string | null
          fab_score?: number | null
          id?: string
          material_type_id: string
          material_used_sqmm?: number
          part_custom_dimensions?: Json | null
          part_custom_height_mm?: number | null
          part_custom_width_mm?: number | null
          part_id?: string | null
          parts_completed?: number
          pdf_url?: string | null
          scrap_sqmm?: number
          stock_label?: string | null
          tenant_id: string
          updated_at?: string
          updated_by?: string | null
          user_id?: string | null
        }
        Update: {
          cost_per_sqm_cents?: number | null
          created_at?: string
          created_by?: string | null
          cut_amount?: number
          cut_date?: string
          cut_length_mm?: number
          cut_pieces?: number
          cut_thickness_mm?: number | null
          cut_width_mm?: number
          deleted_at?: string | null
          fab_score?: number | null
          id?: string
          material_type_id?: string
          material_used_sqmm?: number
          part_custom_dimensions?: Json | null
          part_custom_height_mm?: number | null
          part_custom_width_mm?: number | null
          part_id?: string | null
          parts_completed?: number
          pdf_url?: string | null
          scrap_sqmm?: number
          stock_label?: string | null
          tenant_id?: string
          updated_at?: string
          updated_by?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cut_history_material_type_id_fkey"
            columns: ["material_type_id"]
            isOneToOne: false
            referencedRelation: "material_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cut_history_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      cut_history_selection: {
        Row: {
          created_at: string
          created_by: string | null
          cut_history_id: string
          id: string
          label: string | null
          selection_index: number
          size_text: string | null
          size_value: number | null
          tenant_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          cut_history_id: string
          id?: string
          label?: string | null
          selection_index: number
          size_text?: string | null
          size_value?: number | null
          tenant_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          cut_history_id?: string
          id?: string
          label?: string | null
          selection_index?: number
          size_text?: string | null
          size_value?: number | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cut_history_selection_cut_history_id_fkey"
            columns: ["cut_history_id"]
            isOneToOne: false
            referencedRelation: "cut_history"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cut_history_selection_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      cuts: {
        Row: {
          created_at: string
          created_by: string | null
          cut_by: string | null
          cut_length_mm: number
          cut_width_mm: number
          deleted_at: string | null
          id: string
          job_reference: string | null
          notes: string | null
          quantity: number
          roll_id: string | null
          tenant_id: string
          total_sqmm_used: number | null
          updated_at: string
          updated_by: string | null
          waste_percentage: number | null
          waste_sqmm: number | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          cut_by?: string | null
          cut_length_mm: number
          cut_width_mm: number
          deleted_at?: string | null
          id?: string
          job_reference?: string | null
          notes?: string | null
          quantity?: number
          roll_id?: string | null
          tenant_id: string
          total_sqmm_used?: number | null
          updated_at?: string
          updated_by?: string | null
          waste_percentage?: number | null
          waste_sqmm?: number | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          cut_by?: string | null
          cut_length_mm?: number
          cut_width_mm?: number
          deleted_at?: string | null
          id?: string
          job_reference?: string | null
          notes?: string | null
          quantity?: number
          roll_id?: string | null
          tenant_id?: string
          total_sqmm_used?: number | null
          updated_at?: string
          updated_by?: string | null
          waste_percentage?: number | null
          waste_sqmm?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "cuts_roll_id_fkey"
            columns: ["roll_id"]
            isOneToOne: false
            referencedRelation: "rolls"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cuts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          balance_cents: number
          billing_address_id: string | null
          created_at: string
          created_by: string | null
          currency: string
          deleted_at: string | null
          discount_cents: number
          due_date: string | null
          id: string
          invoice_number: string
          issue_date: string
          notes: string | null
          paid_at: string | null
          paid_cents: number
          payment_terms: string | null
          pdf_url: string | null
          person_id: string | null
          project_id: string | null
          sent_at: string | null
          status: string
          subtotal_cents: number
          tax_cents: number
          tenant_id: string
          total_cents: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          balance_cents?: number
          billing_address_id?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          deleted_at?: string | null
          discount_cents?: number
          due_date?: string | null
          id?: string
          invoice_number: string
          issue_date?: string
          notes?: string | null
          paid_at?: string | null
          paid_cents?: number
          payment_terms?: string | null
          pdf_url?: string | null
          person_id?: string | null
          project_id?: string | null
          sent_at?: string | null
          status?: string
          subtotal_cents?: number
          tax_cents?: number
          tenant_id: string
          total_cents?: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          balance_cents?: number
          billing_address_id?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          deleted_at?: string | null
          discount_cents?: number
          due_date?: string | null
          id?: string
          invoice_number?: string
          issue_date?: string
          notes?: string | null
          paid_at?: string | null
          paid_cents?: number
          payment_terms?: string | null
          pdf_url?: string | null
          person_id?: string | null
          project_id?: string | null
          sent_at?: string | null
          status?: string
          subtotal_cents?: number
          tax_cents?: number
          tenant_id?: string
          total_cents?: number
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "invoices_billing_address_id_fkey"
            columns: ["billing_address_id"]
            isOneToOne: false
            referencedRelation: "addresses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "persons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      jobs: {
        Row: {
          completed_date: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          description: string
          id: string
          invoice_id: string | null
          location: string | null
          person_id: string | null
          project_id: string
          start_date: string | null
          status: string
          tenant_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          completed_date?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          description: string
          id?: string
          invoice_id?: string | null
          location?: string | null
          person_id?: string | null
          project_id: string
          start_date?: string | null
          status?: string
          tenant_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          completed_date?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          description?: string
          id?: string
          invoice_id?: string | null
          location?: string | null
          person_id?: string | null
          project_id?: string
          start_date?: string | null
          status?: string
          tenant_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "jobs_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jobs_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "persons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jobs_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jobs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      material_suppliers: {
        Row: {
          active: boolean
          cost_per_sqm_cents: number
          created_at: string
          created_by: string | null
          deleted_at: string | null
          effective_date: string
          expiration_date: string | null
          id: string
          lead_time_days: number
          material_type_id: string
          minimum_order_sqm: number
          notes: string | null
          preferred_supplier: boolean
          supplier_id: string
          supplier_material_code: string | null
          tenant_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          active?: boolean
          cost_per_sqm_cents: number
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          effective_date?: string
          expiration_date?: string | null
          id?: string
          lead_time_days?: number
          material_type_id: string
          minimum_order_sqm?: number
          notes?: string | null
          preferred_supplier?: boolean
          supplier_id: string
          supplier_material_code?: string | null
          tenant_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          active?: boolean
          cost_per_sqm_cents?: number
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          effective_date?: string
          expiration_date?: string | null
          id?: string
          lead_time_days?: number
          material_type_id?: string
          minimum_order_sqm?: number
          notes?: string | null
          preferred_supplier?: boolean
          supplier_id?: string
          supplier_material_code?: string | null
          tenant_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "material_suppliers_material_type_id_fkey"
            columns: ["material_type_id"]
            isOneToOne: false
            referencedRelation: "material_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "material_suppliers_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "material_suppliers_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      material_types: {
        Row: {
          created_at: string
          created_by: string | null
          deleted_at: string | null
          description: string | null
          id: string
          min_stock_sqm: number | null
          name: string
          tenant_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          description?: string | null
          id?: string
          min_stock_sqm?: number | null
          name: string
          tenant_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          description?: string | null
          id?: string
          min_stock_sqm?: number | null
          name?: string
          tenant_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "material_types_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      memberships: {
        Row: {
          created_at: string
          created_by: string | null
          deleted_at: string | null
          id: string
          invited_by: string | null
          profile_id: string
          roles: string[]
          tenant_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          invited_by?: string | null
          profile_id: string
          roles?: string[]
          tenant_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          invited_by?: string | null
          profile_id?: string
          roles?: string[]
          tenant_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "memberships_invited_by_fkey"
            columns: ["invited_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "memberships_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "memberships_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_queue: {
        Row: {
          context_data: Json
          created_at: string
          email_delivered_at: string | null
          email_error_message: string | null
          email_failed_at: string | null
          email_sent_at: string | null
          id: string
          max_retries: number
          message: string
          next_retry_at: string | null
          notification_type: string
          priority: string
          retry_count: number
          scheduled_for: string
          send_email: boolean
          send_sms: boolean
          sms_delivered_at: string | null
          sms_error_message: string | null
          sms_failed_at: string | null
          sms_sent_at: string | null
          status: string
          tenant_id: string
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          context_data?: Json
          created_at?: string
          email_delivered_at?: string | null
          email_error_message?: string | null
          email_failed_at?: string | null
          email_sent_at?: string | null
          id?: string
          max_retries?: number
          message: string
          next_retry_at?: string | null
          notification_type: string
          priority?: string
          retry_count?: number
          scheduled_for?: string
          send_email?: boolean
          send_sms?: boolean
          sms_delivered_at?: string | null
          sms_error_message?: string | null
          sms_failed_at?: string | null
          sms_sent_at?: string | null
          status?: string
          tenant_id: string
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          context_data?: Json
          created_at?: string
          email_delivered_at?: string | null
          email_error_message?: string | null
          email_failed_at?: string | null
          email_sent_at?: string | null
          id?: string
          max_retries?: number
          message?: string
          next_retry_at?: string | null
          notification_type?: string
          priority?: string
          retry_count?: number
          scheduled_for?: string
          send_email?: boolean
          send_sms?: boolean
          sms_delivered_at?: string | null
          sms_error_message?: string | null
          sms_failed_at?: string | null
          sms_sent_at?: string | null
          status?: string
          tenant_id?: string
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_queue_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          created_at: string
          current_value: number | null
          description: string | null
          id: string
          is_read: boolean
          material_type: string | null
          read_at: string | null
          tenant_id: string
          threshold_value: number | null
          title: string
          type: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          current_value?: number | null
          description?: string | null
          id?: string
          is_read?: boolean
          material_type?: string | null
          read_at?: string | null
          tenant_id: string
          threshold_value?: number | null
          title: string
          type: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          current_value?: number | null
          description?: string | null
          id?: string
          is_read?: boolean
          material_type?: string | null
          read_at?: string | null
          tenant_id?: string
          threshold_value?: number | null
          title?: string
          type?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      persons: {
        Row: {
          created_at: string
          created_by: string | null
          deleted_at: string | null
          email: string | null
          first_name: string
          id: string
          last_name: string
          mobile: string | null
          notes: string | null
          phone: string | null
          profile_id: string | null
          tenant_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          email?: string | null
          first_name: string
          id?: string
          last_name: string
          mobile?: string | null
          notes?: string | null
          phone?: string | null
          profile_id?: string | null
          tenant_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          email?: string | null
          first_name?: string
          id?: string
          last_name?: string
          mobile?: string | null
          notes?: string | null
          phone?: string | null
          profile_id?: string | null
          tenant_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "persons_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "persons_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      plans: {
        Row: {
          billing_interval: string
          code: string
          created_at: string
          created_by: string | null
          currency: string
          deleted_at: string | null
          description: string | null
          features: Json
          id: string
          is_active: boolean
          is_public: boolean
          name: string
          price_cents: number
          seat_limit: number | null
          sort_order: number
          stripe_price_id: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          billing_interval: string
          code: string
          created_at?: string
          created_by?: string | null
          currency?: string
          deleted_at?: string | null
          description?: string | null
          features?: Json
          id?: string
          is_active?: boolean
          is_public?: boolean
          name: string
          price_cents: number
          seat_limit?: number | null
          sort_order?: number
          stripe_price_id?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          billing_interval?: string
          code?: string
          created_at?: string
          created_by?: string | null
          currency?: string
          deleted_at?: string | null
          description?: string | null
          features?: Json
          id?: string
          is_active?: boolean
          is_public?: boolean
          name?: string
          price_cents?: number
          seat_limit?: number | null
          sort_order?: number
          stripe_price_id?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      price_history: {
        Row: {
          change_reason: string | null
          changed_by: string | null
          created_at: string
          effective_date: string
          id: string
          material_supplier_id: string
          new_cost_per_sqm_cents: number
          notes: string | null
          old_cost_per_sqm_cents: number | null
          price_change_percentage: number | null
          tenant_id: string
        }
        Insert: {
          change_reason?: string | null
          changed_by?: string | null
          created_at?: string
          effective_date?: string
          id?: string
          material_supplier_id: string
          new_cost_per_sqm_cents: number
          notes?: string | null
          old_cost_per_sqm_cents?: number | null
          price_change_percentage?: number | null
          tenant_id: string
        }
        Update: {
          change_reason?: string | null
          changed_by?: string | null
          created_at?: string
          effective_date?: string
          id?: string
          material_supplier_id?: string
          new_cost_per_sqm_cents?: number
          notes?: string | null
          old_cost_per_sqm_cents?: number | null
          price_change_percentage?: number | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "price_history_material_supplier_id_fkey"
            columns: ["material_supplier_id"]
            isOneToOne: false
            referencedRelation: "material_suppliers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "price_history_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          email: string | null
          first_name: string | null
          full_name: string | null
          id: string
          is_platform_admin: boolean
          last_name: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          first_name?: string | null
          full_name?: string | null
          id: string
          is_platform_admin?: boolean
          last_name?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string | null
          first_name?: string | null
          full_name?: string | null
          id?: string
          is_platform_admin?: boolean
          last_name?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      project_cut_histories: {
        Row: {
          created_at: string
          created_by: string | null
          cut_history_id: string
          deleted_at: string | null
          id: string
          project_id: string
          tenant_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          cut_history_id: string
          deleted_at?: string | null
          id?: string
          project_id: string
          tenant_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          cut_history_id?: string
          deleted_at?: string | null
          id?: string
          project_id?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_cut_histories_cut_history_id_fkey"
            columns: ["cut_history_id"]
            isOneToOne: false
            referencedRelation: "cut_history"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_cut_histories_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_cut_histories_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      project_materials: {
        Row: {
          allocated_quantity_sqm: number
          created_at: string
          created_by: string | null
          deleted_at: string | null
          id: string
          material_type_id: string
          notes: string | null
          project_id: string
          required_quantity_sqm: number | null
          tenant_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          allocated_quantity_sqm?: number
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          material_type_id: string
          notes?: string | null
          project_id: string
          required_quantity_sqm?: number | null
          tenant_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          allocated_quantity_sqm?: number
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          material_type_id?: string
          notes?: string | null
          project_id?: string
          required_quantity_sqm?: number | null
          tenant_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "project_materials_material_type_id_fkey"
            columns: ["material_type_id"]
            isOneToOne: false
            referencedRelation: "material_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_materials_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_materials_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      project_owners: {
        Row: {
          created_at: string
          created_by: string | null
          deleted_at: string | null
          id: string
          owner_profile_id: string
          project_id: string
          tenant_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          owner_profile_id: string
          project_id: string
          tenant_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          owner_profile_id?: string
          project_id?: string
          tenant_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "project_owners_owner_profile_id_fkey"
            columns: ["owner_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_owners_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_owners_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      projects: {
        Row: {
          budget_cents: number | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          description: string | null
          end_date: string | null
          id: string
          name: string
          notes: string | null
          person_id: string | null
          start_date: string | null
          status: string
          tenant_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          budget_cents?: number | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          description?: string | null
          end_date?: string | null
          id?: string
          name: string
          notes?: string | null
          person_id?: string | null
          start_date?: string | null
          status?: string
          tenant_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          budget_cents?: number | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          description?: string | null
          end_date?: string | null
          id?: string
          name?: string
          notes?: string | null
          person_id?: string | null
          start_date?: string | null
          status?: string
          tenant_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "projects_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "persons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projects_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_order_items: {
        Row: {
          color: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          description: string | null
          id: string
          length_mm: number | null
          line_number: number
          line_total_cents: number
          material_type_id: string
          notes: string | null
          purchase_order_id: string
          quantity_received_sqm: number
          quantity_sqm: number
          received_date: string | null
          tenant_id: string
          thickness_mm: number | null
          unit_cost_cents: number
          updated_at: string
          updated_by: string | null
          width_mm: number | null
        }
        Insert: {
          color?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          description?: string | null
          id?: string
          length_mm?: number | null
          line_number: number
          line_total_cents: number
          material_type_id: string
          notes?: string | null
          purchase_order_id: string
          quantity_received_sqm?: number
          quantity_sqm: number
          received_date?: string | null
          tenant_id: string
          thickness_mm?: number | null
          unit_cost_cents: number
          updated_at?: string
          updated_by?: string | null
          width_mm?: number | null
        }
        Update: {
          color?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          description?: string | null
          id?: string
          length_mm?: number | null
          line_number?: number
          line_total_cents?: number
          material_type_id?: string
          notes?: string | null
          purchase_order_id?: string
          quantity_received_sqm?: number
          quantity_sqm?: number
          received_date?: string | null
          tenant_id?: string
          thickness_mm?: number | null
          unit_cost_cents?: number
          updated_at?: string
          updated_by?: string | null
          width_mm?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "purchase_order_items_material_type_id_fkey"
            columns: ["material_type_id"]
            isOneToOne: false
            referencedRelation: "material_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_order_items_purchase_order_id_fkey"
            columns: ["purchase_order_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_order_items_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_orders: {
        Row: {
          actual_delivery_date: string | null
          approved_at: string | null
          approved_by: string | null
          auto_generated: boolean
          billing_address_id: string | null
          created_at: string
          created_by: string | null
          currency: string
          deleted_at: string | null
          id: string
          notes: string | null
          order_date: string | null
          payment_terms: string | null
          po_number: string
          reorder_rule_id: string | null
          requested_delivery_date: string | null
          shipping_address_id: string | null
          shipping_cost_cents: number
          status: string
          subtotal_cents: number
          supplier_id: string
          tax_amount_cents: number
          tenant_id: string
          total_amount_cents: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          actual_delivery_date?: string | null
          approved_at?: string | null
          approved_by?: string | null
          auto_generated?: boolean
          billing_address_id?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          deleted_at?: string | null
          id?: string
          notes?: string | null
          order_date?: string | null
          payment_terms?: string | null
          po_number: string
          reorder_rule_id?: string | null
          requested_delivery_date?: string | null
          shipping_address_id?: string | null
          shipping_cost_cents?: number
          status?: string
          subtotal_cents?: number
          supplier_id: string
          tax_amount_cents?: number
          tenant_id: string
          total_amount_cents?: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          actual_delivery_date?: string | null
          approved_at?: string | null
          approved_by?: string | null
          auto_generated?: boolean
          billing_address_id?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          deleted_at?: string | null
          id?: string
          notes?: string | null
          order_date?: string | null
          payment_terms?: string | null
          po_number?: string
          reorder_rule_id?: string | null
          requested_delivery_date?: string | null
          shipping_address_id?: string | null
          shipping_cost_cents?: number
          status?: string
          subtotal_cents?: number
          supplier_id?: string
          tax_amount_cents?: number
          tenant_id?: string
          total_amount_cents?: number
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "purchase_orders_billing_address_id_fkey"
            columns: ["billing_address_id"]
            isOneToOne: false
            referencedRelation: "addresses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_orders_reorder_rule_id_fkey"
            columns: ["reorder_rule_id"]
            isOneToOne: false
            referencedRelation: "reorder_rules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_orders_shipping_address_id_fkey"
            columns: ["shipping_address_id"]
            isOneToOne: false
            referencedRelation: "addresses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_orders_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_orders_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      reorder_rules: {
        Row: {
          active: boolean
          auto_reorder: boolean
          created_at: string
          created_by: string | null
          deleted_at: string | null
          id: string
          last_triggered_at: string | null
          lead_time_days: number
          material_type_id: string
          max_stock_level_sqm: number | null
          notes: string | null
          reorder_point_sqm: number
          reorder_quantity_sqm: number
          safety_stock_days: number
          supplier_id: string | null
          tenant_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          active?: boolean
          auto_reorder?: boolean
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          last_triggered_at?: string | null
          lead_time_days?: number
          material_type_id: string
          max_stock_level_sqm?: number | null
          notes?: string | null
          reorder_point_sqm: number
          reorder_quantity_sqm: number
          safety_stock_days?: number
          supplier_id?: string | null
          tenant_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          active?: boolean
          auto_reorder?: boolean
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          last_triggered_at?: string | null
          lead_time_days?: number
          material_type_id?: string
          max_stock_level_sqm?: number | null
          notes?: string | null
          reorder_point_sqm?: number
          reorder_quantity_sqm?: number
          safety_stock_days?: number
          supplier_id?: string | null
          tenant_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "reorder_rules_material_type_id_fkey"
            columns: ["material_type_id"]
            isOneToOne: true
            referencedRelation: "material_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reorder_rules_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reorder_rules_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      rolls: {
        Row: {
          color: string | null
          cost_per_sqm_cents: number | null
          created_at: string
          created_by: string | null
          date_received: string
          deleted_at: string | null
          id: string
          length_mm: number
          location: string | null
          material_type_id: string
          notes: string | null
          parent_roll_id: string | null
          qr_generated_at: string | null
          remaining_length_mm: number
          source_cut_history_id: string | null
          source_type: string
          status: string
          supplier_id: string | null
          tenant_id: string
          thickness_mm: number
          updated_at: string
          updated_by: string | null
          width_mm: number
        }
        Insert: {
          color?: string | null
          cost_per_sqm_cents?: number | null
          created_at?: string
          created_by?: string | null
          date_received?: string
          deleted_at?: string | null
          id?: string
          length_mm: number
          location?: string | null
          material_type_id: string
          notes?: string | null
          parent_roll_id?: string | null
          qr_generated_at?: string | null
          remaining_length_mm: number
          source_cut_history_id?: string | null
          source_type?: string
          status?: string
          supplier_id?: string | null
          tenant_id: string
          thickness_mm: number
          updated_at?: string
          updated_by?: string | null
          width_mm: number
        }
        Update: {
          color?: string | null
          cost_per_sqm_cents?: number | null
          created_at?: string
          created_by?: string | null
          date_received?: string
          deleted_at?: string | null
          id?: string
          length_mm?: number
          location?: string | null
          material_type_id?: string
          notes?: string | null
          parent_roll_id?: string | null
          qr_generated_at?: string | null
          remaining_length_mm?: number
          source_cut_history_id?: string | null
          source_type?: string
          status?: string
          supplier_id?: string | null
          tenant_id?: string
          thickness_mm?: number
          updated_at?: string
          updated_by?: string | null
          width_mm?: number
        }
        Relationships: [
          {
            foreignKeyName: "rolls_material_type_id_fkey"
            columns: ["material_type_id"]
            isOneToOne: false
            referencedRelation: "material_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rolls_parent_roll_id_fkey"
            columns: ["parent_roll_id"]
            isOneToOne: false
            referencedRelation: "rolls"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rolls_source_cut_history_id_fkey"
            columns: ["source_cut_history_id"]
            isOneToOne: false
            referencedRelation: "cut_history"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rolls_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rolls_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      subscriptions: {
        Row: {
          cancel_at: string | null
          canceled_at: string | null
          created_at: string
          created_by: string | null
          current_period_end: string | null
          current_period_start: string | null
          deleted_at: string | null
          id: string
          plan_id: string
          status: string
          stripe_subscription_id: string | null
          tenant_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          cancel_at?: string | null
          canceled_at?: string | null
          created_at?: string
          created_by?: string | null
          current_period_end?: string | null
          current_period_start?: string | null
          deleted_at?: string | null
          id?: string
          plan_id: string
          status: string
          stripe_subscription_id?: string | null
          tenant_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          cancel_at?: string | null
          canceled_at?: string | null
          created_at?: string
          created_by?: string | null
          current_period_end?: string | null
          current_period_start?: string | null
          deleted_at?: string | null
          id?: string
          plan_id?: string
          status?: string
          stripe_subscription_id?: string | null
          tenant_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "subscriptions_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscriptions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      supplier_contacts: {
        Row: {
          created_at: string
          created_by: string | null
          deleted_at: string | null
          department: string | null
          id: string
          is_active: boolean
          is_primary: boolean
          person_id: string
          role: string | null
          supplier_id: string
          tenant_id: string
          title: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          department?: string | null
          id?: string
          is_active?: boolean
          is_primary?: boolean
          person_id: string
          role?: string | null
          supplier_id: string
          tenant_id: string
          title?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          department?: string | null
          id?: string
          is_active?: boolean
          is_primary?: boolean
          person_id?: string
          role?: string | null
          supplier_id?: string
          tenant_id?: string
          title?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "supplier_contacts_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "persons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_contacts_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_contacts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      suppliers: {
        Row: {
          active: boolean
          address_id: string | null
          created_at: string
          created_by: string | null
          currency: string
          deleted_at: string | null
          email: string | null
          general_phone: string | null
          id: string
          name: string
          notes: string | null
          payment_terms: string | null
          preferred: boolean
          rating: number | null
          shipping_cost_cents: number | null
          tax_exempt: boolean
          tax_id: string | null
          tax_rate: number | null
          tenant_id: string
          updated_at: string
          updated_by: string | null
          website: string | null
        }
        Insert: {
          active?: boolean
          address_id?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          deleted_at?: string | null
          email?: string | null
          general_phone?: string | null
          id?: string
          name: string
          notes?: string | null
          payment_terms?: string | null
          preferred?: boolean
          rating?: number | null
          shipping_cost_cents?: number | null
          tax_exempt?: boolean
          tax_id?: string | null
          tax_rate?: number | null
          tenant_id: string
          updated_at?: string
          updated_by?: string | null
          website?: string | null
        }
        Update: {
          active?: boolean
          address_id?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          deleted_at?: string | null
          email?: string | null
          general_phone?: string | null
          id?: string
          name?: string
          notes?: string | null
          payment_terms?: string | null
          preferred?: boolean
          rating?: number | null
          shipping_cost_cents?: number | null
          tax_exempt?: boolean
          tax_id?: string | null
          tax_rate?: number | null
          tenant_id?: string
          updated_at?: string
          updated_by?: string | null
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "suppliers_address_id_fkey"
            columns: ["address_id"]
            isOneToOne: false
            referencedRelation: "addresses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "suppliers_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tax_rates: {
        Row: {
          city: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          effective_date: string
          id: string
          is_active: boolean
          source: string
          state: string
          tax_name: string
          tax_rate: number
          updated_at: string
          updated_by: string | null
          zip_code: string | null
        }
        Insert: {
          city?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          effective_date?: string
          id?: string
          is_active?: boolean
          source?: string
          state: string
          tax_name: string
          tax_rate: number
          updated_at?: string
          updated_by?: string | null
          zip_code?: string | null
        }
        Update: {
          city?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          effective_date?: string
          id?: string
          is_active?: boolean
          source?: string
          state?: string
          tax_name?: string
          tax_rate?: number
          updated_at?: string
          updated_by?: string | null
          zip_code?: string | null
        }
        Relationships: []
      }
      tenant_settings: {
        Row: {
          created_at: string
          date_format: string
          default_currency: string
          inventory_settings: Json
          tenant_id: string
          timezone: string
          unit_system: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          date_format?: string
          default_currency?: string
          inventory_settings?: Json
          tenant_id: string
          timezone?: string
          unit_system?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          date_format?: string
          default_currency?: string
          inventory_settings?: Json
          tenant_id?: string
          timezone?: string
          unit_system?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tenant_settings_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenants: {
        Row: {
          billing_email: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          id: string
          logo_url: string | null
          name: string
          slug: string
          status: string
          stripe_customer_id: string | null
          trial_ends_at: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          billing_email?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          logo_url?: string | null
          name: string
          slug: string
          status?: string
          stripe_customer_id?: string | null
          trial_ends_at?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          billing_email?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          logo_url?: string | null
          name?: string
          slug?: string
          status?: string
          stripe_customer_id?: string | null
          trial_ends_at?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      user_preferences: {
        Row: {
          created_at: string
          notification_preferences: Json
          profile_id: string
          ui_preferences: Json
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          notification_preferences?: Json
          profile_id: string
          ui_preferences?: Json
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          notification_preferences?: Json
          profile_id?: string
          ui_preferences?: Json
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "user_preferences_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      auth_is_platform_admin: { Args: never; Returns: boolean }
      auth_user_is_admin_of: {
        Args: { target_tenant_id: string }
        Returns: boolean
      }
      auth_user_tenant_ids: { Args: never; Returns: string[] }
    }
    Enums: {
      [_ in never]: never
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
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const
