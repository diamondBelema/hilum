import { access, copyFile, mkdir, stat, statfs, writeFile } from "node:fs/promises";
import { constants } from "node:fs";
import { dirname, join, resolve } from "node:path";
import type { Config } from "../config.ts";
import type { VaultService } from "../vault/service.ts";
import { VaultPathError, slug } from "../vault/paths.ts";

export type VaultStatus = {
  path: string;
  exists: boolean;
  writable: boolean;
  courses: string[];
  freeBytes: number | null;
};

export type CourseInput = {
  code: string;
  title: string;
  examDate?: string | null;
  answerStyle?: string | null;
};

export class VaultSetupService {
  constructor(private readonly config: Config, private readonly vault: VaultService) {}

  async status(): Promise<VaultStatus> {
    const path = resolve(this.config.vaultPath);
    const exists = await stat(path).then((info) => info.isDirectory()).catch(() => false);
    const writable = exists
      ? await access(path, constants.R_OK | constants.W_OK).then(() => true).catch(() => false)
      : await access(dirname(path), constants.W_OK).then(() => true).catch(() => false);
    const courses = exists ? (await this.vault.listCourses()).map((course) => course.code) : [];
    const freeBytes = await statfs(exists ? path : dirname(path))
      .then((info) => Number(info.bavail * info.bsize))
      .catch(() => null);
    return { path, exists, writable, courses, freeBytes };
  }

  async scaffold(): Promise<VaultStatus> {
    const root = resolve(this.config.vaultPath);
    await mkdir(root, { recursive: true });
    for (const directory of ["inbox", "inbox/_unsorted", "concepts", "sessions", "rubrics", "courses"]) {
      await mkdir(join(root, directory), { recursive: true });
    }
    await writeIfMissing(join(root, "INDEX.md"), "# Hilum vault\n\nAdd courses and notes through Hilum.\n");
    const guide = resolve(dirname(import.meta.dir), "../../AGENTS.md");
    try {
      await copyIfMissing(guide, join(root, "AGENTS.md"));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    return this.status();
  }

  async createCourse(input: CourseInput): Promise<{ code: string; created: boolean }> {
    const code = input.code.trim().toLowerCase();
    const title = input.title.trim();
    if (!/^[a-z0-9][a-z0-9._-]{1,63}$/.test(code)) throw new VaultPathError("invalid course code");
    if (!title) throw new VaultPathError("course title is required");
    if (slug(code) !== code) throw new VaultPathError("course code must be a safe slug");
    const root = resolve(this.config.vaultPath);
    await this.scaffold();
    const courseRoot = join(root, "courses", code);
    const exists = await stat(courseRoot).then((info) => info.isDirectory()).catch(() => false);
    for (const directory of ["notes", "assets", "activities", "past-questions"]) {
      await mkdir(join(courseRoot, directory), { recursive: true });
    }
    const frontmatter = [
      "---",
      `code: ${code}`,
      `title: ${title}`,
      ...(input.examDate ? [`exam_date: ${input.examDate}`] : []),
      ...(input.answerStyle ? [`answer_style: ${input.answerStyle}`] : []),
      "---",
      "",
      `# ${title}`,
      "",
    ].join("\n");
    await writeIfMissing(join(courseRoot, "course.md"), frontmatter);
    await writeIfMissing(join(courseRoot, "INDEX.md"), `# ${title}\n\nNo notes yet.\n`);
    return { code, created: !exists };
  }
}

async function writeIfMissing(path: string, content: string): Promise<void> {
  try {
    await access(path, constants.F_OK);
  } catch {
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, content, { encoding: "utf8", flag: "wx" }).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== "EEXIST") throw error;
    });
  }
}

async function copyIfMissing(source: string, destination: string): Promise<void> {
  try {
    await access(destination, constants.F_OK);
  } catch {
    await copyFile(source, destination).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== "EEXIST") throw error;
    });
  }
}
