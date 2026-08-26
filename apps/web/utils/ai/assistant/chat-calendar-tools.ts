import { type InferUITool, tool } from "ai";
import { z } from "zod";
import type { Logger } from "@/utils/logger";
import type { CalendarEvent } from "@/utils/calendar/event-types";
import { posthogCaptureEvent } from "@/utils/posthog";
import { createCalendarEventProviders } from "@/utils/calendar/event-provider";

const getCalendarEventsInputSchema = z.object({
  startDate: z
    .string()
    .describe(
      "Start of date range in ISO 8601 format (e.g. 2026-03-18T00:00:00Z)",
    ),
  endDate: z
    .string()
    .describe(
      "End of date range in ISO 8601 format (e.g. 2026-03-19T00:00:00Z)",
    ),
  maxResults: z
    .number()
    .optional()
    .describe("Maximum number of events to return. Defaults to 25."),
});

export const getCalendarEventsTool = ({
  email,
  emailAccountId,
  logger,
}: {
  email: string;
  emailAccountId: string;
  logger: Logger;
}) =>
  tool({
    description: "Fetch calendar events for a date range.",
    inputSchema: getCalendarEventsInputSchema,
    execute: async ({ startDate, endDate, maxResults }) => {
      trackToolCall({ tool: "get_calendar_events", email, logger });

      try {
        const providers = await createCalendarEventProviders(
          emailAccountId,
          logger,
        );

        if (providers.length === 0) {
          return {
            error:
              "No calendar connected. The user needs to connect their calendar in Inbox Zero settings.",
          };
        }

        const allResults = await Promise.allSettled(
          providers.map((provider) =>
            provider.fetchEvents({
              timeMin: new Date(startDate),
              timeMax: new Date(endDate),
              maxResults: maxResults ?? 25,
            }),
          ),
        );

        const fulfilled = allResults.filter(
          (r): r is PromiseFulfilledResult<CalendarEvent[]> =>
            r.status === "fulfilled",
        );
        const rejectedCount = allResults.length - fulfilled.length;

        if (rejectedCount > 0) {
          logger.warn("Some calendar providers failed", {
            count: rejectedCount,
          });
        }

        if (fulfilled.length === 0) {
          return {
            error:
              "All calendar providers failed to fetch events. Please try again later.",
          };
        }

        const events = fulfilled
          .flatMap((r) => r.value)
          .sort((a, b) => a.startTime.getTime() - b.startTime.getTime())
          .slice(0, maxResults ?? 25)
          .map((event) => ({
            title: event.title,
            startTime: event.startTime.toISOString(),
            endTime: event.endTime.toISOString(),
            location: event.location ?? null,
            attendees: event.attendees.map((a) => a.email),
            videoConferenceLink: event.videoConferenceLink ?? null,
          }));

        return { events, count: events.length };
      } catch (error) {
        logger.error("Failed to fetch calendar events", { error });
        return { error: "Failed to fetch calendar events" };
      }
    },
  });

export type GetCalendarEventsTool = InferUITool<
  ReturnType<typeof getCalendarEventsTool>
>;

// --- Create Calendar Event Tool ---

const createCalendarEventInputSchema = z.object({
  title: z.string().trim().min(1).describe("Title of the calendar event."),
  startTime: z
    .string()
    .describe("Start time in ISO 8601 format (e.g. 2026-03-18T10:00:00Z)."),
  endTime: z
    .string()
    .describe("End time in ISO 8601 format (e.g. 2026-03-18T11:00:00Z)."),
  description: z
    .string()
    .optional()
    .describe("Optional description or notes for the event."),
  attendees: z
    .array(z.string())
    .optional()
    .describe(
      "Optional list of attendee email addresses to invite to the event.",
    ),
  location: z
    .string()
    .optional()
    .describe(
      "Optional location for the event (e.g. a physical address or 'Google Meet').",
    ),
  timezone: z
    .string()
    .optional()
    .describe(
      "IANA timezone for the event (e.g. 'America/New_York'). Defaults to UTC.",
    ),
});

export const createCalendarEventTool = ({
  email,
  emailAccountId,
  userTimezone,
  logger,
}: {
  email: string;
  emailAccountId: string;
  userTimezone: string;
  logger: Logger;
}) =>
  tool({
    description:
      "Prepare a new calendar event for the user. This does NOT create the event immediately — it returns a confirmation payload for the user to approve before the event is created.",
    inputSchema: createCalendarEventInputSchema,
    execute: async (input) => {
      trackToolCall({ tool: "create_calendar_event", email, logger });

      try {
        const providers = await createCalendarEventProviders(
          emailAccountId,
          logger,
        );

        if (providers.length === 0) {
          return {
            error:
              "No calendar connected. The user needs to connect their calendar in Inbox Zero settings.",
          };
        }

        return {
          success: true,
          actionType: "create_calendar_event" as const,
          requiresConfirmation: true,
          confirmationState: "pending" as const,
          pendingAction: {
            title: input.title,
            startTime: input.startTime,
            endTime: input.endTime,
            description: input.description ?? null,
            attendees: input.attendees ?? [],
            location: input.location ?? null,
            timezone: input.timezone ?? userTimezone,
          },
        };
      } catch (error) {
        logger.error("Failed to prepare calendar event", { error });
        return { error: "Failed to prepare calendar event" };
      }
    },
  });

export type CreateCalendarEventTool = InferUITool<
  ReturnType<typeof createCalendarEventTool>
>;

// --- Update Calendar Event Tool ---

const updateCalendarEventInputSchema = z.object({
  eventId: z
    .string()
    .trim()
    .min(1)
    .describe(
      "The ID of the calendar event to update (from getCalendarEvents).",
    ),
  title: z
    .string()
    .trim()
    .min(1)
    .describe(
      "The current title of the event (for display in the confirmation card).",
    ),
  startTime: z.string().describe("New start time in ISO 8601 format."),
  endTime: z.string().describe("New end time in ISO 8601 format."),
  timezone: z
    .string()
    .optional()
    .describe(
      "IANA timezone for the updated times (e.g. 'America/New_York'). Defaults to UTC.",
    ),
});

export const updateCalendarEventTool = ({
  email,
  emailAccountId,
  userTimezone,
  logger,
}: {
  email: string;
  emailAccountId: string;
  userTimezone: string;
  logger: Logger;
}) =>
  tool({
    description:
      "Prepare an update to an existing calendar event (reschedule). This does NOT update the event immediately — it returns a confirmation payload for the user to approve. Use the eventId from getCalendarEvents.",
    inputSchema: updateCalendarEventInputSchema,
    execute: async (input) => {
      trackToolCall({ tool: "update_calendar_event", email, logger });

      try {
        const providers = await createCalendarEventProviders(
          emailAccountId,
          logger,
        );

        if (providers.length === 0) {
          return {
            error:
              "No calendar connected. The user needs to connect their calendar in Inbox Zero settings.",
          };
        }

        return {
          success: true,
          actionType: "update_calendar_event" as const,
          requiresConfirmation: true,
          confirmationState: "pending" as const,
          pendingAction: {
            eventId: input.eventId,
            title: input.title,
            startTime: input.startTime,
            endTime: input.endTime,
            timezone: input.timezone ?? userTimezone,
          },
        };
      } catch (error) {
        logger.error("Failed to prepare calendar event update", { error });
        return { error: "Failed to prepare calendar event update" };
      }
    },
  });

export type UpdateCalendarEventTool = InferUITool<
  ReturnType<typeof updateCalendarEventTool>
>;

// --- Cancel Calendar Event Tool ---

const cancelCalendarEventInputSchema = z.object({
  eventId: z
    .string()
    .trim()
    .min(1)
    .describe(
      "The ID of the calendar event to cancel (from getCalendarEvents).",
    ),
  title: z
    .string()
    .trim()
    .min(1)
    .describe(
      "The title of the event being cancelled (for display in the confirmation card).",
    ),
});

export const cancelCalendarEventTool = ({
  email,
  emailAccountId,
  logger,
}: {
  email: string;
  emailAccountId: string;
  logger: Logger;
}) =>
  tool({
    description:
      "Prepare to cancel (delete) an existing calendar event. This does NOT cancel the event immediately — it returns a confirmation payload for the user to approve. Use the eventId from getCalendarEvents.",
    inputSchema: cancelCalendarEventInputSchema,
    execute: async (input) => {
      trackToolCall({ tool: "cancel_calendar_event", email, logger });

      try {
        const providers = await createCalendarEventProviders(
          emailAccountId,
          logger,
        );

        if (providers.length === 0) {
          return {
            error:
              "No calendar connected. The user needs to connect their calendar in Inbox Zero settings.",
          };
        }

        return {
          success: true,
          actionType: "cancel_calendar_event" as const,
          requiresConfirmation: true,
          confirmationState: "pending" as const,
          pendingAction: {
            eventId: input.eventId,
            title: input.title,
          },
        };
      } catch (error) {
        logger.error("Failed to prepare calendar event cancellation", {
          error,
        });
        return { error: "Failed to prepare calendar event cancellation" };
      }
    },
  });

export type CancelCalendarEventTool = InferUITool<
  ReturnType<typeof cancelCalendarEventTool>
>;

async function trackToolCall({
  tool: toolName,
  email,
  logger,
}: {
  tool: string;
  email: string;
  logger: Logger;
}) {
  logger.trace("Tracking tool call", { tool: toolName, email });
  return posthogCaptureEvent(email, "AI Assistant Chat Tool Call", {
    tool: toolName,
  });
}
