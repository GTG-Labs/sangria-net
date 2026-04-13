# 📧 Email Service Setup Guide

The Sangria backend includes a flexible email service for sending invitation emails. This guide shows you how to configure it with different email providers.

## 🚀 Quick Start (Mock Mode)

For development and testing, the email service can run in mock mode where emails are logged instead of sent:

```bash
# Enable mock mode (default if no SMTP credentials)
export EMAIL_MOCK=true
```

When in mock mode, invitation emails will be logged to the console with all details.

## 📨 SMTP Configuration (Production)

### Gmail Setup
```bash
export EMAIL_PROVIDER=smtp
export SMTP_HOST=smtp.gmail.com
export SMTP_PORT=587
export SMTP_USERNAME=your-email@gmail.com
export SMTP_PASSWORD=your-app-password  # Use App Password, not regular password
export FROM_EMAIL=your-email@gmail.com
export FROM_NAME="Sangria"
export FRONTEND_URL=https://yourdomain.com  # For invitation accept links
```

**Gmail App Password Setup:**
1. Enable 2-Factor Authentication on your Google account
2. Go to Google Account settings > Security > App passwords
3. Generate a new app password for "Mail"
4. Use this password (not your regular Gmail password)

### SendGrid SMTP
```bash
export EMAIL_PROVIDER=smtp
export SMTP_HOST=smtp.sendgrid.net
export SMTP_PORT=587
export SMTP_USERNAME=apikey
export SMTP_PASSWORD=your-sendgrid-api-key
export FROM_EMAIL=noreply@yourdomain.com
export FROM_NAME="Your Company"
export FRONTEND_URL=https://yourdomain.com
```

### Generic SMTP
```bash
export EMAIL_PROVIDER=smtp
export SMTP_HOST=your-smtp-server.com
export SMTP_PORT=587  # or 465 for SSL
export SMTP_USERNAME=your-username
export SMTP_PASSWORD=your-password
export FROM_EMAIL=noreply@yourdomain.com
export FROM_NAME="Your Company"
export FRONTEND_URL=https://yourdomain.com
```

## 🔧 Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `EMAIL_PROVIDER` | No | `smtp` | Email provider type |
| `EMAIL_MOCK` | No | `false` | Enable mock mode for testing |
| `SMTP_HOST` | Yes* | `smtp.gmail.com` | SMTP server hostname |
| `SMTP_PORT` | No | `587` | SMTP server port |
| `SMTP_USERNAME` | Yes* | - | SMTP username |
| `SMTP_PASSWORD` | Yes* | - | SMTP password |
| `FROM_EMAIL` | No | `SMTP_USERNAME` | From email address |
| `FROM_NAME` | No | `Sangria` | From name |
| `FRONTEND_URL` | No | `http://localhost:3000` | Frontend URL for links |

*Required for production email sending

## 🎨 Email Template

The service sends beautiful HTML invitation emails with:
- Organization branding
- Personal message from inviter (optional)
- Clear call-to-action button
- Expiration information
- Professional styling

## 🧪 Testing

### Development Mode
Start the server with mock emails enabled:
```bash
EMAIL_MOCK=true go run .
```

### Production Testing
Test with a real email provider:
```bash
# Set your SMTP credentials
export SMTP_USERNAME=test@gmail.com
export SMTP_PASSWORD=your-app-password
export FRONTEND_URL=http://localhost:3000

# Start server
go run .

# Send test invitation via API
curl -X POST http://localhost:8080/internal/organizations/your-org-id/invitations \
  -H "Authorization: Bearer your-jwt" \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","message":"Welcome to our team!"}'
```

## 🔒 Security Notes

- Never commit SMTP credentials to version control
- Use app passwords for Gmail (not regular passwords)
- Consider using environment files (.env) for local development
- In production, use secure secret management (AWS Secrets Manager, etc.)

## 🐛 Troubleshooting

### "SMTP credentials not configured" Error
- Ensure `SMTP_USERNAME` and `SMTP_PASSWORD` are set
- Or enable mock mode with `EMAIL_MOCK=true`

### Gmail "Authentication Failed"
- Use App Password, not regular Gmail password
- Enable 2-Factor Authentication first
- Check username is the full email address

### Emails Not Received
- Check spam folder
- Verify `FROM_EMAIL` is properly configured
- Check email service logs for delivery errors

### Frontend Link Issues
- Ensure `FRONTEND_URL` points to your actual frontend
- Frontend should handle `/accept-invitation?token=xxx` route

## ✨ Future Enhancements

The email service is designed to be extensible. Future providers could include:
- SendGrid Web API
- AWS SES
- Mailgun
- Postmark
- Custom webhook integrations