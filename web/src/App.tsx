import { lazy, Suspense } from "react";
import { Loader } from "@cloudflare/kumo";
import type { PageData } from "../../src/shared/types.ts";
import { AuthProvider } from "./components/Auth.tsx";
import { HomePage } from "./pages/HomePage.tsx";
import { NotFoundPage } from "./pages/NotFoundPage.tsx";
import { TextViewPage } from "./pages/TextViewPage.tsx";

// 编辑器单独分包，访客看只读页不用下载
const EditorPage = lazy(() => import("./pages/EditorPage.tsx").then((m) => ({ default: m.EditorPage })));

const PageLoader = () => (
  <div className="flex min-h-screen items-center justify-center">
    <Loader size={24} />
  </div>
);

function Page({ page }: { page: PageData }) {
  switch (page.kind) {
    case "home":
      return <HomePage limits={page.limits} loginError={page.loginError} />;
    case "edit":
      return (
        <Suspense fallback={<PageLoader />}>
          <EditorPage id={page.id} />
        </Suspense>
      );
    case "text":
      return <TextViewPage file={page.file} shown={page.shown} latest={page.latest} />;
    default:
      return <NotFoundPage />;
  }
}

export function App({ page }: { page: PageData }) {
  return (
    <AuthProvider user={page.user}>
      <Page page={page} />
    </AuthProvider>
  );
}
