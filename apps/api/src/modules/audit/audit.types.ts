export type ActorType = 'customer' | 'admin' | 'system';

/** Canonical audit action names (extend as needed). */
export const AuditAction = {
  // auth
  ADMIN_LOGIN: 'admin.login',
  OTP_REQUESTED: 'auth.otp_requested',
  OTP_VERIFIED: 'auth.otp_verified',
  TOKEN_REFRESHED: 'auth.token_refreshed',
  LOGOUT: 'auth.logout',
  // villages / admins
  VILLAGE_CREATED: 'village.created',
  VILLAGE_UPDATED: 'village.updated',
  ADMIN_CREATED: 'admin.created',
  ADMIN_UPDATED: 'admin.updated',
  // customers
  CUSTOMER_REGISTERED: 'customer.registered',
  CUSTOMER_UPDATED: 'customer.updated',
  KYC_UPDATED: 'customer.kyc_updated',
  DOCUMENT_UPLOADED: 'customer.document_uploaded',
  DOCUMENT_VERIFIED: 'customer.document_verified',
  BANK_DETAILS_UPDATED: 'customer.bank_details_updated',
  NOMINEE_UPDATED: 'customer.nominee_updated',
  NOMINEE_DELETED: 'customer.nominee_deleted',
  // KYC (mandatory gate — every transition is recorded, bypass especially)
  KYC_SUBMITTED: 'kyc.submitted',
  KYC_VERIFIED: 'kyc.verified',
  KYC_REJECTED: 'kyc.rejected',
  KYC_BYPASSED: 'kyc.bypassed',
  KYC_BLOCKED: 'kyc.blocked_attempt',
  // pigmy / ledger
  PIGMY_CREATED: 'pigmy.created',
  PIGMY_STATUS_CHANGED: 'pigmy.status_changed',
  PIGMY_MATURED: 'pigmy.matured',
  PIGMY_INTEREST_CREDITED: 'pigmy.interest_credited',
  LEDGER_CREDIT: 'ledger.credit',
  LEDGER_DEBIT: 'ledger.debit',
  // withdrawals (maker-checker)
  WITHDRAWAL_REQUESTED: 'withdrawal.requested',
  WITHDRAWAL_APPROVED: 'withdrawal.approved',
  WITHDRAWAL_REJECTED: 'withdrawal.rejected',
  WITHDRAWAL_CANCELLED: 'withdrawal.cancelled',
  WITHDRAWAL_PAID: 'withdrawal.paid',
  SCHEME_UPDATED: 'scheme.updated',
  // loans (maker-checker: request → decide → disburse → repay)
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
  // payments
  PAYMENT_ORDER_CREATED: 'payment.order_created',
  PAYMENT_SUCCESS: 'payment.success',
  PAYMENT_FAILED: 'payment.failed',
  PAYMENT_WEBHOOK: 'payment.webhook_received',
  // notifications
  NOTIFICATION_SENT: 'notification.sent',
  BROADCAST_SENT: 'notification.broadcast',
} as const;

export type AuditActionValue = (typeof AuditAction)[keyof typeof AuditAction];
