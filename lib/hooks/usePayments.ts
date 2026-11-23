'use client';

import { useState, useCallback } from 'react';
import { Payment, PaymentSummary } from '@/types';

export function usePayments() {
  const [payments, setPayments] = useState<Payment[]>([]);
  const [summary, setSummary] = useState<PaymentSummary>({ cash: 0, gcash: 0, total: 0 });
  const [loading, setLoading] = useState(false);

  const fetchTodayPayments = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/payments/today');
      const data = await response.json();
      setPayments(data.payments || []);
      setSummary(data.summary || { cash: 0, gcash: 0, total: 0 });
    } catch (error) {
      console.error('Error fetching payments:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  const processPayment = useCallback(
    async (paymentData: {
      appointmentId: string;
      amount: number;
      paymentMethod: string;
      gcashRefNumber?: string | null;
    }) => {
      const response = await fetch('/api/payments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(paymentData),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Payment failed');
      }
      return data;
    },
    []
  );

  const reversePayment = useCallback(async (paymentId: string, reason: string) => {
    const response = await fetch(`/api/payments/${paymentId}/reverse`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason }),
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || 'Failed to reverse payment');
    }
    return data;
  }, []);

  return { payments, summary, loading, fetchTodayPayments, processPayment, reversePayment };
}
