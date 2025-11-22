import {
  FrameNotificationDetails,
  type SendNotificationRequest,
  sendNotificationResponseSchema,
} from "@farcaster/frame-sdk";
import { getUserNotificationDetails } from "@/lib/notification";

const appUrl = process.env.NEXT_PUBLIC_URL || "";

// Allow-list of trusted domains for notification endpoint
const ALLOWED_NOTIFICATION_HOSTNAMES = [
  // Add trusted hosts here, e.g.:
  "api.trustedservice.com",
  "notifications.example.com",
  // "localhost",
];

type SendFrameNotificationResult =
  | {
      state: "error";
      error: unknown;
    }
  | { state: "no_token" }
  | { state: "rate_limit" }
  | { state: "success" };

export async function sendFrameNotification({
  fid,
  title,
  body,
  notificationDetails,
}: {
  fid: number;
  title: string;
  body: string;
  notificationDetails?: FrameNotificationDetails | null;
}): Promise<SendFrameNotificationResult> {
  if (!notificationDetails) {
    notificationDetails = await getUserNotificationDetails(fid);
  }
  if (!notificationDetails) {
    return { state: "no_token" };
  }

  // Validate that notificationDetails.url is in allow-list
  let notificationUrl: URL;
  try {
    notificationUrl = new URL(notificationDetails.url);
  } catch (e) {
    return { state: "error", error: "Invalid notificationDetails.url" };
  }
  // Only allow allow-listed hostnames
  if (!ALLOWED_NOTIFICATION_HOSTNAMES.includes(notificationUrl.hostname)) {
    return { state: "error", error: "Unapproved notification endpoint host" };
  }

  const response = await fetch(notificationUrl.toString(), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      notificationId: crypto.randomUUID(),
      title,
      body,
      targetUrl: appUrl,
      tokens: [notificationDetails.token],
    } satisfies SendNotificationRequest),
  });

  const responseJson = await response.json();

  if (response.status === 200) {
    const responseBody = sendNotificationResponseSchema.safeParse(responseJson);
    if (responseBody.success === false) {
      return { state: "error", error: responseBody.error.errors };
    }

    if (responseBody.data.result.rateLimitedTokens.length) {
      return { state: "rate_limit" };
    }

    return { state: "success" };
  }

  return { state: "error", error: responseJson };
}
