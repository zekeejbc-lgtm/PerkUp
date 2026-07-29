# Mobile Button and Email Overflow Design

## Goal

Keep the authentication flow readable and compact on screens as narrow as
320px without shrinking intentionally prominent calls to action elsewhere in
the app.

## Scope

- Fix the signup OTP notice so long email addresses wrap inside its container.
- Recover horizontal space in the authentication modal on small screens.
- Keep crowded authentication actions to a compact text size and use shorter
  copy where the current label wraps.
- Review app action buttons for the same narrow-screen failure pattern, while
  preserving deliberately large marketing and primary call-to-action buttons.

## Design

The authentication modal will use one layer of small-screen outer spacing and
reduced small-screen content padding, retaining the existing larger padding at
the `sm` breakpoint. Status messages will allow unbroken values such as email
addresses to wrap anywhere rather than overflow horizontally.

The final signup action will read `Create account`. Crowded form actions will
use a compact `text-sm` size while retaining their existing padding and touch
height. Existing buttons that already use compact sizing, icon-only controls,
and intentionally prominent calls to action will not receive a global font
override.

## Verification

- Add a focused AuthModal regression test that reaches OTP verification and
  asserts the wrapping and compact action classes and shortened label.
- Run the focused test, the full Vitest suite, TypeScript checking, and the
  production build.
- Confirm the relevant classes leave usable content width at 320px and retain
  the existing desktop spacing at the `sm` breakpoint.

## Non-goals

- No global CSS rule that forces every button to the same font size.
- No change to authentication behavior, OTP timing, or validation.
- No redesign of desktop layouts or intentionally large marketing actions.
