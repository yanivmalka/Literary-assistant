# Test A: Email/Password → Verify Email → Link Google → Same user.id

## Objective
Verify that a user can sign up with Email/Password, verify their email, then link Google OAuth to the same account, and both sign-in methods return the same `user.id`.

## Prerequisites
- Fresh browser session (or clear all app cookies/localStorage)
- Access to an email inbox where you can receive verification emails
- Google account to use for OAuth linking

## Step-by-Step Instructions

### Phase 1: Email/Password Signup

1. Navigate to: `https://yanivmalka.github.io/signup`
2. Enter:
   - Email: Use a NEW email address (not used before in Supabase)
   - Password: Any password (min 6 characters, e.g., `Test123!`)
   - Confirm Password: Same as above
3. Click "Sign Up"
4. Expected result: See "Check your email" message with verification email info

**Record:**
- Email used: `[YOUR_EMAIL_HERE]`
- Expected next step: Email verification

---

### Phase 2: Verify Email

1. Check your email inbox (wait up to 5 minutes)
2. Open the verification email from the Literary Assistant app
3. Click the confirmation link in the email
4. Expected result: Browser redirects to app or shows success message
5. The app may ask you to log in again

**Record:**
- Email verification link clicked: ✓
- Redirected successfully: ✓ or ✗

---

### Phase 3: Sign In with Email/Password

1. Navigate to: `https://yanivmalka.github.io/login`
2. Enter the same email and password from Step 1
3. Click "Login"
4. Expected result: Successfully logged in, redirected to home page

**Record:**
- Sign in successful: ✓
- Redirected to home: ✓

---

### Phase 4: Check Initial user.id and Identities

1. Navigate to: `https://yanivmalka.github.io/account-settings`
2. You should see:
   - Account Information section with:
     - Email: `[YOUR_EMAIL]`
     - User ID: `[UUID_FIRST_8_CHARS]...` (e.g., `a1b2c3d4...`)
     - Created date
   - Authentication Methods section showing:
     - Email & Password: Connected ✓
     - Google Account: Not connected

**Record:**
- User ID (first 8 chars): `[RECORD_THIS_ID_AS_USER_ID_A]`
- Identities shown: `["email"]`
- Example: User ID: `a1b2c3d4`, Identities: `["email"]`

---

### Phase 5: Link Google Account

1. Still on `/account-settings` page
2. In the "Authentication Methods" section, under "Google Account"
3. Click "Link Google Account" button
4. Expected result: OAuth flow starts, Google sign-in popup or redirect

**During Google OAuth flow:**
- Sign in with your Google account (can be different from the email you signed up with)
- Grant permissions if prompted
- Browser redirects back to the app

**Record:**
- Google linking initiated: ✓
- Google OAuth completed: ✓
- Redirected back to app: ✓

---

### Phase 6: Verify Identities After Linking

1. After Google linking completes, you should be redirected
2. Navigate to: `https://yanivmalka.github.io/account-settings` again
3. You should now see:
   - Authentication Methods section showing:
     - Email & Password: Connected ✓
     - Google Account: Connected ✓
   - Summary message: "Both authentication methods are linked to this account."

**Record:**
- Both methods now show Connected: ✓ or ✗
- Identities shown: `["email", "google"]` or similar
- Example: User ID: `a1b2c3d4`, Identities: `["email", "google"]`

---

### Phase 7: Sign Out and Test Google Login

1. On `/account-settings` page, click Logout
2. Redirected to login page
3. Navigate to: `https://yanivmalka.github.io/login`
4. Click "Sign in with Google" button
5. Authenticate with Google (same Google account used in Phase 5)
6. Expected result: Successfully logged in

**Record:**
- Google sign-in successful: ✓
- Redirected to home: ✓

---

### Phase 8: Verify Same user.id After Google Login

1. Navigate to: `https://yanivmalka.github.io/account-settings`
2. Check the User ID shown in "Account Information"
3. This User ID **MUST** be identical to the one recorded in **Phase 4**

**Record:**
- User ID (first 8 chars): `[RECORD_THIS_ID_AS_USER_ID_B]`
- Is `USER_ID_A` === `USER_ID_B`? ✓ or ✗

**Critical Check:**
```
USER_ID_A (from email login):  [a1b2c3d4]
USER_ID_B (from google login): [a1b2c3d4]
Match: ✓ or ✗
```

---

### Phase 9: Sign Out and Test Email/Password Login Again

1. On `/account-settings` page, click Logout
2. Navigate to: `https://yanivmalka.github.io/login`
3. Sign in with Email/Password (use original email and password from Phase 1)
4. Expected result: Successfully logged in

**Record:**
- Email/Password sign-in successful: ✓

---

### Phase 10: Verify user.id Consistent After Email Login

1. Navigate to: `https://yanivmalka.github.io/account-settings`
2. Check the User ID again

**Record:**
- User ID (first 8 chars): `[RECORD_THIS_ID_AS_USER_ID_C]`
- Is `USER_ID_A` === `USER_ID_C`? ✓ or ✗

---

## Test A Summary Template

Please fill in and return:

```
TEST A: Email/Password → Verify Email → Link Google → Same user.id

Email Used: [YOUR_EMAIL]
Password Used: [PASSWORD]
Google Account Used: [YOUR_GOOGLE_EMAIL]

RESULTS:
---------

Phase 1 - Email Signup:
  ✓ Signup successful
  ✓ Verification email message shown

Phase 2 - Email Verification:
  ✓ Verification email received
  ✓ Clicked link successfully
  
Phase 3 - Email/Password Login:
  ✓ Login successful
  ✓ Logged into account

Phase 4 - Initial user.id and Identities:
  User ID (first 8 chars): [a1b2c3d4]
  Identities: ["email"]

Phase 5 - Link Google:
  ✓ Google linking initiated
  ✓ OAuth flow completed

Phase 6 - Verify Identities After Linking:
  ✓ Both methods show Connected
  Identities: ["email", "google"]

Phase 7 - Sign Out and Google Login:
  ✓ Google sign-in successful

Phase 8 - Verify Same user.id After Google Login:
  User ID (first 8 chars): [a1b2c3d4]
  USER_ID_A === USER_ID_B: ✓

Phase 9 - Email/Password Login Again:
  ✓ Email/Password sign-in successful

Phase 10 - Verify user.id Consistent:
  User ID (first 8 chars): [a1b2c3d4]
  USER_ID_A === USER_ID_C: ✓

FINAL RESULT: ✓ PASS or ✗ FAIL

If FAIL - describe what went wrong:
[DESCRIBE ANY ISSUES HERE]
```

---

## Troubleshooting

### Email verification link not working
- Check if link expires (usually 24 hours)
- Try copying link directly into browser
- Check browser console for errors (F12 → Console)
- Verify app is deployed and accessible at the domain

### Google OAuth fails
- Ensure Google is configured in Supabase Dashboard
- Check if OAuth redirect URL matches app URL
- Try different Google account if available
- Check browser console for errors

### user.id changes after linking
- This would indicate a bug in identity linking
- Check Supabase Dashboard → Authentication → Users
- Verify that the email and google identities point to the same user
- Run SQL query: `SELECT id, identities FROM auth.users WHERE email = '[YOUR_EMAIL]'`

### Can't access account-settings page
- Ensure you're logged in (check home page redirects to /projects)
- Try going directly to login page and signing in again
- Clear browser cache and try again

---

## Next Steps After Test A

Once Test A is complete and passing:
1. Return the filled-in test summary
2. I will proceed with Test B (Google → Add Password)
3. Then Test C & D (edge cases)
4. Finally commit and push to GitHub

