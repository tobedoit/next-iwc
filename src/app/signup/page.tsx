import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import SignupForm from "./SignupForm";

export default async function SignupPage() {
  const supabase = await supabaseServer();
  const [{ data: sessionData }, { data: orgData, error }] = await Promise.all([
    supabase.auth.getSession(),
    supabase.from("orgs").select("id,name").order("name", { ascending: true }),
  ]);

  if (sessionData.session) {
    redirect("/leads");
  }

  if (error) {
    console.error("Failed to load org list", error);
    return <div className="p-6 text-red-500">지점 목록을 불러오지 못했습니다.</div>;
  }

  return <SignupForm orgs={orgData ?? []} />;
}
