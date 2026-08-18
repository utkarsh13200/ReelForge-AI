import { Suspense } from "react";
import { LoginForm } from "@/components/auth/login-form";

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="min-h-screen mesh-bg" aria-busy="true" aria-label="Loading login" />}>
      <LoginForm />
    </Suspense>
  );
}
