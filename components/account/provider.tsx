"use client";
import { createContext, useContext, useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { browserSupabase } from "@/lib/supabase/browser";
const Context = createContext<{
  user: User | null;
  loading: boolean;
  configured: boolean;
}>({ user: null, loading: true, configured: false });
export function AccountProvider({ children }: { children: React.ReactNode }) {
  const client = browserSupabase();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    if (!client) {
      queueMicrotask(() => setLoading(false));
      return;
    }
    let active = true;
    let changed = false;
    const {
      data: { subscription },
    } = client.auth.onAuthStateChange((_event, session) => {
      changed = true;
      if (active) {
        setUser(session?.user ?? null);
        setLoading(false);
      }
    });
    void client.auth
      .getUser()
      .then(({ data }) => {
        if (active && !changed) {
          setUser(data.user);
          setLoading(false);
        }
      })
      .catch(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [client]);
  return (
    <Context.Provider value={{ user, loading, configured: !!client }}>
      {children}
    </Context.Provider>
  );
}
export function useAccount() {
  return useContext(Context);
}
