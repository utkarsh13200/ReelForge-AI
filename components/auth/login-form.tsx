"use client";

import { useFormState, useFormStatus } from "react-dom";
import { useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { ArrowRight, CheckCircle2, Sparkles } from "lucide-react";
import { BrandLogo } from "@/components/marketing/brand-logo";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { hasSupabaseEnv } from "@/lib/supabase/client";
import {
  signInWithEmail,
  signInWithGoogle,
  signUpWithEmail,
  type AuthActionState,
} from "@/app/login/actions";

const FEATURES = [
  "Six-module production pipeline",
  "Free visuals & voice generation",
  "YouTube-ready MP4 export",
] as const;

const initialState: AuthActionState = {};

function GoogleButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="outline" className="w-full" disabled={pending}>
      {pending ? "Redirecting to Google…" : "Continue with Google"}
    </Button>
  );
}

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" className="w-full" disabled={pending}>
      {pending ? "Please wait…" : label}
      {!pending ? <ArrowRight className="h-4 w-4" /> : null}
    </Button>
  );
}

export function LoginForm() {
  const params = useSearchParams();
  const [mode, setMode] = useState<"sign-in" | "sign-up">("sign-in");
  const [signInState, signInAction] = useFormState(signInWithEmail, initialState);
  const [signUpState, signUpAction] = useFormState(signUpWithEmail, initialState);
  const setup = params.get("setup") === "1";
  const authError = params.get("error");

  const state = mode === "sign-in" ? signInState : signUpState;
  const formAction = mode === "sign-in" ? signInAction : signUpAction;

  return (
    <div className="min-h-screen mesh-bg lg:grid lg:grid-cols-2">
      <div className="relative hidden flex-col justify-between overflow-hidden border-r border-white/10 p-10 lg:flex">
        <div className="absolute inset-0 bg-gradient-to-br from-forge/10 via-transparent to-transparent" />
        <div className="relative">
          <BrandLogo href="/" />
        </div>
        <div className="relative space-y-6">
          <Badge variant="secondary" className="border-white/10">
            <Sparkles className="mr-1 h-3 w-3" />
            AI video studio
          </Badge>
          <h1 className="font-display text-4xl font-semibold leading-tight tracking-tight">
            Forge scripts, visuals, voice, and exports in one place.
          </h1>
          <ul className="space-y-3">
            {FEATURES.map((feature) => (
              <li key={feature} className="flex items-center gap-2 text-sm text-muted-foreground">
                <CheckCircle2 className="h-4 w-4 shrink-0 text-forge" />
                {feature}
              </li>
            ))}
          </ul>
        </div>
        <p className="relative text-xs text-muted-foreground">
          Topic → Script → Visuals → Voice → Thumbnail → Edit → Export
        </p>
      </div>

      <div className="flex items-center justify-center p-6 md:p-10">
        <div className="w-full max-w-md space-y-6">
          <div className="lg:hidden">
            <BrandLogo href="/" className="justify-center" />
          </div>

          <Card className="glass-panel border-white/10 shadow-2xl shadow-black/30">
            <CardHeader className="space-y-2">
              <CardTitle className="text-2xl">
                {setup ? "Connect Supabase" : mode === "sign-in" ? "Welcome back" : "Create your account"}
              </CardTitle>
              <CardDescription>
                {setup
                  ? "Add Supabase credentials to .env.local, then restart the server."
                  : "Sign in to access your video production dashboard."}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {authError && !setup ? (
                <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-red-300">
                  {authError}
                </p>
              ) : null}

              {setup ? (
                <div className="space-y-3 rounded-lg border border-white/10 bg-black/20 p-4 text-sm">
                  <p>Set these in <code className="text-forge">.env.local</code>:</p>
                  <ul className="list-inside list-disc space-y-1 text-muted-foreground">
                    <li>NEXT_PUBLIC_SUPABASE_URL</li>
                    <li>NEXT_PUBLIC_SUPABASE_ANON_KEY</li>
                  </ul>
                  <p className="text-muted-foreground">
                    In Supabase → Authentication → URL Configuration, add{" "}
                    <code className="text-forge">http://localhost:3001/auth/callback</code>
                  </p>
                  <p className="text-muted-foreground">
                    Enable Google under Authentication → Providers, and add the same callback URL in
                    your Google Cloud OAuth client.
                  </p>
                  <ol className="list-inside list-decimal space-y-1 text-muted-foreground">
                    <li>Supabase → Authentication → Providers → Google → Enable</li>
                    <li>Add Google OAuth Client ID + Secret from Google Cloud Console</li>
                    <li>Google Cloud → Authorized redirect URI: your Supabase callback (shown in Supabase Google settings)</li>
                  </ol>
                  <Button asChild variant="outline" className="w-full">
                    <a href="https://supabase.com/dashboard" target="_blank" rel="noreferrer">
                      Open Supabase dashboard
                    </a>
                  </Button>
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-2 gap-2 rounded-lg bg-secondary/80 p-1">
                    <Button
                      type="button"
                      variant={mode === "sign-in" ? "default" : "ghost"}
                      size="sm"
                      onClick={() => setMode("sign-in")}
                    >
                      Sign in
                    </Button>
                    <Button
                      type="button"
                      variant={mode === "sign-up" ? "default" : "ghost"}
                      size="sm"
                      onClick={() => setMode("sign-up")}
                    >
                      Sign up
                    </Button>
                  </div>

                  <form action={signInWithGoogle}>
                    <GoogleButton />
                  </form>

                  <div className="relative">
                    <Separator />
                    <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-card px-2 text-xs text-muted-foreground">
                      or email
                    </span>
                  </div>

                  <form action={formAction} className="space-y-3">
                    {mode === "sign-up" && (
                      <div className="space-y-2">
                        <Label htmlFor="name">Display name</Label>
                        <Input id="name" name="name" required />
                      </div>
                    )}
                    <div className="space-y-2">
                      <Label htmlFor="email">Email</Label>
                      <Input id="email" name="email" type="email" required autoComplete="email" />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="password">Password</Label>
                      <Input
                        id="password"
                        name="password"
                        type="password"
                        minLength={6}
                        required
                        autoComplete={mode === "sign-in" ? "current-password" : "new-password"}
                      />
                    </div>

                    {state.error ? (
                      <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-red-300">
                        {state.error}
                      </p>
                    ) : null}
                    {state.success ? (
                      <p className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-300">
                        {state.success}
                      </p>
                    ) : null}

                    <SubmitButton
                      label={mode === "sign-in" ? "Enter dashboard" : "Create account"}
                    />
                  </form>

                  {mode === "sign-in" ? (
                    <p className="text-center text-xs text-muted-foreground">
                      No account yet? Switch to <strong>Sign up</strong> above.
                    </p>
                  ) : null}
                </>
              )}

              {!hasSupabaseEnv() && !setup && (
                <p className="text-center text-xs text-muted-foreground">
                  Supabase is not configured.{" "}
                  <Link href="/login?setup=1" className="text-forge hover:underline">
                    Setup guide
                  </Link>
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
