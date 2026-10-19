// Offline only. No network, credentials, real identities or remote insertion.
export function isolatedCollectors() {
  return Object.fromEntries([["lab-a", 9], ["lab-b", 1200]].map(([collector, count]) => [collector, {
    collector,
    records: Array.from({ length: count }, (_, i) => ({
      fixture_key: `${collector}-owned-${String(i + 1).padStart(4, "0")}`,
      card_id: `${collector}-fictional-printing-${i + 1}`,
      card_name: `FICTIONAL ${collector.toUpperCase()} Card ${i + 1}`,
      set_id: `${collector}-fictional-set`,
      card_number: String(i + 1),
      quantity: collector === "lab-a" ? 1 : 1 + i % 3,
      language: collector === "lab-a" ? "English" : "Japanese",
      variant: collector === "lab-a" ? "Normal" : "Holo",
      is_looking_for: false,
    })),
  }]));
}
// Export payloads only after the approved operator verifies the isolated session.
// Ownership is assigned by Base44, never supplied by this fixture.
export function insertionPayloads(collector) {
  const collectors = isolatedCollectors();
  const fixture = Object.hasOwn(collectors, collector) ? collectors[collector] : null;
  if (!fixture) throw Error("Unknown fictional collector");
  return fixture.records.map(({ fixture_key, ...fields }) => fields);
}
