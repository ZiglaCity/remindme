import { createConnection, type Socket } from "node:net";
import nodemailer from "nodemailer";
import type { z } from "zod";
import type { emailEnvSchema } from "../env/schema";
import { recipientApproved } from "./policy";

export type EmailConfiguration = z.infer<typeof emailEnvSchema>;
export type OutboundEmail = {
  notificationId: string;
  to: string;
  subject: string;
  text: string;
  html: string;
};
export type EmailSender = (
  message: OutboundEmail,
) => Promise<{ messageId: string }>;

// A fresh, bounded connection per operation. Destroying the underlying socket also
// interrupts STARTTLS, rather than merely abandoning a promise that could send later.
export function createSmtpSender(env: EmailConfiguration) {
  async function operate<T>(
    operation: (
      transport: ReturnType<typeof nodemailer.createTransport>,
    ) => Promise<T>,
  ): Promise<T> {
    let socket: Socket | undefined;
    let expired = false;
    const transport = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_SECURE,
      requireTLS: !env.SMTP_SECURE,
      auth: { user: env.SMTP_USER, pass: env.SMTP_PASS },
      tls: { minVersion: "TLSv1.2", rejectUnauthorized: true },
      connectionTimeout: 15_000,
      greetingTimeout: 10_000,
      socketTimeout: 20_000,
      logger: false,
      debug: false,
      disableFileAccess: true,
      disableUrlAccess: true,
      getSocket: (_options, callback) => {
        if (expired) {
          callback(
            Object.assign(new Error("SMTP deadline"), { code: "ETIMEDOUT" }),
          );
          return;
        }
        socket = createConnection({ host: env.SMTP_HOST, port: env.SMTP_PORT });
        // getSocket opens TCP before Nodemailer's own connection timers start.
        // Bound DNS/TCP here too, including a lookup that never completes.
        const connection = socket;
        const connectTimer = setTimeout(
          () =>
            connection.destroy(
              Object.assign(new Error("SMTP connection deadline"), {
                code: "ETIMEDOUT",
                command: "CONN",
              }),
            ),
          15_000,
        );
        connection.once("close", () => clearTimeout(connectTimer));
        const onError = (error: Error) => callback(error);
        socket.once("error", onError);
        socket.once("connect", () => {
          clearTimeout(connectTimer);
          socket!.removeListener("error", onError);
          if (expired) {
            socket!.destroy();
            return;
          }
          callback(null, { connection: socket });
        });
      },
    });
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        expired = true;
        socket?.destroy();
        reject(
          Object.assign(new Error("SMTP deadline"), {
            code: "ETIMEDOUT",
            command: "DATA",
          }),
        );
      }, 60_000);
    });
    try {
      return await Promise.race([operation(transport), timeout]);
    } finally {
      clearTimeout(timer);
      socket?.destroy();
      transport.close();
    }
  }
  const send: EmailSender = async (message) => {
    if (!recipientApproved(message.to, env.SMTP_APPROVED_RECIPIENTS))
      throw Object.assign(new Error("Recipient not approved"), {
        code: "EENVELOPE",
      });
    const result = await operate((transport) =>
      transport.sendMail({
        from: { name: "RemindMe", address: env.EMAIL_FROM },
        to: { address: message.to, name: "" },
        envelope: { from: env.EMAIL_FROM, to: [message.to] },
        messageId: `<${message.notificationId}@${new URL(env.APP_URL).hostname}>`,
        subject: message.subject,
        text: message.text,
        html: message.html,
        disableFileAccess: true,
        disableUrlAccess: true,
      }),
    );
    if (
      !result.accepted?.some(
        (email: string) => email.toLowerCase() === message.to.toLowerCase(),
      )
    )
      throw Object.assign(new Error("Recipient rejected"), {
        code: "EENVELOPE",
      });
    return {
      messageId: String(result.messageId)
        .replace(/[\r\n]/g, "")
        .slice(0, 512),
    };
  };
  return { send, verify: () => operate((transport) => transport.verify()) };
}
