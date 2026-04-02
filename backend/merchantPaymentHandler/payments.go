package merchantPaymentHandler

import (
	"fmt"

	"github.com/gofiber/fiber/v3"
)

type generatePaymentRequest struct {
	Amount      float64 `json:"amount"`
	Resource    string  `json:"resource"`
	Description string  `json:"description"`
}

// RegisterRoutes registers the stub payment endpoints on the given Fiber app.
func RegisterRoutes(app *fiber.App) {
	// POST /v1/generate-payment — returns hardcoded 402-style payment requirement
	app.Post("/v1/generate-payment", func(c fiber.Ctx) error {
		var body generatePaymentRequest
		if err := c.Bind().JSON(&body); err != nil {
			return c.Status(400).JSON(fiber.Map{"error": "invalid JSON body"})
		}

		// Amount in USDC base units (6 decimals): price * 1_000_000
		amountBaseUnits := fmt.Sprintf("%.0f", body.Amount*1_000_000)

		return c.JSON(fiber.Map{
			"x402Version": 2,
			"description": body.Description,
			"resource":    body.Resource,
			"accepts": []fiber.Map{{
				"scheme":            "exact",
				"network":           "eip155:84532",
				"amount":            amountBaseUnits,
				"asset":             "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
				"payTo":             "0x0000000000000000000000000000000000000000",
				"maxTimeoutSeconds": 300,
				"extra": fiber.Map{
					"name":                "USDC",
					"version":             "1",
					"assetTransferMethod": "eip3009",
				},
			}},
		})
	})

	// POST /v1/settle-payment — returns stub settlement failure
	app.Post("/v1/settle-payment", func(c fiber.Ctx) error {
		return c.JSON(fiber.Map{
			"success": false,
			"error":   "stub: settlement not implemented",
		})
	})
}
