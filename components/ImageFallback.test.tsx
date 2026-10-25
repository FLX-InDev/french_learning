import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { ImageFallback } from "./ImageFallback";

afterEach(cleanup);

describe("ImageFallback with next/image", () => {
  it.each([
    [{}, "eager"],
    [{ lazy: false }, "eager"],
    [{ lazy: true }, "lazy"],
    [{ lazy: true, eager: true }, "eager"],
    [{ eager: true }, "eager"],
  ] as const)("preserves explicit loading behavior for %j", (props, loading) => {
    const view = render(<ImageFallback src="/images/icons/math.svg" alt="Math" fallback="Fallback" {...props} />);
    const image = view.container.querySelector("img")!;
    expect(image.getAttribute("loading")).toBe(loading);
    expect(image.getAttribute("decoding")).toBe("async");
    expect(image.getAttribute("width")).toBe("64");
    expect(image.getAttribute("height")).toBe("64");
    expect(new URL(image.src).pathname).toBe("/images/icons/math.svg");
    expect(image.getAttribute("data-nimg")).toBe("1");
  });

  it("retains alt, container class, dimensions, and object containment for local illustrations", () => {
    const view = render(<ImageFallback src="/images/illustrations/word.png" alt="Word illustration" fallback="Fallback" size={96} className="gallery-image" />);
    const image = view.container.querySelector("img")!;
    const wrapper = image.parentElement!;
    expect(image.getAttribute("alt")).toBe("Word illustration");
    expect(image.getAttribute("width")).toBe("96");
    expect(image.getAttribute("height")).toBe("96");
    expect(image.className).toBe("h-full w-full object-contain");
    expect(wrapper.style.width).toBe("96px");
    expect(wrapper.style.height).toBe("96px");
    expect(wrapper.classList.contains("gallery-image")).toBe(true);
    expect(image.getAttribute("srcset")).toContain("/_next/image?");
  });

  it("shows the supplied fallback after an image error without losing size or accessibility", () => {
    const view = render(<ImageFallback src="/images/icons/missing.svg" alt="Missing image" fallback={<b>Fallback</b>} size={80} className="gallery-image" />);
    fireEvent.error(view.container.querySelector("img")!);
    expect(view.container.querySelector("img")).toBeNull();
    expect(screen.getByText("Fallback")).toBeTruthy();
    const fallback = screen.getByRole("img", { name: "Missing image" });
    expect(fallback.style.width).toBe("80px");
    expect(fallback.style.height).toBe("80px");
    expect(fallback.classList.contains("gallery-image")).toBe(true);
  });
});
