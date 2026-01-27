'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { usePayments } from '@/lib/hooks/usePayments';
import { formatCurrency, formatDateTime } from '@/lib/utils';
import { Payment, PaymentSummary } from '@/types';

interface PaymentsTabProps {
  initialPayments?: Payment[];
  initialSummary?: PaymentSummary;
}

export function PaymentsTab({ initialPayments, initialSummary }: PaymentsTabProps) {
  const router = useRouter();
  const { payments, summary, fetchTodayPayments } = usePayments();

  useEffect(() => { fetchTodayPayments(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const data = payments.length > 0 ? payments : (initialPayments || []);
  const summ = payments.length > 0 ? summary : (initialSummary || { cash: 0, gcash: 0, total: 0 });

  return (
    <div>
      <h2 className="text-xl font-bold mb-6">Today&apos;s Payments</h2>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
        <div className="bg-white p-6 rounded-lg shadow">
          <h3 className="text-sm font-medium text-gray-500">Cash Total</h3>
          <p className="text-3xl font-bold text-green-600">{formatCurrency(summ.cash)}</p>
        </div>
        <div className="bg-white p-6 rounded-lg shadow">
          <h3 className="text-sm font-medium text-gray-500">GCash Total</h3>
          <p className="text-3xl font-bold text-blue-600">{formatCurrency(summ.gcash)}</p>
        </div>
        <div className="bg-white p-6 rounded-lg shadow">
          <h3 className="text-sm font-medium text-gray-500">Overall Total</h3>
          <p className="text-3xl font-bold text-purple-600">{formatCurrency(summ.total)}</p>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-bold">Recent Payments</h3>
          <button onClick={() => router.push('/cashier')} className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700">
            Go to Cashier
          </button>
        </div>
        <div className="space-y-3 max-h-96 overflow-y-auto">
          {data.length === 0 ? (
            <p className="text-gray-500 text-center py-4">No payments today</p>
          ) : (
            data.map((payment) => (
              <div key={payment.id} className="border-l-4 border-blue-500 bg-gray-50 p-3 rounded">
                <div className="flex justify-between items-start">
                  <div>
                    <p className="font-semibold">{payment.appointment.participantName}</p>
                    <p className="text-sm text-gray-600">{payment.appointment.sacramentType}</p>
                    <p className="text-xs text-gray-500">{formatDateTime(payment.createdAt)}</p>
                    <p className="text-xs text-gray-500">Processed by: {payment.processedBy?.name}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-green-600">{formatCurrency(payment.amount)}</p>
                    <p className="text-xs text-gray-600">{payment.paymentMethod}</p>
                    <p className="text-xs text-gray-500">{payment.receiptNumber}</p>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
