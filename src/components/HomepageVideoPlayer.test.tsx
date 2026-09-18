import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test } from "vitest";
import { HomepageVideoPlayer } from "./HomepageVideoPlayer";

describe("HomepageVideoPlayer", () => {
  test("loads the full YouTube player only after the user presses play", async () => {
    const user = userEvent.setup();
    const { container } = render(<HomepageVideoPlayer url="https://youtu.be/QErxFonAUOA" title="Customer demo" />);

    expect(screen.queryByTitle("Customer demo")).not.toBeInTheDocument();
    expect(container.querySelector("img")).toHaveAttribute(
      "src",
      "https://i.ytimg.com/vi/QErxFonAUOA/maxresdefault.jpg",
    );

    await user.click(screen.getByRole("button", { name: "Play Customer demo" }));

    expect(screen.getByTitle("Customer demo")).toHaveAttribute(
      "src",
      "https://www.youtube-nocookie.com/embed/QErxFonAUOA?playsinline=1&rel=0&autoplay=1",
    );
  });

  test("uses the Google Drive preview player without iframe sandbox restrictions", () => {
    render(
      <HomepageVideoPlayer
        url="https://drive.google.com/file/d/abc123XYZ/view?usp=sharing"
        title="Customer demo"
      />,
    );

    const player = screen.getByTitle("Customer demo");
    expect(player).toHaveAttribute("src", "https://drive.google.com/file/d/abc123XYZ/preview");
    expect(player).not.toHaveAttribute("sandbox");
    expect(player).toHaveAttribute("allowfullscreen");
  });

  test("keeps direct MP4 playback inline on iPhone", () => {
    render(<HomepageVideoPlayer url="https://cdn.example.com/demo.mp4" title="Direct demo" />);

    expect(screen.getByLabelText("Direct demo")).toHaveAttribute("playsinline");
  });

  test("supports an edge-to-edge frame for the public homepage card", () => {
    const { container } = render(
      <HomepageVideoPlayer url="https://youtu.be/QErxFonAUOA" title="Customer demo" edgeToEdge />,
    );

    expect(container.firstElementChild).toHaveClass("rounded-none");
    expect(container.firstElementChild).not.toHaveClass("rounded-2xl");
  });
});
