interface StatsData {
  transactions: string;
  volume: string;
  buyers: string;
  sellers: string;
}

const STATIC_STATS: StatsData = {
  transactions: "39.04M",
  volume: "$23.32M",
  buyers: "342.65K",
  sellers: "69K",
};

interface StatItemProps {
  value: string;
  label: string;
}

function StatItem({ value, label }: StatItemProps) {
  return (
    <div className="flex flex-col items-center md:items-end gap-1.5">
      <div className="text-3xl sm:text-4xl md:text-[56px] font-display leading-none tracking-tighter text-black">
        {value}
      </div>
      <div className="text-xs sm:text-sm font-medium text-gray-40 text-center md:text-right">{label}</div>
    </div>
  );
}

export function StatsSection() {
  return (
    <section className="bg-white py-10 sm:py-12 md:py-14 px-4 sm:px-6 md:px-10 lg:px-16" aria-label="Platform statistics">
      <div className="max-w-container mx-auto flex flex-col md:flex-row items-start md:items-center gap-6 md:gap-16 lg:gap-32">
        <div className="text-sm text-black text-left md:text-center w-auto md:w-20">
          Last 30 days
        </div>
        <div className="flex flex-wrap gap-6 sm:gap-8 md:gap-16 lg:gap-32">
          <StatItem value={STATIC_STATS.transactions} label="Transactions" />
          <StatItem value={STATIC_STATS.volume} label="Volume" />
          <StatItem value={STATIC_STATS.buyers} label="Buyers" />
          <StatItem value={STATIC_STATS.sellers} label="Sellers" />
        </div>
      </div>
    </section>
  );
}