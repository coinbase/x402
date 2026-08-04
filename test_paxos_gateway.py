# test_paxos_gateway.py
import pytest
import asyncio
from decimal import Decimal
from unittest.mock import AsyncMock, patch
from paxos_gateway import PaxosUSDGGateway, PaxosCredentials, PaxosBalance

@pytest.fixture
def mock_creds():
    return PaxosCredentials(
        client_id="test",
        client_secret="test",
        api_base_url="https://sandbox.paxos.com/v2",
        web3_provider_url="https://rinkeby.infura.io/v3/test",
        usdg_contract_address="0x1234567890123456789012345678901234567890",
        private_key="0x" + "1"*64
    )

@pytest.mark.asyncio
@patch('paxos_gateway.Web3.is_connected', return_value=True)
async def test_get_balances(mock_is_connected, mock_creds):
    with patch.object(PaxosUSDGGateway, 'get_balances', new_callable=AsyncMock) as mock:
        mock.return_value = [PaxosBalance(currency="USDG", total=Decimal("1000"), available=Decimal("990"), pending=Decimal("10"))]
        gateway = PaxosUSDGGateway(mock_creds)
        gateway.api.get_balances = mock
        balances = await gateway.get_balances()
        assert len(balances) == 1
        assert balances[0].currency == "USDG"
