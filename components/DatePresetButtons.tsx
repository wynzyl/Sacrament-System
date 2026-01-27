'use client';

interface DatePresetButtonsProps {
  onSetDates: (from: string, to: string) => void;
}

export function DatePresetButtons({ onSetDates }: DatePresetButtonsProps) {
  const toDateStr = (d: Date) => d.toISOString().split('T')[0];

  return (
    <div className="mb-4">
      <label className="block text-sm font-medium text-gray-700 mb-2">Quick Select</label>
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => {
            const d = toDateStr(new Date());
            onSetDates(d, d);
          }}
          className="px-3 py-1 text-sm bg-gray-100 hover:bg-gray-200 rounded-lg"
        >
          Today
        </button>
        <button
          onClick={() => {
            const today = new Date();
            const start = new Date(today);
            start.setDate(today.getDate() - today.getDay());
            const end = new Date(start);
            end.setDate(start.getDate() + 6);
            onSetDates(toDateStr(start), toDateStr(end));
          }}
          className="px-3 py-1 text-sm bg-gray-100 hover:bg-gray-200 rounded-lg"
        >
          This Week
        </button>
        <button
          onClick={() => {
            const today = new Date();
            const start = new Date(today.getFullYear(), today.getMonth(), 1);
            const end = new Date(today.getFullYear(), today.getMonth() + 1, 0);
            onSetDates(toDateStr(start), toDateStr(end));
          }}
          className="px-3 py-1 text-sm bg-gray-100 hover:bg-gray-200 rounded-lg"
        >
          This Month
        </button>
        <button
          onClick={() => {
            const today = new Date();
            const start = new Date(today.getFullYear(), today.getMonth() - 1, 1);
            const end = new Date(today.getFullYear(), today.getMonth(), 0);
            onSetDates(toDateStr(start), toDateStr(end));
          }}
          className="px-3 py-1 text-sm bg-gray-100 hover:bg-gray-200 rounded-lg"
        >
          Last Month
        </button>
      </div>
    </div>
  );
}
