# Test C & D: Edge Cases and Duplicate Prevention

## Test C: Sign Up with Email Already Linked to Google Account

### Objective
Verify that when a user tries to sign up with an email that's already linked to an existing Google OAuth account, the system does NOT create a duplicate account.

### Setup
- You must have completed Test B (user with Google account that has password added)
- That user's email: `[GOOGLE_EMAIL_FROM_TEST_B]`

### Test C Instructions

1. Open a **NEW browser tab or use Incognito mode** (fresh session, no cookies)
2. Navigate to: `https://yanivmalka.github.io/signup`
3. Try to sign up with:
   - Email: Use the SAME email from your Google account (from Test B)
   - Password: Any password
   - Confirm Password: Same as above
4. Click "Sign Up"

**Expected Behavior - Option A (Secure):**
- Get a generic error message like:
  - "An error occurred" or
  - "Could not sign up" or
  - Similar generic message
- NO message revealing whether the email exists
- This is correct for user enumeration prevention

**Expected Behavior - Option B (Also Secure):**
- Success message shown (same as normal signup)
- But when you try to verify the email or login, you get:
  - "Email not confirmed" error or
  - "Invalid credentials" error
- This happens because Supabase prevents duplicate users

**Unexpected Behavior (BUG):**
- Successful signup with new user created
- Being able to login with the new email/password
- This would indicate duplicate account creation

**Record:**
- Sign up attempted with existing Google email: ✓
- Error message received: ✓ or Success message: ✓
- Error/message text: [DESCRIBE]
- Able to login with new account: ✗ (should not be possible)

---

### Verification

1. After the sign-up attempt, open Supabase Dashboard
2. Go to: Authentication → Users
3. Search for `[GOOGLE_EMAIL_FROM_TEST_B]`
4. Count how many users have this email

**Critical Check:**
```
Expected: 1 user with this email
Actual: [COUNT]
Result: ✓ (1 user) or ✗ (duplicate found)
```

5. Click on the user entry
6. Check the "Identities" tab
7. Verify identities are: `["google", "email"]`
8. NOT two separate users

---

## Test D: Link Google Account That's Already Linked to Another User

### Objective
Verify that when a user tries to link a Google account that's already linked to another user, the system prevents this and shows an appropriate error.

### Setup
- You need 2 different users (from Test A and Test B)

**User 1 (from Test A):**
- Email: `[EMAIL_FROM_TEST_A]`
- Google: Linked (second method added)
- user.id: `[USER_ID_A]`

**User 2 (from Test B):**
- Email: `[GOOGLE_EMAIL_FROM_TEST_B]` (Google account)
- Password: Added
- user.id: `[USER_ID_B]`

### Test D Instructions

1. Create a THIRD test account using Email/Password (for this test):
   - Navigate to: `https://yanivmalka.github.io/signup`
   - Email: New email (not used before)
   - Password: Any password
   - Verify your email
   - Login

2. Navigate to: `https://yanivmalka.github.io/account-settings`
3. You should see only "Email & Password" connected

4. Click "Link Google Account"
5. Google OAuth flow starts
6. **Important:** Try to sign in with the Google account from **User 1** (Test A)
   - This Google account is already linked to User 1
7. Complete the OAuth flow

**Expected Behavior:**
- After OAuth completes, you should get one of:
  - Error message: "This Google account is already linked to another account"
  - Error message: "Google account already in use"
  - Error message: "Authentication failed"
  - Generic error message
- You should NOT be linked to User 1
- You should remain as the third user
- The third user should still only have Email & Password

**Unexpected Behavior (BUG):**
- You get automatically merged into User 1
- Your user.id changes to User 1's ID
- You lose your email/password credentials
- This would indicate automatic account merging (which is wrong)

**Record:**
- Attempted to link already-linked Google account: ✓
- Error received: ✓ or Linking succeeded: ✗
- Error message: [DESCRIBE]
- Still separate user (user.id unchanged): ✓ or ✗

---

### Verification

1. After the linking attempt, navigate back to account-settings
2. Verify you're still the same user:
   - User ID should be unchanged (the third test user's ID)
   - Email should still be your email (not merged)
   - Google should NOT be connected

**Critical Check:**
```
User ID before linking attempt: [THIRD_USER_ID]
User ID after linking attempt:  [THIRD_USER_ID]
Same user: ✓ (unchanged) or ✗ (merged/changed)
```

3. Sign out
4. Sign in again with Email/Password
5. Verify you can still access your account and data

---

## Test C & D Summary Template

```
TEST C: Sign Up with Email Already Linked to Google

Email Used (already linked): [GOOGLE_EMAIL_FROM_TEST_B]
Password Attempted: [PASSWORD]

RESULTS:
---------

Sign-up Attempt:
  ✓ Signup attempted
  Error received: [YES or NO - describe]
  Error message: [DESCRIBE]

Supabase Verification:
  Total users with this email: [COUNT - should be 1]
  User count correct (1): ✓ or ✗
  Identities for this user: [LIST]
  No duplicate user: ✓ or ✗

FINAL RESULT: ✓ PASS or ✗ FAIL
```

```
TEST D: Link Google Account Already Linked to Another User

Third Test Email: [NEW_EMAIL_FOR_THIS_TEST]
Google Account Used for Linking: [GOOGLE_EMAIL_FROM_TEST_A]
(This Google account belongs to User 1 from Test A)

RESULTS:
---------

Google Linking Attempt:
  ✓ Linking attempted
  Error received: ✓ or ✗
  Error message: [DESCRIBE]

Account Verification:
  User ID before linking: [THIRD_USER_ID]
  User ID after linking:  [THIRD_USER_ID]
  Same user (not merged): ✓ or ✗
  Email still yours: ✓ or ✗
  Google linked: ✓ (bug!) or ✗ (correct - not linked)

Post-linking Login Test:
  Can sign in with Email/Password: ✓
  User ID matches: ✓

FINAL RESULT: ✓ PASS or ✗ FAIL
```

---

## Expected Outcomes Summary

| Test | Scenario | Expected | Indicates |
|------|----------|----------|-----------|
| C | Signup with existing Google email | Generic error or signup succeeds but login fails | User enumeration protection + duplicate prevention working |
| D | Link already-linked Google to different user | Error preventing link | Account isolation maintained |

---

## Critical Security Requirements

These tests verify:
1. ✓ No user enumeration (can't tell if email exists)
2. ✓ No duplicate accounts created
3. ✓ No automatic account merging
4. ✓ One Google account = one user
5. ✓ Proper error handling for edge cases

---

## Troubleshooting

### Test C: Got success message but couldn't login
- This is actually correct behavior
- Sign-up succeeds to prevent enumeration
- But login fails because account isn't verified or conflicts
- Check Supabase Dashboard to confirm only 1 user exists

### Test D: Got permissions error from Google
- This is normal if Google account has 2FA
- Just confirm access to the account
- If still can't proceed, try different Google account

### Either test: Can't create third test account
- Use a different email format for variety
- Or use email aliases (gmail.com: email+test@gmail.com)

---

## After All Tests Pass

Once Tests A, B, C, and D all pass:
1. Return filled test summaries
2. Implementation is complete and verified
3. Ready for final GitHub commit and push

