#!/usr/bin/env sh
# 下载 Live2D 官方示例模型（Hiyori、Mao、Haru 等）到 static/live2d/models/_samples/，用来验证运行环境。
#
# 这些模型属于 Live2D Inc.，使用前请阅读并同意《无偿提供素材使用授权协议》（Free Material License）：
#   https://www.live2d.com/eula/live2d-free-material-license-agreement_cn.html
# 该目录已加入 .gitignore，不会被提交到仓库。
#
# 用法：sh tools/fetch_live2d_samples.sh [模型名...]   默认 Hiyori Mao
set -e
cd "$(dirname "$0")/.."
DEST=static/live2d/models/_samples
TAG=5-r.5
MODELS=${*:-"Hiyori Mao"}
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT
git clone --quiet --depth 1 --branch "$TAG" --filter=blob:none --sparse https://github.com/Live2D/CubismWebSamples.git "$TMP/s"
cd "$TMP/s"
set --
for m in $MODELS; do set -- "$@" "Samples/Resources/$m"; done
git sparse-checkout set "$@"
cd - >/dev/null
mkdir -p "$DEST"
for m in $MODELS; do
  if [ -d "$TMP/s/Samples/Resources/$m" ]; then
    rm -rf "$DEST/$m"
    cp -R "$TMP/s/Samples/Resources/$m" "$DEST/$m"
    echo "已下载 $m → $DEST/$m"
  else
    echo "没有找到示例模型 $m" >&2
  fi
done
