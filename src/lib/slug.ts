/** URL-safe slug from arbitrary text: "Basic Physics 101!" -> "basic-physics-101". */
export function slugify(input: string) {
  return input
    .toLowerCase()
    .trim()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "") // strip accents left behind by NFKD
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/[\s-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
