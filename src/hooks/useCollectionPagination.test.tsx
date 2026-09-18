import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useCollectionPagination } from "./useCollectionPagination";

describe("useCollectionPagination", () => {
  it("renders only the active page and clamps when the collection shrinks", async () => {
    const { result, rerender } = renderHook(
      ({ items }) => useCollectionPagination(items, 3),
      { initialProps: { items: [1, 2, 3, 4, 5, 6, 7] } },
    );

    expect(result.current.pageItems).toEqual([1, 2, 3]);

    act(() => result.current.setPage(3));
    expect(result.current.pageItems).toEqual([7]);

    rerender({ items: [1, 2] });

    await waitFor(() => expect(result.current.page).toBe(1));
    expect(result.current.pageItems).toEqual([1, 2]);
  });
});
