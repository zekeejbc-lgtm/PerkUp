import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import StoreOwnerInfo from "./StoreOwnerInfo";

const mocks = vi.hoisted(() => ({
  doc: vi.fn(),
  updateDoc: vi.fn(),
}));

vi.mock("@/src/lib/dataCompat", () => ({
  doc: mocks.doc,
  updateDoc: mocks.updateDoc,
}));

vi.mock("../../lib/backend", () => ({ db: { name: "test-db" } }));

vi.mock("leaflet", () => ({
  default: {
    divIcon: vi.fn(() => ({ kind: "test-icon" })),
  },
}));

vi.mock("react-leaflet", () => ({
  MapContainer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Marker: () => null,
  useMapEvents: vi.fn(),
}));

vi.mock("../../components/MapBaseLayers", () => ({
  MapBaseLayers: () => null,
}));

vi.mock("../../lib/imageStorage", () => ({
  deleteImageFromDriveSecure: vi.fn().mockResolvedValue(undefined),
  getDisplayImageUrl: (value: string) => value,
  isTemporaryObjectUrl: () => false,
  uploadImageFileToDriveSecure: vi.fn(),
}));

const northBranch = {
  id: "branch-b",
  name: "Perk North",
  category: "Cafe",
  contact: "09170000000",
  address: "North Street",
  lat: 7.4,
  lng: 125.8,
  socialLinks: [{ url: "https://instagram.com/north" }],
};

describe("StoreOwnerInfo branch social links", () => {
  beforeEach(() => {
    mocks.doc.mockReset().mockReturnValue({ path: "stores/branch-b" });
    mocks.updateDoc.mockReset().mockResolvedValue(undefined);
  });

  it("normalizes and saves links only to the active branch document", async () => {
    const user = userEvent.setup();
    render(<StoreOwnerInfo store={northBranch} setStore={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: /edit store information/i }));
    await user.click(screen.getByRole("button", { name: /add social link/i }));
    fireEvent.change(screen.getByRole("textbox", { name: /social media link 2/i }), {
      target: { value: "tiktok.com/@north" },
    });
    await user.click(screen.getByRole("button", { name: /save branch information/i }));

    await waitFor(() => expect(mocks.updateDoc).toHaveBeenCalledTimes(1));
    expect(mocks.doc).toHaveBeenCalledWith(expect.anything(), "stores", "branch-b");
    expect(mocks.updateDoc).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        socialLinks: [
          { url: "https://instagram.com/north" },
          { url: "https://tiktok.com/@north" },
        ],
      }),
    );
  });

  it("resets the editor when the selected branch changes", async () => {
    const user = userEvent.setup();
    const { rerender } = render(<StoreOwnerInfo store={northBranch} setStore={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: /edit store information/i }));
    expect(screen.getByDisplayValue("https://instagram.com/north")).toBeInTheDocument();

    rerender(
      <StoreOwnerInfo
        store={{
          ...northBranch,
          id: "branch-c",
          name: "Perk South",
          socialLinks: [{ url: "https://facebook.com/south" }],
        }}
        setStore={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: /edit store information/i }));
    expect(screen.queryByDisplayValue("https://instagram.com/north")).not.toBeInTheDocument();
    expect(screen.getByDisplayValue("https://facebook.com/south")).toBeInTheDocument();
  });

  it("restores the active branch values after canceling", async () => {
    const user = userEvent.setup();
    render(<StoreOwnerInfo store={northBranch} setStore={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: /edit store information/i }));
    fireEvent.change(screen.getByRole("textbox", { name: /social media link 1/i }), {
      target: { value: "instagram.com/changed" },
    });
    await user.click(screen.getByRole("button", { name: /cancel editing store information/i }));
    await user.click(screen.getByRole("button", { name: /edit store information/i }));

    expect(screen.getByDisplayValue("https://instagram.com/north")).toBeInTheDocument();
  });

  it("blocks persistence while a social URL is invalid", async () => {
    const user = userEvent.setup();
    render(<StoreOwnerInfo store={northBranch} setStore={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: /edit store information/i }));
    await user.click(screen.getByRole("button", { name: /add social link/i }));
    fireEvent.change(screen.getByRole("textbox", { name: /social media link 2/i }), {
      target: { value: "javascript:alert(1)" },
    });
    await user.click(screen.getByRole("button", { name: /save branch information/i }));

    expect(screen.getByText("Enter a valid social media URL.")).toBeInTheDocument();
    expect(mocks.updateDoc).not.toHaveBeenCalled();
  });
});
