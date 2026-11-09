const DJB2_SEED = 5381;

// Must stay byte-for-byte equivalent to lineHash in the admin panel's comments.js,
// because the panel and this extension compare each other's stored hashes.
export function lineHash(text: string): string {
  let hash = DJB2_SEED;
  for (let index = 0; index < text.length; index++) {
    hash = (hash << 5) + hash + text.charCodeAt(index);
    hash = hash & hash;
  }
  return (hash >>> 0).toString(16);
}
