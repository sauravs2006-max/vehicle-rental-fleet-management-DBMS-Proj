"use client";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui";
export default function LogoutButton() {
  const r = useRouter();
  return <Button variant="outline" size="sm" onClick={async () => { await fetch("/api/auth/logout", { method: "POST" }); r.push("/login"); r.refresh(); }}>Log out</Button>;
}
