# Branch-Specific Store Social Links

## Goal

Allow store owners to add, edit, order, and remove any number of social-media links from the existing Edit Store screen. Each branch owns its own links, and each public branch page displays only the links saved for that branch.

## Data Model

Each store record may contain an ordered `socialLinks` array:

```ts
type StoreSocialLink = {
  url: string;
};
```

The array is stored directly on the existing `stores/{branchId}` record. It is not inherited from the primary branch and is not copied between sibling branches. Multiple links from the same platform are allowed.

Older store records without `socialLinks` are treated as having an empty array.

## URL Normalization and Platform Detection

Before saving, each nonblank entry is normalized and validated:

- surrounding whitespace is removed;
- links without a scheme receive `https://`;
- only `http:` and `https:` URLs are accepted;
- invalid URLs prevent saving and identify the affected row;
- blank rows are discarded;
- input order is preserved.

The hostname determines the presentation. Recognized hostnames include:

- Facebook;
- Instagram;
- TikTok;
- X/Twitter;
- YouTube;
- LinkedIn;
- Pinterest;
- Threads;
- Snapchat;
- WhatsApp;
- Telegram;
- Discord.

Hostname matching must use exact domains or valid subdomains so lookalike domains such as `facebook.example.com` or `facebook.com.example.org` are not misclassified.

Recognized platforms use their corresponding logo or closest available branded icon. Unknown platforms use a generic globe/link icon and the normalized hostname as their label.

## Store Owner Editing Experience

The existing Edit Store form gains a Social Media section:

- each row contains a URL input, detected-platform preview, and Remove action;
- Add Link appends another blank row;
- there is no application-level link count limit;
- duplicate URLs and multiple links from the same platform are permitted;
- detected presentation updates as the owner edits a URL;
- Cancel restores the selected branch's previously saved links;
- Save persists normalized nonblank links along with the rest of the selected branch record.

The editor continues to call `updateDoc` for `stores/{store.id}`. Since `store.id` is the active branch selected by the owner dashboard, no sibling or primary-branch record is updated.

## Public Branch Page

The public `/store/{branchId}` page reads `socialLinks` from that exact branch record and displays them in the contact section.

Each link:

- opens in a new tab;
- uses `rel="noopener noreferrer"`;
- shows its inferred platform icon and label;
- falls back to a globe icon and hostname for unrecognized domains.

The existing empty-contact state considers social links, so it appears only when the branch has no contact number, website, or valid social links.

## Code Boundaries

A focused social-link utility owns:

- normalization and validation;
- safe hostname matching;
- platform metadata and labels;
- conversion of unknown links into generic presentation metadata.

The utility contains no React or persistence logic. Edit Store owns row manipulation and validation feedback. Store Page owns public rendering. This keeps URL behavior independently testable and consistent between both screens.

## Error Handling

- Invalid URLs remain visible in the form and block the save.
- The owner receives a row-specific validation message.
- Existing save failures retain the form contents and use the current store-update error path.
- Public rendering ignores malformed legacy entries rather than allowing unsafe or broken link targets.

## Testing

Test-driven implementation will cover:

- scheme insertion and whitespace trimming;
- rejection of malformed and non-HTTP(S) URLs;
- each recognized hostname and representative subdomains;
- lookalike-domain rejection;
- generic hostname fallback;
- multiple links from the same platform;
- preservation of unlimited ordered entries;
- loading, adding, removing, canceling, and saving links in Edit Store;
- persistence to the active `store.id` only;
- public rendering for the requested branch only;
- safe external-link attributes and empty-contact behavior.

## Scope

This feature does not add social links to partner applications, administrator editing, staff editing, or homepage footer configuration. It does not fetch remote favicons or accept uploaded social icons.
