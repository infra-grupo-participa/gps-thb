"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

/** Encerra a sessão e volta ao login. redirect() lida bem com o proxy da Hostinger. */
export async function sair() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
