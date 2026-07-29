# Store Review Experience Design

## Goal

Make public store reviews compact and easy to browse while keeping full review text and full-size customer images available on demand. Move review creation into a modal and provide a dedicated public page for browsing every review.

## Scope

This change covers the public store detail page, a new public all-reviews page, and store-owner review moderation. It does not change review eligibility, image upload limits, or the rule that only customer accounts can submit reviews.

## Store Page Review Montage

The store detail page will replace the static review grid with a horizontally moving montage:

- Each review uses a compact, fixed-width card.
- The written review is limited to two visible lines.
- Review images appear as small square thumbnails rather than a large image grid.
- The montage moves continuously and slowly from right to left.
- Hovering anywhere over the montage pauses the entire animation.
- Keyboard focus within the montage also pauses it so keyboard users can interact without moving targets.
- The track repeats the review cards when enough content exists to create a seamless loop.
- A single review remains stationary instead of being duplicated visually.
- Under `prefers-reduced-motion: reduce`, the animation is disabled and the cards remain horizontally scrollable.

The section header retains the review count, average rating, and average star display. A visible `Show all` button links to `/store/:storeId/reviews`.

## Compact Review Card

Each compact card displays:

- Customer identity, review date, and star rating.
- A two-line review excerpt.
- Small image thumbnails when images exist.
- A compact indication of an owner response when present.

Clicking the card body or review excerpt opens the full-review modal. Each card is keyboard operable. Clicking an image thumbnail does not open the full-review modal; event propagation is stopped and the full-image modal opens instead.

Anonymous reviews must never expose stored identity data. They display `Anonymous Customer` and a generic user icon. The UI must not render their avatar URL, stored initials, derived initials, or accessible image text that identifies the reviewer.

## Full-Review Modal

The full-review modal presents one complete review:

- Public customer identity or the anonymous presentation.
- Review date and star rating.
- The full, untruncated comment.
- Compact clickable image thumbnails.
- The full store-owner response and response update date, when present.

Selecting an image inside this modal opens the full-image modal. The review modal remains the underlying context and is restored after the image modal closes.

## Full-Image Modal

The full-image modal is dedicated to viewing one review image at its largest useful size:

- The image uses `object-contain` and fits within the viewport without cropping.
- The backdrop visually separates the image from the page.
- A clearly labeled close control is always available.
- Clicking the backdrop or pressing Escape closes it.
- The modal has an accessible image description such as `Review photo 1`.

The thumbnail itself remains small on cards and in review details; only this modal shows the full image.

## Feedback Creation Modal

The always-visible `Leave a Review` form will be removed from the store page layout.

- A `Create feedback` button opens a modal for signed-in customer accounts.
- The modal reuses the existing rating, anonymous option, comment, image selection, preview, removal, upload, and submission behavior.
- The anonymous helper copy states that no profile image or initials will be shown.
- Successful submission closes the modal after the refreshed review list is available and shows a success confirmation on the store page.
- Submission failures keep the modal open, preserve the form state, and show the existing error message.
- Closing the modal without submitting preserves the draft for the current page session.
- Signed-out visitors see the existing sign-in call to action.
- Signed-in non-customer roles see the existing eligibility message.

## All Reviews Page

The new public route `/store/:storeId/reviews` displays:

- A back link to the store detail page.
- Store name and `Customer Reviews` heading.
- Review count, average numeric rating, and average stars.
- Every review in newest-first order using a responsive, non-animated card grid.
- Compact comments and thumbnails consistent with the store-page cards.
- The same full-review and full-image modals.
- The same anonymous identity protection.
- Empty, loading, and missing-store states consistent with existing public store pages.

Review data remains fetched by `storeId`. Hidden reviews are excluded from public results and public rating summaries.

## Store-Owner Moderation

The store-owner feedback dashboard will add two actions to each review:

- `Hide review` is reversible. It records `hidden`, `hiddenAt`, and `hiddenBy` metadata, removes the review from public store pages and public rating summaries, and leaves it visible in the owning store's dashboard.
- `Show review` reverses a hidden review and clears its moderation metadata.
- `Remove review` is permanent. It requires an explicit destructive confirmation, deletes the review record, and attempts to delete every registered uploaded review image.

Hidden reviews display a clear `Hidden` status in the owner dashboard. Store-owner analytics continue to include hidden reviews so moderation does not rewrite historical feedback metrics.

Only the owner of the review's store, or an authorized administrator, may hide, show, or remove it. Ownership must be verified on the server from the authenticated user and store record; client-supplied role or store ownership data is not trusted.

Hide/show updates use the existing review update path with database enforcement expanded to permit only the reply and moderation fields. Permanent removal uses a dedicated authenticated server operation so review ownership validation, database deletion, and image cleanup are coordinated without granting broad client-side delete access.

## Component Boundaries

The review presentation will be split into focused units:

- Shared review types and display helpers normalize dates, public identity, image URLs, and average rating.
- `ReviewCard` owns compact review presentation and click separation between card details and image thumbnails.
- `ReviewDetailsModal` owns the complete review view.
- `ReviewImageModal` owns full-image viewing.
- `ReviewMontage` owns duplication rules, animation state, hover/focus pausing, and reduced-motion behavior.
- `ReviewFormModal` owns review creation UI while submission and persistence remain coordinated by the store page.
- `StoreReviewsPage` owns public all-review fetching, summary, and grid layout.
- Store-owner feedback controls own hide/show state and destructive confirmation UI.
- The store-review moderation server operation owns authorization and permanent review/image deletion.

These units should follow the project’s existing Tailwind, React Router, dark-mode, and modal patterns.

## Modal Interaction and Accessibility

All review modals will:

- Use dialog semantics with an accessible name.
- Close through a close button, backdrop click, or Escape.
- Prevent background page scrolling while open.
- Avoid backdrop-close when an interaction begins inside the panel.
- Restore focus to the control that opened the modal when closed.

When the full-image modal is opened from the full-review modal, Escape closes only the topmost image modal first.

## Error Handling

- A review-fetch failure logs the underlying error and renders the appropriate empty/error presentation without crashing the page.
- Broken or absent optional review images do not prevent text content from rendering.
- Existing upload rollback behavior remains unchanged when review persistence fails.
- A missing or non-public store uses the existing public missing-store behavior.
- A failed hide/show operation leaves the review's current visibility unchanged and reports the failure.
- A failed permanent removal leaves the review in the dashboard unless the database deletion has already succeeded. Image cleanup is best-effort after database deletion and logs individual cleanup failures for operational follow-up.

## Testing

Automated tests will verify:

- Anonymous identity never renders stored initials or an avatar.
- Review text is visually truncated on compact cards and complete in the details modal.
- Thumbnail clicks open the image modal without opening the review-details modal.
- Full-size images use non-cropping viewport-contained presentation.
- Montage duplication occurs only when needed and exposes pause behavior for hover/focus.
- Reduced-motion styling disables movement.
- `Show all` targets the store-specific reviews route.
- The all-reviews page renders every fetched review in newest-first order.
- `Create feedback` opens the form modal and successful submission closes it.
- Escape and close controls dismiss the correct modal layer.
- Public review lists and rating summaries exclude hidden reviews.
- Store owners can hide and restore only reviews belonging to their stores.
- Hidden reviews remain visible and labeled in the owner dashboard.
- Permanent removal requires confirmation, removes the review from the dashboard, and invokes cleanup for each review image.
- Unauthorized moderation attempts are rejected by database or server-side authorization.

The project TypeScript check, targeted Vitest tests, Supabase database tests, and production build must pass before completion.
