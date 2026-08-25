import nodemailer from "nodemailer";

function getTransporter() {
  if (!process.env.EMAIL_SERVER_HOST) return null;
  return nodemailer.createTransport({
    host: process.env.EMAIL_SERVER_HOST,
    port: Number(process.env.EMAIL_SERVER_PORT ?? 587),
    secure: Number(process.env.EMAIL_SERVER_PORT) === 465,
    auth: process.env.EMAIL_SERVER_USER
      ? { user: process.env.EMAIL_SERVER_USER, pass: process.env.EMAIL_SERVER_PASSWORD }
      : undefined,
  });
}

export async function sendPasswordResetEmail(to: string, resetUrl: string) {
  const transporter = getTransporter();

  const html = `
    <div style="font-family:sans-serif;max-width:480px;margin:auto">
      <h2>Reset your ExamPrep password</h2>
      <p>We received a request to reset your password. This link expires in 1 hour.</p>
      <p><a href="${resetUrl}" style="display:inline-block;background:#2563eb;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none">Reset password</a></p>
      <p style="color:#6b7280;font-size:12px">If you didn't request this, you can safely ignore this email.</p>
    </div>
  `;

  if (!transporter) {
    // No SMTP configured (e.g. local dev) — log instead of failing silently.
    console.log(`\n[email:dev] Password reset link for ${to}:\n${resetUrl}\n`);
    return;
  }

  await transporter.sendMail({
    from: process.env.EMAIL_FROM ?? "ExamPrep <no-reply@examprep.app>",
    to,
    subject: "Reset your ExamPrep password",
    html,
  });
}
