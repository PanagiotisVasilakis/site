import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

export const DEFAULT_MAX_IMAGE_BYTES = 512 * 1024;

const EXPECTED_FORMATS: Readonly<Record<string, readonly string[]>> = {
  '.avif': ['heif'],
  '.gif': ['gif'],
  '.jpeg': ['jpeg'],
  '.jpg': ['jpeg'],
  '.png': ['png'],
  '.webp': ['webp'],
};

export interface ImageAssetIssue {
  file: string;
  message: string;
}

export interface ImageAssetValidationResult {
  checked: number;
  issues: ImageAssetIssue[];
}

export interface ImageAssetValidationOptions {
  rootDir?: string;
  maxBytes?: number;
}

async function collectRasterImages(directory: string): Promise<string[]> {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...await collectRasterImages(absolutePath));
      continue;
    }

    if (entry.isFile() && EXPECTED_FORMATS[path.extname(entry.name).toLowerCase()]) {
      files.push(absolutePath);
    }
  }

  return files;
}

export async function validateImageAssets({
  rootDir = path.join(process.cwd(), 'public'),
  maxBytes = DEFAULT_MAX_IMAGE_BYTES,
}: ImageAssetValidationOptions = {}): Promise<ImageAssetValidationResult> {
  if (!Number.isSafeInteger(maxBytes) || maxBytes <= 0) {
    throw new Error('maxBytes must be a positive safe integer');
  }

  const files = await collectRasterImages(rootDir);
  const issues: ImageAssetIssue[] = [];

  for (const file of files) {
    const relativeFile = path.relative(rootDir, file).split(path.sep).join('/');
    const extension = path.extname(file).toLowerCase();
    const expectedFormats = EXPECTED_FORMATS[extension];
    const stats = await fs.stat(file);

    if (stats.size > maxBytes) {
      issues.push({
        file: relativeFile,
        message: `is ${stats.size} bytes; maximum allowed is ${maxBytes} bytes`,
      });
    }

    try {
      const metadata = await sharp(file, { failOn: 'error' }).metadata();
      if (!metadata.format || !expectedFormats.includes(metadata.format)) {
        issues.push({
          file: relativeFile,
          message: `extension ${extension} does not match detected format ${metadata.format ?? 'unknown'}`,
        });
      }
      if (!metadata.width || !metadata.height) {
        issues.push({ file: relativeFile, message: 'has no decodable pixel dimensions' });
      }
    } catch (error) {
      issues.push({
        file: relativeFile,
        message: `cannot be decoded: ${error instanceof Error ? error.message : String(error)}`,
      });
    }
  }

  return { checked: files.length, issues };
}

async function main(): Promise<void> {
  const maxBytes = process.env.MAX_PUBLIC_IMAGE_BYTES
    ? Number(process.env.MAX_PUBLIC_IMAGE_BYTES)
    : DEFAULT_MAX_IMAGE_BYTES;
  const result = await validateImageAssets({ maxBytes });

  if (result.issues.length > 0) {
    console.error(`Image asset validation failed with ${result.issues.length} issue(s):`);
    for (const issue of result.issues) {
      console.error(`- ${issue.file}: ${issue.message}`);
    }
    process.exitCode = 1;
    return;
  }

  console.log(`Validated ${result.checked} raster image assets (maximum ${maxBytes} bytes each).`);
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : '';
if (invokedPath === fileURLToPath(import.meta.url)) {
  void main().catch((error: unknown) => {
    console.error('Image asset validation failed:', error);
    process.exitCode = 1;
  });
}
