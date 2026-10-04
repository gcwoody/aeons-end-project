/** Merge static content tables while rejecting duplicate or mismatched IDs. */
export function mergeCatalogs<T extends { id: string }>(...catalogs: Array<Record<string, T>>): Record<string, T> {
  const merged: Record<string, T> = {}
  for (const catalog of catalogs) {
    for (const [key, item] of Object.entries(catalog)) {
      if (key !== item.id) {
        throw new Error(`Catalog key "${key}" does not match content ID "${item.id}"`)
      }
      if (Object.prototype.hasOwnProperty.call(merged, key)) {
        throw new Error(`Duplicate content ID "${key}" while building the static catalog`)
      }
      merged[key] = item
    }
  }
  return merged
}
