import { config as loadDotenv } from "dotenv";
import { z } from "zod";

// Load .env before any other module reads process.env.
loadDotenv();

/**
 * Validates and freezes runtime configuration.
 * Failing fast here prevents the API from starting with unsafe defaults.
 */
const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(4000),
  APP_URL: z.string().url().default("http://localhost:4000"),
  FRONTEND_ORIGIN: z.string().url().default("http://localhost:3000"),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  REDIS_URL: z.string().default("redis://localhost:6379"),
  /** Access JWT signing secret — min 32 chars (see .env.example). */
  JWT_ACCESS_SECRET: z.string().min(32, "JWT_ACCESS_SECRET must be ≥ 32 characters"),
  /** Reserved for asymmetric/refresh JWT schemes; refresh tokens are opaque today. */
  JWT_REFRESH_SECRET: z.string().min(32, "JWT_REFRESH_SECRET must be ≥ 32 characters"),
  JWT_ACCESS_TTL: z.string().default("15m"),
  JWT_REFRESH_TTL: z.string().default("7d"),
  /** MinIO / S3 for visit photos (Phase B10+). */
  S3_ENDPOINT: z.string().url().default("http://localhost:9000"),
  S3_REGION: z.string().default("us-east-1"),
  S3_ACCESS_KEY: z.string().default("samu"),
  S3_SECRET_KEY: z.string().default("samu-secret"),
  S3_BUCKET: z.string().default("samu-uploads"),
  /**
   * Transactional email via Resend (https://resend.com). When the key is unset,
   * emails are not sent; outside production the message (with its link) is logged instead.
   */
  RESEND_API_KEY: z.string().min(1).optional(),
  EMAIL_FROM: z.string().min(3).default("SAMU <no-reply@solektra.rw>"),
  /** Lifetime of a forgot-password link. */
  PASSWORD_RESET_TTL: z.string().default("1h"),
  /** Lifetime of the set-password link emailed when an admin creates a user. */
  PASSWORD_INVITE_TTL: z.string().default("3d"),
  /** Max GPS distance (meters) from agent registered location before flagging. */
  GPS_DISTANCE_METERS: z.coerce.number().int().positive().default(10),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("Invalid environment configuration:", parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
