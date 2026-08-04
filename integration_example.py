# integration_example.py
import asyncio
import logging
from decimal import Decimal
from paxos_gateway import PaxosUSDGGateway, PaxosCredentials

logging.basicConfig(level=logging.INFO)

async def main():
    # Configurações (use variáveis de ambiente em produção)
    creds = PaxosCredentials(
        client_id="SEU_CLIENT_ID",
        client_secret="SEU_CLIENT_SECRET",
        api_base_url="https://api.paxos.com/v2",  # ou sandbox
        web3_provider_url="https://mainnet.infura.io/v3/SUA_KEY",
        usdg_contract_address="0x...",  # endereço do contrato USDG
        private_key="0x..."  # mantenha em segredo
    )

    async with PaxosUSDGGateway(creds) as gateway:
        # Registra callback de alerta (ex: enviar notificação para Windows)
        async def alert_callback(title: str, message: str, severity: str):
            logging.warning(f"[ALERTA {severity.upper()}] {title}: {message}")
        gateway.set_alert_callback(alert_callback)

        # Inicia monitoramento
        await gateway.start_monitoring(interval_seconds=30)

        # 1. Consultar saldos custodiais
        balances = await gateway.get_balances()
        for bal in balances:
            print(f"Saldo {bal.currency}: total={bal.total}, disponível={bal.available}")

        # 2. Mint de 1000 USDG
        tx_mint = await gateway.mint(Decimal("1000"), currency="USD")
        print(f"Mint iniciado: {tx_mint.id}, status={tx_mint.status}")

        # 3. Transferência on-chain
        tx_hash = await gateway.transfer_on_chain("0xDestino...", Decimal("100"))
        print(f"Transferência enviada: {tx_hash}")

        # 4. Aumentar allowance para um contrato de swap
        spender = "0xContratoSwap..."
        await gateway.increase_allowance(spender, Decimal("500"))

        # 5. Consultar saldo on-chain
        onchain_bal = await gateway.get_onchain_balance()
        print(f"Saldo on-chain da carteira: {onchain_bal} USDG")

        # 6. Redeem (resgatar USDG para USD)
        tx_redeem = await gateway.redeem(Decimal("200"), destination_currency="USD")
        print(f"Redeem iniciado: {tx_redeem.id}")

        # Aguardar monitoramento por alguns segundos
        await asyncio.sleep(10)

if __name__ == "__main__":
    asyncio.run(main())
