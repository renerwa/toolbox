import NineGridCutter from "@/components/NineGridCutter";

export default function Home() {
  return (
    <div className="min-h-screen bg-black text-white">
      <main className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-6 py-10">
        <header className="flex flex-col gap-2">
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            朋友圈九宫格切图器
          </h1>
          <p className="max-w-2xl text-sm leading-6 text-white/60">
            上传图片 → 固定 1:1 裁剪 → 一键切成 3×3 九张图并下载（支持 PNG / JPEG）。
          </p>
        </header>
        <NineGridCutter />
        <footer className="pt-2 text-xs text-white/40">
          建议使用正方形裁剪区域；生成结果文件名为 原图名-1…-9
        </footer>
      </main>
    </div>
  );
}
