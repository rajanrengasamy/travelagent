import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { atomicWriteJson, readJson, fileExists } from './atomic.js';

describe('atomic', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'atomic-test-'));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe('atomicWriteJson', () => {
    it('creates file with correct content', async () => {
      const filePath = path.join(tempDir, 'test.json');
      const data = { foo: 'bar', num: 42 };

      await atomicWriteJson(filePath, data);

      const content = await fs.readFile(filePath, 'utf-8');
      expect(JSON.parse(content)).toEqual(data);
    });

    it('creates parent directories', async () => {
      const filePath = path.join(tempDir, 'nested', 'deep', 'test.json');
      await atomicWriteJson(filePath, { test: true });

      const content = await fs.readFile(filePath, 'utf-8');
      expect(JSON.parse(content)).toEqual({ test: true });
    });

    it('uses 2-space indentation', async () => {
      const filePath = path.join(tempDir, 'test.json');
      await atomicWriteJson(filePath, { a: 1 });

      const content = await fs.readFile(filePath, 'utf-8');
      expect(content).toBe('{\n  "a": 1\n}');
    });

    it('overwrites existing file', async () => {
      const filePath = path.join(tempDir, 'test.json');
      await atomicWriteJson(filePath, { first: true });
      await atomicWriteJson(filePath, { second: true });

      const content = await fs.readFile(filePath, 'utf-8');
      expect(JSON.parse(content)).toEqual({ second: true });
    });
  });

  describe('readJson', () => {
    it('returns parsed content', async () => {
      const filePath = path.join(tempDir, 'test.json');
      await fs.writeFile(filePath, '{"foo":"bar"}');

      const data = await readJson<{ foo: string }>(filePath);
      expect(data).toEqual({ foo: 'bar' });
    });

    it('throws for non-existent file', async () => {
      const filePath = path.join(tempDir, 'missing.json');
      await expect(readJson(filePath)).rejects.toThrow('File not found');
    });

    it('throws for invalid JSON', async () => {
      const filePath = path.join(tempDir, 'invalid.json');
      await fs.writeFile(filePath, 'not json');

      await expect(readJson(filePath)).rejects.toThrow('Invalid JSON');
    });

    it('handles arrays', async () => {
      const filePath = path.join(tempDir, 'array.json');
      await fs.writeFile(filePath, '[1, 2, 3]');

      const data = await readJson<number[]>(filePath);
      expect(data).toEqual([1, 2, 3]);
    });
  });

  describe('fileExists', () => {
    it('returns true for existing file', async () => {
      const filePath = path.join(tempDir, 'test.json');
      await fs.writeFile(filePath, '{}');

      expect(await fileExists(filePath)).toBe(true);
    });

    it('returns false for non-existent file', async () => {
      const filePath = path.join(tempDir, 'missing.json');
      expect(await fileExists(filePath)).toBe(false);
    });

    it('returns false for directories', async () => {
      expect(await fileExists(tempDir)).toBe(false);
    });
  });
});
