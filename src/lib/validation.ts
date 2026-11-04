import { z } from "zod";

const email = z
  .string()
  .trim()
  .max(320)
  .email("Enter a valid email address.")
  .transform((value) => value.toLowerCase());

export const signupSchema = z.object({
  email,
  password: z
    .string()
    .min(8, "Password must be at least 8 characters.")
    // bcrypt only uses the first 72 bytes; reject longer to avoid false security.
    .max(72, "Password must be at most 72 characters."),
  fullName: z.string().trim().max(200).optional(),
  organizationName: z.string().trim().min(1, "Organization name is required.").max(200),
});

export const loginSchema = z.object({
  email,
  password: z.string().min(1, "Password is required.").max(200),
});

export const askQuestionSchema = z.object({
  question: z.string().trim().min(1, "Question cannot be empty.").max(2000),
  conversationId: z.string().uuid().optional(),
});

export const createConversationSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
});

export const uuidSchema = z.string().uuid();

/** First human-readable validation message, for API error responses. */
export function firstIssue(error: z.ZodError): string {
  return error.issues[0]?.message ?? "Invalid input.";
}

export const ALLOWED_FILE_TYPES = (
  process.env.UPLOAD_ALLOWED_TYPES ||
  "application/pdf,text/plain,text/markdown,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
)
  .split(",")
  .map((t) => t.trim());

export const MAX_FILE_SIZE_BYTES =
  Number(process.env.UPLOAD_MAX_FILE_SIZE_MB || 20) * 1024 * 1024;
