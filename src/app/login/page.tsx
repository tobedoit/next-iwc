import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import LoginForm from "./LoginForm";

export default async function LoginPage() {
  const supabase = await supabaseServer();
  const { data } = await supabase.auth.getSession();
  if (data.session) {
    redirect("/leads");
  }

  return <LoginForm />;
}
