"""Smoke test for Python SDK error handling.

Run with:
    python3 test_errors.py

Uses httpx's mock transport so no real server is needed.
"""

from __future__ import annotations

import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent / "src"))

import httpx

from sangria_sdk import (
    FixedPriceOptions,
    PaymentProceeded,
    PaymentResponse,
    SangriaAPIStatusError,
    SangriaConnectionError,
    SangriaError,
    SangriaMerchantClient,
    SangriaTimeoutError,
)
from sangria_sdk._http import SangriaHTTPClient


passed = 0
failed = 0


def log_pass(name: str) -> None:
    global passed
    print(f"✓ {name}")
    passed += 1


def log_fail(name: str, err: Exception) -> None:
    global failed
    print(f"✗ {name}")
    print(f"  {err}")
    failed += 1


def make_client_with_transport(
    transport: httpx.MockTransport,
) -> SangriaMerchantClient:
    """Construct a client whose HTTP layer uses the given mock transport."""
    client = SangriaMerchantClient(api_key="k", base_url="http://mock")
    # Swap in a new async client that uses our transport
    client._http = SangriaHTTPClient.__new__(SangriaHTTPClient)
    client._http._client = httpx.AsyncClient(
        base_url="http://mock",
        transport=transport,
        headers={
            "Authorization": "Bearer k",
            "Content-Type": "application/json",
            "Accept": "application/json",
        },
    )
    return client


async def run_tests() -> None:
    opts = FixedPriceOptions(price=1.0, resource="/premium", description="test")

    # --- 5xx throws SangriaAPIStatusError ---
    try:
        transport = httpx.MockTransport(
            lambda _req: httpx.Response(500, json={"error": {"message": "backend on fire"}})
        )
        client = make_client_with_transport(transport)
        try:
            await client.handle_fixed_price(payment_header=None, options=opts)
            raise AssertionError("expected raise")
        except SangriaAPIStatusError as e:
            assert e.status_code == 500, f"wrong status: {e.status_code}"
            assert e.operation == "generate", f"wrong op: {e.operation}"
            assert "backend on fire" in e.message, f"wrong msg: {e.message}"
        log_pass("5xx raises SangriaAPIStatusError")
    except Exception as e:
        log_fail("5xx raises SangriaAPIStatusError", e)
    finally:
        await client.aclose()

    # --- 401 throws SangriaAPIStatusError ---
    try:
        transport = httpx.MockTransport(
            lambda _req: httpx.Response(401, json={"error": "unauthorized"})
        )
        client = make_client_with_transport(transport)
        try:
            await client.handle_fixed_price(payment_header=None, options=opts)
            raise AssertionError("expected raise")
        except SangriaAPIStatusError as e:
            assert e.status_code == 401
        log_pass("401 raises SangriaAPIStatusError")
    except Exception as e:
        log_fail("401 raises SangriaAPIStatusError", e)
    finally:
        await client.aclose()

    # --- connection refused raises SangriaConnectionError ---
    try:
        def refuse(req: httpx.Request) -> httpx.Response:
            raise httpx.ConnectError("connection refused", request=req)

        transport = httpx.MockTransport(refuse)
        client = make_client_with_transport(transport)
        try:
            await client.handle_fixed_price(payment_header=None, options=opts)
            raise AssertionError("expected raise")
        except SangriaConnectionError as e:
            assert not isinstance(e, SangriaTimeoutError), "should not be timeout"
            assert e.operation == "generate"
        log_pass("connection refused raises SangriaConnectionError")
    except Exception as e:
        log_fail("connection refused raises SangriaConnectionError", e)
    finally:
        await client.aclose()

    # --- timeout raises SangriaTimeoutError ---
    try:
        def time_out(req: httpx.Request) -> httpx.Response:
            raise httpx.ConnectTimeout("timed out", request=req)

        transport = httpx.MockTransport(time_out)
        client = make_client_with_transport(transport)
        try:
            await client.handle_fixed_price(payment_header=None, options=opts)
            raise AssertionError("expected raise")
        except SangriaTimeoutError as e:
            assert e.operation == "generate"
        log_pass("timeout raises SangriaTimeoutError")
    except Exception as e:
        log_fail("timeout raises SangriaTimeoutError", e)
    finally:
        await client.aclose()

    # --- 200 with success: false returns PaymentResponse (no raise) ---
    try:
        transport = httpx.MockTransport(
            lambda _req: httpx.Response(
                200, json={"success": False, "error_reason": "insufficient_funds"}
            )
        )
        client = make_client_with_transport(transport)
        result = await client.handle_fixed_price(payment_header="sig", options=opts)
        assert isinstance(result, PaymentResponse), f"wrong type: {type(result)}"
        assert result.status_code == 402
        log_pass("200 success:false returns PaymentResponse")
    except Exception as e:
        log_fail("200 success:false returns PaymentResponse", e)
    finally:
        await client.aclose()

    # --- 200 with success: true returns PaymentProceeded ---
    try:
        transport = httpx.MockTransport(
            lambda _req: httpx.Response(
                200, json={"success": True, "transaction": "0xabc"}
            )
        )
        client = make_client_with_transport(transport)
        result = await client.handle_fixed_price(payment_header="sig", options=opts)
        assert isinstance(result, PaymentProceeded)
        assert result.transaction == "0xabc"
        log_pass("200 success:true returns PaymentProceeded")
    except Exception as e:
        log_fail("200 success:true returns PaymentProceeded", e)
    finally:
        await client.aclose()

    # --- generate returns 402 challenge ---
    try:
        transport = httpx.MockTransport(
            lambda _req: httpx.Response(200, json={"x402Version": 2, "accepts": []})
        )
        client = make_client_with_transport(transport)
        result = await client.handle_fixed_price(payment_header=None, options=opts)
        assert isinstance(result, PaymentResponse)
        assert result.status_code == 402
        assert "PAYMENT-REQUIRED" in result.headers
        log_pass("generate returns 402 challenge")
    except Exception as e:
        log_fail("generate returns 402 challenge", e)
    finally:
        await client.aclose()

    # --- settle operation tag ---
    try:
        transport = httpx.MockTransport(lambda _req: httpx.Response(500, text="boom"))
        client = make_client_with_transport(transport)
        try:
            await client.handle_fixed_price(payment_header="sig", options=opts)
            raise AssertionError("expected raise")
        except SangriaError as e:
            assert e.operation == "settle", f"wrong op: {e.operation}"
        log_pass("settle errors carry operation=settle")
    except Exception as e:
        log_fail("settle errors carry operation=settle", e)
    finally:
        await client.aclose()

    # --- invalid options raise ValueError at construction ---
    try:
        from sangria_sdk import validate_fixed_price_options

        try:
            validate_fixed_price_options(FixedPriceOptions(price=-1, resource="/x"))
            raise AssertionError("expected ValueError")
        except ValueError:
            pass
        log_pass("negative price raises ValueError")
    except Exception as e:
        log_fail("negative price raises ValueError", e)


def main() -> None:
    asyncio.run(run_tests())
    print(f"\n{passed} passed, {failed} failed")
    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main()
