"use client";
import { useState } from "react";
import { authClient } from "@/lib/auth/client";
import { useRouter } from "next/navigation";
import { Icon } from "./icon";
export function SignOut() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <div>
      <button
        disabled={busy}
        className="sign-out-button disabled:opacity-50"
        aria-label={busy ? "Signing out…" : "Sign out"}
        title="Sign out"
        onClick={async () => {
          setBusy(true);
          setError("");
          try {
            const result = await authClient.signOut();
            if (result.error) setError("Couldn’t sign out. Please retry.");
            else {
              router.replace("/login");
              router.refresh();
            }
          } catch {
            setError("Couldn’t connect. Please retry.");
          } finally {
            setBusy(false);
          }
        }}
      >
        <Icon name="logout" size={18} />
      </button>
      {error && (
        <p role="alert" className="text-sm text-red-800">
          {error}
        </p>
      )}
    </div>
  );
}
