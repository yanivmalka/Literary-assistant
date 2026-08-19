# Authentication Troubleshooting Guide

## Your Issues
1. ❌ Cannot log in with email/password → Error: `invalid_credentials`
2. ❌ No verification email sent when creating new account

## Why This Happens

When you sign up a new user in Supabase:
```
User Signs Up → Supabase creates account → Sends email with confirmation link
                                          ↓ 
                              User clicks link to confirm
                                          ↓
                            Account is now verified
                                          ↓
                        User can log in with password
```

**Your issue:** Steps 2 and 3 are failing:
- Email is NOT being sent
- Account is created but marked as "unverified"
- When user tries to log in → `invalid_credentials` (because account isn't verified)

## Solution - 2 Options

### ⚡ Quick Fix (Development/Testing)
**Disable email verification requirement**

Go to [Supabase Dashboard](https://app.supabase.com):
1. Select your project `lqfqfzqcrqluxanhnjwu`
2. **Authentication** → **Providers**
3. Find **Email** section
4. Toggle **Email Confirmations** to **OFF** ← Click this
5. **Save**

Result: Users can sign up and log in immediately ✅

---

### ✅ Proper Fix (Production)
**Enable email verification with a mail service**

#### Step 1: Set up email provider (choose one)

**Option A: SendGrid (Easiest)**
1. Go to https://sendgrid.com (free tier available)
2. Sign up and create an API key
3. Copy the API key
4. In Supabase Dashboard:
   - **Project Settings** → **Email Provider**
   - Select **SendGrid**
   - Paste API key
   - **Save**

**Option B: Mailgun**
1. Go to https://mailgun.com
2. Create account and get API key
3. Same steps as SendGrid in Supabase

**Option C: Custom SMTP**
- Use your own mail server (Gmail, company email, etc.)
- Configure in **Email Provider** settings

#### Step 2: Verify email template
In Supabase Dashboard:
- **Authentication** → **Email Templates**
- Check **Confirm signup** template
- Make sure it has: `{{ confirmation_url }}`
- Redirect should point to your app

#### Step 3: Enable confirmations
- **Authentication** → **Providers**
- Find **Email**
- Toggle **Email Confirmations** to **ON**
- **Save**

#### Step 4: Test it
1. Go to signup
2. Enter email & password
3. Should get confirmation email
4. Click link in email
5. Can now log in ✅

---

## Code Changes Made

I've updated your `authStore.ts` with:

1. **Better error handling**
   ```typescript
   // Now catches specific "Email not confirmed" error
   if (error?.message?.includes('Email not confirmed')) {
     return { error: 'Please check your email to confirm your account' }
   }
   ```

2. **Email redirect URL**
   ```typescript
   emailRedirectTo: `${window.location.origin}${import.meta.env.BASE_URL}`
   // Points confirmation link back to your app
   ```

3. **Email confirmation method**
   ```typescript
   confirmEmail: async (email, token) => {
     // Handles email link clicks and confirms account
   }
   ```

---

## Quick Reference

### If using Quick Fix (disabled email confirmation):
- ✅ Signup → Can login immediately
- ✅ No verification email needed
- ⚠️ Less secure - only for development
- ⚠️ Anyone with email can create account

### If using Proper Fix (with email service):
- ✅ Signup → Get verification email
- ✅ Click link → Account confirmed
- ✅ Login works
- ✅ More secure - recommended for production

---

## Verification Checklist

### After making changes, test with:
```
1. New email address (never used before)
2. Simple password (e.g., "Test123!")
3. Go to https://yanivmalka.github.io/signup
4. Enter email & password
5. Click signup button
6. For Quick Fix: See confirmation message
7. For Proper Fix: Check email for link, click it
8. Go to login page
9. Enter same email & password
10. Should see dashboard ✅
```

---

## If Still Not Working

**Check these:**

1. **Is Supabase actually connected?**
   - Check if `.env` has correct values:
   ```
   VITE_SUPABASE_URL="https://lqfqfzqcrqluxanhnjwu.supabase.co"
   VITE_SUPABASE_ANON_KEY="eyJhbGc..." (long JWT key)
   ```

2. **Is your email provider working?**
   - Check SendGrid/Mailgun dashboard
   - Look at delivery logs
   - Try sending test email from their UI

3. **Is the redirect URL correct?**
   - Should be: `https://yanivmalka.github.io/`
   - Check email template in Supabase

4. **Enable debug logging:**
   - Open browser DevTools (F12)
   - Watch for auth errors in Console
   - Share exact error message

---

## Need More Help?

- [Supabase Auth Docs](https://supabase.com/docs/guides/auth)
- [Email Configuration Guide](https://supabase.com/docs/guides/auth/auth-smtp)
- [SendGrid Setup](https://supabase.com/docs/guides/auth/auth-twilio-sendgrid)

Good luck! 🚀
