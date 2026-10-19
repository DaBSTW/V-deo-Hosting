import { NextResponse } from "next/server";
import { SESSION_COOKIE } from "@/server/auth/jwt";
import { route } from "@/server/http";

export const POST = route(async () => {
  const res = NextResponse.json({ ok: true });
  res.cookies.set({ name: SESSION_COOKIE, value: "", path: "/", maxAge: 0 });
  return res;
});
