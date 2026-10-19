import {
  CreateBucketCommand,
  GetObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { randomUUID } from "node:crypto";
import { env } from "../config/env.js";
import { logger } from "./logger.js";

let client: S3Client | null = null;
let bucketReady = false;

function getClient(): S3Client {
  if (!client) {
    client = new S3Client({
      region: env.S3_REGION,
      endpoint: env.S3_ENDPOINT,
      forcePathStyle: true,
      credentials: {
        accessKeyId: env.S3_ACCESS_KEY,
        secretAccessKey: env.S3_SECRET_KEY,
      },
    });
  }
  return client;
}

/**
 * Ensure the configured bucket exists (idempotent). Safe to call on every upload.
 */
export async function ensureBucket(): Promise<void> {
  if (bucketReady) return;
  const s3 = getClient();
  try {
    await s3.send(new HeadBucketCommand({ Bucket: env.S3_BUCKET }));
    bucketReady = true;
  } catch {
    try {
      await s3.send(new CreateBucketCommand({ Bucket: env.S3_BUCKET }));
      bucketReady = true;
      logger.info({ bucket: env.S3_BUCKET }, "Created S3/MinIO bucket");
    } catch (error) {
      logger.warn({ err: error }, "Could not ensure S3 bucket — uploads may fail");
      throw error;
    }
  }
}

export type UploadedObject = {
  storageKey: string;
  contentType: string;
  sizeBytes: number;
};

/**
 * Upload a visit photo buffer to MinIO/S3 under visits/{userId}/{uuid}-{safeName}.
 */
export async function uploadVisitPhoto(opts: {
  uploaderUserId: string;
  fileName: string;
  contentType: string;
  body: Buffer;
}): Promise<UploadedObject> {
  await ensureBucket();
  const safeName = opts.fileName.replace(/[^\w.\-]+/g, "_").slice(0, 120);
  const storageKey = `visits/${opts.uploaderUserId}/${randomUUID()}-${safeName}`;

  await getClient().send(
    new PutObjectCommand({
      Bucket: env.S3_BUCKET,
      Key: storageKey,
      Body: opts.body,
      ContentType: opts.contentType,
    }),
  );

  return {
    storageKey,
    contentType: opts.contentType,
    sizeBytes: opts.body.length,
  };
}

/**
 * Short-lived signed GET URL for a stored photo (private bucket).
 */
export async function getSignedPhotoUrl(
  storageKey: string,
  expiresInSeconds = 3600,
): Promise<string> {
  const command = new GetObjectCommand({
    Bucket: env.S3_BUCKET,
    Key: storageKey,
  });
  return getSignedUrl(getClient(), command, { expiresIn: expiresInSeconds });
}
