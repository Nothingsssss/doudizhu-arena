#!/usr/bin/env node
/**
 * 构建 static/live2d/live2d.js（官方 CubismWebFramework + 本项目的 Live2D 模块）。
 *
 *   node live2d/build.mjs           构建
 *   node live2d/build.mjs --check   只做类型检查
 *
 * 只依赖 TypeScript 编译器（tsc），不需要 npm 安装其他包。
 * 如果 static/live2d/core/live2dcubismcore.d.ts（官方 Core 的类型声明）存在，会用它代替宽松的 shim 做类型检查。
 */
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const out = join(root, 'static', 'live2d');
const coreDts = join(out, 'core', 'live2dcubismcore.d.ts');
const check = process.argv.includes('--check');

if (!existsSync(join(here, 'framework', 'src', 'live2dcubismframework.ts'))) {
  console.error('缺少 live2d/framework（官方 CubismWebFramework）。请先运行：git submodule update --init live2d/framework');
  process.exit(1);
}

function tscBin() {
  const local = join(root, 'node_modules', '.bin', 'tsc');
  return existsSync(local) ? local : 'tsc';
}

const base = JSON.parse(readFileSync(join(here, 'tsconfig.json'), 'utf8'));
const cfg = structuredClone(base);
if (existsSync(coreDts)) {
  cfg.include = [];
  cfg.files = [...base.files, '../static/live2d/core/live2dcubismcore.d.ts'];
  console.log('使用官方 Core 类型声明：static/live2d/core/live2dcubismcore.d.ts');
}
if (check) {
  cfg.compilerOptions.noEmit = true;
  delete cfg.compilerOptions.outFile;
}
const tmp = join(here, '.tsconfig.build.json');
writeFileSync(tmp, JSON.stringify(cfg, null, 2));
try {
  execFileSync(tscBin(), ['-p', tmp], { stdio: 'inherit', cwd: here });
} catch (e) {
  console.error('TypeScript 编译失败');
  process.exit(1);
} finally {
  rmSync(tmp, { force: true });
}
if (check) {
  console.log('类型检查通过');
  process.exit(0);
}

const amdFile = resolve(here, cfg.compilerOptions.outFile);
const amd = readFileSync(amdFile, 'utf8');
const fwVersion = (() => {
  try {
    const log = readFileSync(join(here, 'framework', 'CHANGELOG.md'), 'utf8');
    const m = log.match(/^## \[([^\]]+)\]/m);
    return m ? m[1] : 'unknown';
  } catch (e) {
    return 'unknown';
  }
})();

// 极简 AMD 加载器：支持 tsc 生成的自引用和循环依赖
const loader = `(function () {
  'use strict';
  var defs = {}, mods = {};
  function define(name, deps, factory) { defs[name] = { deps: deps, factory: factory }; }
  function req(name) {
    if (mods[name]) return mods[name].exports;
    var d = defs[name];
    if (!d) throw new Error('[Live2D] bundle 缺少模块 ' + name);
    var m = { exports: {} };
    mods[name] = m;
    var args = d.deps.map(function (x) { return x === 'require' ? req : x === 'exports' ? m.exports : req(x); });
    var r = d.factory.apply(null, args);
    if (r !== undefined) m.exports = r;
    return m.exports;
  }
  var __l2dRequire = req;
`;
const banner = `/*!
 * doudizhu-arena Live2D 模块
 * 包含 Live2D Cubism Web Framework ${fwVersion}（Copyright(c) Live2D Inc.，Live2D Open Software License：
 * https://www.live2d.com/eula/live2d-open-software-license-agreement_en.html）
 * 不包含 Live2D Cubism Core（专有组件，需从官方 SDK 获取，见 static/live2d/core/README.md）
 */
`;
mkdirSync(out, { recursive: true });
writeFileSync(join(out, 'live2d.js'), banner + loader + amd + '\n  req("src/entry");\n})();\n');
rmSync(amdFile, { force: true });
try {
  if (!readdirSync(dirname(amdFile)).length) rmSync(dirname(amdFile), { recursive: true, force: true });
} catch (e) {
  /* ignore */
}

// 官方着色器（渲染器运行时用 fetch 读取）
const shaderSrc = join(here, 'framework', 'Shaders', 'WebGL');
const shaderDst = join(out, 'shaders', 'WebGL');
rmSync(shaderDst, { recursive: true, force: true });
mkdirSync(shaderDst, { recursive: true });
cpSync(shaderSrc, shaderDst, { recursive: true });

const size = readFileSync(join(out, 'live2d.js')).length;
console.log(`已生成 static/live2d/live2d.js（${(size / 1024).toFixed(0)} KB，Framework ${fwVersion}）和 static/live2d/shaders/WebGL/`);
