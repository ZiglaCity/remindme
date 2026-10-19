import Link from "next/link";
import { SignOut } from "@/components/sign-out";
import { Brand } from "@/components/icon";
export default function AccessDenied() {
  return (
    <main className="mx-auto max-w-lg px-6 py-20">
      <Link href="/" aria-label="RemindMe home">
        <Brand />
      </Link>
      <p className="eyebrow mt-16">A little early</p>
      <h1 className="page-title mt-4">Tester access required</h1>
      <p className="page-description my-6">
        Your account isn’t currently approved. Ask the project owner to add your
        email to the tester list.
      </p>
      <SignOut />
      <Link href="/" className="mt-6 block underline">
        Back to home
      </Link>
    </main>
  );
}
