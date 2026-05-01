"""
Email service — mock mode jika SMTP tidak dikonfigurasi.
Untuk production: isi SMTP_HOST, SMTP_USER, SMTP_PASSWORD di .env
"""
import smtplib
import logging
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart

from app.core.config import settings

logger = logging.getLogger(__name__)


def _send_smtp(to_email: str, subject: str, html_body: str) -> None:
    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = f"{settings.EMAILS_FROM_NAME} <{settings.EMAILS_FROM_EMAIL}>"
    msg["To"] = to_email
    msg.attach(MIMEText(html_body, "html"))

    with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT) as server:
        server.ehlo()
        server.starttls()
        server.login(settings.SMTP_USER, settings.SMTP_PASSWORD)
        server.sendmail(settings.EMAILS_FROM_EMAIL, to_email, msg.as_string())


def send_email(to_email: str, subject: str, html_body: str) -> None:
    """Entry point — kirim email atau log mock jika SMTP belum di-setup."""
    if not settings.SMTP_HOST:
        logger.info(
            "[EMAIL MOCK] To: %s | Subject: %s\n%s",
            to_email,
            subject,
            html_body,
        )
        return
    try:
        _send_smtp(to_email, subject, html_body)
        logger.info("Email sent to %s", to_email)
    except Exception as exc:
        logger.error("Failed to send email to %s: %s", to_email, exc)


# ── Email templates ─────────────────────────────────────────────────────────

def send_verification_email(to_email: str, username: str, token: str) -> None:
    verify_url = f"{settings.FRONTEND_URL}/verify-email?token={token}"
    html = f"""
    <h2>Verifikasi Email – {settings.APP_NAME}</h2>
    <p>Halo <b>{username}</b>,</p>
    <p>Klik tombol di bawah untuk memverifikasi akun Anda (berlaku 24 jam):</p>
    <p>
      <a href="{verify_url}"
         style="background:#6366f1;color:#fff;padding:12px 24px;border-radius:6px;
                text-decoration:none;font-weight:bold;">
        Verifikasi Email
      </a>
    </p>
    <p>Atau salin link ini:<br><code>{verify_url}</code></p>
    <hr>
    <small>Jika Anda tidak mendaftar, abaikan email ini.</small>
    """
    send_email(to_email, f"Verifikasi Email – {settings.APP_NAME}", html)


def send_reset_password_email(to_email: str, username: str, token: str) -> None:
    reset_url = f"{settings.FRONTEND_URL}/reset-password?token={token}"
    html = f"""
    <h2>Reset Password – {settings.APP_NAME}</h2>
    <p>Halo <b>{username}</b>,</p>
    <p>Klik tombol di bawah untuk reset password Anda (berlaku 1 jam):</p>
    <p>
      <a href="{reset_url}"
         style="background:#ef4444;color:#fff;padding:12px 24px;border-radius:6px;
                text-decoration:none;font-weight:bold;">
        Reset Password
      </a>
    </p>
    <p>Atau salin link ini:<br><code>{reset_url}</code></p>
    <hr>
    <small>Jika Anda tidak meminta reset password, abaikan email ini.</small>
    """
    send_email(to_email, f"Reset Password – {settings.APP_NAME}", html)


def send_welcome_email(to_email: str, username: str) -> None:
    dashboard_url = f"{settings.FRONTEND_URL}/dashboard"
    html = f"""
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
      <h2 style="color:#6366f1">Welcome to {settings.APP_NAME}! 🎉</h2>
      <p>Hi <b>{username}</b>,</p>
      <p>Your account is ready. Start converting PNG images to professional 3D formats
         (STL, SVG, DXF) powered by AI.</p>
      <p>
        <a href="{dashboard_url}"
           style="background:#6366f1;color:#fff;padding:12px 24px;border-radius:6px;
                  text-decoration:none;font-weight:bold;">
          Go to Dashboard
        </a>
      </p>
      <hr>
      <small>You're receiving this because you just created an account at {settings.APP_NAME}.</small>
    </div>
    """
    send_email(to_email, f"Welcome to {settings.APP_NAME}!", html)


def send_conversion_complete_email(
    to_email: str,
    username: str,
    filename: str,
    output_format: str,
    job_id: str,
) -> None:
    download_url = f"{settings.FRONTEND_URL}/history?job={job_id}"
    html = f"""
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
      <h2 style="color:#10b981">Conversion Complete ✅</h2>
      <p>Hi <b>{username}</b>,</p>
      <p>Your file <b>{filename}</b> has been successfully converted to
         <b>{output_format.upper()}</b>.</p>
      <p>
        <a href="{download_url}"
           style="background:#10b981;color:#fff;padding:12px 24px;border-radius:6px;
                  text-decoration:none;font-weight:bold;">
          View &amp; Download
        </a>
      </p>
      <hr>
      <small>Files are automatically deleted after 7 days.</small>
    </div>
    """
    send_email(to_email, f"Conversion Complete – {filename} → {output_format.upper()}", html)


def send_limit_warning_email(
    to_email: str,
    username: str,
    used: int,
    max_allowed: int,
    scope: str = "daily",
) -> None:
    pct = round(used / max_allowed * 100) if max_allowed else 0
    upgrade_url = f"{settings.FRONTEND_URL}/settings"
    html = f"""
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
      <h2 style="color:#f59e0b">Usage Limit Warning ⚠️</h2>
      <p>Hi <b>{username}</b>,</p>
      <p>You have used <b>{used}</b> of your <b>{max_allowed}</b> {scope} conversions
         (<b>{pct}%</b>).</p>
      <p>Consider upgrading your plan to avoid interruptions.</p>
      <p>
        <a href="{upgrade_url}"
           style="background:#f59e0b;color:#fff;padding:12px 24px;border-radius:6px;
                  text-decoration:none;font-weight:bold;">
          Manage Account
        </a>
      </p>
    </div>
    """
    send_email(to_email, f"You've used {pct}% of your {scope} limit – {settings.APP_NAME}", html)


def send_account_suspended_email(to_email: str, username: str, reason: str = "") -> None:
    support_url = f"{settings.FRONTEND_URL}/support"
    reason_line = f"<p><b>Reason:</b> {reason}</p>" if reason else ""
    html = f"""
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
      <h2 style="color:#ef4444">Account Suspended 🚫</h2>
      <p>Hi <b>{username}</b>,</p>
      <p>Your account on <b>{settings.APP_NAME}</b> has been suspended.</p>
      {reason_line}
      <p>If you believe this is a mistake, please contact support.</p>
      <p>
        <a href="{support_url}"
           style="background:#ef4444;color:#fff;padding:12px 24px;border-radius:6px;
                  text-decoration:none;font-weight:bold;">
          Contact Support
        </a>
      </p>
    </div>
    """
    send_email(to_email, f"Your account has been suspended – {settings.APP_NAME}", html)
