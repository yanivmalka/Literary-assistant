# Supabase Authentication Configuration Guide

## Problem Summary
Your app is showing `invalid_credentials` errors when trying to log in, and no verification emails are being sent during signup.

## Root Causes

1. **Email Verification Requirement Not Configured**: Supabase requires email verification before login, but the email system isn't configured to send verification links.
2. **No Email Provider Setup**: SMTP or email service provider (SendGrid, Mailgun, etc.) is not configured in your Supabase project.
3. **Email Template Missing**: Verification email template might not be set up.

## How to Fix (Two Options)

### Option 1: Disable Email Verification (Quick Fix - Development Only)
This is suitable for development/testing. Users can sign up and log in immediately without email confirmation.

**Steps:**
1. Go to your [Supabase Dashboard](https://app.supabase.com)
2. Select your project: `lqfqfzqcrqluxanhnjwu`
3. Navigate to **Authentication** → **Providers**
4. Find **Email** provider
5. Toggle **Email Confirmations** to **OFF**
6. Click **Save**

**After this:**
- ✅ Users can sign up and log in immediately
- ✅ No verification emails needed
- ⚠️ Only use for development/testing

---

### Option 2: Enable Email Verification (Production Recommended)
This is the proper way for production apps.

**Steps:**

#### Step 1: Configure SMTP or Email Service
You need to set up an email provider. Supabase supports:
- **SendGrid** (recommended)
- **Mailgun**
- **AWS SES**
- **Custom SMTP** (your own email server)

**Example: Using SendGrid (Free tier available)**

1. Sign up at [SendGrid](https://sendgrid.com)
2. Create an API key
3. In Supabase Dashboard:
   - Go to **Project Settings** → **Email Provider**
   - Select **SendGrid** as the provider
   - Paste your SendGrid API key
   - Click **Save**

#### Step 2: Configure Email Template
1. In Supabase Dashboard, go to **Authentication** → **Email Templates**
2. Make sure the **Confirm signup** template has your redirect URL:
   - It should include: `{{ confirmation_url }}`
   - Redirect URL should be: `https://yanivmalka.github.io/` (your app URL)

#### Step 3: Enable Email Confirmations
1. Go to **Authentication** → **Providers**
2. Find **Email** provider
3. Toggle **Email Confirmations** to **ON**
4. Click **Save**

#### Step 4: Update Your Frontend (if needed)
The code already handles email confirmation flow. Users will see:
1. Sign up page
2. Confirmation message: "Check your email for confirmation link"
3. They click the link in their email
4. They can now log in

---

## Current Code Changes
I've updated `authStore.ts` to:
- ✅ Include email redirect URL in signup
- ✅ Provide better error messages for unconfirmed emails
- ✅ Handle errors more gracefully

## Testing the Fix

### For Option 1 (Disable Verification):
```
1. Go to https://yanivmalka.github.io/signup
2. Enter any email and password
3. Click signup
4. Go to login page
5. Enter same email and password
6. ✅ Should log in successfully
```

### For Option 2 (Enable with Email):
```
1. Go to https://yanivmalka.github.io/signup
2. Enter your real email and password
3. Check your inbox for verification email
4. Click the confirmation link
5. Go to login page
6. Enter email and password
7. ✅ Should log in successfully
```

---

## Troubleshooting

### "Invalid credentials" error:
- ❌ Account exists but not confirmed → User needs to check email
- ❌ Account doesn't exist → User needs to sign up first
- ❌ Wrong password → User needs to re-enter password

### Email not arriving:
- Check **Email** provider configuration in Supabase
- Check your email spam/junk folder
- Verify the email address is correct
- Check SendGrid/provider logs for delivery errors

### Can't click "Confirm" link in email:
- Make sure redirect URL in email template matches your app URL
- Check email template format in Supabase

---

## Recommended Setup for Production
1. **Use Email Verification** (Option 2) for security
2. **Use SendGrid** for reliability and deliverability
3. **Test with real email** before going live
4. **Monitor email delivery** via SendGrid dashboard

---

## Questions?
Check the [Supabase Auth Documentation](https://supabase.com/docs/guides/auth/overview)
