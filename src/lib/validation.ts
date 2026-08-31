import { z } from "zod";

export const signupSchema = z.object({
  email: z.string().email("Enter a valid email address."),
  password: z.string().min(8, "Password must be at least 8 characters."),
  fullName: z.string().min(1).max(200).optional(),
  organizationName: z.string().min(1, "Organization name is required.").max(200),
});

export const loginSchema = z.object({
  email: z.string().email("Enter a valid email address."),
  password: z.string().min(1, "Password is required."),
});

export const askQuestionSchema = z.object({
  question: z.string().min(1, "Question cannot be empty.").max(2000),
  conversationId: z.string().uuid().optional(),
});

export const createConversationSchema = z.object({
  title: z.string().min(1).max(200).optional(),
});

export const ALLOWED_FILE_TYPES = (
  process.env.UPLOAD_ALLOWED_TYPES ||
  "application/pdf,text/plain,text/markdown,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
).split(",");

export const MAX_FILE_SIZE_BYTES =
  Number(process.env.UPLOAD_MAX_FILE_SIZE_MB || 20) * 1024 * 1024;
