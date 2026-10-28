"use client";
import type {Database} from './database.types'
import { createBrowserClient } from "@supabase/ssr";
import { supabaseConfig } from "./config";
export function browserSupabase() {
  const config = supabaseConfig();
  return config ? createBrowserClient<Database>(config.url, config.key) : null;
}
