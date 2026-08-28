import { onDocumentCreated, onDocumentDeleted } from "firebase-functions/v2/firestore";
import { defineSecret } from "firebase-functions/params";
import { logger } from "firebase-functions/v2";
import { createHash } from "crypto";
import axios from "axios";

const MAILCHIMP_API_KEY = defineSecret("MAILCHIMP_API_KEY");

const AUDIENCE_ID = "3c84f978bb";

function subscriberHash(email: string): string {
  return createHash("md5").update(email.toLowerCase()).digest("hex");
}

function mailchimpClient(apiKey: string) {
  const server = apiKey.split("-").pop() ?? "us1";
  return axios.create({
    baseURL: `https://${server}.api.mailchimp.com/3.0`,
    auth: { username: "anystring", password: apiKey },
  });
}

export const onUserCreatedMailchimp = onDocumentCreated(
  { document: "users/{uid}", region: "us-central1", secrets: [MAILCHIMP_API_KEY] },
  async (event) => {
    const data = event.data?.data();
    if (!data?.email) return;

    const client = mailchimpClient(MAILCHIMP_API_KEY.value());
    const hash = subscriberHash(data.email);

    try {
      const res = await client.put(`/lists/${AUDIENCE_ID}/members/${hash}`, {
        email_address: data.email,
        status_if_new: "subscribed",
        merge_fields: {
          FNAME: data.firstName ?? "",
          LNAME: data.lastName ?? "",
          PHONE: data.mobile ?? "",
        },
      });
      logger.info("[onUserCreatedMailchimp] success", {
        email: data.email,
        status: res.status,
        memberId: res.data?.id,
        memberStatus: res.data?.status,
      });
    } catch (err: unknown) {
      if (axios.isAxiosError(err)) {
        logger.error("[onUserCreatedMailchimp] mailchimp API error", {
          email: data.email,
          status: err.response?.status,
          body: err.response?.data,
          message: err.message,
        });
      } else {
        logger.error("[onUserCreatedMailchimp] unexpected error", {
          email: data.email,
          error: String(err),
        });
      }
    }
  }
);

export const onUserDeletedMailchimp = onDocumentDeleted(
  { document: "users/{uid}", region: "us-central1", secrets: [MAILCHIMP_API_KEY] },
  async (event) => {
    const data = event.data?.data();
    if (!data?.email) return;

    const client = mailchimpClient(MAILCHIMP_API_KEY.value());
    const hash = subscriberHash(data.email);

    try {
      await client.delete(`/lists/${AUDIENCE_ID}/members/${hash}`);
    } catch (err: unknown) {
      if (axios.isAxiosError(err) && err.response?.status !== 404) {
        logger.error("[onUserDeletedMailchimp] failed", {
          email: data.email,
          status: err.response?.status,
          body: err.response?.data,
        });
      }
    }
  }
);
