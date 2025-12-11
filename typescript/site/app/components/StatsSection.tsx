interface StatsData {
  transactions: string;
  volume: string;
  buyers: string;
  sellers: string;
}

const STATIC_STATS: StatsData = {
  transactions: "75.41M",
  volume: "$24.24M",
  buyers: "94.06K",
  sellers: "22K",
};

interface StatItemProps {
  value: string;
  label: string;
}

function StatItem({ value, label }: StatItemProps) {
  return (
    <div className="flex flex-col items-start gap-1.5">
      <div className="text-3xl sm:text-4xl md:text-[56px] font-display leading-none tracking-tighter text-black">
        {value}
      </div>
      <div className="text-xs sm:text-sm font-medium text-gray-40">{label}</div>
    </div>
  );
}

export function StatsSection() {
  return (
    <section className="max-w-container mx-auto px-4 sm:px-6 md:px-10 py-10 sm:py-12 md:py-14" aria-label="Platform statistics">
      <div className="flex flex-wrap items-end gap-6 sm:gap-8 md:gap-16 lg:gap-20">
          <StatItem value={STATIC_STATS.transactions} label="Transactions" />
          <StatItem value={STATIC_STATS.volume} label="Volume" />
          <StatItem value={STATIC_STATS.buyers} label="Buyers" />
          <StatItem value={STATIC_STATS.sellers} label="Sellers" />
        <div className="flex flex-col items-start gap-1.5">
          <div className="text-3xl sm:text-4xl md:text-[56px] font-display leading-none tracking-tighter text-black invisible">0</div>
          <div className="text-xs sm:text-sm font-medium text-gray-40">Last 30 days</div>
        </div>
      </div>
    </section>
  );
}
