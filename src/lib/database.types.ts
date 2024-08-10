// src/lib/database.types.ts
export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json }
  | Json[]

  export interface Database {
    public: {
      Tables: {
        users: {
          Row: {
            id: string
            discord_id: string
            username: string
            email: string
            created_at: string
            updated_at: string
          }
          Insert: {
            id?: string
            discord_id: string
            username: string
            email: string
            created_at?: string
            updated_at?: string
          }
          Update: {
            id?: string
            discord_id?: string
            username?: string
            email?: string
            created_at?: string
            updated_at?: string
          }
        }
      }
    }
  }