package emailService

import (
	"bytes"
	"context"
	"fmt"
	"html/template"
	"log/slog"
	"net/smtp"
	"os"
	"strings"
)

// EmailService interface for sending emails
type EmailService interface {
	SendInvitationEmail(ctx context.Context, invitation InvitationEmailData) error
}

// InvitationEmailData contains all data needed for invitation emails
type InvitationEmailData struct {
	InviteeEmail     string
	InviterName      string
	OrganizationName string
	InvitationToken  string
	ExpiresAt        string
	Message          *string
	AcceptURL        string // Frontend URL to accept invitation
}

// SMTPEmailService implements EmailService using SMTP
type SMTPEmailService struct {
	Host     string
	Port     string
	Username string
	Password string
	FromEmail string
	FromName  string
}

// NewEmailService creates a new email service based on configuration
func NewEmailService() EmailService {
	emailProvider := strings.ToLower(os.Getenv("EMAIL_PROVIDER"))

	switch emailProvider {
	case "smtp", "gmail", "":
		// Default to SMTP (works with Gmail, Outlook, SendGrid SMTP, etc.)
		return &SMTPEmailService{
			Host:      getEnvWithDefault("SMTP_HOST", "smtp.gmail.com"),
			Port:      getEnvWithDefault("SMTP_PORT", "587"),
			Username:  os.Getenv("SMTP_USERNAME"),
			Password:  os.Getenv("SMTP_PASSWORD"),
			FromEmail: getEnvWithDefault("FROM_EMAIL", os.Getenv("SMTP_USERNAME")),
			FromName:  getEnvWithDefault("FROM_NAME", "Sangria"),
		}
	default:
		slog.Warn("unknown email provider, defaulting to SMTP", "provider", emailProvider)
		return &SMTPEmailService{
			Host:      getEnvWithDefault("SMTP_HOST", "smtp.gmail.com"),
			Port:      getEnvWithDefault("SMTP_PORT", "587"),
			Username:  os.Getenv("SMTP_USERNAME"),
			Password:  os.Getenv("SMTP_PASSWORD"),
			FromEmail: getEnvWithDefault("FROM_EMAIL", os.Getenv("SMTP_USERNAME")),
			FromName:  getEnvWithDefault("FROM_NAME", "Sangria"),
		}
	}
}

// SendInvitationEmail sends an invitation email using SMTP
func (s *SMTPEmailService) SendInvitationEmail(ctx context.Context, data InvitationEmailData) error {
	if s.Username == "" || s.Password == "" {
		return fmt.Errorf("SMTP credentials not configured")
	}

	// Generate email content
	subject, body, err := generateInvitationEmail(data)
	if err != nil {
		return fmt.Errorf("failed to generate email content: %w", err)
	}

	// Create email message
	msg := fmt.Sprintf("To: %s\r\n"+
		"From: %s <%s>\r\n"+
		"Subject: %s\r\n"+
		"MIME-Version: 1.0\r\n"+
		"Content-Type: text/html; charset=UTF-8\r\n\r\n"+
		"%s\r\n",
		data.InviteeEmail,
		s.FromName, s.FromEmail,
		subject,
		body)

	// Set up authentication
	auth := smtp.PlainAuth("", s.Username, s.Password, s.Host)

	// Send email
	err = smtp.SendMail(
		s.Host+":"+s.Port,
		auth,
		s.FromEmail,
		[]string{data.InviteeEmail},
		[]byte(msg),
	)
	if err != nil {
		return fmt.Errorf("failed to send email: %w", err)
	}

	slog.Info("invitation email sent successfully",
		"invitee_email", data.InviteeEmail,
		"organization", data.OrganizationName,
		"inviter", data.InviterName)

	return nil
}

// generateInvitationEmail creates the email subject and HTML body
func generateInvitationEmail(data InvitationEmailData) (subject, body string, err error) {
	subject = fmt.Sprintf("You're invited to join %s on Sangria", data.OrganizationName)

	// HTML email template
	emailTemplate := `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Invitation to join {{.OrganizationName}}</title>
</head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
    <div style="text-align: center; margin-bottom: 30px;">
        <h1 style="color: #2c3e50; margin-bottom: 10px;">🩸 Sangria</h1>
        <p style="color: #666; margin: 0;">Payment Infrastructure</p>
    </div>

    <div style="background: #f8f9fa; padding: 30px; border-radius: 8px; margin-bottom: 30px;">
        <h2 style="color: #2c3e50; margin-top: 0;">You're invited!</h2>
        <p><strong>{{.InviterName}}</strong> has invited you to join <strong>{{.OrganizationName}}</strong> on Sangria.</p>

        {{if .Message}}
        <div style="background: #fff; padding: 20px; border-radius: 6px; margin: 20px 0; border-left: 4px solid #3498db;">
            <p style="margin: 0; font-style: italic;">"{{.Message}}"</p>
        </div>
        {{end}}

        <p>With Sangria, you can:</p>
        <ul style="margin: 20px 0;">
            <li>Accept payments securely</li>
            <li>Manage API keys for your applications</li>
            <li>Track transactions and balances</li>
            <li>Collaborate with your team</li>
        </ul>
    </div>

    <div style="text-align: center; margin: 30px 0;">
        <a href="{{.AcceptURL}}"
           style="display: inline-block; background: #3498db; color: white; padding: 15px 30px; text-decoration: none; border-radius: 6px; font-weight: bold; font-size: 16px;">
            Accept Invitation
        </a>
    </div>

    <div style="background: #f1f2f6; padding: 20px; border-radius: 6px; font-size: 14px; color: #666;">
        <p><strong>Important:</strong></p>
        <ul style="margin: 10px 0;">
            <li>This invitation expires on <strong>{{.ExpiresAt}}</strong></li>
            <li>If you don't have a Sangria account, you'll be prompted to create one</li>
            <li>Once you accept, you'll have access to {{.OrganizationName}}</li>
        </ul>
    </div>

    <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">

    <div style="text-align: center; color: #666; font-size: 12px;">
        <p>This invitation was sent to {{.InviteeEmail}}</p>
        <p>If you weren't expecting this invitation, you can safely ignore this email.</p>
        <p style="margin-top: 20px;">
            <a href="#" style="color: #666;">Sangria</a> • Payment Infrastructure for Modern Applications
        </p>
    </div>
</body>
</html>`

	// Parse and execute template
	tmpl, err := template.New("invitation").Parse(emailTemplate)
	if err != nil {
		return "", "", fmt.Errorf("failed to parse email template: %w", err)
	}

	var buf bytes.Buffer
	err = tmpl.Execute(&buf, data)
	if err != nil {
		return "", "", fmt.Errorf("failed to execute email template: %w", err)
	}

	return subject, buf.String(), nil
}

// getEnvWithDefault returns environment variable or default value
func getEnvWithDefault(key, defaultValue string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return defaultValue
}

// MockEmailService for testing - logs emails instead of sending them
type MockEmailService struct{}

func (m *MockEmailService) SendInvitationEmail(ctx context.Context, data InvitationEmailData) error {
	slog.Info("MOCK EMAIL: Invitation email",
		"to", data.InviteeEmail,
		"from", data.InviterName,
		"organization", data.OrganizationName,
		"token", data.InvitationToken,
		"expires", data.ExpiresAt,
		"accept_url", data.AcceptURL,
		"message", data.Message)
	return nil
}

// NewMockEmailService creates a mock email service for testing
func NewMockEmailService() EmailService {
	return &MockEmailService{}
}