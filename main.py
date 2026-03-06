import asyncio
from wallet import TestnetWallet, get_cdp_client


async def main():
    # Mint a fresh testnet wallet
    # w = await TestnetWallet.mint()
    # await w.fund_eth()
    # await w.fund_usdc()


    w = TestnetWallet.from_existing("0x0b7b1E88e321C3f326776e35C042bb3d035Be649")
    await w.fund_eth()
    await w.fund_usdc()
    print(w)
    print(await w.get_eth_balance())
    print(await w.get_usdc_balance())


    await get_cdp_client().close()


if __name__ == "__main__":
    asyncio.run(main())
