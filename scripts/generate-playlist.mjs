import { readdir, mkdir, writeFile } from "node:fs/promises";
import { basename, extname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const defaultMusicDirectory = join(root, "public", "music");
const extensions = new Set([".mp3", ".m4a", ".ogg", ".wav"]);

export function titleFromFilename(filename) {
  return basename(filename, extname(filename))
    .replace(/^\s*\d{1,3}\s*[-_. ]+\s*/, "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export async function buildPlaylist(musicDirectory) {
  let entries = [];
  try {
    entries = await readdir(musicDirectory, { withFileTypes: true });
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    return [];
  }
  return entries
    .filter((entry) => entry.isFile() && extensions.has(extname(entry.name).toLowerCase()))
    .sort((first, second) => first.name.localeCompare(second.name, undefined, { sensitivity: "base" }))
    .map((entry) => ({
      id: entry.name,
      title: titleFromFilename(entry.name) || entry.name,
      src: `/music/${relative(musicDirectory, join(musicDirectory, entry.name)).split(sep).join("/")}`,
    }));
}

export async function writePlaylist(musicDirectory = defaultMusicDirectory) {
  await mkdir(musicDirectory, { recursive: true });
  const playlist = await buildPlaylist(musicDirectory);
  await writeFile(join(musicDirectory, "playlist.json"), `${JSON.stringify(playlist, null, 2)}\n`, "utf8");
  return playlist;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const playlist = await writePlaylist();
    console.info(`Generated playlist with ${playlist.length} track${playlist.length === 1 ? "" : "s"}.`);
  } catch (error) {
    console.error("Could not generate the music playlist.", error);
    process.exitCode = 1;
  }
}
