import type { Auth } from "../../lib/auth/core";
import type { AccessPolicy } from "../../lib/auth/policy";
import { authorize } from "../../lib/auth/authorize";
import { AppError, errorResponse } from "../../lib/http/errors";
import { readBoundedBody } from "../../lib/http/body";
import {
  paginationInput,
  reminderIdInput,
} from "../../lib/validation/reminders";
import {
  attemptHistory,
  listReminders,
  notificationHistory,
  readReminder,
} from "../../repositories/reminders";
import type { Database } from "../../repositories/preferences";
import { createReminderService } from "./service";
import type { Clock } from "../scheduling/schedule";

export type ReminderRoute = {
  id?: string;
  action?: "complete" | "reopen";
  completed?: boolean;
};
export function createRemindersHandler(
  db: Database,
  auth: Auth,
  policy: AccessPolicy,
  origin: string,
  clock: Clock = () => new Date(),
) {
  const service = createReminderService(db, clock);
  return async (request: Request, route: ReminderRoute = {}) => {
    try {
      const { owner } = await authorize(auth, request.headers, policy);
      if (route.id && !reminderIdInput.safeParse(route.id).success)
        throw new AppError(
          400,
          "invalid_input",
          "Invalid reminder identifier.",
        );
      if (request.method === "GET") {
        if (route.id) {
          const reminder = await readReminder(db, owner, route.id);
          const [notifications, attempts] = await Promise.all([
            notificationHistory(db, owner, route.id),
            attemptHistory(db, owner, route.id),
          ]);
          return Response.json(
            { reminder, notifications, attempts },
            { headers: { "Cache-Control": "no-store" } },
          );
        }
        const query = paginationInput.safeParse(
          Object.fromEntries(new URL(request.url).searchParams),
        );
        if (!query.success)
          throw new AppError(
            400,
            "invalid_input",
            "Choose a page size between 1 and 100 and a valid page.",
          );
        return Response.json(
          await listReminders(
            db,
            owner,
            route.completed ? "completed" : "active",
            query.data.page,
            query.data.pageSize,
          ),
          { headers: { "Cache-Control": "no-store" } },
        );
      }
      if (request.headers.get("origin") !== new URL(origin).origin)
        throw new AppError(
          403,
          "invalid_origin",
          "Request origin is not allowed.",
        );
      const text = await readBoundedBody(request, 32_768);
      let body: unknown;
      try {
        body = text ? JSON.parse(text) : {};
      } catch {
        throw new AppError(400, "invalid_input", "Check the reminder fields.");
      }
      const result =
        !route.id && request.method === "POST"
          ? await service.create(owner, body)
          : route.id && request.method === "PATCH"
            ? await service.edit(owner, route.id, body)
            : route.id && request.method === "DELETE"
              ? await service.transition(owner, route.id, "delete", body)
              : route.id && route.action && request.method === "POST"
                ? await service.transition(owner, route.id, route.action, body)
                : null;
      if (!result)
        throw new AppError(405, "method_not_allowed", "Method not allowed.");
      return Response.json(
        { reminder: result },
        {
          status: !route.id ? 201 : 200,
          headers: { "Cache-Control": "no-store" },
        },
      );
    } catch (error) {
      return errorResponse(error);
    }
  };
}
