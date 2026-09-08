export type ActorType = 'customer' | 'admin' | 'system';

/** Canonical audit action names. Every privileged action MUST have an entry here. */
export const AuditAction = {
  // ── Auth ──────────────────────────────────────────────────────────────────
  ADMIN_LOGIN: 'admin.login',
  ADMIN_LOGIN_FAILED: 'admin.login_failed',
  ADMIN_LOCKOUT: 'admin.lockout',
  OTP_REQUESTED: 'auth.otp_requested',
  OTP_VERIFIED: 'auth.otp_verified',
  OTP_FAILED: 'auth.otp_failed',
  TOKEN_REFRESHED: 'auth.token_refreshed',
  LOGOUT: 'auth.logout',

  // ── Villages / Admins ─────────────────────────────────────────────────────
  VILLAGE_CREATED: 'village.created',
  VILLAGE_UPDATED: 'village.updated',
  ADMIN_CREATED: 'admin.created',
  ADMIN_UPDATED: 'admin.updated',
  ADMIN_ROLE_CHANGED: 'admin.role_changed',

  // ── Customers ─────────────────────────────────────────────────────────────
  CUSTOMER_REGISTERED: 'customer.registered',
  CUSTOMER_UPDATED: 'customer.updated',
  CUSTOMER_DEACTIVATED: 'customer.deactivated',
  KYC_UPDATED: 'customer.kyc_updated',
  DOCUMENT_UPLOADED: 'customer.document_uploaded',
  DOCUMENT_VERIFIED: 'customer.document_verified',
  BANK_DETAILS_UPDATED: 'customer.bank_details_updated',
  NOMINEE_UPDATED: 'customer.nominee_updated',
  NOMINEE_DELETED: 'customer.nominee_deleted',

  // ── KYC (mandatory gate — every transition is recorded) ───────────────────
  KYC_SUBMITTED: 'kyc.submitted',
  KYC_VERIFIED: 'kyc.verified',
  KYC_REJECTED: 'kyc.rejected',
  KYC_BYPASSED: 'kyc.bypassed',
  KYC_BLOCKED: 'kyc.blocked_attempt',

  // ── Pigmy / Ledger ────────────────────────────────────────────────────────
  PIGMY_CREATED: 'pigmy.created',
  PIGMY_STATUS_CHANGED: 'pigmy.status_changed',
  PIGMY_MATURED: 'pigmy.matured',
  PIGMY_INTEREST_CREDITED: 'pigmy.interest_credited',
  LEDGER_CREDIT: 'ledger.credit',
  LEDGER_DEBIT: 'ledger.debit',
  LEDGER_ADJUSTMENT: 'ledger.adjustment',
  LEDGER_REVERSAL: 'ledger.reversal',

  // ── Withdrawals (maker-checker) ───────────────────────────────────────────
  WITHDRAWAL_REQUESTED: 'withdrawal.requested',
  WITHDRAWAL_APPROVED: 'withdrawal.approved',
  WITHDRAWAL_REJECTED: 'withdrawal.rejected',
  WITHDRAWAL_CANCELLED: 'withdrawal.cancelled',
  WITHDRAWAL_PAID: 'withdrawal.paid',
  SCHEME_UPDATED: 'scheme.updated',

  // ── Loans (maker-checker: request → decide → disburse → repay) ────────────
  LOAN_REQUESTED: 'loan.requested',
  LOAN_APPROVED: 'loan.approved',
  LOAN_REJECTED: 'loan.rejected',
  LOAN_CANCELLED: 'loan.cancelled',
  LOAN_DISBURSED: 'loan.disbursed',
  LOAN_REPAYMENT_RECORDED: 'loan.repayment_recorded',
  LOAN_INSTALMENT_WAIVED: 'loan.instalment_waived',
  LOAN_CLOSED: 'loan.closed',
  LOAN_DEFAULTED: 'loan.defaulted',
  LOAN_OVERDUE_MARKED: 'loan.overdue_marked',
  LOAN_SETTINGS_UPDATED: 'loan.settings_updated',

  // ── Payments ──────────────────────────────────────────────────────────────
  PAYMENT_ORDER_CREATED: 'payment.order_created',
  PAYMENT_SUCCESS: 'payment.success',
  PAYMENT_FAILED: 'payment.failed',
  PAYMENT_WEBHOOK: 'payment.webhook_received',
  PAYMENT_RECONCILED: 'payment.reconciled',
  PAYMENT_RECONCILIATION_FAILED: 'payment.reconciliation_failed',

  // ── Reconciliation ────────────────────────────────────────────────────────
  RECONCILIATION_MATCHED: 'reconciliation.matched',
  RECONCILIATION_MISMATCH: 'reconciliation.mismatch',
  RECONCILIATION_RESOLVED: 'reconciliation.resolved',
  RECONCILIATION_INVESTIGATION: 'reconciliation.investigation',

  // ── Risk & Fraud ──────────────────────────────────────────────────────────
  RISK_ALERT_CREATED: 'risk.alert_created',
  RISK_ALERT_RESOLVED: 'risk.alert_resolved',
  RISK_ALERT_DISMISSED: 'risk.alert_dismissed',

  // ── Notifications ─────────────────────────────────────────────────────────
  NOTIFICATION_SENT: 'notification.sent',
  BROADCAST_SENT: 'notification.broadcast',

  // ── System ────────────────────────────────────────────────────────────────
  SYSTEM_HEALTH_CHECK: 'system.health_check',
  SYSTEM_CONFIG_CHANGED: 'system.config_changed',
  EXPORT_GENERATED: 'export.generated',
} as const;

export type AuditActionValue = (typeof AuditAction)[keyof typeof AuditAction];
