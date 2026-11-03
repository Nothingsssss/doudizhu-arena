/**
 * Live2DAssetManager：模型文件下载、缓存和错误记录。
 *
 * - 二进制文件（json / moc3 / motion3 / physics3 …）按 URL 缓存，同一个模型被多个画布使用时只下载一次。
 * - 贴图必须在各自的 WebGL 上下文里创建，不跨上下文共享；图片解码结果（ImageBitmap/Image）会缓存。
 * - 所有失败都记录到 errors，供调试界面显示。
 */
import { log } from './core';

export interface AssetError {
  url: string;
  status: number;
  message: string;
  time: number;
}

export class Live2DAssetManager {
  readonly errors: AssetError[] = [];
  private buffers = new Map<string, Promise<ArrayBuffer>>();
  private images = new Map<string, Promise<HTMLImageElement>>();
  private listeners: Array<(e: AssetError) => void> = [];

  onError(fn: (e: AssetError) => void): () => void {
    this.listeners.push(fn);
    return () => {
      this.listeners = this.listeners.filter((f) => f !== fn);
    };
  }

  private fail(url: string, status: number, message: string): Error {
    const e: AssetError = { url, status, message, time: Date.now() };
    this.errors.push(e);
    if (this.errors.length > 200) this.errors.shift();
    log('error', `资源加载失败 ${url}：${message}`);
    for (const f of this.listeners) f(e);
    return new Error(`${message}（${url}）`);
  }

  fetchBuffer(url: string): Promise<ArrayBuffer> {
    const hit = this.buffers.get(url);
    if (hit) return hit;
    const p = (async () => {
      let res: Response;
      try {
        res = await fetch(url);
      } catch (e) {
        throw this.fail(url, 0, '网络错误');
      }
      if (!res.ok) throw this.fail(url, res.status, `HTTP ${res.status}`);
      const buf = await res.arrayBuffer();
      if (!buf.byteLength) throw this.fail(url, res.status, '文件为空');
      return buf;
    })();
    this.buffers.set(url, p);
    p.catch(() => this.buffers.delete(url));
    return p;
  }

  private loadImage(url: string): Promise<HTMLImageElement> {
    const hit = this.images.get(url);
    if (hit) return hit;
    const p = new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => resolve(img);
      img.onerror = () => reject(this.fail(url, 0, '贴图无法解码或不存在'));
      img.src = url;
    });
    this.images.set(url, p);
    p.catch(() => this.images.delete(url));
    return p;
  }

  /** 在指定 GL 上下文里创建预乘 alpha 的贴图（和官方示例一致，透明边缘不发黑） */
  async createTexture(gl: WebGLRenderingContext | WebGL2RenderingContext, url: string): Promise<WebGLTexture> {
    const img = await this.loadImage(url);
    if (gl.isContextLost()) throw new Error('WebGL 上下文已丢失');
    const tex = gl.createTexture();
    if (!tex) throw this.fail(url, 0, '创建贴图失败');
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, 1);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, 0);
    gl.bindTexture(gl.TEXTURE_2D, null);
    return tex;
  }

  /** 释放某个目录下的缓存（模型不再使用时调用） */
  evict(prefix: string): void {
    for (const k of [...this.buffers.keys()]) if (k.startsWith(prefix)) this.buffers.delete(k);
    for (const k of [...this.images.keys()]) if (k.startsWith(prefix)) this.images.delete(k);
  }

  stats(): { buffers: number; images: number; errors: number } {
    return { buffers: this.buffers.size, images: this.images.size, errors: this.errors.length };
  }
}

export const sharedAssets = new Live2DAssetManager();
