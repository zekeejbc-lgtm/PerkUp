import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { StoreSocialLinksEditor, StoreSocialLinksList } from "./StoreSocialLinks";

describe("StoreSocialLinksEditor", () => {
  it("adds an unlimited controlled row without replacing existing links", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <StoreSocialLinksEditor
        value={[{ url: "instagram.com/perkup" }]}
        onChange={onChange}
      />,
    );

    await user.click(screen.getByRole("button", { name: /add social link/i }));

    expect(onChange).toHaveBeenCalledWith([
      { url: "instagram.com/perkup" },
      { url: "" },
    ]);
  });

  it("removes only the selected row", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <StoreSocialLinksEditor
        value={[{ url: "instagram.com/first" }, { url: "x.com/second" }]}
        onChange={onChange}
      />,
    );

    await user.click(screen.getByRole("button", { name: /remove social link 1/i }));

    expect(onChange).toHaveBeenCalledWith([{ url: "x.com/second" }]);
  });

  it("edits one row while preserving its siblings", () => {
    const onChange = vi.fn();
    render(
      <StoreSocialLinksEditor
        value={[{ url: "instagram.com/first" }, { url: "" }]}
        onChange={onChange}
      />,
    );

    fireEvent.change(screen.getByRole("textbox", { name: /social media link 2/i }), {
      target: { value: "tiktok.com/@second" },
    });

    expect(onChange).toHaveBeenLastCalledWith([
      { url: "instagram.com/first" },
      { url: "tiktok.com/@second" },
    ]);
  });

  it("previews recognized, generic, and invalid links", () => {
    render(
      <StoreSocialLinksEditor
        value={[
          { url: "instagram.com/perkup" },
          { url: "example.social/perkup" },
          { url: "javascript:alert(1)" },
        ]}
        onChange={() => undefined}
      />,
    );

    expect(screen.getByText("Instagram")).toBeInTheDocument();
    expect(screen.getByText("example.social")).toBeInTheDocument();
    expect(screen.getByText("Enter a valid social media URL.")).toBeInTheDocument();
  });
});

describe("StoreSocialLinksList", () => {
  it("renders normalized safe links with platform and fallback labels", () => {
    render(
      <StoreSocialLinksList
        links={[
          { url: "instagram.com/perkup" },
          { url: "https://x.com/perkup" },
          { url: "example.social/perkup" },
          { url: "javascript:alert(1)" },
        ]}
      />,
    );

    const instagram = screen.getByRole("link", { name: /instagram/i });
    const x = screen.getByRole("link", { name: /^open x$/i });
    const generic = screen.getByRole("link", { name: /example\.social/i });

    expect(instagram).toHaveAttribute("href", "https://instagram.com/perkup");
    expect(x).toHaveAttribute("href", "https://x.com/perkup");
    expect(generic).toHaveAttribute("href", "https://example.social/perkup");
    for (const link of [instagram, x, generic]) {
      expect(link).toHaveAttribute("target", "_blank");
      expect(link).toHaveAttribute("rel", "noopener noreferrer");
    }
    expect(screen.getAllByRole("link")).toHaveLength(3);
  });

  it("replaces one branch's links when a different branch is supplied", () => {
    const { rerender } = render(
      <StoreSocialLinksList links={[{ url: "instagram.com/branch-a" }]} />,
    );
    expect(screen.getByRole("link", { name: /instagram/i })).toHaveAttribute(
      "href",
      "https://instagram.com/branch-a",
    );

    rerender(<StoreSocialLinksList links={[{ url: "tiktok.com/@branch-b" }]} />);

    expect(screen.queryByRole("link", { name: /instagram/i })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /tiktok/i })).toHaveAttribute(
      "href",
      "https://tiktok.com/@branch-b",
    );
  });
});
