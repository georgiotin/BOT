/**
 * Отправка писем: SMTP (nodemailer) ИЛИ Resend API — выбор через настройку `mail_provider`.
 *
 * Здесь только транспорт (sendEmail). Контент системных писем
 * (верификация, привязка почты, сброс пароля и т.п.) не хардкодится в этом
 * файле — он рендерится из редактируемых шаблонов админки:
 * email-templates.service.ts → renderEmailTemplate(key, vars).
 *
 * Все отправители собирают конфиг через mailConfigFromSystem(config) — единый
 * источник, чтобы переключение SMTP↔Resend работало сразу во всех письмах.
 */

import nodemailer from "nodemailer";

export type MailProvider = "smtp" | "resend";

export type SmtpConfig = {
  host: string;
  port: number;
  secure: boolean;
  user: string | null;
  password: string | null;
  fromEmail: string | null;
  fromName: string | null;
  /** Выбранный провайдер отправки (по умолчанию smtp). */
  provider?: MailProvider;
  /** Resend: API-ключ (re_...). */
  resendApiKey?: string | null;
  /** Resend: адрес отправителя на верифицированном домене (fallback — fromEmail). */
  resendFromEmail?: string | null;
};

/** SMTP настроен (хватает параметров для отправки). */
export function isSmtpConfigured(config: SmtpConfig): boolean {
  return Boolean(config.host && config.port && config.fromEmail);
}

/** Resend настроен (есть ключ и адрес отправителя). */
export function isResendConfigured(config: SmtpConfig): boolean {
  return Boolean(config.resendApiKey && (config.resendFromEmail || config.fromEmail));
}

/** Настроен ли ВЫБРАННЫЙ провайдер (единый гейт для всех auth-флоу). */
export function isMailConfigured(config: SmtpConfig): boolean {
  return config.provider === "resend" ? isResendConfigured(config) : isSmtpConfigured(config);
}

/**
 * Собрать транспорт-конфиг из системного конфига (getSystemConfig()).
 * Единственная точка, где camelCase-поля настроек превращаются в MailConfig —
 * используется всеми отправителями (регистрация/сброс/рассылки/шаблоны).
 */
export function mailConfigFromSystem(c: {
  smtpHost?: string | null;
  smtpPort?: number | null;
  smtpSecure?: boolean | null;
  smtpUser?: string | null;
  smtpPassword?: string | null;
  smtpFromEmail?: string | null;
  smtpFromName?: string | null;
  mailProvider?: string | null;
  resendApiKey?: string | null;
  resendFromEmail?: string | null;
}): SmtpConfig {
  return {
    host: c.smtpHost || "",
    port: c.smtpPort ?? 587,
    secure: c.smtpSecure ?? false,
    user: c.smtpUser ?? null,
    password: c.smtpPassword ?? null,
    fromEmail: c.smtpFromEmail ?? null,
    fromName: c.smtpFromName ?? null,
    provider: c.mailProvider === "resend" ? "resend" : "smtp",
    resendApiKey: c.resendApiKey ?? null,
    resendFromEmail: c.resendFromEmail ?? null,
  };
}

export type EmailAttachment = { filename: string; content: Buffer };

/**
 * Отправить произвольное письмо выбранным провайдером. Опционально — вложения.
 */
export async function sendEmail(
  config: SmtpConfig,
  to: string,
  subject: string,
  html: string,
  attachments?: EmailAttachment[]
): Promise<{ ok: boolean; error?: string }> {
  if (config.provider === "resend") {
    return sendViaResend(config, to, subject, html, attachments);
  }
  return sendViaSmtp(config, to, subject, html, attachments);
}

/** Транспорт Resend (HTTP API, без SMTP). */
async function sendViaResend(
  config: SmtpConfig,
  to: string,
  subject: string,
  html: string,
  attachments?: EmailAttachment[]
): Promise<{ ok: boolean; error?: string }> {
  if (!isResendConfigured(config)) {
    return { ok: false, error: "Resend not configured" };
  }
  const fromEmail = config.resendFromEmail || config.fromEmail!;
  const from = config.fromName ? `${config.fromName} <${fromEmail}>` : fromEmail;
  try {
    const resp = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [to],
        subject,
        html,
        ...(attachments?.length
          ? { attachments: attachments.map((a) => ({ filename: a.filename, content: a.content.toString("base64") })) }
          : {}),
      }),
    });
    if (!resp.ok) {
      const text = await resp.text().catch(() => "");
      return { ok: false, error: `Resend ${resp.status}: ${text.slice(0, 300)}` };
    }
    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: message };
  }
}

/** Транспорт SMTP (nodemailer). */
async function sendViaSmtp(
  config: SmtpConfig,
  to: string,
  subject: string,
  html: string,
  attachments?: EmailAttachment[]
): Promise<{ ok: boolean; error?: string }> {
  if (!isSmtpConfigured(config)) {
    return { ok: false, error: "SMTP not configured" };
  }

  const auth = config.user && config.password ? { user: config.user, pass: config.password } : undefined;
  const transporter = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth,
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 10000,
  });

  const from = config.fromName
    ? `"${config.fromName}" <${config.fromEmail}>`
    : config.fromEmail!;

  try {
    await transporter.sendMail({
      from,
      to,
      subject,
      html,
      ...(attachments?.length ? { attachments: attachments.map((a) => ({ filename: a.filename, content: a.content })) } : {}),
    });
    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: message };
  }
}
