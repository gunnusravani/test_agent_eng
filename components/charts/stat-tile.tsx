export function StatTile({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="text-sm text-muted-foreground">{label}</div>
      <div className={`mt-1 text-3xl font-semibold ${accent ? "text-[#2a78d6] dark:text-[#3987e5]" : "text-foreground"}`}>{value}</div>
    </div>
  );
}
