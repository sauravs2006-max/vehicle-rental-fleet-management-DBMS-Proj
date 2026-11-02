"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, Input, Label, Notice } from "@/components/ui";

export default function LoginPage() {
  const r = useRouter();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [f, setF] = useState({ fullName: "", email: "", password: "", phone: "", licenseNo: "" });
  const [err, setErr] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setErr("");
    const body = mode === "login" ? { email: f.email, password: f.password }
      : { ...f, phone: f.phone || undefined, licenseNo: f.licenseNo || undefined };
    const res = await fetch(`/api/auth/${mode}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const data = await res.json(); setBusy(false);
    if (!res.ok) { setErr(data.details ? Object.values(data.details).flat().join(", ") : data.error); return; }
    r.push(data.role === "admin" ? "/admin" : "/vehicles"); r.refresh();
  }

  return (
    <div className="mx-auto mt-10 max-w-sm">
      <Card>
        <h1 className="mb-4 text-xl font-semibold">{mode === "login" ? "Sign in" : "Create customer account"}</h1>
        <form onSubmit={submit} className="space-y-3">
          {mode === "register" && <div><Label>Full name</Label><Input required value={f.fullName} onChange={set("fullName")} /></div>}
          <div><Label>Email</Label><Input type="email" required value={f.email} onChange={set("email")} /></div>
          <div><Label>Password</Label><Input type="password" required value={f.password} onChange={set("password")} /></div>
          {mode === "register" && <>
            <div><Label>Phone</Label><Input value={f.phone} onChange={set("phone")} /></div>
            <div><Label>Driving licence no.</Label><Input value={f.licenseNo} onChange={set("licenseNo")} /></div>
          </>}
          {err && <Notice kind="error">{err}</Notice>}
          <Button className="w-full" disabled={busy}>{busy ? "Please wait..." : mode === "login" ? "Sign in" : "Register"}</Button>
        </form>
        <button className="mt-3 text-sm text-zinc-300 hover:text-white hover:underline" onClick={() => { setMode(mode === "login" ? "register" : "login"); setErr(""); }}>
          {mode === "login" ? "New here? Create an account" : "Have an account? Sign in"}
        </button>
      </Card>
      <p className="mt-4 text-center text-xs text-zinc-500">Demo: admin@fleet.test / Admin@123 · priya@example.com / Customer@123</p>
    </div>
  );
}
