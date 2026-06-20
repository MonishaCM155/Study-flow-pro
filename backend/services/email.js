// services/email.js
import nodemailer from 'nodemailer';

let transporter = null;

function getTransporter() {
  if (transporter) return transporter;

  transporter = nodemailer.createTransport({
    host: process.env.EMAIL_HOST,
    port: parseInt(process.env.EMAIL_PORT || '587'),
    secure: process.env.EMAIL_SECURE === 'true',
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
    tls: { rejectUnauthorized: process.env.NODE_ENV === 'production' },
  });

  return transporter;
}

export async function verifyEmailConfig() {
  try {
    const t = getTransporter();
    await t.verify();
    return { ok: true };
  } catch (err) {
    console.warn('[Email] SMTP verify failed:', err.message);
    return { ok: false, error: err.message };
  }
}

/* ── INVITE EMAIL ──────────────────────────── */
export async function sendInviteEmail({ to, toName, fromName, group, inviteToken, appUrl }) {
  const acceptUrl = `${appUrl}/accept-invite?token=${inviteToken}`;
  const appUrlBase = process.env.FRONTEND_URL || appUrl;

  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>You're Invited to StudyFlow Pro</title>
</head>
<body style="margin:0;padding:0;background:#0a0b0e;font-family:'Segoe UI',Helvetica,Arial,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0a0b0e;padding:40px 20px">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#111318;border:1px solid #ffffff1e;border-radius:20px;overflow:hidden;max-width:560px">
        <!-- Header -->
        <tr>
          <td style="background:linear-gradient(135deg,#00d4ff18,#a78bfa18);padding:36px 40px;text-align:center;border-bottom:1px solid #ffffff12">
            <div style="display:inline-flex;align-items:center;justify-content:center;width:52px;height:52px;background:linear-gradient(135deg,#00d4ff,#a78bfa);border-radius:14px;margin-bottom:16px;font-size:22px;font-weight:900;color:#fff">SF</div>
            <h1 style="margin:0;font-size:26px;font-weight:800;color:#f0f2f7;letter-spacing:-0.5px">StudyFlow Pro</h1>
            <p style="margin:6px 0 0;font-size:13px;color:#8892a4;letter-spacing:0.05em;text-transform:uppercase">Study Smarter. Together.</p>
          </td>
        </tr>
        <!-- Body -->
        <tr>
          <td style="padding:36px 40px">
            <h2 style="margin:0 0 12px;font-size:22px;font-weight:800;color:#f0f2f7">
              Hey ${toName || 'there'} 👋
            </h2>
            <p style="margin:0 0 20px;font-size:15px;color:#d0d4e0;line-height:1.6">
              <strong style="color:#00d4ff">${fromName}</strong> has invited you to join their study group
              <strong style="color:#a78bfa">"${group || 'StudyFlow'}"</strong> on StudyFlow Pro.
            </p>
            <p style="margin:0 0 28px;font-size:14px;color:#8892a4;line-height:1.6">
              StudyFlow Pro is an AI-powered student productivity platform with task management,
              Pomodoro timers, smart reminders, and real-time group collaboration — all in one place.
            </p>

            <!-- CTA Button -->
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr><td align="center" style="padding:4px 0 28px">
                <a href="${acceptUrl}"
                   style="display:inline-block;background:linear-gradient(135deg,#00d4ff,#a78bfa);color:#fff;text-decoration:none;font-size:15px;font-weight:700;padding:14px 36px;border-radius:10px;letter-spacing:0.02em">
                  Accept Invitation →
                </a>
              </td></tr>
            </table>

            <!-- Feature pills -->
            <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:28px">
              <tr>
                <td style="padding:4px">
                  <div style="background:#ffffff08;border:1px solid #ffffff12;border-radius:10px;padding:14px;text-align:center">
                    <div style="font-size:20px;margin-bottom:4px">📋</div>
                    <div style="font-size:12px;font-weight:700;color:#f0f2f7">Task Board</div>
                    <div style="font-size:11px;color:#8892a4">Kanban & Timeline</div>
                  </div>
                </td>
                <td width="8"></td>
                <td style="padding:4px">
                  <div style="background:#ffffff08;border:1px solid #ffffff12;border-radius:10px;padding:14px;text-align:center">
                    <div style="font-size:20px;margin-bottom:4px">🍅</div>
                    <div style="font-size:12px;font-weight:700;color:#f0f2f7">Pomodoro</div>
                    <div style="font-size:11px;color:#8892a4">Focus Timer</div>
                  </div>
                </td>
                <td width="8"></td>
                <td style="padding:4px">
                  <div style="background:#ffffff08;border:1px solid #ffffff12;border-radius:10px;padding:14px;text-align:center">
                    <div style="font-size:20px;margin-bottom:4px">🔔</div>
                    <div style="font-size:12px;font-weight:700;color:#f0f2f7">Reminders</div>
                    <div style="font-size:11px;color:#8892a4">Smart Alarms</div>
                  </div>
                </td>
              </tr>
            </table>

            <p style="margin:0;font-size:12px;color:#5c6478;line-height:1.6">
              This invitation link expires in 7 days. If you didn't expect this invite, you can safely ignore this email.
              <br><br>
              <span style="word-break:break-all;color:#3d4456">${acceptUrl}</span>
            </p>
          </td>
        </tr>
        <!-- Footer -->
        <tr>
          <td style="padding:20px 40px;border-top:1px solid #ffffff12;text-align:center">
            <p style="margin:0;font-size:11px;color:#5c6478">
              © ${new Date().getFullYear()} StudyFlow Pro · Built with ❤️ for students everywhere
            </p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  const text = `
StudyFlow Pro — Study Invitation

Hey ${toName || 'there'}!

${fromName} has invited you to join their study group "${group || 'StudyFlow'}" on StudyFlow Pro.

Accept your invitation here:
${acceptUrl}

This link expires in 7 days.

— The StudyFlow Pro Team
`;

  await getTransporter().sendMail({
    from: process.env.EMAIL_FROM || `"StudyFlow Pro" <${process.env.EMAIL_USER}>`,
    to: `${toName || ''} <${to}>`.trim(),
    subject: `${fromName} invited you to study on StudyFlow Pro 🎓`,
    html,
    text,
  });
}

/* ── ALARM REMINDER EMAIL ──────────────────── */
export async function sendAlarmReminderEmail({ to, toName, alarmLabel, alarmTime }) {
  const html = `
<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><title>StudyFlow Reminder</title></head>
<body style="margin:0;padding:0;background:#0a0b0e;font-family:'Segoe UI',Helvetica,Arial,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0a0b0e;padding:40px 20px">
    <tr><td align="center">
      <table width="480" cellpadding="0" cellspacing="0" style="background:#111318;border:1px solid #ffffff1e;border-radius:20px;overflow:hidden;max-width:480px">
        <tr>
          <td style="background:linear-gradient(135deg,#fbbf2418,#f8717118);padding:28px 36px;text-align:center;border-bottom:1px solid #ffffff12">
            <div style="font-size:40px;margin-bottom:8px">⏰</div>
            <h1 style="margin:0;font-size:20px;font-weight:800;color:#f0f2f7">Study Reminder</h1>
            <p style="margin:6px 0 0;font-size:13px;color:#8892a4">StudyFlow Pro</p>
          </td>
        </tr>
        <tr>
          <td style="padding:30px 36px;text-align:center">
            <p style="margin:0 0 8px;font-size:16px;color:#d0d4e0">Hey ${toName || 'there'}, time to study!</p>
            <h2 style="margin:0 0 12px;font-size:24px;font-weight:800;color:#fbbf24">${alarmLabel}</h2>
            <p style="margin:0 0 24px;font-size:13px;color:#8892a4">Scheduled for: ${alarmTime}</p>
            <a href="${process.env.FRONTEND_URL || 'https://deft-stardust-9e7614.netlify.app/'}"
               style="display:inline-block;background:linear-gradient(135deg,#fbbf24,#f87171);color:#000;text-decoration:none;font-size:14px;font-weight:700;padding:12px 28px;border-radius:10px">
              Open StudyFlow Pro →
            </a>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  await getTransporter().sendMail({
    from: process.env.EMAIL_FROM,
    to: `${toName || ''} <${to}>`.trim(),
    subject: `⏰ Reminder: ${alarmLabel} — StudyFlow Pro`,
    html,
    text: `StudyFlow Pro Reminder\n\nHey ${toName}!\n\nYour alarm "${alarmLabel}" is scheduled for ${alarmTime}.\n\nOpen StudyFlow Pro to get started.`,
  });
}
