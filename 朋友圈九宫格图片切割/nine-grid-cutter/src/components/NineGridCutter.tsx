"use client";

import Cropper, { type Area } from "react-easy-crop";
import { useEffect, useMemo, useRef, useState } from "react";
import NextImage from "next/image";
import JSZip from "jszip";
import { saveAs } from "file-saver";

type OutputFormat = "image/png" | "image/jpeg";

type Tile = {
  name: string;
  blob: Blob;
  url: string;
};

function getBaseName(filename: string) {
  return filename.replace(/\.[^.]+$/, "");
}

function getExt(format: OutputFormat) {
  return format === "image/png" ? "png" : "jpg";
}

function createImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new globalThis.Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

function canvasToBlob(
  canvas: HTMLCanvasElement,
  format: OutputFormat,
  quality: number
) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error("Failed to export canvas"));
          return;
        }
        resolve(blob);
      },
      format,
      format === "image/jpeg" ? quality : undefined
    );
  });
}

export default function NineGridCutter() {
  const inputRef = useRef<HTMLInputElement | null>(null);

  const [fileName, setFileName] = useState<string>("");
  const [imageSrc, setImageSrc] = useState<string>("");

  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);

  const [format, setFormat] = useState<OutputFormat>("image/png");
  const [jpegQuality, setJpegQuality] = useState(0.92);
  const [tiles, setTiles] = useState<Tile[]>([]);

  const ext = useMemo(() => getExt(format), [format]);
  const baseName = useMemo(() => getBaseName(fileName || "image"), [fileName]);

  useEffect(() => {
    return () => {
      if (imageSrc) URL.revokeObjectURL(imageSrc);
    };
  }, [imageSrc]);

  useEffect(() => {
    return () => {
      for (const t of tiles) URL.revokeObjectURL(t.url);
    };
  }, [tiles]);

  async function onSelectFile(file: File) {
    if (!file.type.startsWith("image/")) return;

    for (const t of tiles) URL.revokeObjectURL(t.url);
    setTiles([]);

    if (imageSrc) URL.revokeObjectURL(imageSrc);

    const url = URL.createObjectURL(file);
    setFileName(file.name);
    setImageSrc(url);
    setCrop({ x: 0, y: 0 });
    setZoom(1);
    setCroppedAreaPixels(null);
  }

  async function onGenerate() {
    if (!imageSrc || !croppedAreaPixels) return;

    for (const t of tiles) URL.revokeObjectURL(t.url);
    setTiles([]);

    const img = await createImage(imageSrc);
    const x0 = croppedAreaPixels.x;
    const y0 = croppedAreaPixels.y;
    const w = croppedAreaPixels.width;
    const h = croppedAreaPixels.height;

    const nextTiles: Tile[] = [];

    for (let row = 0; row < 3; row++) {
      const sy0 = y0 + Math.round((row * h) / 3);
      const sy1 = y0 + Math.round(((row + 1) * h) / 3);
      const sh = Math.max(1, sy1 - sy0);

      for (let col = 0; col < 3; col++) {
        const sx0 = x0 + Math.round((col * w) / 3);
        const sx1 = x0 + Math.round(((col + 1) * w) / 3);
        const sw = Math.max(1, sx1 - sx0);

        const canvas = document.createElement("canvas");
        canvas.width = sw;
        canvas.height = sh;

        const ctx = canvas.getContext("2d");
        if (!ctx) continue;

        if (format === "image/jpeg") {
          ctx.fillStyle = "#000000";
          ctx.fillRect(0, 0, sw, sh);
        }

        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = "high";
        ctx.drawImage(img, sx0, sy0, sw, sh, 0, 0, sw, sh);

        const blob = await canvasToBlob(canvas, format, jpegQuality);
        const url = URL.createObjectURL(blob);
        const index = row * 3 + col + 1;
        nextTiles.push({
          blob,
          url,
          name: `${baseName}-${index}.${ext}`,
        });
      }
    }

    setTiles(nextTiles);
  }

  function onClear() {
    for (const t of tiles) URL.revokeObjectURL(t.url);
    setTiles([]);

    if (imageSrc) URL.revokeObjectURL(imageSrc);
    setImageSrc("");
    setFileName("");
    setCrop({ x: 0, y: 0 });
    setZoom(1);
    setCroppedAreaPixels(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  async function onDownloadAll() {
    if (!tiles.length) return;

    const zip = new JSZip();
    for (const t of tiles) {
      zip.file(t.name, t.blob);
    }

    const content = await zip.generateAsync({ type: "blob" });
    saveAs(content, `${baseName}-九宫格.zip`);
  }

  return (
    <div className="w-full">
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <input
              ref={inputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void onSelectFile(f);
              }}
            />
            <button
              type="button"
              className="h-10 rounded-full bg-white/90 px-5 text-sm font-medium text-zinc-950 hover:bg-white"
              onClick={() => inputRef.current?.click()}
            >
              {imageSrc ? "更换图片" : "上传图片"}
            </button>
            <button
              type="button"
              className="h-10 rounded-full bg-emerald-400/90 px-5 text-sm font-semibold text-zinc-950 hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-40"
              onClick={() => void onGenerate()}
              disabled={!imageSrc || !croppedAreaPixels}
            >
              生成九宫格
            </button>
            <button
              type="button"
              className="h-10 rounded-full border border-white/15 bg-white/5 px-5 text-sm font-medium text-white hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
              onClick={onClear}
              disabled={!imageSrc}
            >
              清空
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-4 text-sm text-white/80">
            <div className="flex items-center gap-2">
              <span className="text-white/70">导出格式</span>
              <select
                value={format}
                onChange={(e) => setFormat(e.target.value as OutputFormat)}
                className="h-9 rounded-full border border-white/15 bg-black/40 px-3 text-sm text-white outline-none"
              >
                <option value="image/png">PNG</option>
                <option value="image/jpeg">JPEG</option>
              </select>
            </div>

            <div className="flex items-center gap-3">
              <span className="text-white/70">缩放</span>
              <input
                type="range"
                min={1}
                max={3}
                step={0.01}
                value={zoom}
                onChange={(e) => setZoom(Number(e.target.value))}
                className="w-48 accent-white"
                disabled={!imageSrc}
              />
              <span className="tabular-nums text-white/60">
                {zoom.toFixed(2)}×
              </span>
            </div>

            {format === "image/jpeg" ? (
              <div className="flex items-center gap-3">
                <span className="text-white/70">质量</span>
                <input
                  type="range"
                  min={0.4}
                  max={1}
                  step={0.01}
                  value={jpegQuality}
                  onChange={(e) => setJpegQuality(Number(e.target.value))}
                  className="w-40 accent-white"
                />
                <span className="tabular-nums text-white/60">
                  {jpegQuality.toFixed(2)}
                </span>
              </div>
            ) : null}
          </div>
        </div>

        <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
          <div className="flex flex-col gap-3">
            <div className="text-sm font-medium text-white/80">裁剪预览</div>
            <div className="relative h-[360px] w-[360px] overflow-hidden rounded-2xl border border-white/10 bg-black/40 sm:h-[420px] sm:w-[420px]">
              {imageSrc ? (
                <>
                  <Cropper
                    image={imageSrc}
                    crop={crop}
                    zoom={zoom}
                    aspect={1}
                    onCropChange={setCrop}
                    onZoomChange={setZoom}
                    onCropComplete={(_, areaPixels) => {
                      setCroppedAreaPixels(areaPixels);
                    }}
                    objectFit="contain"
                    showGrid={false}
                    classes={{ cropAreaClassName: "nineGridCropArea" }}
                  />
                </>
              ) : (
                <button
                  type="button"
                  className="flex h-full w-full items-center justify-center text-sm font-medium text-white/60 hover:text-white"
                  onClick={() => inputRef.current?.click()}
                >
                  点击上传图片
                </button>
              )}
            </div>
            <div className="text-xs text-white/45">
              鼠标拖拽移动，滚轮缩放；裁剪框固定为 1:1
            </div>
          </div>

          <div className="flex-1">
            <div className="mb-3 flex items-center justify-between">
              <div className="text-sm font-medium text-white/80">生成结果</div>
              {tiles.length > 0 && (
                <button
                  type="button"
                  onClick={() => void onDownloadAll()}
                  className="rounded-full bg-blue-500 px-4 py-1.5 text-xs font-semibold text-white hover:bg-blue-400"
                >
                  一键下载ZIP
                </button>
              )}
            </div>
            {tiles.length ? (
              <div className="grid grid-cols-3 gap-3">
                {tiles.map((t) => (
                  <div
                    key={t.name}
                    className="overflow-hidden rounded-xl border border-white/10 bg-black/30"
                  >
                    <NextImage
                      src={t.url}
                      alt={t.name}
                      width={600}
                      height={600}
                      unoptimized
                      className="aspect-square w-full object-cover"
                    />
                    <div className="flex items-center justify-between gap-2 p-2">
                      <div className="min-w-0 flex-1 truncate text-xs text-white/70">
                        {t.name}
                      </div>
                      <a
                        href={t.url}
                        download={t.name}
                        className="shrink-0 rounded-full bg-white/10 px-3 py-1 text-xs font-medium text-white hover:bg-white/15"
                      >
                        下载
                      </a>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-2xl border border-white/10 bg-black/30 p-6 text-sm text-white/50">
                还没有生成切图。上传图片后点击“生成九宫格”。
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
