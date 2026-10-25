import { act, cleanup, render } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { hydrateRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const motionPreference = vi.hoisted(() => ({ reduce: false }));
vi.mock("framer-motion", async (importOriginal) => ({
  ...await importOriginal<typeof import("framer-motion")>(),
  useReducedMotion: () => motionPreference.reduce,
}));

import Template from "./template";

beforeEach(() => { motionPreference.reduce = false; });
afterEach(cleanup);

describe("route transition visibility", () => {
  it("server-renders visible content without waiting for JavaScript", () => {
    const html = renderToString(<Template><h1>First page</h1></Template>);
    expect(html).toContain("opacity:1");
    expect(html).toContain("transform:none");
    expect(html).not.toContain("opacity:0");
    expect(html).toContain("First page");
  });

  it.each([false, true])("hydrates visible content when reduced motion is %s", async (reduce) => {
    const page = <Template><h1>First page</h1></Template>;
    const container = document.createElement("div");
    container.innerHTML = renderToString(page);
    document.body.appendChild(container);
    motionPreference.reduce = reduce;
    const errors = vi.fn();
    let root: Root | undefined;
    try {
      await act(async () => { root = hydrateRoot(container, page, { onRecoverableError: errors }); });
      expect((container.firstElementChild as HTMLElement).style.opacity).toBe("1");
      expect(errors).not.toHaveBeenCalled();
    } finally {
      await act(async () => { root?.unmount(); });
      container.remove();
    }
  });

  it("retains the fade-in for subsequent client navigation mounts", () => {
    const view = render(<Template><h1>Next page</h1></Template>);
    expect((view.container.firstElementChild as HTMLElement).style.opacity).toBe("0");
    expect((view.container.firstElementChild as HTMLElement).style.transform).toContain("10px");
  });

  it("keeps reduced-motion client mounts visible without changing the wrapper", () => {
    motionPreference.reduce = true;
    const view = render(<Template><h1>Page</h1></Template>);
    expect(view.container.firstElementChild?.tagName).toBe("DIV");
    expect((view.container.firstElementChild as HTMLElement).style.opacity).toBe("1");
    expect((view.container.firstElementChild as HTMLElement).style.transform).toBe("none");
  });
});
