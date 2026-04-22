import type { APIRoute } from "astro";
import { DISCORD_WEBHOOK_URL, TURNSTILE_SECRET_KEY } from "astro:env/server";

export const prerender = false;

const TURNSTILE_VERIFY_URL =
  "https://challenges.cloudflare.com/turnstile/v0/siteverify";
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CONTROL_CHARACTERS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;
const MAX_NAME_LENGTH = 120;
const MAX_EMAIL_LENGTH = 320;
const MAX_MESSAGE_LENGTH = 1000;

type ContactPayload = {
  name?: unknown;
  email?: unknown;
  message?: unknown;
  turnstileToken?: unknown;
};

type ContactSubmission = {
  name: string;
  email: string;
  message: string;
  turnstileToken: string;
};

const jsonResponse = (body: Record<string, string>, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });

const extractTextValue = (value: FormDataEntryValue | unknown) =>
  typeof value === "string" ? value : "";

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

const parseSubmission = async (
  request: Request,
): Promise<ContactSubmission> => {
  const contentType = request.headers.get("content-type") ?? "";

  if (contentType.includes("application/json")) {
    const body = (await request.json()) as ContactPayload;

    if (!body || typeof body !== "object" || Array.isArray(body)) {
      throw new Error("invalid_json");
    }

    return {
      name: extractTextValue(body.name),
      email: extractTextValue(body.email),
      message: extractTextValue(body.message),
      turnstileToken: extractTextValue(body.turnstileToken),
    };
  }

  const formData = await request.formData();

  return {
    name: extractTextValue(formData.get("name")),
    email: extractTextValue(formData.get("email")),
    message: extractTextValue(formData.get("message")),
    turnstileToken: extractTextValue(
      formData.get("turnstileToken") ?? formData.get("cf-turnstile-response"),
    ),
  };
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
          title: "New Contact Form Submission",
          color: 0xc4714a,
          timestamp: submission.timestamp,
          fields: [
            {
              name: "Name",
              value: submission.name,
            },
            {
              name: "Email",
              value: submission.email || "Not provided",
            },
            {
              name: "Message",
              value: submission.message,
            },
            {
              name: "IP Address",
              value: submission.ipAddress,
            },
            {
              name: "Timestamp",
              value: submission.timestamp,
            },
          ],
        },
      ],
    }),
  });

  if (!response.ok) {
    throw new Error(`discord_http_${response.status}`);
  }
};

export const POST: APIRoute = async ({ request }) => {
  let submission: ContactSubmission;

  try {
    submission = await parseSubmission(request);
  } catch {
    return jsonResponse({ error: "Invalid request body." }, 400);
  }

  const name = sanitizeSingleLine(submission.name);
  const email = sanitizeSingleLine(submission.email);
  const message = sanitizeMessage(submission.message);
  const turnstileToken = sanitizeSingleLine(submission.turnstileToken);
  const ipAddress = extractIpAddress(request);

  if (!name || !message) {
    return jsonResponse({ error: "Name and message are required." }, 400);
  }

  if (!turnstileToken) {
    return jsonResponse(
      { error: "Please complete the verification challenge." },
      400,
    );
  }

  if (name.length > MAX_NAME_LENGTH) {
    return jsonResponse(
      { error: "Name must be 120 characters or fewer." },
      400,
    );
  }

  if (email.length > MAX_EMAIL_LENGTH) {
    return jsonResponse(
      { error: "Email must be 320 characters or fewer." },
      400,
    );
  }

  if (message.length > MAX_MESSAGE_LENGTH) {
    return jsonResponse(
      { error: "Message must be 1000 characters or fewer." },
      400,
    );
  }

  if (email && !EMAIL_PATTERN.test(email)) {
    return jsonResponse(
      { error: "Please provide a valid email address." },
      400,
    );
  }

  try {
    const verification = await verifyTurnstile(turnstileToken, ipAddress);

    if (!verification.success) {
      return jsonResponse(
        { error: "Verification failed. Please try again." },
        403,
      );
    }
  } catch (error) {
    console.error("Turnstile verification failed.", error);
    return jsonResponse(
      {
        error:
          "Verification service is unavailable right now. Please try again.",
      },
      502,
    );
  }

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
    return jsonResponse(
      {
        error: "Unable to send your message right now. Please try again later.",
      },
      502,
    );
  }

  return jsonResponse({ message: "sent! i'll get back to you soon." }, 200);
};
