import { AuthForm } from "@/components/auth-form";
export const dynamic = "force-dynamic";
export default async function Login({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  return (
    <>
      {error && (
        <p role="alert" className="px-6 pt-6 text-center text-red-800">
          Sign-in could not be completed. Please try again.
        </p>
      )}
      <AuthForm
        mode="login"
        googleEnabled={Boolean(
          process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET,
        )}
      />
    </>
  );
}
