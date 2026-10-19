import { z } from "zod";
export function recipientApproved(email: string, approved: string) {
  return (
    z.email().safeParse(email).success &&
    approved
      .split(",")
      .some((entry) => entry.trim().toLowerCase() === email.toLowerCase())
  );
}
export type DeliveryFailure = {
  category: "transient" | "permanent" | "uncertain";
  code: string;
};
export function classifySmtpError(error: unknown): DeliveryFailure {
  const data =
    typeof error === "object" && error !== null
      ? (error as { code?: string; command?: string; responseCode?: number })
      : {};
  if (data.code === "EAUTH")
    return { category: "permanent", code: "smtp_auth" };
  if (data.responseCode && data.responseCode >= 500)
    return { category: "permanent", code: "smtp_rejected" };
  if (data.responseCode && data.responseCode >= 400)
    return { category: "transient", code: "smtp_temporary_rejection" };
  if (["EENVELOPE", "EMESSAGE", "ESTREAM", "ETLS"].includes(data.code ?? ""))
    return { category: "permanent", code: "smtp_configuration_or_recipient" };
  if (
    [
      "CONN",
      "AUTH",
      "EHLO",
      "HELO",
      "STARTTLS",
      "MAIL FROM",
      "RCPT TO",
    ].includes(data.command ?? "")
  )
    return { category: "transient", code: "smtp_connection" };
  // A connection loss during/after DATA may follow acceptance. Retrying can duplicate mail.
  return {
    category: "uncertain",
    code:
      data.code === "ETIMEDOUT"
        ? "smtp_timeout_uncertain"
        : "smtp_delivery_uncertain",
  };
}
export function retryAt(attemptCount: number, now: Date, delays: number[]) {
  return new Date(
    now.getTime() +
      delays[Math.min(attemptCount - 1, delays.length - 1)] * 1000,
  );
}
