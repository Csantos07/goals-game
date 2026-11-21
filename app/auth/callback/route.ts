import { type NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const requestedNext = request.nextUrl.searchParams.get("next") ?? "/";
  const safeNext = requestedNext.startsWith("/") && !requestedNext.startsWith("//")
    ? requestedNext
    : "/";
  const destination = new URL(safeNext, request.url);
  const code = request.nextUrl.searchParams.get("code");

  if (!code) {
    destination.searchParams.set("authError", "recovery");
    return NextResponse.redirect(destination);
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    destination.searchParams.set("authError", "recovery");
  }

  return NextResponse.redirect(destination);
}
