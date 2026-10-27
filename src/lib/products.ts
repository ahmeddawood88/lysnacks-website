import type { ImageMetadata } from 'astro';
import products from '../data/products.json';

export type Brand = 'L&Y' | 'Ramla';

export interface Product {
  slug: string;
  brand: Brand;
  name: string;
  nameAr: string;
  category: string;
  description: string;
  featured: boolean;
  /** Image file name (without extension) when it differs from the slug, e.g. a shared photo. */
  image?: string;
  /** Ramla color token from tokens.css, without the `--color-` prefix. */
  color?: string;
}

export const allProducts = products as Product[];

export function productsByBrand(brand: Brand): Product[] {
  return allProducts.filter((product) => product.brand === brand);
}

/** Groups products by category, keeping the order categories first appear in products.json. */
export function groupByCategory(list: Product[]): [string, Product[]][] {
  const groups = new Map<string, Product[]>();
  for (const product of list) {
    groups.set(product.category, [...(groups.get(product.category) ?? []), product]);
  }
  return [...groups];
}

/** Placeholder copy in products.json starts with "TODO" until Ahmed supplies it. */
export function isTodo(text: string): boolean {
  return text.trim().startsWith('TODO');
}

// Dropping a file named <slug>.jpg|png|webp into src/assets/products/ is all it takes.
const images = import.meta.glob<{ default: ImageMetadata }>(
  '/src/assets/products/*.{jpg,jpeg,png,webp}',
  { eager: true },
);

export function getProductImage(product: Product): ImageMetadata | undefined {
  const fileName = product.image ?? product.slug;
  const match = Object.entries(images).find(
    ([path]) => path.split('/').pop()?.replace(/\.[^.]+$/, '') === fileName,
  );
  return match?.[1].default;
}
