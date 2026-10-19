import { Suspense } from "react";
import { AuthForm } from "@/components/auth/AuthForm";

export const metadata = { title: "Iniciar sesión" };

export default function LoginPage() {
  return (
    <>
      <h1 className="mb-6 text-xl font-semibold">Iniciar sesión</h1>
      <Suspense>
        <AuthForm mode="login" />
      </Suspense>
    </>
  );
}
