import Link from "next/link";
import { SignOut } from "@/components/sign-out";
export default function AccessDenied() {
  return (
    <main className="mx-auto max-w-lg px-6 py-16">
      <h1 className="text-3xl font-semibold">Tester access required</h1>
      <p className="my-6 text-stone-600">
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
