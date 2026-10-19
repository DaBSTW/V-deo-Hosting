import { Suspense } from "react";
import { AuthForm } from "@/components/auth/AuthForm";

export const metadata = { title: "Crear cuenta" };

export default function RegisterPage() {
  return (
    <>
      <h1 className="mb-6 text-xl font-semibold">Crear cuenta</h1>
      <Suspense>
        <AuthForm mode="register" />
      </Suspense>
    </>
  );
}
