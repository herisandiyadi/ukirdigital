"""
WhatsApp service menggunakan Twilio.
Untuk production: isi TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_WHATSAPP_NUMBER di .env
"""
import logging
from app.core.config import settings

logger = logging.getLogger(__name__)

try:
    from twilio.rest import Client
    TWILIO_AVAILABLE = True
except ImportError:
    TWILIO_AVAILABLE = False
    logger.warning("Twilio not installed. Run: pip install twilio")


def send_whatsapp_message(to_phone: str, message: str) -> bool:
    """
    Kirim pesan WhatsApp ke nomor telepon.
    to_phone: nomor dalam format internasional (contoh: +62812345678)
    message: isi pesan
    Returns: True jika berhasil, False jika gagal
    """
    if not settings.TWILIO_ACCOUNT_SID or not settings.TWILIO_AUTH_TOKEN:
        logger.info(
            "[WHATSAPP MOCK] To: %s | Message: %s",
            to_phone,
            message,
        )
        return True
    
    if not TWILIO_AVAILABLE:
        logger.error("Twilio is not installed")
        return False
    
    try:
        client = Client(settings.TWILIO_ACCOUNT_SID, settings.TWILIO_AUTH_TOKEN)
        msg = client.messages.create(
            from_=settings.TWILIO_WHATSAPP_NUMBER,
            to=f"whatsapp:{to_phone}",
            body=message,
        )
        logger.info("WhatsApp message sent: %s", msg.sid)
        return True
    except Exception as exc:
        logger.error("Failed to send WhatsApp message to %s: %s", to_phone, exc)
        return False


def send_verification_whatsapp(phone: str, username: str, token: str) -> bool:
    """Kirim kode verifikasi via WhatsApp."""
    verify_url = f"{settings.FRONTEND_URL}/verify-email?token={token}"
    message = f"""Halo {username}! 👋

Verifikasi akun Anda di {settings.APP_NAME}.

Klik link ini untuk verifikasi (berlaku 24 jam):
{verify_url}

Jika tidak ingin mendaftar, abaikan pesan ini."""
    
    return send_whatsapp_message(phone, message)


def send_reset_password_whatsapp(phone: str, username: str, token: str) -> bool:
    """Kirim link reset password via WhatsApp."""
    reset_url = f"{settings.FRONTEND_URL}/reset-password?token={token}"
    message = f"""Halo {username}! 🔐

Anda meminta reset password untuk akun {settings.APP_NAME}.

Klik link ini untuk reset password (berlaku 1 jam):
{reset_url}

Jika tidak meminta reset, abaikan pesan ini."""
    
    return send_whatsapp_message(phone, message)


def send_welcome_whatsapp(phone: str, username: str) -> bool:
    """Kirim pesan selamat datang via WhatsApp."""
    message = f"""Selamat datang di {settings.APP_NAME}! 🎉

Halo {username},

Akun Anda sudah siap digunakan. Mulai ubah gambar PNG menjadi format 3D profesional (STL, SVG, DXF) dengan kekuatan AI.

Buka aplikasi sekarang: {settings.FRONTEND_URL}"""
    
    return send_whatsapp_message(phone, message)


def send_conversion_complete_whatsapp(
    phone: str,
    username: str,
    filename: str,
    output_format: str,
    job_id: str,
) -> bool:
    """Notifikasi konversi selesai via WhatsApp."""
    download_url = f"{settings.FRONTEND_URL}/history?job={job_id}"
    message = f"""Konversi Selesai! ✅

Halo {username},

File {filename} berhasil dikonversi ke format {output_format.upper()}.

Lihat & unduh di sini:
{download_url}

File otomatis dihapus setelah 7 hari."""
    
    return send_whatsapp_message(phone, message)
