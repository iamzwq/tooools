import { browser } from 'wxt/browser';
import SparkMD5 from 'spark-md5';
import { signPath } from './sign';
import { PAN123_DOMAINS, pan123AuthItem, type Pan123Auth } from './auth';

const CHUNK_SIZE = 16 * 1024 * 1024;
const PAGE_LIMIT = 100;
const MAX_LIST_PAGES = 20;
const HEADER_RULE_ID = 12301;

export class Pan123AuthError extends Error {}

interface ApiResponse<T> {
  code: number;
  message: string;
  data: T;
}

interface UploadRequestData {
  Reuse: boolean;
  FileId: number;
  Key: string;
  Bucket: string;
  StorageNode: string;
  UploadId: string;
}

interface PresignedData {
  presignedUrls: Record<string, string>;
}

export interface Pan123File {
  FileId: number;
  FileName: string;
  Type: number; // 0 = file, 1 = folder
  Trashed?: boolean;
}

interface FileListData {
  InfoList: Pan123File[] | null;
  Next: string;
  Total: number;
}

/**
 * The API rejects requests whose Origin/Referer is not the 123pan site, and fetch()
 * cannot set those headers, so rewrite them for requests made by this extension.
 */
async function ensureHeaderRule(origin: string): Promise<void> {
  await browser.declarativeNetRequest.updateSessionRules({
    removeRuleIds: [HEADER_RULE_ID],
    addRules: [
      {
        id: HEADER_RULE_ID,
        priority: 1,
        action: {
          type: 'modifyHeaders',
          requestHeaders: [
            { header: 'origin', operation: 'set', value: origin },
            { header: 'referer', operation: 'set', value: `${origin}/` },
          ],
        },
        condition: {
          requestDomains: PAN123_DOMAINS,
          initiatorDomains: [browser.runtime.id],
          resourceTypes: ['xmlhttprequest'],
        },
      },
    ],
  });
}

export class Pan123Client {
  private readonly apiBase: string;
  private headerRuleReady?: Promise<void>;

  constructor(private readonly auth: Pan123Auth) {
    this.apiBase = `${auth.origin}/b/api`;
  }

  private async request<T>(method: 'GET' | 'POST', path: string, params?: Record<string, unknown>): Promise<T> {
    this.headerRuleReady ??= ensureHeaderRule(this.auth.origin);
    await this.headerRuleReady;

    const url = new URL(this.apiBase + path);
    const [signKey, signValue] = signPath(url.pathname);
    url.searchParams.set(signKey, signValue);
    if (method === 'GET' && params) {
      for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));
    }

    const res = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${this.auth.token}`,
        'Content-Type': 'application/json;charset=UTF-8',
        platform: 'web',
        'App-Version': '3',
      },
      body: method === 'POST' ? JSON.stringify(params ?? {}) : undefined,
    });
    if (res.status === 401) throw await this.authFailed();

    const json = (await res.json()) as ApiResponse<T>;
    if (json.code === 401) throw await this.authFailed();
    if (json.code !== 0) throw new Error(`123云盘接口错误(${json.code}): ${json.message}`);
    return json.data;
  }

  private async authFailed(): Promise<Pan123AuthError> {
    await pan123AuthItem.setValue(null);
    return new Pan123AuthError('123云盘登录已失效，请打开 123云盘网页重新登录后再试');
  }

  getUserInfo(): Promise<Record<string, unknown>> {
    return this.request('GET', '/user/info');
  }

  async listFolder(parentFileId: number): Promise<Pan123File[]> {
    const files: Pan123File[] = [];
    for (let page = 1; page <= MAX_LIST_PAGES; page++) {
      const data = await this.request<FileListData>('GET', '/file/list/new', {
        driveId: 0,
        limit: PAGE_LIMIT,
        next: 0,
        orderBy: 'file_id',
        orderDirection: 'desc',
        parentFileId,
        trashed: false,
        SearchData: '',
        Page: page,
        OnlyLookAbnormalFile: 0,
        event: 'homeListFile',
        operateType: 4,
        inDirectSpace: false,
      });
      const list = data.InfoList ?? [];
      files.push(...list);
      if (list.length === 0 || data.Next === '-1' || files.length >= data.Total) break;
    }
    return files;
  }

  async mkdir(parentFileId: number, name: string): Promise<void> {
    await this.request('POST', '/file/upload_request', {
      driveId: 0,
      etag: '',
      fileName: name,
      parentFileId,
      size: 0,
      type: 1,
      duplicate: 1,
    });
  }

  /** Finds a folder by name under `parentFileId`, creating it if needed. */
  async ensureFolder(name: string, parentFileId = 0): Promise<number> {
    const find = async () =>
      (await this.listFolder(parentFileId)).find((f) => f.Type === 1 && f.FileName === name && !f.Trashed);
    const existing = await find();
    if (existing) return existing.FileId;
    await this.mkdir(parentFileId, name);
    const created = await find();
    if (!created) throw new Error(`创建文件夹「${name}」失败`);
    return created.FileId;
  }

  /** Uploads a file; returns true if the server already had it (instant upload). */
  async uploadFile(parentFileId: number, fileName: string, data: ArrayBuffer): Promise<{ reused: boolean }> {
    const size = data.byteLength;
    if (size === 0) throw new Error('文件为空');

    const up = await this.request<UploadRequestData>('POST', '/file/upload_request', {
      driveId: 0,
      duplicate: 1, // 1 = keep both (auto-rename), 2 = overwrite
      etag: SparkMD5.ArrayBuffer.hash(data),
      fileName,
      parentFileId,
      size,
      type: 0,
    });
    if (up.Reuse || !up.Key) return { reused: true };

    const chunkCount = Math.ceil(size / CHUNK_SIZE);
    const isMultipart = chunkCount > 1;
    const batchSize = isMultipart ? 10 : 1;
    const getUrls = (start: number, end: number) =>
      this.request<PresignedData>(
        'POST',
        isMultipart ? '/file/s3_repare_upload_parts_batch' : '/file/s3_upload_object/auth',
        {
          bucket: up.Bucket,
          key: up.Key,
          partNumberStart: start,
          partNumberEnd: end,
          uploadId: up.UploadId,
          StorageNode: up.StorageNode,
        },
      ).then((d) => d.presignedUrls);

    for (let start = 1; start <= chunkCount; start += batchSize) {
      const end = Math.min(start + batchSize, chunkCount + 1);
      let urls = await getUrls(start, end);
      for (let part = start; part < end; part++) {
        const chunk = data.slice((part - 1) * CHUNK_SIZE, Math.min(part * CHUNK_SIZE, size));
        let res = await putChunk(urls[part], chunk);
        if (res.status === 403) {
          // Presigned URL expired: refresh once and retry.
          urls = await getUrls(part, end);
          res = await putChunk(urls[part], chunk);
        }
        if (!res.ok) throw new Error(`上传分片 ${part} 失败: HTTP ${res.status}`);
      }
    }

    await this.request('POST', '/file/upload_complete/v2', {
      StorageNode: up.StorageNode,
      bucket: up.Bucket,
      fileId: up.FileId,
      fileSize: size,
      isMultipart,
      key: up.Key,
      uploadId: up.UploadId,
    });
    return { reused: false };
  }
}

function putChunk(url: string | undefined, chunk: ArrayBuffer): Promise<Response> {
  if (!url) throw new Error('未获取到上传地址');
  return fetch(url, { method: 'PUT', body: chunk });
}
