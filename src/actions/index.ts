import { defineAction, ActionError } from "astro:actions";
import { z } from "astro/zod";
import { DISCORD_WEBHOOK_URL, TURNSTILE_SECRET_KEY } from "astro:env/server";

const TURNSTILE_VERIFY_URL =
  "https://challenges.cloudflare.com/turnstile/v0/siteverify";
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CONTROL_CHARACTERS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

const sanitizeSingleLine = (value: string) =>
  value
    .normalize("NFKC")
    .replace(CONTROL_CHARACTERS, "")
    .replace(/\s+/g, " ")
    .trim();

const sanitizeMessage = (value: string) =>
  value
    .normalize("NFKC")
    .replace(CONTROL_CHARACTERS, "")
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.trimEnd())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

const extractIpAddress = (request: Request) => {
  const headerNames = [
    "cf-connecting-ip",
    "x-forwarded-for",
    "x-real-ip",
    "true-client-ip",
    "x-client-ip",
    "fastly-client-ip",
  ];

  for (const headerName of headerNames) {
    const headerValue = request.headers.get(headerName);

    if (!headerValue) {
      continue;
    }

    const candidate = sanitizeSingleLine(headerValue.split(",")[0] ?? "").slice(
      0,
      120,
    );

    if (candidate) {
      return candidate;
    }
  }

  return "Unknown";
};

const verifyTurnstile = async (token: string, ipAddress: string) => {
  const body = new FormData();
  body.set("secret", TURNSTILE_SECRET_KEY);
  body.set("response", token);

  if (ipAddress !== "Unknown") {
    body.set("remoteip", ipAddress);
  }

  const response = await fetch(TURNSTILE_VERIFY_URL, {
    method: "POST",
    body,
  });

  if (!response.ok) {
    throw new Error(`turnstile_http_${response.status}`);
  }

  return (await response.json()) as {
    success?: boolean;
    "error-codes"?: string[];
  };
};

const sendDiscordWebhook = async (submission: {
  name: string;
  email: string;
  message: string;
  ipAddress: string;
  timestamp: string;
}) => {
  const response = await fetch(DISCORD_WEBHOOK_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      allowed_mentions: {
        parse: [],
      },
      embeds: [
        {
          title: "📬 New Contact Form Submission",
          description: submission.message,
          color: 0xc4714a,
          timestamp: submission.timestamp,
          fields: [
            {
              name: "👤 Name",
              value: submission.name,
              inline: true,
            },
            {
              name: "📧 Email",
              value: submission.email || "*Not provided*",
              inline: true,
            },
            {
              name: "🌐 IP Address",
              value: `\`${submission.ipAddress}\``,
              inline: true,
            },
          ],
          footer: {
            text: "perish.ing",
          },
        },
      ],
    }),
  });

  if (!response.ok) {
    throw new Error(`discord_http_${response.status}`);
  }
};

export const server = {
  contact: defineAction({
    input: z.object({
      name: z.string().min(1, "Name is required.").max(120),
      email: z
        .string()
        .max(320)
        .refine((val) => val === "" || EMAIL_PATTERN.test(val), {
          message: "Please provide a valid email address.",
        })
        .optional()
        .default(""),
      message: z.string().min(1, "Message is required.").max(1500),
      turnstileToken: z.string().min(1, "Verification token is required."),
    }),
    handler: async (input, context) => {
      const name = sanitizeSingleLine(input.name);
      const email = sanitizeSingleLine(input.email);
      const message = sanitizeMessage(input.message);
      const turnstileToken = sanitizeSingleLine(input.turnstileToken);
      const ipAddress = extractIpAddress(context.request);

      if (!name || !message) {
        throw new ActionError({
          code: "BAD_REQUEST",
          message: "Name and message are required.",
        });
      }

      if (!turnstileToken) {
        throw new ActionError({
          code: "BAD_REQUEST",
          message: "Please complete the verification challenge.",
        });
      }

      // Verify Turnstile
      try {
        const verification = await verifyTurnstile(turnstileToken, ipAddress);

        if (!verification.success) {
          throw new ActionError({
            code: "FORBIDDEN",
            message: "Verification failed. Please try again.",
          });
        }
      } catch (error) {
        if (error instanceof ActionError) throw error;

        console.error("Turnstile verification failed.", error);
        throw new ActionError({
          code: "INTERNAL_SERVER_ERROR",
          message:
            "Verification service is unavailable right now. Please try again.",
        });
      }

      // Send Discord webhook
      const timestamp = new Date().toISOString();

      try {
        await sendDiscordWebhook({
          name,
          email,
          message,
          ipAddress,
          timestamp,
        });
      } catch (error) {
        console.error("Discord webhook request failed.", error);
        throw new ActionError({
          code: "INTERNAL_SERVER_ERROR",
          message:
            "Unable to send your message right now. Please try again later.",
        });
      }

      return { message: "sent! i'll get back to you soon." };
    },
  }),
};
