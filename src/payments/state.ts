import type {CheckoutSessionRecord, PaymentRecord, PaymentStatus} from '../api/types';
import {formatCurrency} from '../utils/format';

export type MobilePaymentState = {
  checkoutSession?: CheckoutSessionRecord | null;
  message: string;
  payment?: PaymentRecord | null;
  status: 'action_needed' | 'canceled' | 'failed' | 'pending' | 'processing' | 'refunded' | 'succeeded' | 'unknown';
};

export function normalizePaymentStatus(status: string | null | undefined): MobilePaymentState['status'] {
  switch (status) {
    case 'canceled':
    case 'cancelled':
      return 'canceled';
    case 'failed':
      return 'failed';
    case 'pending':
    case 'initiated':
      return 'pending';
    case 'processing':
      return 'processing';
    case 'refunded':
      return 'refunded';
    case 'succeeded':
    case 'paid':
    case 'completed':
      return 'succeeded';
    default:
      return 'unknown';
  }
}

export function paymentStateFromRecords(input: {
  checkoutSession?: CheckoutSessionRecord | null;
  locale?: string;
  payment?: PaymentRecord | null;
  redirectStatus?: string | null;
}): MobilePaymentState {
  const paymentStatus = input.payment?.status;
  const sessionStatus = input.checkoutSession?.status;
  const status = normalizePaymentStatus(paymentStatus ?? sessionStatus ?? input.redirectStatus);
  const amount =
    input.payment && input.payment.amountCents > 0
      ? formatCurrency(input.payment.amountCents, input.payment.currency, input.locale)
      : null;

  if (status === 'succeeded') {
    return {
      checkoutSession: input.checkoutSession,
      message: amount
        ? `Payment confirmed for ${amount}. Receipt details will stay attached to this event.`
        : 'Payment is confirmed. Receipt details will stay attached to this event.',
      payment: input.payment,
      status,
    };
  }

  if (status === 'canceled') {
    return {
      checkoutSession: input.checkoutSession,
      message: 'Checkout was canceled. Your RSVP has not been marked as paid.',
      payment: input.payment,
      status,
    };
  }

  if (status === 'failed') {
    return {
      checkoutSession: input.checkoutSession,
      message: 'Payment failed. Try checkout again or contact the organizer if money was captured.',
      payment: input.payment,
      status,
    };
  }

  if (status === 'refunded') {
    return {
      checkoutSession: input.checkoutSession,
      message: 'This payment has been refunded. The event record keeps the refund trail visible.',
      payment: input.payment,
      status,
    };
  }

  if (status === 'processing') {
    return {
      checkoutSession: input.checkoutSession,
      message: 'Payment is processing. Refresh status before assuming your place is confirmed.',
      payment: input.payment,
      status,
    };
  }

  if (status === 'pending') {
    return {
      checkoutSession: input.checkoutSession,
      message: 'Checkout is open or pending. Samgamam will show success only after the backend confirms it.',
      payment: input.payment,
      status,
    };
  }

  return {
    checkoutSession: input.checkoutSession,
    message:
      input.redirectStatus === 'succeeded'
        ? 'The provider returned a success signal. Refresh payment status so the backend can confirm it.'
        : 'Payment status is not confirmed yet. Refresh before making event access decisions.',
    payment: input.payment,
    status: input.redirectStatus ? normalizePaymentStatus(input.redirectStatus) : 'unknown',
  };
}

export function paymentStatusTone(status: MobilePaymentState['status']): 'accent' | 'default' | 'success' | 'warning' {
  if (status === 'succeeded') {
    return 'success';
  }

  if (status === 'failed' || status === 'canceled') {
    return 'warning';
  }

  if (status === 'pending' || status === 'processing' || status === 'unknown') {
    return 'accent';
  }

  return 'default';
}

export function isFinalPaymentStatus(status: PaymentStatus | CheckoutSessionRecord['status'] | undefined) {
  return status === 'succeeded' || status === 'failed' || status === 'refunded' || status === 'canceled';
}
