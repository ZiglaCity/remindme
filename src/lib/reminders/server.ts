import "server-only";
import { getDatabase } from "../db/server";
import { getAuth } from "../auth/server";
import { getWebEnvironment } from "../env/server";
import {
  createRemindersHandler,
  type ReminderRoute,
} from "../../services/reminders/http";
import { errorResponse } from "../http/errors";
export async function handleReminders(
  request: Request,
  route: ReminderRoute = {},
) {
  try {
    const env = getWebEnvironment();
    return await createRemindersHandler(
      getDatabase(),
      getAuth(),
      env,
      env.BETTER_AUTH_URL,
    )(request, route);
  } catch (error) {
    return errorResponse(error);
  }
}
