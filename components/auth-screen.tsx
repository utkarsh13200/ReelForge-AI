"use client";

import { FormEvent, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "../lib/supabase/client";

export default function AuthScreen() {
  const router = useRouter(); const params = useSearchParams();
  const [mode, setMode] = useState<"sign-in" | "sign-up">("sign-in");
  const [name, setName] = useState(""); const [email, setEmail] = useState(""); const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false); const [notice, setNotice] = useState("");
  const setup = params.get("setup") === "1";
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const supabase = createClient();
    if (!supabase) { setNotice("Add your Supabase URL and publishable key to .env.local first."); return; }
    setBusy(true); setNotice(""); const redirectTo = `${window.location.origin}/auth/callback`;
    const response = mode === "sign-up" ? await supabase.auth.signUp({ email, password, options: { data: { full_name: name }, emailRedirectTo: redirectTo } }) : await supabase.auth.signInWithPassword({ email, password });
    setBusy(false); if (response.error) { setNotice(response.error.message); return; }
    if (mode === "sign-up" && !response.data.session) { setNotice("Check your inbox to confirm your email, then sign in."); return; }
    router.replace("/"); router.refresh();
  }
  async function google() { const supabase = createClient(); if (!supabase) { setNotice("Add your Supabase URL and publishable key to .env.local first."); return; } await supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo: `${window.location.origin}/auth/callback` } }); }
  return <main className="auth-page"><section className="auth-story"><div className="auth-brand"><span className="brand-mark"><i/><i/><i/></span> Creator&apos;s Bible</div><div className="auth-copy"><p className="kicker">YOUR ORIGINAL IDEAS, IN MOTION</p><h1>A private studio for your next <em>big thing.</em></h1><p>Write, direct, edit, and ship every original story from one beautifully focused place.</p></div><div className="auth-showcase"><div className="showcase-head"><span>IN PRODUCTION</span><b>01:42</b></div><div className="showcase-orb"/><div className="showcase-note"><span>THE CALM CREATOR&apos;S ADVANTAGE</span><strong>Your point of view, made visible.</strong></div><div className="showcase-wave">∿ ∿ ∿ ∿ ∿ ∿</div></div><div className="auth-proof"><span><b>1</b> idea</span><i/> <span><b>7</b> creative stages</span><i/> <span><b>∞</b> ways to make it yours</span></div></section><section className="auth-panel"><div className="auth-form-wrap"><p className="kicker">WELCOME TO YOUR STUDIO</p><h2>{setup ? "Connect your studio" : mode === "sign-in" ? "Welcome back." : "Start something original."}</h2><p className="auth-intro">{setup ? "Your app is ready. Add your Supabase details to unlock secure accounts." : mode === "sign-in" ? "Sign in to pick up exactly where your story left off." : "Create your account and keep every creative decision in one place."}</p>{setup ? <div className="setup-card"><b>One quick setup step</b><p>In Supabase, create a project, then copy its Project URL and Publishable key into <code>.env.local</code>. Restart the app when you&apos;re done.</p><a href="https://supabase.com/dashboard" target="_blank" rel="noreferrer">Open Supabase dashboard ↗</a></div> : <><div className="auth-tabs"><button className={mode === "sign-in" ? "active" : ""} onClick={() => { setMode("sign-in"); setNotice(""); }}>Sign in</button><button className={mode === "sign-up" ? "active" : ""} onClick={() => { setMode("sign-up"); setNotice(""); }}>Create account</button></div><form onSubmit={submit} className="auth-form">{mode === "sign-up" && <label>Your name<input required value={name} onChange={(e) => setName(e.target.value)} placeholder="How should we call you?"/></label>}<label>Email address<input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com"/></label><label>Password<input required minLength={6} type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="At least 6 characters"/></label>{notice && <p className="auth-notice">{notice}</p>}<button className="auth-submit" disabled={busy}>{busy ? "Just a moment…" : mode === "sign-in" ? "Enter the studio →" : "Create my studio →"}</button></form><div className="auth-divider"><span>or continue with</span></div><button className="google-button" onClick={google}><span>G</span> Google</button><p className="auth-terms">By continuing, you agree to create only with content you own or are allowed to use.</p></>}</div></section></main>;
}
