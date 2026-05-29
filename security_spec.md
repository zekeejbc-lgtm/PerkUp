# Security Specification for PerkUp

## 1. Data Invariants
1. **Roles & Identity**: A user's role can only be modified by an Admin or Auditor. Users cannot assign themselves higher privileges during registration or profile updates.
2. **Loyalty Stars**: A customer's lifetime stars can only be incremented by an authorized Staff member or Store Owner.
3. **Reward Cards**: A customer card can only have stamps added by authorized Staff/Owner, and only up to the `requiredStamps` of the promo.
4. **Staff Scans**: Staff can only log a transaction or award points if they are officially assigned to the store (`stores/{storeId}/staff/{userId}` exists) and during their active duty hours (though duty hours will be mostly enforced client-side, the rules will enforce that they are at least staff for that store).
5. **Subscription Status**: Only Admins can set a store's status to `active` or `suspended`. Store Owners can create stores which default to `pending`.
6. **Transaction Logs**: Transactions are append-only. They cannot be updated or deleted except by an Auditor.

## 2. The "Dirty Dozen" Payloads
1. **The Self-Promoter**: A user tries to create their `/users/{userId}` doc with `role: "admin"`.
2. **The Fake Staff**: A user tries to write a `/transactions/{id}` impersonating a `staffId` that is not them.
3. **The Rogue Owner**: A store owner sets their store's `status` to `active` without Admin approval.
4. **Double Dipping**: A customer directly modifies their `/customers/{userId}/cards/{cardId}` to `currentStamps: 10`.
5. **The Star Hacker**: A customer directly increments their `/customers/{userId}` `lifetimeStars`.
6. **Orphaned Card**: Creating a card in another user's collection.
7. **The Ghost Shift**: A staff member adding themselves to `stores/{storeId}/staff` without being the owner.
8. **The Card Forge**: A store owner trying to create a card for themselves as a customer.
9. **Shadow Admin Modification**: A staff member updating another staff member's shift hours.
10. **Transaction Tampering**: Updating an existing transaction type or timestamp.
11. **Type Poisoning**: A store owner passes an array to `requiredStamps` instead of a number.
12. **The Infinite Store IDs**: A user creates a store using a 500-character ID to cause resource exhaustion.

## 3. Test Runner
A Firebase rules test suite must verify that all these 12 operations return `PERMISSION_DENIED`.
