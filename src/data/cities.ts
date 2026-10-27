// Cities where L&Y / Ramla are sold (from CLAUDE.md), alphabetical.
// The /customers page groups stores under these same anchors.
export const cities = ['Corona', 'El Cajon', 'Moreno Valley', 'Murrieta', 'Riverside', 'Temecula'];

export function citySlug(city: string): string {
  return city.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}
