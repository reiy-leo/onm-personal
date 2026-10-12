import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Toasty } from "@cloudflare/kumo";
import type { PageData } from "../../src/shared/types.ts";
import { App } from "./App.tsx";
import "./styles.css";

const DEMO_LIMITS = { maxImageBytes: 20 * 1024 * 1024, maxTextBytes: 1024 * 1024 };

function readPageData(): PageData {
  const el = document.getElementById("page-data");
  if (el?.textContent) {
    try {
      return JSON.parse(el.textContent) as PageData;
    } catch {
      /* fall through */
    }
  }
  // vite dev 直接打开时没有注入数据：用 ?page= 预览各页面（API 仍需 wrangler dev）
  const kind = new URLSearchParams(location.search).get("page") ?? "home";
  const user = { email: "dev@localhost", name: "本地开发" };
  if (kind === "guest") return { kind: "home", user: null, loginError: null, limits: DEMO_LIMITS };
  if (kind === "notfound") return { kind: "notfound", user: null };
  return { kind: "home", user, loginError: null, limits: DEMO_LIMITS };
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Toasty>
      <App page={readPageData()} />
    </Toasty>
  </StrictMode>,
);
