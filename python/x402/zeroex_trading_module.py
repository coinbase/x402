import aiohttp


class ZeroExTradingModule:
    def __init__(
        self, api_key: str, chain_id: int, wallet_address: str, zvec_memory, world_model=None
    ):
        self.api_key = api_key
        self.chain_id = chain_id
        self.wallet = wallet_address
        self.zvec = zvec_memory
        self.world_model = world_model
        self.base_url = "https://api.0x.org/swap/allowance-holder"
        self.session = None

    async def execute_swap(
        self, sell_token: str, buy_token: str, sell_amount: int, slippage_bps: int = 100
    ) -> dict | None:
        """
        Executa um swap via 0x Swap API v2.
        Inclui validação de segurança e persistência de memória.
        """
        params = {
            "chainId": self.chain_id,
            "sellToken": sell_token,
            "buyToken": buy_token,
            "sellAmount": sell_amount,
            "taker": self.wallet,
            "slippageBps": slippage_bps,
        }
        headers = {"0x-api-key": self.api_key, "0x-version": "v2"}

        if self.session is None:
            self.session = aiohttp.ClientSession()
        async with self.session.get(
            f"{self.base_url}/quote", params=params, headers=headers
        ) as resp:
            if resp.status != 200:
                return None
            quote = await resp.json()

        # 1. Validação de Segurança (Z3) - Exemplo de condição
        if "issues" in quote and quote["issues"].get("liquidityAvailable") is False:
            return None

        # 2. Aprovação de Token (AllowanceHolder)
        allowance_params = {
            "chainId": self.chain_id,
            "sellToken": sell_token,
            "taker": self.wallet,
            "sellAmount": sell_amount,
        }
        async with self.session.get(
            f"{self.base_url}/approval", params=allowance_params, headers=headers
        ) as resp:
            await resp.json()

        # 3. Submissão da Transação (simplificado)
        tx_hash = await self._send_transaction(quote.get("transaction", {}))
        result = {"tx_hash": tx_hash, "buy_amount": quote.get("buyAmount", 0)}

        # 4. Pós-processamento
        embedding = await self._get_market_embedding(sell_token, buy_token, sell_amount, quote)

        # We need to adapt this to the actual MemorySpace class in ArkheAgent.
        # It expects an entry dict with content/queryable stuff.
        memory_entry = {
            "type": "trade_execution",
            "content": f"Swapped {sell_amount} of {sell_token} for {buy_token}",
            "embedding": embedding,
            "result": result,
        }
        if hasattr(self.zvec, "store_transaction_embedding"):
            self.zvec.store_transaction_embedding(embedding, result)
        else:
            self.zvec.add(memory_entry)

        reward = self._calc_reward(result)
        if self.world_model and hasattr(self.world_model, "update_personality_from_reward"):
            self.world_model.update_personality_from_reward(reward)

        return result

    async def _send_transaction(self, transaction: dict) -> str:
        # Simplificado
        return "0x_mock_tx_hash"

    async def _get_market_embedding(
        self, sell_token: str, buy_token: str, sell_amount: int, quote: dict
    ) -> list:
        # Simplificado
        return [0.0] * 256

    def _calc_reward(self, result: dict) -> float:
        # Simplificado
        return 1.0

    async def close(self):
        await self.session.close()
