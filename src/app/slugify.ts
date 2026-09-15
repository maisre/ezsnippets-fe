/**
 * Client-side mirror of ez-api's `common/slugify.ts`.
 *
 * Used only to show the customer the URL they are actually going to get while
 * they type — the server normalises independently and remains the authority.
 * Without this the preview under the field shows raw input
 * ("…/Stans HVAC") while the saved value is "stans-hvac", which reads as a bug.
 *
 * Keep the transform identical to the server's.
 */
export function slugify(value: string): string {
  return (value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
