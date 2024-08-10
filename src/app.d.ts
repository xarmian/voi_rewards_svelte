// See https://kit.svelte.dev/docs/types#app
// for information about these interfaces
import { SupabaseClient, Session, User } from '@supabase/supabase-js';
import { Database } from '$lib/database.types';

declare global {
	namespace App {
		// interface Error {}
		interface Locals {
			supabase: SupabaseClient<Database>;
			getUser(): Promise<User | null>;
			user: User;
		  }
		  interface PageData {
			session: Session | null;
		  }
		// interface PageData {}
		// interface Platform {}
	}
}

export {};
