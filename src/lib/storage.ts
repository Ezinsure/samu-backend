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
import { AppError } from "./errors.js";
import { logger } from "./logger.js";

let client: S3Client | null = null;
let bucketReady = false;

function getClient(): S3Client {
  if (!client) {
    client = new S3Client({
      region: env.S3_REGION,
      endpoint: env.S3_ENDPOINT,
      // Required for MinIO and Cloudflare R2 path-style URLs.
      forcePathStyle: true,
      credentials: {
        accessKeyId: env.S3_ACCESS_KEY,
        secretAccessKey: env.S3_SECRET_KEY,
      },
    });
  }
  return client;
}

function s3ErrorName(error: unknown): string {
  if (!error || typeof error !== "object") return "";
  const record = error as { name?: string; Code?: string; $metadata?: { httpStatusCode?: number } };
  return record.name ?? record.Code ?? "";
}

function isNotFound(error: unknown): boolean {
  const name = s3ErrorName(error);
  const status = (error as { $metadata?: { httpStatusCode?: number } } | null)?.$metadata
    ?.httpStatusCode;
  return (
    name === "NotFound" ||
    name === "NoSuchBucket" ||
    status === 404
  );
}

function isAccessDenied(error: unknown): boolean {
  const name = s3ErrorName(error);
  const status = (error as { $metadata?: { httpStatusCode?: number } } | null)?.$metadata
    ?.httpStatusCode;
  return name === "AccessDenied" || name === "Forbidden" || status === 403;
}

/**
 * Best-effort bucket check. Cloudflare R2 tokens often can PutObject but not
 * HeadBucket/CreateBucket — in that case we skip ahead and let the upload decide.
 * Create the bucket in the R2/MinIO dashboard; do not rely on the API to create it.
 */
export async function ensureBucket(): Promise<void> {
  if (bucketReady) return;
  const s3 = getClient();

  try {
    await s3.send(new HeadBucketCommand({ Bucket: env.S3_BUCKET }));
    bucketReady = true;
    return;
  } catch (headError) {
    if (!isNotFound(headError)) {
      // AccessDenied / other: token may still be allowed to write objects.
      logger.warn(
        { err: headError, bucket: env.S3_BUCKET },
        "HeadBucket failed — assuming the bucket already exists",
      );
      bucketReady = true;
      return;
    }
  }

  try {
    await s3.send(new CreateBucketCommand({ Bucket: env.S3_BUCKET }));
    bucketReady = true;
    logger.info({ bucket: env.S3_BUCKET }, "Created S3/MinIO bucket");
  } catch (createError) {
    if (isAccessDenied(createError)) {
      // R2: create the bucket in the dashboard; API tokens rarely may CreateBucket.
      logger.warn(
        { err: createError, bucket: env.S3_BUCKET },
        "CreateBucket denied — create the bucket in the storage dashboard if uploads fail",
      );
      bucketReady = true;
      return;
    }
    logger.warn({ err: createError }, "Could not ensure S3 bucket — uploads may fail");
    throw createError;
  }
}

export type UploadedObject = {
  storageKey: string;
  contentType: string;
  sizeBytes: number;
};

function storageConfigError(cause: unknown): AppError {
  logger.error({ err: cause, bucket: env.S3_BUCKET }, "Photo upload to object storage failed");
  return new AppError(
    502,
    "STORAGE_ERROR",
    "Photo storage rejected the upload. An administrator must confirm the S3/R2 bucket exists and the API token can write objects.",
  );
}

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

  try {
    await getClient().send(
      new PutObjectCommand({
        Bucket: env.S3_BUCKET,
        Key: storageKey,
        Body: opts.body,
        ContentType: opts.contentType,
      }),
    );
  } catch (error) {
    throw storageConfigError(error);
  }

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
