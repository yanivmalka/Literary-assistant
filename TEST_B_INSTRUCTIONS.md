# Test B: Google OAuth → Add Password → Same user.id

## Objective
Verify that a user can sign up with Google OAuth, then add a password to the same account, and both sign-in methods return the same `user.id`.

## Prerequisites
- Fresh browser session (or clear all app cookies/localStorage)
- Google account to use for initial sign-up
- Email address ready for password-based sign-in (can be same or different from Google account email)

## Step-by-Step Instructions

### Phase 1: Google OAuth Sign Up

1. Navigate to: `https://yanivmalka.github.io/signup`
2. Click "Sign in with Google" button
3. Google OAuth flow starts
4. Select your Google account (or create new one)
5. Grant permissions if prompted
6. Expected result: Successfully authenticated, redirected to app home

**Record:**
- Google account used: `[YOUR_GOOGLE_EMAIL]`
- Sign-up successful: ✓

---

### Phase 2: Check Initial user.id and Identities

1. Navigate to: `https://yanivmalka.github.io/account-settings`
2. You should see:
   - Account Information section with:
     - Email: `[GOOGLE_EMAIL]` (from your Google account)
     - User ID: `[UUID_FIRST_8_CHARS]...` (e.g., `x9y8z7w6...`)
     - Created date
   - Authentication Methods section showing:
     - Email & Password: Not connected
     - Google Account: Connected ✓

**Record:**
- User ID (first 8 chars): `[RECORD_THIS_ID_AS_USER_ID_B1]`
- Identities shown: `["google"]`
- Example: User ID: `x9y8z7w6`, Identities: `["google"]`

---

### Phase 3: Add Password

1. Still on `/account-settings` page
2. In the "Authentication Methods" section, under "Email & Password"
3. You should see "Add Password" option
4. Click "Add Password"
5. A form appears with:
   - New password field
   - Confirm password field
   - Add Password button

**Fill in:**
- New password: Any password (min 6 characters, e.g., `EmailPass123!`)
- Confirm password: Same as above
- Click "Add Password" button

6. Expected result: Success message "Password added successfully!"

**Record:**
- Password addition initiated: ✓
- Success message shown: ✓ or error message: [DESCRIBE]

---

### Phase 4: Verify Identities After Adding Password

1. After success message, page may auto-refresh
2. Check the "Authentication Methods" section again
3. You should now see:
   - Email & Password: Connected ✓
   - Google Account: Connected ✓
   - Summary message: "Both authentication methods are linked to this account."

**Record:**
- Both methods now show Connected: ✓ or ✗
- Identities shown: `["google", "email"]` or similar
- Example: User ID: `x9y8z7w6`, Identities: `["google", "email"]`

---

### Phase 5: Sign Out and Test Email/Password Login

1. On `/account-settings` page, click Logout
2. Redirected to login page
3. Navigate to: `https://yanivmalka.github.io/login`
4. Sign in with Email/Password:
   - Email: Your Google account email (shown in account info)
   - Password: The password you just added
5. Click "Login"
6. Expected result: Successfully logged in

**Record:**
- Email/Password sign-in successful: ✓

---

### Phase 6: Verify Same user.id After Email Login

1. Navigate to: `https://yanivmalka.github.io/account-settings`
2. Check the User ID shown in "Account Information"
3. This User ID **MUST** be identical to the one recorded in **Phase 2**

**Record:**
- User ID (first 8 chars): `[RECORD_THIS_ID_AS_USER_ID_B2]`
- Is `USER_ID_B1` === `USER_ID_B2`? ✓ or ✗

**Critical Check:**
```
USER_ID_B1 (from google login):         [x9y8z7w6]
USER_ID_B2 (from email/password login): [x9y8z7w6]
Match: ✓ or ✗
```

---

### Phase 7: Sign Out and Test Google Login Again

1. On `/account-settings` page, click Logout
2. Navigate to: `https://yanivmalka.github.io/login`
3. Click "Sign in with Google" button
4. Authenticate with the same Google account
5. Expected result: Successfully logged in

**Record:**
- Google sign-in successful: ✓

---

### Phase 8: Verify user.id Consistent After Google Login

1. Navigate to: `https://yanivmalka.github.io/account-settings`
2. Check the User ID again

**Record:**
- User ID (first 8 chars): `[RECORD_THIS_ID_AS_USER_ID_B3]`
- Is `USER_ID_B1` === `USER_ID_B3`? ✓ or ✗

---

## Test B Summary Template

Please fill in and return:

```
TEST B: Google OAuth → Add Password → Same user.id

Google Account Used: [YOUR_GOOGLE_EMAIL]
Password Added: [PASSWORD_USED_FOR_EMAIL_LOGIN]

RESULTS:
---------

Phase 1 - Google OAuth Sign Up:
  ✓ Google sign-up successful
  ✓ Authenticated and redirected

Phase 2 - Initial user.id and Identities:
  User ID (first 8 chars): [x9y8z7w6]
  Identities: ["google"]

Phase 3 - Add Password:
  ✓ Add Password form displayed
  ✓ Password entered
  ✓ Success message shown (or error: [DESCRIBE])

Phase 4 - Verify Identities After Adding Password:
  ✓ Both methods show Connected
  Identities: ["google", "email"]

Phase 5 - Email/Password Login:
  ✓ Email/Password sign-in successful

Phase 6 - Verify Same user.id After Email Login:
  User ID (first 8 chars): [x9y8z7w6]
  USER_ID_B1 === USER_ID_B2: ✓

Phase 7 - Google Login Again:
  ✓ Google sign-in successful

Phase 8 - Verify user.id Consistent:
  User ID (first 8 chars): [x9y8z7w6]
  USER_ID_B1 === USER_ID_B3: ✓

FINAL RESULT: ✓ PASS or ✗ FAIL

If FAIL - describe what went wrong:
[DESCRIBE ANY ISSUES HERE]
```

---

## Troubleshooting

Same as Test A - see TEST_A_INSTRUCTIONS.md for details.

---

## Next Steps After Test B

Once Test B is complete and passing:
1. Return the filled-in test summary
2. I will provide Test C & D instructions (edge cases)
3. Then final verification and GitHub commit

