import { Empty, LinkButton } from "@cloudflare/kumo";
import { FileXIcon } from "@phosphor-icons/react";
import { AppHeader } from "../components/AppHeader.tsx";

export function NotFoundPage() {
  return (
    <div className="min-h-screen bg-kumo-canvas">
      <AppHeader />
      <main className="mx-auto flex max-w-xl justify-center px-5 py-16">
        <Empty
          icon={<span className="text-kumo-inactive"><FileXIcon size={48} /></span>}
          title="内容不存在"
          description="这个链接不存在，或者文件已经被删除。"
          contents={<LinkButton href="/" variant="secondary">回到首页</LinkButton>}
        />
      </main>
    </div>
  );
}
