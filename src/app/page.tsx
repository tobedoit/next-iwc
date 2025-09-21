import { redirect } from "next/navigation";

type SearchParams = Record<string, string | string[] | undefined>;

function toUrlSearchParams(searchParams: SearchParams) {
  const result = new URLSearchParams();
  for (const [key, value] of Object.entries(searchParams)) {
    if (typeof value === "string") {
      result.set(key, value);
    }
  }
  return result;
}

export default function Home({ searchParams }: { searchParams: SearchParams }) {
  const code = typeof searchParams.code === "string" ? searchParams.code : undefined;
  if (code) {
    const forwarded = toUrlSearchParams(searchParams).toString();
    const target = forwarded.length > 0 ? `/auth/callback?${forwarded}` : "/auth/callback";
    redirect(target);
  }

  redirect("/login");
}
