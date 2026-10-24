// Font files (.ttf, .otf, .woff, .woff2) the user adds. They are read in this
// browser and kept for the page session only, like the song and pictures.

export interface UserFont {
  /** CSS family name the canvas draws with. */
  family: string;
  fileName: string;
}

const fonts: UserFont[] = [];
const listeners = new Set<() => void>();

export const userFonts = (): readonly UserFont[] => fonts;
export const isUserFont = (family: string): boolean => fonts.some((f) => f.family === family);

export function onUserFontsChange(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Loads a font file into the page; returns its family name. */
export async function addUserFont(file: File): Promise<UserFont> {
  const existing = fonts.find((f) => f.fileName === file.name);
  if (existing) return existing;
  const family = `MyFont ${fonts.length + 1} ${file.name.replace(/\.[^.]+$/, "").replace(/['"\\]/g, "")}`;
  const face = new FontFace(family, await file.arrayBuffer());
  await face.load();
  document.fonts.add(face);
  const font = { family, fileName: file.name };
  fonts.push(font);
  for (const fn of listeners) fn();
  return font;
}
