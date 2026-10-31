"""Payment-provider abstraction.

No provider is bundled or enabled by default. Integrators should subclass
PaymentProvider, implement create_checkout() and verify_webhook(), register the
class in PROVIDERS, and set PAYMENT_PROVIDER + secrets in the environment.
VIP must never be granted from client-side claims: only a verified server-side
webhook (or an audited owner/admin manual grant) may extend vip_until.
"""
from __future__ import annotations

import hmac
from dataclasses import dataclass
from hashlib import sha256

from sqlalchemy.orm import Session

from .config import settings
from .models import User, VipPlan


@dataclass
class CheckoutSession:
    url: str
    external_id: str | None = None


class PaymentProvider:
    name = "base"

    @property
    def configured(self) -> bool:
        return False

    def create_checkout(self, db: Session, user: User, plan: VipPlan) -> CheckoutSession:
        raise NotImplementedError

    def verify_webhook(self, raw_body: bytes, headers: dict[str, str]) -> dict:
        raise NotImplementedError


class NoPaymentProvider(PaymentProvider):
    name = "none"

    @property
    def configured(self) -> bool:
        return False


PROVIDERS: dict[str, type[PaymentProvider]] = {}


def get_provider() -> PaymentProvider:
    provider_cls = PROVIDERS.get(settings.payment_provider)
    if provider_cls is None:
        return NoPaymentProvider()
    return provider_cls()


def verify_hmac_signature(raw_body: bytes, signature: str | None, secret: str | None = None) -> bool:
    secret_value = secret or settings.payment_webhook_secret
    if not secret_value or not signature:
        return False
    expected = hmac.new(secret_value.encode(), raw_body, sha256).hexdigest()
    return hmac.compare_digest(expected, signature.strip().lower())
