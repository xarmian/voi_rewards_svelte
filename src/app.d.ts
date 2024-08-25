import type { User, SupabaseClient, User } from '@supabase/supabase-js'

declare global {
  namespace App {
    // interface Error {}
    interface Locals {
      supabase: SupabaseClient
      getUser: () => Promise< User | null>
      session: Session | null
      user: User | null
    }
    // interface PageState {}
    // interface Platform {}
  }
}

export {}