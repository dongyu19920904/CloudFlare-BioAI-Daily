globalThis.fetch = async () => {
  throw new Error('Offline tests forbid real network/model calls; inject a fixture fetcher.');
};
